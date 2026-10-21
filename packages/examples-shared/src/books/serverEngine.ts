/**
 * `createHttpFilterEngine` — a `FilterEngineAsync<T>` whose transport is `fetch` against a remote
 * filtering server, instead of Comlink over a Web Worker. The **shared** server-backed transport,
 * consumed across verticals AND datasets (generic over the record type, `Book` by default):
 *
 *   - **React `/books-server`** points it at `@filter-enginez/examples-server` through the same-origin
 *     `/api` (the default `baseUrl`): the Vite dev proxy to its Node process locally, the app's own
 *     Cloudflare Worker when deployed.
 *   - **SvelteKit `/books-server`** points it at that app's own in-process `+server.ts` endpoints
 *     (`baseUrl: '/books-server'`) — SvelteKit's server tier running the isomorphic core directly, no
 *     separate process.
 *   - **SvelteKit `/wine-server`** boots the SAME function with `<Wine>` + `dataset: 'wine'` against
 *     `baseUrl: '/wine-server'`. Nothing here is books-specific beyond the default type parameter.
 *
 * @remarks
 * This is the whole point of the `/books-server` routes: the reactive stack
 * (`createSignalsEngineFromAsync` → `SignalsEngine` → every framework binding → the exact app
 * component tree) is transport-agnostic. The worker tier hands it a `FilterEngineAsync` backed by a
 * `postMessage` boundary; this hands it one backed by HTTP. The browser never runs a filter — every
 * mutation round-trips to the server's real engine, which owns the config → results decision.
 *
 * **The corpus copy.** Like the worker tier (which ships its corpus to the main thread once at boot),
 * this fetches the corpus once from `GET {baseUrl}/corpus/<dataset>.json` so the resident mirror can
 * turn server-returned result INDICES back into records, and so the shared filter panel can derive
 * slider baselines + chip vocabularies. The server remains the filtering authority — this is the data,
 * not the decisions. Deployed, that URL is a static file in each app's build rather than a server
 * response (the Workers Free plan allows 10 ms of CPU per request, far less than serializing a corpus
 * takes); in development the same path is answered dynamically.
 *
 * **Two round-trips per settled filter change.** A mutation invalidates the mirror sync (one
 * `POST {baseUrl}/query` with an empty facet query → result indices only) and the books bundle
 * separately fetches predictive-disable metadata (a second `POST {baseUrl}/query` carrying the facet
 * query). Mutations are debounced so a slider drag collapses to one settled round-trip, matching the
 * worker tier's one-bundle-per-event contract.
 *
 * @packageDocumentation
 */

import type { Book } from '@filter-enginez/mock-data/books';
import type {
	FilterEngineAsync,
	WireActionLogEntry,
	WireDevtoolsState,
} from '@filter-enginez/worker-bridge';

import {
	type ChangeEvent,
	type ChangeListener,
	type CompositeRule,
	exportConfig,
	type FilterBundle,
	type FilterBundleQuery,
	type FilterEngineConfig,
	type FilterGroup,
	type FilterRule,
	resolveConfig,
	type RuleId,
	ruleRegistry,
	type SerializedRule,
	type SimulationModification,
	type SimulationResult,
	type Unsubscribe,
} from '@filter-enginez/core';

/** Options for {@link createHttpFilterEngine}. */
export interface HttpFilterEngineOptions {
	/** Base URL the endpoints hang off. Defaults to `/api` (the React Vite dev proxy → examples-server).
	 * The SvelteKit vertical overrides this to `/books-server` (its own in-process `+server.ts`). */
	readonly baseUrl?: string;
	/** Coalesce window (ms) for collapsing a rapid mutation burst (slider drag) into one round-trip. */
	readonly debounceMs?: number;
	/** Dataset id to filter. Defaults to `books`. */
	readonly dataset?: string;
}

/** The `/query` response shape (mirror of the server's `QueryResult`; the browser can't import it). */
interface QueryResponse {
	readonly chipGroups: readonly {
		readonly candidates: readonly { readonly projectedCount: number; readonly value: string; readonly wouldBeEmpty: boolean }[];
		readonly ruleId: string;
	}[];
	readonly fields: readonly {
		readonly bounds: { readonly max: number | null; readonly min: number | null };
		readonly fieldKey: string;
		readonly histogram: { readonly bucketEdges: readonly number[]; readonly counts: readonly number[] };
		readonly ruleId: string;
	}[];
	readonly matched: number;
	readonly resultIndices: readonly number[];
}

/** The empty devtools cursor the browser mirror reports (time-travel isn't wired over HTTP). */
const EMPTY_DEVTOOLS: WireDevtoolsState = { canRedo: false, canUndo: false, currentIndex: -1, total: 0 };

/**
 * Build a server-backed `FilterEngineAsync<T>`.
 *
 * @remarks
 * Generic over the record type, defaulting to `Book` so every existing books call site is unchanged.
 * The transport is structurally identical for any dataset — records are only ever indexed into and
 * handed back — so `/wine-server` boots the very same function with `<Wine>` + `dataset: 'wine'`. The
 * only per-dataset inputs are the `dataset` option (drives `/corpus/<dataset>.json` + the `/query`
 * body) and that type parameter.
 *
 * @typeParam T - The corpus record type (defaults to `Book`).
 * @param options - Transport configuration (base URL, dataset, debounce window).
 * @returns A `FilterEngineAsync<T>` ready to hand to `createSignalsEngineFromAsync`.
 */
export function createHttpFilterEngine<T = Book>(options: HttpFilterEngineOptions = {}): FilterEngineAsync<T> {
	const baseUrl = options.baseUrl ?? '/api';
	const dataset = options.dataset ?? 'books';
	const debounceMs = options.debounceMs ?? 90;

	// ─── Local state (the resident mirror the reactive stack reads through) ───
	let sourceData: null | readonly T[] = null;
	// Rules are stored in SERIALIZED form — the core shim serializes before calling `addRule`, and the
	// adapter's `deserializeRules` reconstructs instances from what `getRules` returns.
	const rules = new Map<RuleId, SerializedRule>();
	// The explicit expression (smart-filter / expression mode), also in SERIALIZED form: the core shim
	// serializes the `CompositeRule` before `setExpression`, exactly like `addRule`. `null` = flat-map
	// mode. Without it the transport would drop expression mode entirely: every preset would clear the
	// panel's flat rules and then filter nothing.
	let expression: SerializedRule | null = null;
	let syncCache: Promise<{ count: number; indices: Uint32Array }> | null = null;
	let listener: ChangeListener | null = null;
	let emitTimer: ReturnType<typeof setTimeout> | null = null;
	// The event a pending debounce will deliver. Tracked (not just captured in the timer closure) so a
	// burst of DIFFERENT events can escalate to `reset` — see `scheduleEmit`.
	let pendingEvent: ChangeEvent | null = null;

	// ─── Transport helpers ───────────────────────────────────────────────────
	const post = async <R>(path: string, payload: unknown): Promise<R> => {
		const response = await fetch(`${baseUrl}${path}`, {
			body: JSON.stringify(payload),
			headers: { 'content-type': 'application/json' },
			method: 'POST',
		});

		if (!response.ok) {
			throw new Error(`Filter server responded ${response.status} for POST ${path}`);
		}

		return response.json() as Promise<R>;
	};
	const getJson = async <R>(path: string): Promise<R> => {
		const response = await fetch(`${baseUrl}${path}`);

		if (!response.ok) {
			throw new Error(`Filter server responded ${response.status} for GET ${path}`);
		}

		return response.json() as Promise<R>;
	};

	// ─── Config assembly + the mirror-sync round-trip ─────────────────────────
	// Route through the core's own `exportConfig` rather than hand-building `{ rules }`, because an
	// EXPRESSION serializes differently from a flat rule: `config.expression` is a REFERENCE tree
	// (`{ type: 'rule', ruleId }` leaves) with the inline leaf rules hoisted into `config.rules` under
	// synthetic `__inline_N` ids. Reconstructing real instances and handing them to `exportConfig` is
	// what produces that shape correctly — and it's the exact document the server's `createFilterEngine`
	// consumes. Flat-map mode (no expression) yields plain `{ rules, version }`, unchanged from before.
	const buildConfig = (): FilterEngineConfig => {
		const ruleInstances = new Map<RuleId, FilterRule>(
			[...rules].map(([id, serialized]) => [id, ruleRegistry.deserialize(serialized)]),
		);
		const expr = expression === null ? null : (ruleRegistry.deserialize(expression) as CompositeRule);

		return exportConfig({
			getExpression: () => expr,
			getGroups: () => [],
			getRules: () => ruleInstances,
		});
	};

	// One `POST /query` with an empty facet query — result indices + count only. Memoized so the boot
	// getters (`getResultCount` + `getResults`) share a single round-trip; invalidated on mutation.
	const sync = async (): Promise<{ count: number; indices: Uint32Array }> => {
		syncCache ??= post<QueryResponse>('/query', { config: buildConfig(), dataset, limit: 0, query: {}})
			.then((response) => ({ count: response.matched, indices: Uint32Array.from(response.resultIndices) }));

		return syncCache;
	};

	// Fetch (once) + return the resident corpus copy.
	const ensureCorpus = async (): Promise<readonly T[]> => {
		sourceData ??= (await getJson<{ records: readonly T[] }>(`/corpus/${dataset}.json`)).records;

		return sourceData;
	};

	// Which of the shim's mirror-refreshers an event routes to (mirrors the `switch` in
	// `createSignalsEngineFromAsync`). Two events can safely coalesce to the LAST only when they share a
	// refresher — every `rule:*` event re-pulls the whole rule set, so an add-then-change burst (a chip
	// toggle, a slider drag) collapses cleanly; but a `rule:removed` and an `expression` do NOT, and
	// keeping only the trailing one would skip the rule refresh.
	const refreshGroupOf = (type: ChangeEvent['type']): string => {
		switch (type) {
			case 'expression': {
				return 'expression';
			}
			case 'rule:added':
			case 'rule:changed':
			case 'rule:removed': {
				return 'rules';
			}
			default: {
				// `reset` (emitted by clear-all + group ops) collapses to the widest refresh — and so do
				// the events this HTTP client never actually emits (`results`, `sourceData`, `workingSet`,
				// its `setSourceData` / `setWorkingSet` being no-op stubs). Folding them here rather than
				// giving each its own group is behaviorally identical for the coalescing decision: a
				// same-group burst still coalesces, and any mix with `expression` / `rules` escalates.
				return 'reset';
			}
		}
	};

	// Invalidate the mirror sync + fire the change event (debounced) so the adapter re-pulls.
	//
	// **Heterogeneous bursts escalate to `reset`.** The debounce coalesces a burst to a single delivered
	// event, and the shim routes each event type to the SMALLEST refresh that satisfies it — an
	// `expression` event refreshes expression + results but NOT the active rules. So a "clear all" (which
	// fires `removeRule` for every facet and THEN `setExpression(null)`, all synchronously) would coalesce
	// to just the trailing `expression` event, leaving the header's active-filter chips refreshed from
	// stale rules — visible only on this debounced HTTP tier, since the worker tier delivers each event
	// separately. When the newly-scheduled event isn't the same logical change as the one already pending,
	// collapse to `reset` (the one event that refreshes EVERY mirror). A same-signal burst still coalesces.
	const scheduleEmit = (event: ChangeEvent): void => {
		syncCache = null;
		pendingEvent = pendingEvent !== null && refreshGroupOf(pendingEvent.type) !== refreshGroupOf(event.type)
			? { type: 'reset' }
			: event;
		if (emitTimer !== null) {
			clearTimeout(emitTimer);
		}
		emitTimer = setTimeout(() => {
			emitTimer = null;
			const toEmit = pendingEvent;

			pendingEvent = null;
			/* v8 ignore next 2 -- `pendingEvent` is set non-null by every `scheduleEmit`, and a superseding
			   call clears the prior timer, so a timer that actually fires always carries a pending event;
			   this null-guard is a type-narrowing formality that cannot be hit. */
			if (toEmit === null) {
				return;
			}
			listener?.(toEmit);
		}, debounceMs);
	};

	return {
		addGroup: async () => Promise.resolve(),
		addRule: async (ruleId: RuleId, rule: FilterRule): Promise<void> => {
			// The core shim already serialized the rule before the (nominal) wire boundary. Reconstruct
			// an instance for the `ChangeEvent` (the adapter refresher re-pulls from `getRules`, but the
			// event type — and the Redux mirror bridge — want a real rule).
			const serialized = rule as unknown as SerializedRule;
			const isNew = !rules.has(ruleId);
			const instance = ruleRegistry.deserialize(serialized);

			rules.set(ruleId, serialized);
			scheduleEmit(isNew
				? { rule: instance, ruleId, type: 'rule:added' }
				: { next: instance, previous: instance, ruleId, type: 'rule:changed' });

			return Promise.resolve();
		},
		applyFiltersAndQuery: async (query?: FilterBundleQuery): Promise<FilterBundle> => {
			const response = await post<QueryResponse>('/query', { config: buildConfig(), dataset, limit: 0, query: query ?? {}});

			return {
				chipGroups: response.chipGroups.map((group) => ({
					candidates: group.candidates.map((candidate) => ({
						projectedCount: candidate.projectedCount,
						value: candidate.value,
						wouldBeEmpty: candidate.wouldBeEmpty,
					})),
					ruleId: group.ruleId,
				})),
				fields: response.fields.map((field) => ({
					bounds: { max: field.bounds.max, min: field.bounds.min },
					fieldKey: field.fieldKey,
					histogram: {
						bucketEdges: Float64Array.from(field.histogram.bucketEdges),
						counts: Uint32Array.from(field.histogram.counts),
					},
					ruleId: field.ruleId,
				})),
				resultCount: response.matched,
				resultIndices: Uint32Array.from(response.resultIndices),
			};
		},
		clearRules: async (): Promise<void> => {
			// Clears rules, groups, AND the expression — matching the real engine's `clearRules`.
			rules.clear();
			expression = null;
			scheduleEmit({ type: 'reset' });

			return Promise.resolve();
		},
		destroy: async (): Promise<void> => {
			if (emitTimer !== null) {
				clearTimeout(emitTimer);
				emitTimer = null;
			}
			pendingEvent = null;
			listener = null;

			return Promise.resolve();
		},
		exportConfig: async (): Promise<FilterEngineConfig> => Promise.resolve(buildConfig()),
		getActionLogSnapshot: async (): Promise<readonly WireActionLogEntry[]> => Promise.resolve([]),
		getActiveRuleIds: async (): Promise<readonly RuleId[]> => Promise.resolve([...rules.keys()]),
		getDevtoolsState: async (): Promise<WireDevtoolsState> => Promise.resolve(EMPTY_DEVTOOLS),
		// Mirror the worker adapter: hand back the SERIALIZED expression cast as `CompositeRule` (the shim
		// stores it as-is; `mode` derives from null-vs-non-null, so the wire form is all the surface needs).
		getExpression: async (): Promise<CompositeRule | null> => Promise.resolve(expression as unknown as CompositeRule | null),
		getFilteredFieldValuesExcept: async (): Promise<Float64Array> => Promise.resolve(new Float64Array(0)),
		getGroups: async (): Promise<readonly FilterGroup[]> => Promise.resolve([]),
		getResultCount: async (): Promise<number> => (await sync()).count,
		getResultIndices: async (): Promise<Uint32Array> => (await sync()).indices,
		getResults: async (): Promise<readonly T[]> => {
			const [{ indices }, corpus] = await Promise.all([sync(), ensureCorpus()]);
			const out = new Array<T>(indices.length);

			for (let i = 0; i < indices.length; i++) {
				out[i] = corpus[indices[i] as number] as T;
			}

			return out;
		},
		// Stored serialized; the wire boundary carries `SerializedRule`, typed as `FilterRule`.
		getRule: async (ruleId: RuleId): Promise<FilterRule | undefined> => Promise.resolve(rules.get(ruleId) as unknown as FilterRule | undefined),
		getRules: async (): Promise<ReadonlyMap<RuleId, FilterRule>> => Promise.resolve(rules as unknown as ReadonlyMap<RuleId, FilterRule>),
		getSourceData: async (): Promise<readonly T[]> => ensureCorpus(),
		jumpToDevtoolsIndex: async () => Promise.resolve(),
		loadConfig: async (config: FilterEngineConfig): Promise<void> => {
			// `resolveConfig` does what the in-process engine's `loadConfig` does: it reconstructs the
			// (reference-tree) expression into a real `CompositeRule`, resolving its inline leaves against
			// `config.rules`, and returns as `rules` only the rules to REGISTER, never those inline leaves.
			// So both are stored exactly as resolved, the way the engine that exported the config held
			// them: a flat rule loaded beside an expression stays registered (dormant while the expression
			// is set), and clearing the expression leaves nothing behind that starts filtering.
			const resolved = resolveConfig(config);

			rules.clear();
			for (const [ruleId, rule] of resolved.rules) {
				rules.set(ruleId, rule.serialize());
			}
			expression = resolved.expression === null ? null : resolved.expression.serialize();
			scheduleEmit({ type: 'reset' });

			return Promise.resolve();
		},
		redoDevtools: async () => Promise.resolve(),
		removeGroup: async () => Promise.resolve(),
		removeRule: async (ruleId: RuleId): Promise<void> => {
			const removed = rules.get(ruleId);

			rules.delete(ruleId);
			scheduleEmit(removed === undefined
				? { type: 'reset' }
				: { rule: ruleRegistry.deserialize(removed), ruleId, type: 'rule:removed' });

			return Promise.resolve();
		},
		reset: async (): Promise<void> => {
			rules.clear();
			expression = null;
			scheduleEmit({ type: 'reset' });

			return Promise.resolve();
		},
		resetWorkingSet: async () => Promise.resolve(),
		setExpression: async (incoming: CompositeRule | null): Promise<void> => {
			// The core shim already serialized the expression before the (nominal) wire boundary — the
			// same dance as `addRule` — so `incoming` is a `SerializedRule` typed as `CompositeRule`.
			const previous = expression;

			expression = incoming === null ? null : (incoming as unknown as SerializedRule);
			// Deserialize for the `ChangeEvent` (the refresher re-pulls from `getExpression`, but the event
			// type wants real rules). `null` ↔ flat-map, a tree ↔ expression mode, which drives `mode`.
			scheduleEmit({
				next: expression === null ? null : (ruleRegistry.deserialize(expression) as CompositeRule),
				previous: previous === null ? null : (ruleRegistry.deserialize(previous) as CompositeRule),
				type: 'expression',
			});

			return Promise.resolve();
		},
		setSourceData: async () => Promise.resolve(),
		setWorkingSet: async () => Promise.resolve(),
		simulate: async (_modification: SimulationModification): Promise<SimulationResult<T>> =>
			Promise.reject(new Error('createHttpFilterEngine: simulate() is not supported — read bundled exclusion data from applyFiltersAndQuery instead.')),
		subscribe: async (incoming: ChangeListener): Promise<Unsubscribe> => {
			listener = incoming;

			return Promise.resolve(() => {
				listener = null;
			});
		},
		undoDevtools: async () => Promise.resolve(),
	};
}
