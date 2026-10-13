/**
 * Unit tests for `createHttpFilterEngine` — the shared `FilterEngineAsync<Book>` HTTP transport.
 *
 * @remarks
 * `fetch` is stubbed so these run without a server: the corpus endpoint + `/query` return canned
 * payloads, and each POST body is captured so we can assert the config + facet query that crossed the
 * wire. The full reactive integration (this engine → `createSignalsEngineFromAsync` → signals) is
 * exercised separately; here we pin the transport contract in isolation.
 *
 * @packageDocumentation
 */

import { type ChangeEvent, type CompositeRule, type FilterRule, inSet, or } from '@filter-enginez/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createHttpFilterEngine } from './serverEngine.js';

/** A tiny stand-in corpus (only `.length` + index access matter to the engine). */
const CORPUS = Array.from({ length: 5 }, (_, index) => ({ id: `book-${index}`, title: `Title ${index}` }));

/** A leaf of the serialized `config.expression` reference tree. */
interface ExprLeaf { readonly ruleId: string; readonly type: 'rule' }
/** A serialized `config.expression` node — the reference tree the engine posts. */
type ExprNode = ExprLeaf | { readonly children: readonly ExprNode[]; readonly op: string; readonly type: 'composite' };
/** POST bodies captured from the fetch stub, in call order. */
let postedBodies: { config: { expression?: ExprNode; rules: readonly { id: string }[] }; query?: unknown }[];
/** Canned `/query` response the stub returns (mutable so a test can vary it). */
let queryResponse: unknown;

beforeEach(() => {
	postedBodies = [];
	queryResponse = { chipGroups: [], fields: [], matched: 3, resultIndices: [0, 1, 2]};

	vi.stubGlobal('fetch', vi.fn(async (url: string, init?: { body?: string; method?: string }) => {
		const path = String(url);
		const respond = (payload: unknown, status = 200): Response => new Response(JSON.stringify(payload), { status });

		if (path.includes('/corpus/')) {
			return Promise.resolve(respond({ dataset: 'books', records: CORPUS }));
		}
		if (path.includes('/query')) {
			postedBodies.push(JSON.parse(init?.body ?? '{}') as (typeof postedBodies)[number]);

			return Promise.resolve(respond(queryResponse));
		}

		return Promise.resolve(respond({ error: 'not found' }, 404));
	}));
});

afterEach(() => {
	vi.unstubAllGlobals();
});

describe('createHttpFilterEngine', () => {
	it('fetches the corpus once and caches it', async () => {
		const engine = createHttpFilterEngine({ dataset: 'books' });

		expect(await engine.getSourceData()).toHaveLength(5);
		await engine.getSourceData();

		const corpusCalls = (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls.filter(([url]) => String(url).includes('/corpus/'));

		expect(corpusCalls).toHaveLength(1);
		// The `.json` file name is the contract: deployed, this URL is a static file in the app's assets.
		expect(String(corpusCalls[0]?.[0])).toBe('/api/corpus/books.json');
	});

	it('targets the configured baseUrl (the SvelteKit in-process endpoints)', async () => {
		const engine = createHttpFilterEngine({ baseUrl: '/books-server', dataset: 'books' });

		await engine.getSourceData();

		const calls = (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls as readonly (readonly unknown[])[];
		const corpusCall = calls.find((call) => String(call[0]).includes('/corpus/'));

		expect(String(corpusCall?.[0])).toBe('/books-server/corpus/books.json');
	});

	it('derives result count + indices from a single memoized /query round-trip', async () => {
		const engine = createHttpFilterEngine();

		expect(await engine.getResultCount()).toBe(3);
		expect([...(await engine.getResultIndices())]).toEqual([0, 1, 2]);

		// Both getters shared ONE POST (the sync cache), until a mutation invalidates it.
		expect(postedBodies).toHaveLength(1);
	});

	it('materializes results by joining indices against the corpus', async () => {
		const engine = createHttpFilterEngine();
		const results = await engine.getResults();

		expect(results.map((book) => (book as { id: string }).id)).toEqual(['book-0', 'book-1', 'book-2']);
	});

	it('adds a rule to the posted config + emits rule:added', async () => {
		const engine = createHttpFilterEngine({ debounceMs: 1 });
		const events: ChangeEvent[] = [];

		await engine.subscribe((event) => events.push(event));
		await engine.addRule('genre', inSet('genre', ['fantasy']).serialize() as unknown as FilterRule);

		expect(await engine.getActiveRuleIds()).toEqual(['genre']);
		await engine.getResultIndices(); // forces a fresh sync → captures the config

		const lastBody = postedBodies.at(-1);

		expect(lastBody?.config.rules.map((rule) => rule.id)).toContain('genre');
		await new Promise((resolve) => setTimeout(resolve, 10));
		expect(events.at(-1)).toMatchObject({ ruleId: 'genre', type: 'rule:added' });
	});

	it('removes a rule + emits rule:removed (reset when nothing was removed)', async () => {
		const engine = createHttpFilterEngine({ debounceMs: 1 });
		const events: ChangeEvent[] = [];

		await engine.subscribe((event) => events.push(event));
		await engine.addRule('genre', inSet('genre', ['fantasy']).serialize() as unknown as FilterRule);
		await engine.removeRule('genre');
		await new Promise((resolve) => setTimeout(resolve, 10));
		expect(events.at(-1)).toMatchObject({ ruleId: 'genre', type: 'rule:removed' });

		await engine.removeRule('absent');
		await new Promise((resolve) => setTimeout(resolve, 10));
		expect(events.at(-1)).toMatchObject({ type: 'reset' });
	});

	it('maps the /query response into a FilterBundle with typed arrays', async () => {
		queryResponse = {
			chipGroups: [{ candidates: [{ projectedCount: 12, value: 'fantasy', wouldBeEmpty: false }], ruleId: 'genre' }],
			fields: [{ bounds: { max: 900, min: 20 }, fieldKey: 'pageCount', histogram: { bucketEdges: [0, 500, 1000], counts: [3, 7]}, ruleId: 'page-count' }],
			matched: 2,
			resultIndices: [1, 4],
		};
		const engine = createHttpFilterEngine();
		const bundle = await engine.applyFiltersAndQuery({ chipGroups: [{ candidates: ['fantasy'], field: 'genre', kind: 'inSet', ruleId: 'genre' }]});

		expect(bundle.resultIndices).toBeInstanceOf(Uint32Array);
		expect([...bundle.resultIndices]).toEqual([1, 4]);
		expect(bundle.resultCount).toBe(2);
		expect(bundle.chipGroups[0]?.candidates[0]).toMatchObject({ projectedCount: 12, value: 'fantasy', wouldBeEmpty: false });
		expect(bundle.fields[0]?.histogram.bucketEdges).toBeInstanceOf(Float64Array);
		expect(bundle.fields[0]?.histogram.counts).toBeInstanceOf(Uint32Array);
	});

	it('round-trips a config through loadConfig / exportConfig', async () => {
		const engine = createHttpFilterEngine();
		const config = { rules: [{ id: 'genre', rule: inSet('genre', ['mystery']).serialize() }], version: 1 as const };

		await engine.loadConfig(config);

		const exported = await engine.exportConfig();

		expect(exported.rules.map((entry) => entry.id)).toEqual(['genre']);
	});

	it('throws a clear error on a non-2xx response', async () => {
		queryResponse = { error: 'boom' };
		vi.stubGlobal('fetch', vi.fn(async () => Promise.resolve(new Response('{}', { status: 500 }))));
		const engine = createHttpFilterEngine();

		await expect(engine.getResultCount()).rejects.toThrow(/responded 500/);
	});
});

describe('mutation events + lifecycle', () => {
	/**
	 * Capture the next emitted change event.
	 *
	 * @param engine - The engine to subscribe to.
	 * @returns A promise resolving with the first event emitted after subscription.
	 */
	async function nextEvent(engine: ReturnType<typeof createHttpFilterEngine>): Promise<ChangeEvent> {
		return new Promise<ChangeEvent>((resolve) => {
			void engine.subscribe((event) => {
				resolve(event);
			});
		});
	}

	it('emits rule:changed rather than rule:added when the rule already exists', async () => {
		// The `isNew` ternary. Re-adding under an existing id is what every slider drag and chip
		// toggle does, so this is the COMMON path — reporting it as `rule:added` would make the
		// devtools action log show an add per keystroke and mislead the Redux mirror bridge.
		const engine = createHttpFilterEngine({ dataset: 'books', debounceMs: 0 });

		await engine.addRule('genre', inSet('genre', ['fantasy']).serialize() as unknown as FilterRule);
		const changed = nextEvent(engine);

		await engine.addRule('genre', inSet('genre', ['mystery']).serialize() as unknown as FilterRule);

		expect((await changed).type).toBe('rule:changed');
	});

	it('posts an empty facet query when applyFiltersAndQuery is called with no argument', async () => {
		// `query ?? {}`. An undefined query on the wire would make the server derive a DEFAULT facet
		// bundle — real work, and a different response shape than the caller asked for.
		const engine = createHttpFilterEngine({ dataset: 'books' });

		await engine.applyFiltersAndQuery();

		expect(postedBodies.at(-1)?.query).toEqual({});
	});

	it.each([
		['clearRules', async (engine: ReturnType<typeof createHttpFilterEngine>): Promise<void> => engine.clearRules()],
		['reset', async (engine: ReturnType<typeof createHttpFilterEngine>): Promise<void> => engine.reset()],
	])('%s drops every rule and emits reset', async (_label, act) => {
		const engine = createHttpFilterEngine({ dataset: 'books', debounceMs: 0 });

		await engine.addRule('genre', inSet('genre', ['fantasy']).serialize() as unknown as FilterRule);
		const reset = nextEvent(engine);

		await act(engine);

		expect((await reset).type).toBe('reset');
		expect(await engine.getActiveRuleIds()).toEqual([]);
	});

	it('escalates a heterogeneous coalesced burst to reset (a clear-all refreshes the rules mirror)', async () => {
		// The /wine-server "clear all" fires `removeRule` for a facet and THEN `setExpression(null)`,
		// synchronously. On this debounced tier the two collapse into ONE delivered event; keeping only
		// the trailing `expression` would refresh expression + results but NOT the rules, so the header's
		// active-filter chips would survive the clear. Different refresher groups → escalate to `reset`.
		const engine = createHttpFilterEngine({ dataset: 'books', debounceMs: 10 });

		await engine.addRule('genre', inSet('genre', ['fantasy']).serialize() as unknown as FilterRule);
		await new Promise((resolve) => setTimeout(resolve, 20));
		const next = nextEvent(engine);

		await engine.removeRule('genre');
		await engine.setExpression(null);

		expect((await next).type).toBe('reset');
	});

	it('coalesces a SAME-group burst without escalating (rule burst stays a rule event)', async () => {
		// The counterpart: two `rule:*` events share a refresher, so an add-then-remove of DIFFERENT ids
		// must NOT escalate — it coalesces to the last rule event (which still re-pulls the whole rule set).
		const engine = createHttpFilterEngine({ dataset: 'books', debounceMs: 10 });
		const next = nextEvent(engine);

		await engine.addRule('genre', inSet('genre', ['fantasy']).serialize() as unknown as FilterRule);
		await engine.removeRule('genre');

		expect((await next).type).toBe('rule:removed');
	});

	it('escalates when a reset event lands mid-burst (exercises the reset refresh group)', async () => {
		// A rule add, then removing a rule that DOES NOT exist — the latter emits `reset` (nothing was
		// removed). `rules` vs `reset` are different refresh groups → escalate. This is the path that
		// hands a `reset`-typed event to `refreshGroupOf` (its `default` arm), unlike the other burst
		// tests whose events are all `rule:*` / `expression`.
		const engine = createHttpFilterEngine({ dataset: 'books', debounceMs: 10 });
		const next = nextEvent(engine);

		await engine.addRule('genre', inSet('genre', ['fantasy']).serialize() as unknown as FilterRule);
		await engine.removeRule('does-not-exist');

		expect((await next).type).toBe('reset');
	});

	it('loadConfig replaces the rule set wholesale', async () => {
		const engine = createHttpFilterEngine({ dataset: 'books', debounceMs: 0 });

		await engine.addRule('stale', inSet('genre', ['fantasy']).serialize() as unknown as FilterRule);
		await engine.loadConfig({ rules: [{ id: 'fresh', rule: inSet('genre', ['mystery']).serialize() }], version: 1 });

		expect(await engine.getActiveRuleIds()).toEqual(['fresh']);
	});

	it('destroy cancels a pending emit so no listener fires after teardown', async () => {
		// The debounce means a mutation can be in flight when a route unmounts. Firing into a torn-down
		// adapter is how "setState on an unmounted component" bugs appear in the server-backed route.
		const engine = createHttpFilterEngine({ dataset: 'books', debounceMs: 20 });
		const seen: ChangeEvent[] = [];

		await engine.subscribe((event) => {
			seen.push(event);
		});
		await engine.reset();
		await engine.destroy();
		await new Promise((resolve) => setTimeout(resolve, 40));

		expect(seen).toEqual([]);
	});

	it('destroy is a no-op when no emit is pending', async () => {
		// The route can unmount without the user having touched a filter. `destroy` guards on the timer
		// being non-null; clearing a null handle would throw and turn a clean teardown into a console
		// error on every visit that filtered nothing.
		const engine = createHttpFilterEngine({ dataset: 'books', debounceMs: 20 });

		await expect(engine.destroy()).resolves.toBeUndefined();
	});

	it('unsubscribing stops delivery', async () => {
		const engine = createHttpFilterEngine({ dataset: 'books', debounceMs: 0 });
		const seen: ChangeEvent[] = [];
		const unsubscribe = await engine.subscribe((event) => {
			seen.push(event);
		});

		unsubscribe();
		await engine.reset();
		await new Promise((resolve) => setTimeout(resolve, 10));

		expect(seen).toEqual([]);
	});

	it('rejects simulate() with a message pointing at the supported alternative', async () => {
		// Deliberately unsupported over the wire: a per-candidate simulation would be one round-trip
		// per chip. The message has to name the replacement or a caller has no way to know what to do.
		const engine = createHttpFilterEngine({ dataset: 'books' });

		await expect(engine.simulate({})).rejects.toThrow(/applyFiltersAndQuery/);
	});
});

describe('expression mode (smart filters)', () => {
	/** Build the serialized composite the core shim hands `setExpression` (it calls `.serialize()`). */
	function serializedExpression(): CompositeRule {
		return or(inSet('genre', ['fantasy']), inSet('genre', ['mystery'])).serialize() as unknown as CompositeRule;
	}

	it('setExpression posts a config carrying the expression tree + its hoisted leaf rules', async () => {
		// The failure this guards: a no-op setExpression would never send the expression to the server,
		// the config posted would be empty, and smart-filter presets would filter nothing.
		const engine = createHttpFilterEngine({ dataset: 'books', debounceMs: 0 });

		await engine.setExpression(serializedExpression());
		await engine.applyFiltersAndQuery();

		const config = postedBodies.at(-1)?.config;
		const expr = config?.expression;

		expect(expr?.type).toBe('composite');
		// A reference tree: an `or` of two leaves, each pointing at a rule id present in `config.rules`.
		expect(expr && 'op' in expr ? expr.op : undefined).toBe('or');
		const leafIds = expr && 'children' in expr
			? expr.children.map((child) => ('ruleId' in child ? child.ruleId : undefined))
			: [];

		expect(leafIds).toHaveLength(2);
		for (const id of leafIds) {
			expect(config?.rules.some((rule) => rule.id === id)).toBe(true);
		}
	});

	it('getExpression reflects the current mode (non-null under an expression, null in flat-map)', async () => {
		const engine = createHttpFilterEngine({ dataset: 'books', debounceMs: 0 });

		expect(await engine.getExpression()).toBeNull();

		await engine.setExpression(serializedExpression());
		expect(await engine.getExpression()).not.toBeNull();

		await engine.setExpression(null);
		expect(await engine.getExpression()).toBeNull();
	});

	it('setExpression(null) returns to flat-map — the posted config has no expression', async () => {
		const engine = createHttpFilterEngine({ dataset: 'books', debounceMs: 0 });

		await engine.setExpression(serializedExpression());
		await engine.setExpression(null);
		await engine.applyFiltersAndQuery();

		expect(postedBodies.at(-1)?.config.expression).toBeUndefined();
	});

	it('emits an expression change event so the reactive stack refreshes its mode', async () => {
		const engine = createHttpFilterEngine({ dataset: 'books', debounceMs: 0 });
		const seen: ChangeEvent[] = [];

		await engine.subscribe((event) => {
			seen.push(event);
		});
		await engine.setExpression(serializedExpression());
		await new Promise((resolve) => setTimeout(resolve, 5));

		expect(seen.at(-1)?.type).toBe('expression');
	});

	it('loadConfig restores an expression, and clearRules drops it', async () => {
		const engine = createHttpFilterEngine({ dataset: 'books', debounceMs: 0 });

		// Round-trip: capture the config an expression produces, then load it into a fresh state.
		await engine.setExpression(serializedExpression());
		await engine.applyFiltersAndQuery();
		const exported = postedBodies.at(-1)?.config;

		await engine.reset();
		expect(await engine.getExpression()).toBeNull();

		await engine.loadConfig({ ...exported, rules: exported?.rules ?? [], version: 1 } as Parameters<typeof engine.loadConfig>[0]);
		expect(await engine.getExpression()).not.toBeNull();

		await engine.clearRules();
		expect(await engine.getExpression()).toBeNull();
	});
});

describe('read-side accessors', () => {
	it('returns a stored rule by id, and undefined for an unknown id', async () => {
		const engine = createHttpFilterEngine({ dataset: 'books', debounceMs: 0 });

		await engine.addRule('genre', inSet('genre', ['fantasy']).serialize() as unknown as FilterRule);

		expect(await engine.getRule('genre')).toBeDefined();
		expect(await engine.getRule('nope')).toBeUndefined();
	});

	it('exposes the rule map', async () => {
		const engine = createHttpFilterEngine({ dataset: 'books', debounceMs: 0 });

		await engine.addRule('genre', inSet('genre', ['fantasy']).serialize() as unknown as FilterRule);

		expect([...(await engine.getRules()).keys()]).toEqual(['genre']);
	});

	it('throws a clear error when the corpus endpoint fails', async () => {
		// The GET error path, distinct from the POST one already covered. Boot fetches the corpus
		// first, so this is the failure a user meets before anything renders.
		vi.stubGlobal('fetch', vi.fn(async () => Promise.resolve(new Response('nope', { status: 503 }))));

		const engine = createHttpFilterEngine({ dataset: 'books' });

		await expect(engine.getSourceData()).rejects.toThrow(/responded 503 for GET \/corpus\/books\.json/);
	});
});

describe('unsupported contract members', () => {
	// `FilterEngineAsync` is a wide interface; the HTTP transport implements the parts a server-backed
	// books route uses and satisfies the rest with documented no-ops. They are asserted rather than
	// ignored because the VALUES matter: a consumer that reads `getGroups()` must get an empty array,
	// not undefined, or it crashes on `.map`. This is the contract, not decoration.
	it.each([
		['getActionLogSnapshot', async (e: ReturnType<typeof createHttpFilterEngine>): Promise<unknown> => e.getActionLogSnapshot(), []],
		['getExpression', async (e: ReturnType<typeof createHttpFilterEngine>): Promise<unknown> => e.getExpression(), null],
		['getGroups', async (e: ReturnType<typeof createHttpFilterEngine>): Promise<unknown> => e.getGroups(), []],
		['getDevtoolsState', async (e: ReturnType<typeof createHttpFilterEngine>): Promise<unknown> => e.getDevtoolsState(), { canRedo: false, canUndo: false, currentIndex: -1, total: 0 }],
	])('%s resolves to its documented empty value', async (_label, read, expected) => {
		expect(await read(createHttpFilterEngine({ dataset: 'books' }))).toEqual(expected);
	});

	it('getFilteredFieldValuesExcept resolves to an empty Float64Array', async () => {
		const values = await createHttpFilterEngine({ dataset: 'books' }).getFilteredFieldValuesExcept('pageCount', 'x');

		expect(values).toBeInstanceOf(Float64Array);
		expect(values).toHaveLength(0);
	});

	it.each([
		['addGroup', async (e: ReturnType<typeof createHttpFilterEngine>): Promise<void> => e.addGroup({} as never)],
		['removeGroup', async (e: ReturnType<typeof createHttpFilterEngine>): Promise<void> => e.removeGroup('g')],
		['setExpression', async (e: ReturnType<typeof createHttpFilterEngine>): Promise<void> => e.setExpression(null)],
		['setSourceData', async (e: ReturnType<typeof createHttpFilterEngine>): Promise<void> => e.setSourceData([])],
		['setWorkingSet', async (e: ReturnType<typeof createHttpFilterEngine>): Promise<void> => e.setWorkingSet([])],
		['resetWorkingSet', async (e: ReturnType<typeof createHttpFilterEngine>): Promise<void> => e.resetWorkingSet()],
		['undoDevtools', async (e: ReturnType<typeof createHttpFilterEngine>): Promise<void> => e.undoDevtools()],
		['redoDevtools', async (e: ReturnType<typeof createHttpFilterEngine>): Promise<void> => e.redoDevtools()],
		['jumpToDevtoolsIndex', async (e: ReturnType<typeof createHttpFilterEngine>): Promise<void> => e.jumpToDevtoolsIndex(0)],
	])('%s resolves without throwing', async (_label, act) => {
		await expect(act(createHttpFilterEngine({ dataset: 'books' }))).resolves.toBeUndefined();
	});
});
