/**
 * `@filter-enginez/examples-shared/devtools-core` — the devtools panel's framework-free half.
 *
 * @remarks
 * `./devtools`'s own docblock says that "a Svelte / Vue / Angular / vanilla port needs the markup and
 * the cursor bookkeeping, and nothing else". This module is what makes that true: every decision the panel makes that is NOT markup lives
 * here, so four ports render four templates over one set of rules instead of re-deriving them.
 *
 * What that covers, and why each piece would otherwise drift:
 *
 *   - **{@link normalizeEntry}** — the action log stores raw dispatcher actions, and the panel wants a
 *     flat row. Reimplementing the flattening per vertical means four answers to "what does a
 *     `RULE_CHANGED` with a `groupId` read as", over the same log.
 *   - **{@link actionTypeTone} / {@link actionTypeLabel}** — the color and the short label are design-system
 *     vocabulary. A vertical inventing its own `removeRule` label is the same class of drift as the
 *     `single-family` / `single family` formatter split that `real-estate-domain` exists to prevent.
 *   - **{@link formatLogTime}** — a fourth spelling of `HH:MM:SS` is a fourth chance to differ on padding.
 *   - **{@link indexFromScrubPointer}** — the drag-scrub math, including the 6px thumb inset and the
 *     single-entry special case. This is the one with real edge cases, and the one where a per-vertical
 *     copy would be found by nobody.
 *
 * **No engine import, and no framework import.** The panel's remaining job — subscribe, hold an
 * optimistic cursor, call `devtools.jumpTo` — is genuinely per-framework, because it is exactly the
 * part each reactivity system expresses differently.
 *
 * @packageDocumentation
 */

/**
 * One row in the panel, flattened from the action log.
 *
 * @remarks
 * Declared here rather than imported from `react-ui` so a non-React vertical does not reach into a
 * React package for a plain data shape. `react-ui` re-exports this as `DevtoolsLogEntry`, so the
 * React panel's existing imports are unchanged and there is still ONE declaration.
 */
export interface DevtoolsEntry {
	/** The dispatcher action type, e.g. `RULE_ADDED`. */
	readonly type: string;
	/** When it was recorded. */
	readonly timestamp: number;
	/** Human gloss — the rule/group id in angle brackets, or the lower-cased type. */
	readonly summary: string;
	/** Where it came from, when the log recorded one. */
	readonly source?: string;
}

/** Short labels for the action-type column — design-system voice. @internal */
const ACTION_TYPE_LABELS: Record<string, string> = {
	EXPRESSION_SET: 'setExpression',
	GROUP_ADDED: 'addGroup',
	GROUP_REMOVED: 'removeGroup',
	RESET: 'reset',
	RULE_ADDED: 'addRule',
	RULE_CHANGED: 'changeRule',
	RULE_REMOVED: 'removeRule',
	RULES_CLEARED: 'clearRules',
	SOURCE_DATA_SET: 'setSourceData',
	WORKING_SET_RESET: 'resetWorkingSet',
	WORKING_SET_SET: 'setWorkingSet',
};

/** Action types that REMOVE something — painted with the danger tone. @internal */
const REMOVING_TYPES = new Set(['GROUP_REMOVED', 'RESET', 'RULE_REMOVED', 'RULES_CLEARED', 'WORKING_SET_RESET']);

/** Action types that ADD something. @internal */
const ADDING_TYPES = new Set(['GROUP_ADDED', 'RULE_ADDED']);

/** The BEM modifier suffix a row's type badge carries. */
export type ActionTone = 'added' | 'danger' | 'neutral';

/**
 * The tone a row's type badge is painted in.
 *
 * @param type - The dispatcher action type.
 * @returns The `fe-devtools-row__type--*` modifier suffix.
 */
export function actionTypeTone(type: string): ActionTone {
	if (REMOVING_TYPES.has(type)) {
		return 'danger';
	}

	return ADDING_TYPES.has(type) ? 'added' : 'neutral';
}

/**
 * The short, human label for an action type.
 *
 * @param type - The dispatcher action type.
 * @returns Its API-shaped label, or the raw type when unmapped — an unknown action should still be
 *   readable rather than blank.
 */
export function actionTypeLabel(type: string): string {
	return ACTION_TYPE_LABELS[type] ?? type;
}

/**
 * Format a log timestamp as `HH:MM:SS`.
 *
 * @param timestamp - Epoch milliseconds.
 * @returns A zero-padded 24-hour clock time.
 */
export function formatLogTime(timestamp: number): string {
	const date = new Date(timestamp);
	const hours = String(date.getHours()).padStart(2, '0');
	const minutes = String(date.getMinutes()).padStart(2, '0');
	const seconds = String(date.getSeconds()).padStart(2, '0');

	return `${hours}:${minutes}:${seconds}`;
}

/** Half the timeline thumb's width — the strip insets its dots by this much at each end. @internal */
const SCRUB_THUMB_INSET_PX = 6;

/**
 * Which log index a pointer at `clientX` is scrubbing to.
 *
 * @remarks
 * The 6px inset at each end is not cosmetic: the dots are centered on their positions, so the first
 * and last sit half a thumb inside the strip. Without it, the extreme ends of the drag are
 * unreachable — you can never scrub to entry 0.
 *
 * A single-entry log short-circuits to 0 rather than dividing by a zero-width span.
 *
 * @param clientX - The pointer's viewport x.
 * @param stripRect - The scrub strip's bounding rect.
 * @param entryCount - How many entries the log holds.
 * @returns A valid index into the log, clamped to its bounds.
 */
export function indexFromScrubPointer(
	clientX: number,
	stripRect: { readonly left: number; readonly width: number },
	entryCount: number,
): number {
	if (entryCount <= 1) {
		return 0;
	}
	const usableWidth = stripRect.width - SCRUB_THUMB_INSET_PX * 2;

	if (usableWidth <= 0) {
		return 0;
	}
	const offsetX = Math.max(0, Math.min(usableWidth, clientX - stripRect.left - SCRUB_THUMB_INSET_PX));

	return Math.round((offsetX / usableWidth) * (entryCount - 1));
}

/**
 * Which index an arrow / Home / End key moves the cursor to, or `null` for a key that does not scrub.
 *
 * @remarks
 * Returning `null` rather than the current index is what lets a caller decide whether to
 * `preventDefault`: a key this does not handle must keep its browser behavior.
 *
 * @param key - The `KeyboardEvent.key`.
 * @param activeCursor - Where the cursor is now.
 * @param entryCount - How many entries the log holds.
 * @returns The next index, or `null`.
 */
export function scrubIndexForKey(key: string, activeCursor: number, entryCount: number): number | null {
	if (key === 'ArrowLeft') {
		return Math.max(0, activeCursor - 1);
	}
	if (key === 'ArrowRight') {
		return Math.min(entryCount - 1, activeCursor + 1);
	}
	if (key === 'Home') {
		return 0;
	}

	return key === 'End' ? entryCount - 1 : null;
}

/**
 * Flatten one action-log record into a panel row.
 *
 * @remarks
 * The log holds raw dispatcher actions (`{ action: { type, payload }, meta }`), but a caller may also
 * hand back something already flattened — the worker tier's devtools mirror does. Both shapes arrive
 * here, so the already-flat case is detected and passed through rather than re-wrapped.
 *
 * @param raw - One log record, in either shape.
 * @returns The row the panel renders.
 */
export function normalizeEntry(raw: unknown): DevtoolsEntry {
	const record = raw as {
		readonly action?: { readonly payload?: Record<string, unknown>; readonly type: string };
		readonly meta?: { readonly source?: string };
	} & Partial<DevtoolsEntry>;

	if (typeof record.summary === 'string' && typeof record.type === 'string') {
		return record as DevtoolsEntry;
	}
	const action = record.action;

	if (action === undefined) {
		return { summary: '?', timestamp: record.timestamp ?? 0, type: 'unknown' };
	}
	const payload = action.payload ?? {};
	let summary: string;

	if (typeof payload['ruleId'] === 'string') {
		summary = `<${payload['ruleId']}>`;
	} else if (typeof payload['groupId'] === 'string') {
		summary = `<${payload['groupId']}>`;
	} else {
		summary = action.type.toLowerCase();
	}
	const entry: DevtoolsEntry = { summary, timestamp: record.timestamp ?? Date.now(), type: action.type };

	return record.meta?.source === undefined ? entry : { ...entry, source: record.meta.source };
}
