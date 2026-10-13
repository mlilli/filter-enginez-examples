/**
 * Tests for the devtools panel's framework-free half.
 *
 * @remarks
 * These exist because four verticals are about to render over this module. Every case below is one a
 * per-vertical copy could plausibly get wrong in a different way — which is the entire
 * argument for the module existing.
 *
 * @packageDocumentation
 */

import { describe, expect, it } from 'vitest';

import {
	actionTypeLabel,
	actionTypeTone,
	formatLogTime,
	indexFromScrubPointer,
	normalizeEntry,
	scrubIndexForKey,
} from './devtoolsCore.js';

/** A strip 206px wide starting at x=10 — 194px usable once the 6px thumb inset is taken off each end. */
const STRIP = { left: 10, width: 206 };

describe('actionTypeTone', () => {
	it.each(['RULE_REMOVED', 'GROUP_REMOVED', 'RULES_CLEARED', 'RESET', 'WORKING_SET_RESET'])(
		'paints %s as danger',
		(type) => {
			expect(actionTypeTone(type)).toBe('danger');
		},
	);

	it.each(['RULE_ADDED', 'GROUP_ADDED'])('paints %s as added', (type) => {
		expect(actionTypeTone(type)).toBe('added');
	});

	it('paints anything else neutral', () => {
		// Including types that MUTATE rather than add or remove — `RULE_CHANGED` is the common one, and
		// reading it as "added" would make an edit look like a new filter in the timeline.
		expect(actionTypeTone('RULE_CHANGED')).toBe('neutral');
		expect(actionTypeTone('EXPRESSION_SET')).toBe('neutral');
		expect(actionTypeTone('SOMETHING_NEW')).toBe('neutral');
	});
});

describe('actionTypeLabel', () => {
	it('maps a known type to its API-shaped label', () => {
		expect(actionTypeLabel('RULE_ADDED')).toBe('addRule');
		expect(actionTypeLabel('WORKING_SET_RESET')).toBe('resetWorkingSet');
	});

	it('falls back to the raw type rather than blank', () => {
		// A future action type must still be readable in the log. Returning '' would render an empty
		// badge, which looks like a rendering bug rather than an unmapped label.
		expect(actionTypeLabel('BRAND_NEW_ACTION')).toBe('BRAND_NEW_ACTION');
	});
});

describe('formatLogTime', () => {
	it('zero-pads every field', () => {
		const at = new Date(2026, 6, 31, 9, 5, 3).getTime();

		expect(formatLogTime(at)).toBe('09:05:03');
	});

	it('uses a 24-hour clock', () => {
		expect(formatLogTime(new Date(2026, 6, 31, 23, 59, 59).getTime())).toBe('23:59:59');
	});
});

describe('indexFromScrubPointer', () => {
	it('reaches index 0 at the very start of the strip', () => {
		// The reason the 6px inset exists. Dots are CENTERED on their positions, so the first sits half a
		// thumb inside the strip; without the inset the leftmost drag position never resolves to 0 and
		// the first entry is unreachable by pointer.
		expect(indexFromScrubPointer(STRIP.left, STRIP, 5)).toBe(0);
		expect(indexFromScrubPointer(STRIP.left - 40, STRIP, 5)).toBe(0);
	});

	it('reaches the last index at the very end', () => {
		expect(indexFromScrubPointer(STRIP.left + STRIP.width, STRIP, 5)).toBe(4);
		expect(indexFromScrubPointer(STRIP.left + STRIP.width + 40, STRIP, 5)).toBe(4);
	});

	it('lands on the middle index at the midpoint', () => {
		expect(indexFromScrubPointer(STRIP.left + STRIP.width / 2, STRIP, 5)).toBe(2);
	});

	it('returns 0 for a single-entry log rather than dividing by a zero span', () => {
		expect(indexFromScrubPointer(STRIP.left + 100, STRIP, 1)).toBe(0);
	});

	it('returns 0 for an empty log', () => {
		expect(indexFromScrubPointer(STRIP.left + 100, STRIP, 0)).toBe(0);
	});

	it('returns 0 when the strip is narrower than its own insets', () => {
		// A panel that is open but not yet laid out measures 0 wide. Without the guard the ratio is a
		// division by a negative span and the cursor jumps somewhere arbitrary on the first frame.
		expect(indexFromScrubPointer(5, { left: 0, width: 8 }, 5)).toBe(0);
	});
});

describe('scrubIndexForKey', () => {
	it('steps left and right, clamped', () => {
		expect(scrubIndexForKey('ArrowLeft', 3, 5)).toBe(2);
		expect(scrubIndexForKey('ArrowRight', 3, 5)).toBe(4);
		expect(scrubIndexForKey('ArrowLeft', 0, 5)).toBe(0);
		expect(scrubIndexForKey('ArrowRight', 4, 5)).toBe(4);
	});

	it('jumps to the ends', () => {
		expect(scrubIndexForKey('Home', 3, 5)).toBe(0);
		expect(scrubIndexForKey('End', 1, 5)).toBe(4);
	});

	it('returns null for a key it does not handle', () => {
		// Load-bearing: the caller uses `null` to decide NOT to `preventDefault`, so Tab, typing and
		// browser shortcuts keep working while the scrubber has focus.
		expect(scrubIndexForKey('Tab', 2, 5)).toBeNull();
		expect(scrubIndexForKey('a', 2, 5)).toBeNull();
	});
});

describe('normalizeEntry', () => {
	it('flattens a raw dispatcher action, preferring the rule id', () => {
		const entry = normalizeEntry({
			action: { payload: { ruleId: 'color' }, type: 'RULE_ADDED' },
			meta: { source: 'user' },
			timestamp: 1234,
		});

		expect(entry).toEqual({ source: 'user', summary: '<color>', timestamp: 1234, type: 'RULE_ADDED' });
	});

	it('falls back to the group id when there is no rule id', () => {
		const entry = normalizeEntry({ action: { payload: { groupId: 'g1' }, type: 'GROUP_ADDED' }, timestamp: 7 });

		expect(entry.summary).toBe('<g1>');
	});

	it('falls back to the lower-cased type when the payload names neither', () => {
		expect(normalizeEntry({ action: { type: 'RULES_CLEARED' }, timestamp: 7 }).summary).toBe('rules_cleared');
	});

	it('passes an ALREADY-FLAT entry straight through', () => {
		// The worker tier's devtools mirror hands back rows that are already flat. Re-wrapping them would
		// produce `summary: 'unknown'` for every action on that tier — a log that renders but says
		// nothing, on the one tier where time travel is hardest to reason about.
		const flat = { summary: '<price>', timestamp: 99, type: 'RULE_CHANGED' };

		expect(normalizeEntry(flat)).toBe(flat);
	});

	it('survives a record with no action at all', () => {
		expect(normalizeEntry({ timestamp: 5 })).toEqual({ summary: '?', timestamp: 5, type: 'unknown' });
	});

	it('defaults an actionless record with no timestamp to 0, not to now', () => {
		// The two fallbacks differ on purpose. An unreadable record has no known time, so it sorts to the
		// START of the log rather than jumping to the top as if it had just happened.
		expect(normalizeEntry({})).toEqual({ summary: '?', timestamp: 0, type: 'unknown' });
	});

	it('stamps a real action that arrived without a timestamp with now', () => {
		// The opposite call: the action DID just happen, the log simply did not record when. Dating it to
		// the epoch would bury it at the bottom of the timeline.
		const before = Date.now();
		const entry = normalizeEntry({ action: { payload: { ruleId: 'color' }, type: 'RULE_ADDED' }});

		expect(entry.timestamp).toBeGreaterThanOrEqual(before);
		expect(entry.summary).toBe('<color>');
	});

	it('omits `source` entirely when the log recorded none', () => {
		// Not `source: undefined` — the row is rendered from these keys, and an explicit undefined would
		// have every port deciding separately whether to print an empty source column.
		expect('source' in normalizeEntry({ action: { type: 'RESET' }, timestamp: 1 })).toBe(false);
	});
});
