/**
 * Tests for the origin rule every wine app commits.
 *
 * @remarks
 * The callers are the six apps' origin sections, four of which sit in packages whose suites do not feed
 * the root coverage report, so the helpers are tested here, where they live. The fake engine is a spy
 * bag, as in `commit.test.ts`: these functions decide which engine calls to make and with what rule,
 * and make no decision that depends on a result.
 *
 * @packageDocumentation
 */

import { InSetofSetsRule, type RuleId } from '@filter-enginez/core';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { wineBusyCore } from '../engineBusyCore.js';
import { type OriginNodeSpec } from './bundle.js';
import { type WineEngineHost } from './commit.js';
import { buildWineOriginRule, commitOriginSelection, writeOriginSelection } from './originRule.js';

const addRule = vi.fn<(ruleId: RuleId, rule: unknown) => void>();
const removeRule = vi.fn<(ruleId: RuleId) => void>();

/**
 * A structural stand-in for the engine facade.
 *
 * @returns The fake host.
 */
function fakeHost(): WineEngineHost {
	return { core: { addRule, removeRule }} as unknown as WineEngineHost;
}

/** The specs `buildOriginNodeSpecs` produces for US (Oregon, California) and France (Bordeaux), pre-order. */
const SPECS: readonly OriginNodeSpec[] = [
	{ depth: 0, label: 'US', leafIds: ['US', 'US|Oregon', 'US|California'], value: 'US' },
	{ depth: 1, label: 'Oregon', leafIds: ['US|Oregon'], value: 'US|Oregon' },
	{ depth: 1, label: 'California', leafIds: ['US|California'], value: 'US|California' },
	{ depth: 0, label: 'France', leafIds: ['France', 'France|Bordeaux'], value: 'France' },
	{ depth: 1, label: 'Bordeaux', leafIds: ['France|Bordeaux'], value: 'France|Bordeaux' },
];

beforeEach(() => {
	addRule.mockClear();
	removeRule.mockClear();
});

describe('buildWineOriginRule', () => {
	it('commits one set per selected node over originId, in the tree’s order whatever the selection’s', () => {
		const rule = buildWineOriginRule(['France|Bordeaux', 'US'], SPECS);

		expect(rule).toBeInstanceOf(InSetofSetsRule);
		expect(rule.serialize()).toEqual({
			config: { set: [['US', 'US|Oregon', 'US|California'], ['France|Bordeaux']]},
			field: 'originId',
			type: 'InSetofSetsRule',
		});
		expect(buildWineOriginRule(['US', 'France|Bordeaux'], SPECS).serialize()).toEqual(rule.serialize());
	});

	it('skips a selected id the tree has no node for', () => {
		expect(buildWineOriginRule(['Atlantis', 'US|Oregon'], SPECS).config.set).toEqual([['US|Oregon']]);
	});
});

describe('writeOriginSelection', () => {
	it('adds the origin rule for a non-empty selection', () => {
		writeOriginSelection(fakeHost().core, ['US|Oregon'], SPECS);

		expect(removeRule).not.toHaveBeenCalled();
		expect(addRule).toHaveBeenCalledTimes(1);
		expect(addRule.mock.calls[0]?.[0]).toBe('origin');
		expect((addRule.mock.calls[0]?.[1] as InSetofSetsRule<string>).config.set).toEqual([['US|Oregon']]);
	});

	it('removes the rule, rather than committing an empty one, when nothing is selected', () => {
		writeOriginSelection(fakeHost().core, [], SPECS);

		expect(addRule).not.toHaveBeenCalled();
		expect(removeRule).toHaveBeenCalledWith('origin');
	});
});

describe('commitOriginSelection', () => {
	it('bumps the wine busy tracker before writing, like every other wine commit', () => {
		const before = wineBusyCore.captureCurrentVersion();

		removeRule.mockImplementation(() => {
			// At the moment of the write, the version has already moved.
			expect(wineBusyCore.captureCurrentVersion()).toBe(before + 1);
		});
		commitOriginSelection(fakeHost(), [], SPECS);
		removeRule.mockReset();

		expect(wineBusyCore.captureCurrentVersion()).toBe(before + 1);
	});

	it('writes the same rule writeOriginSelection does', () => {
		commitOriginSelection(fakeHost(), ['France'], SPECS);

		expect((addRule.mock.calls[0]?.[1] as InSetofSetsRule<string>).config.set).toEqual([['France', 'France|Bordeaux']]);
	});
});
