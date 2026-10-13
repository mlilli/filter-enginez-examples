/**
 * Which state `/compare` is transporting, and where it came from.
 *
 * @remarks
 * The one piece of `/compare` that is neither link algebra nor markup: given the three query
 * parameters and the visitor's format preference, decide what goes in the six `?f=` values and what
 * the provenance line says above them.
 *
 * ### Why it is here rather than in each shell
 *
 * React's `ComparePage.tsx`, SvelteKit's `CompareView.svelte`, and the Vue, Angular and vanilla
 * compare pages all need it, and the rule is not a formatting detail: **an inbound `?f=` must be passed through
 * VERBATIM**, never decoded and re-encoded. A shell that round-tripped it would still work, and would
 * quietly be demonstrating something weaker than the page claims — that an EQUIVALENT state reaches
 * the other five, rather than the visitor's own bytes. A rule whose violation looks like success is
 * exactly the kind that should exist once.
 *
 * ### Why `state.ts` and not `links.ts`
 *
 * This module imports the serializer; `links.ts` imports nothing outside `compare/` and the vertical
 * registry. Two e2e specs reach into `links.js` by relative path (Playwright does not transform files
 * under `node_modules`, so the package's own subpaths are unavailable to them), and keeping that file
 * dependency-free is what makes those imports cost nothing. Folding this in would drag
 * `url-state-router` into the Playwright program for two constants.
 *
 * @packageDocumentation
 */

import {
	type BuiltInSerializerName,
	createTaggedSerializer,
} from '@filter-enginez/url-state-router/serializers';

import { type CompareDataset, hasComparableState } from './links.js';
import { COMPARE_PRESETS, findPreset } from './presets.js';

/** The provenance line shown when the visitor arrived carrying their own state. */
export const INBOUND_STATE_LABEL = 'from your link';

/** What `/compare` is transporting, and the line describing where it came from. */
export interface CompareState {
	/** The value every link on the page carries in its `?f=`. */
	readonly serialized: string;
	/** Human provenance — {@link INBOUND_STATE_LABEL}, or `preset · <label>`. */
	readonly sourceLabel: string;
}

/** Inputs to {@link resolveCompareState} — the three query parameters plus the format preference. */
export interface CompareStateOptions {
	/** Which dataset's presets to fall back to. */
	readonly dataset: CompareDataset;
	/**
	 * The serializer format a preset is encoded in.
	 *
	 * @remarks
	 * Ignored entirely on the inbound path, which is the point: the visitor's bytes are not re-encoded
	 * into the reader's preferred format. Taken as a value rather than as an `encode` callback so the
	 * five shells do not each construct a serializer — the format is the only thing they differ on, and
	 * each of them holds it in a different reactive primitive (a Svelte store, a Vue ref, an Angular
	 * signal, a React hook, a plain getter).
	 */
	readonly format: BuiltInSerializerName;
	/** A `?f=` the visitor arrived with. `null` or empty both mean "they came in cold". */
	readonly inboundState: string | null;
	/** The `?preset=` they chose, or `null` for this dataset's default. */
	readonly presetId: string | null;
}

/**
 * Decide what the links carry.
 *
 * @remarks
 * **An inbound `?f=` wins and is returned untouched.** See the module docblock — that is the whole
 * claim, and re-encoding would weaken it invisibly.
 *
 * Otherwise a preset is encoded in the requested format: the named one, or this dataset's first.
 * There is no empty result and no "no state" branch, because {@link COMPARE_PRESETS} is typed
 * non-empty — every dataset has at least one, which `core.test.ts` independently asserts by loading
 * each into a real engine. An unreachable fallback would be a branch no test could cover, and the
 * only gate that can see one is the coverage run, which a plain `pnpm test` does not include. For the
 * same reason, callers need no `serialized === '' ? [] : …` guard downstream.
 *
 * @param options - See {@link CompareStateOptions}.
 * @returns The state to transport, and its provenance line.
 */
export function resolveCompareState(options: CompareStateOptions): CompareState {
	const { dataset, format, inboundState, presetId } = options;

	if (hasComparableState(inboundState)) {
		return { serialized: inboundState, sourceLabel: INBOUND_STATE_LABEL };
	}

	const active = findPreset(dataset, presetId ?? '') ?? COMPARE_PRESETS[dataset][0];

	return {
		serialized: createTaggedSerializer(format).encode(active.config),
		sourceLabel: `preset · ${active.label}`,
	};
}
