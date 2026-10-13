/**
 * The suite's timeout budgets, asserted against the config that declares them.
 *
 * @remarks
 * This repo's tests parse real corpora. `mock-data`'s wine datasets are 8.6 MB (default tier),
 * 100 MB and 116 MB (full tiers), and four suites import one of them. Vitest's default per-test
 * budget is 5s, which is sized for I/O-free unit tests and is not enough.
 *
 * ### The failure this pins
 *
 * `how-it-works/benchmark/benchmarkWorkload.test.ts`'s "resolves the bundled wine corpus" calls
 * `loadWineCorpus()` — a dynamic import of the 8.6 MB default tier — from inside the test body, so
 * its cost counts against the per-test budget. In isolation that takes around two seconds, a thin
 * margin against the 5s default. A full parallel run competing for CPU closes that gap, producing an
 * intermittent timeout on a suite that passes when rerun.
 *
 * The other three corpus importers (`wineEngine`, `smartFilters`, `wineCorpusLoader`) are safe only
 * by accident of structure — they import at module top level, where the cost lands in file-import
 * time and counts against no test. Move any one of those loads into a test body or a `beforeAll` and
 * the same flake appears there.
 *
 * ### Why this file rather than trusting the comment in the config
 *
 * A generous timeout looks like slack. It reads as something to tighten during a cleanup pass, and
 * the failure it prevents is intermittent and appears in a file nobody was editing — so the person
 * who reverts it will not connect the two. The config carries the full rationale; this makes
 * removing it fail immediately and loudly instead of weeks later on someone else's branch.
 *
 * Asserted as a FLOOR, not an equality: raising the budget further is always safe, and pinning an
 * exact value would turn a harmless increase into a failing gate.
 */

import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

/**
 * The floor both budgets must clear, in ms.
 *
 * @remarks
 * Well above the measured load time, because the point is headroom rather than a tuned fit — the
 * corpora are regenerated in the engine repository, and a budget sized to their current size is a
 * budget that breaks the next time they grow.
 */
const MINIMUM_TIMEOUT_MS = 20_000;

/** The root Vitest config, read as text — the invariant is about what it DECLARES. */
const configSource = readFileSync(resolve(REPO_ROOT, 'vitest.config.ts'), 'utf8');

/**
 * Read a numeric option off the config source, tolerating numeric separators.
 *
 * @remarks
 * Parsed from source rather than imported: importing the config would evaluate it and hand back
 * resolved defaults, so a DELETED option would read as whatever Vitest fills in — which is exactly
 * the deletion this file exists to catch. Text is the honest source here.
 *
 * @param option - The option name, e.g. `testTimeout`.
 * @returns The declared value in ms, or `null` when the option is absent.
 */
function declaredTimeout(option: string): number | null {
	const match = new RegExp(`^\\s*${option}:\\s*([0-9_]+)\\s*,`, 'mu').exec(configSource);

	if (match?.[1] === undefined) {
		return null;
	}

	return Number(match[1].replace(/_/gu, ''));
}

describe('vitest timeout budgets', () => {
	it.each(['testTimeout', 'hookTimeout'])('declares %s explicitly', (option) => {
		// Absent means Vitest's 5s default applies, which is the flaky state this pins against.
		expect(
			declaredTimeout(option),
			`vitest.config.ts must set ${option} — without it the 5s default applies and the 8.6 MB wine-corpus import flakes. See the comment on testTimeout.`,
		).not.toBeNull();
	});

	it.each(['testTimeout', 'hookTimeout'])('gives %s real headroom over a corpus parse', (option) => {
		expect(
			declaredTimeout(option) ?? 0,
			`${option} must be at least ${MINIMUM_TIMEOUT_MS}ms — the 8.6 MB default-tier wine corpus takes ~2.1s to import in isolation, and a full parallel run has repeatedly exceeded a 5s budget.`,
		).toBeGreaterThanOrEqual(MINIMUM_TIMEOUT_MS);
	});

	it('keeps the two budgets in step', () => {
		// The natural fix for a slow body-level await is to hoist it into `beforeAll`. If the hook
		// budget were the smaller of the two, that move would trade one flake for an identical one a
		// line higher up — so the hook budget must be at least as generous as the test budget.
		expect(declaredTimeout('hookTimeout') ?? 0).toBeGreaterThanOrEqual(
			declaredTimeout('testTimeout') ?? 0,
		);
	});
});
