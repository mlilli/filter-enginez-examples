#!/usr/bin/env node
/**
 * Refuse a coverage-register deletion whose measurement does not actually say 100%.
 *
 * @remarks
 * ### Why this exists
 *
 * `vitest.coverage.config.ts` says that `measure-vanilla-coverage.sh` is what authorizes removing an
 * entry from the `examples-vanilla` register, and that a module short of 100% keeps its entry. A
 * module at 98% looks done, and deleting its entry on that reading turns `pnpm test:coverage` red on a
 * single uncalled function.
 *
 * A standard that relies on memory or willpower is not enforced; tooling is. A comment at the top of
 * a script is exactly the memory-shaped kind of guard that fails that way. This is the executable
 * version.
 *
 * ### What it checks, and why the second check is not padding
 *
 * 1. **The module reads 100% on all four counters** in the measurement artifact.
 * 2. **The artifact is NEWER than the module and its sibling spec.** A stale report is the same
 *    failure wearing better clothes: the number is real, it is simply about a different tree. Both
 *    ways this goes wrong — assuming numbers moved when they had not, and deleting an entry against a
 *    number that was current and short — are answered by asking whether the measurement is about the
 *    code in front of you.
 *
 * ### Usage
 *
 * ```bash
 * bash scripts/measure-vanilla-coverage.sh                                    # writes the artifact
 * node scripts/assert-module-covered.mjs examples-vanilla/src/wine/panel.ts   # refuses, or is silent
 * ```
 *
 * `measure-react-plain-coverage.sh` writes the same artifact for `examples-react-plain`. Run this
 * from the repository root: both the artifact path and the module paths resolve against the working
 * directory.
 *
 * Exit 0 means the deletion is authorized. Any other exit means it is not, and the message says
 * which of the two checks refused.
 */

import { readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Where the `measure-*-coverage.sh` scripts leave the copy of their istanbul report that this script
 * reads.
 *
 * @remarks
 * 🔴 **Deliberately NOT under `coverage/`.** That directory belongs to the root `pnpm test:coverage`
 * run, whose provider cleans its reports directory before writing — so with the artifact there, the
 * ordinary sequence (measure → run the gates → delete the entry) would delete its own authorization in
 * the middle, and this script would then report "no measurement", which reads as *you forgot* rather
 * than *something else removed it*.
 *
 * Fixture assertions cannot catch that, because they CONSTRUCT the artifact themselves. **A fixture
 * that creates a file cannot discover that a different tool deletes it.** There is deliberately no
 * fallback under `coverage/`: it would silently re-admit the trap.
 */
const REPORT_PATH = '.coverage-probe/coverage-final.json';

/** The command that rewrites {@link REPORT_PATH}, quoted in every refusal that needs a re-measure. */
const REMEASURE_COMMAND =
	'bash scripts/measure-vanilla-coverage.sh   (or scripts/measure-react-plain-coverage.sh)';

/** The four counters istanbul reports, in the order the register's table prints them. */
const COUNTER_LABELS = ['statements', 'branches', 'functions', 'lines'];

/**
 * One file's istanbul counters. `s` / `f` are hit counts by id; `b` is hit counts by branch arm.
 *
 * @typedef {{
 *   b: Record<string, number[]>,
 *   f: Record<string, number>,
 *   s: Record<string, number>,
 * }} FileCoverage
 */

/**
 * Percentage of entries that were hit at least once.
 *
 * @remarks
 * An empty counter is 100% by definition, matching istanbul: a module with no branches has not
 * failed to cover any. Reporting 0% there would refuse every branchless module.
 *
 * @param {readonly number[]} hits - One hit count per statement / function / branch arm.
 * @returns {number} 0–100.
 */
function percentageCovered(hits) {
	if (hits.length === 0) {
		return 100;
	}

	return (hits.filter((count) => count > 0).length / hits.length) * 100;
}

/**
 * Print a refusal and exit non-zero.
 *
 * @param {string} headline - What was refused.
 * @param {readonly string[]} detail - Indented lines explaining why.
 * @returns {never}
 */
function refuse(headline, detail) {
	process.stderr.write(`\u001B[31m✗ ${headline}\u001B[0m\n`);
	for (const line of detail) {
		process.stderr.write(`    ${line}\n`);
	}
	process.exit(1);
}

/**
 * The one report entry whose path ends with `suffix`.
 *
 * @param {Record<string, FileCoverage>} report - The parsed istanbul report.
 * @param {string} suffix - A repo-relative path fragment, e.g. `examples-vanilla/src/wine/panel.ts`.
 * @returns {FileCoverage} The entry.
 */
function entryFor(report, suffix) {
	const matches = Object.keys(report).filter((key) => key.replaceAll('\\', '/').endsWith(suffix));
	const [only] = matches;

	if (only === undefined) {
		refuse(`the measurement does not mention ${suffix}`, [
			'Either the path is wrong, or the module is still excluded from the report —',
			'and an entry the measurement cannot see is one this script cannot clear.',
			`Re-run: ${REMEASURE_COMMAND}`,
		]);
	}
	if (matches.length > 1) {
		refuse(`${suffix} matches ${String(matches.length)} files in the measurement`, matches);
	}

	const entry = report[only];

	if (entry === undefined) {
		refuse(`the measurement entry for ${suffix} could not be read`, [only]);
	}

	return entry;
}

/**
 * Refuse if the artifact predates the module or its sibling spec.
 *
 * @param {number} reportMtimeMs - When the measurement was written.
 * @param {string} suffix - The module's repo-relative path.
 * @returns {void}
 */
function assertMeasurementIsCurrent(reportMtimeMs, suffix) {
	const modulePath = resolve('packages', suffix);
	const specPath = modulePath.replace(/\.ts$/u, '.test.ts');

	for (const candidate of [modulePath, specPath]) {
		/** @type {number} */
		let mtimeMs;

		try {
			mtimeMs = statSync(candidate).mtimeMs;
		} catch {
			// A module with no sibling spec is normal; a missing module is caught by `entryFor`.
			continue;
		}
		if (mtimeMs > reportMtimeMs) {
			refuse(`the measurement is older than ${candidate.split('/packages/')[1] ?? candidate}`, [
				'The number is real but it is about a different tree. Re-measure before deleting:',
				`    ${REMEASURE_COMMAND}`,
			]);
		}
	}
}

const suffixes = process.argv.slice(2);

if (suffixes.length === 0) {
	refuse('no module was named', ['usage: node scripts/assert-module-covered.mjs <path> [path…]']);
}

/** @type {Record<string, FileCoverage>} */
let report;
/** @type {number} */
let reportMtimeMs;

try {
	report = JSON.parse(readFileSync(REPORT_PATH, 'utf8'));
	reportMtimeMs = statSync(REPORT_PATH).mtimeMs;
} catch {
	refuse(`no measurement at ${REPORT_PATH}`, [
		'A register deletion is authorized by a measurement, never by a probe or a reading.',
		`    ${REMEASURE_COMMAND}`,
	]);
}

for (const suffix of suffixes) {
	assertMeasurementIsCurrent(reportMtimeMs, suffix);

	const entry = entryFor(report, suffix);
	const statements = Object.values(entry.s);
	const percentages = [
		percentageCovered(statements),
		percentageCovered(Object.values(entry.b).flat()),
		percentageCovered(Object.values(entry.f)),
		// istanbul's line counter is derived from statements in this report shape; measuring it
		// separately would report a number the artifact does not actually carry.
		percentageCovered(statements),
	];
	const short = percentages
		.map((value, index) => ({ label: COUNTER_LABELS[index] ?? '?', value }))
		.filter((counter) => counter.value < 100);

	if (short.length > 0) {
		refuse(`${suffix} is not at 100% — its register entry stays`, [
			...short.map((counter) => `${counter.label}: ${counter.value.toFixed(2)}%`),
			'',
			'Cover the gap and re-measure. A number in hand that reads short is not permission;',
			'it is the answer.',
		]);
	}

	process.stdout.write(`\u001B[32m✓ ${suffix} — 100% on all four counters\u001B[0m\n`);
}
