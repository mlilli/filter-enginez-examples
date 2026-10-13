#!/usr/bin/env node
/**
 * summarize-coverage.mjs — per-file coverage from a `coverage-final.json`, worst first.
 *
 * Istanbul-shaped JSON is keyed by absolute path, with `s`/`b`/`f` hit maps beside their
 * `statementMap`/`branchMap`/`fnMap` definitions. This reduces that to four percentages per file and
 * sorts by the worst of them, because the question a coverage-narrowing pass asks is always "which
 * files are not at 100%", never "what is the average".
 *
 * ## Why this exists rather than reading the HTML report
 *
 * The HTML report is per-directory and sorted by name, and the decision it feeds — which paths go on
 * a `coverage.exclude` list — needs the opposite: one flat list, ordered by how far from 100% each
 * file is, with the fully-covered ones separated out so the list of exclusions writes itself.
 *
 * Usage:
 *
 *     node scripts/summarize-coverage.mjs <coverage-final.json> [path-substring-filter]
 *
 * @packageDocumentation
 */

import { readFileSync } from 'node:fs';

const [, , reportPath, filter = ''] = process.argv;

if (reportPath === undefined) {
	console.error('usage: node scripts/summarize-coverage.mjs <coverage-final.json> [filter]');
	process.exit(2);
}

/**
 * Percentage of covered entries in an Istanbul hit map.
 *
 * @param {Record<string, number | number[]> | undefined} hits - The `s` / `f` map (id → hit count),
 * or the `b` map (id → one count per branch arm).
 * @returns {number | null} Covered percentage, or `null` when the file has nothing of that kind to
 * cover — a module of pure type declarations has no statements, and averaging it in as 0 would
 * misreport it.
 */
function percentOf(hits) {
	const counts = Object.values(hits ?? {}).flat();

	if (counts.length === 0) {
		return null;
	}

	return (counts.filter((count) => count > 0).length / counts.length) * 100;
}

/**
 * Format a percentage, or `—` when the metric does not apply to this file.
 *
 * @param {number | null} value - The percentage, or `null` for "not applicable".
 * @returns {string} A fixed-width string.
 */
const show = (value) => (value === null ? '    —' : `${value.toFixed(1).padStart(5)}`);

/**
 * Repo-relative display path.
 *
 * @remarks
 * Sliced at `packages/` rather than computed with `path.relative`, because a report is often read on
 * a different machine from the one that wrote it — the absolute paths inside are the AUTHOR's, and
 * `relative()` against a foreign cwd produces a wall of `../..`. Slicing is machine-independent.
 *
 * @param {string} absolutePath - The key from `coverage-final.json`.
 * @returns {string} A path starting at `packages/`, or the original when it contains none.
 */
function displayPath(absolutePath) {
	const index = absolutePath.indexOf('packages/');

	return index === -1 ? absolutePath : absolutePath.slice(index);
}

const report = JSON.parse(readFileSync(reportPath, 'utf8'));
const rows = [];

for (const [absolutePath, data] of Object.entries(report)) {
	if (!absolutePath.includes(filter)) {
		continue;
	}
	const metrics = {
		branches: percentOf(data.b),
		functions: percentOf(data.f),
		lines: percentOf(data.s),
		statements: percentOf(data.s),
	};
	const applicable = Object.values(metrics).filter((value) => value !== null);

	rows.push({
		file: displayPath(absolutePath),
		metrics,
		worst: applicable.length === 0 ? 100 : Math.min(...applicable),
	});
}

rows.sort((a, b) => a.worst - b.worst || a.file.localeCompare(b.file));

const short = rows.filter((row) => row.worst < 100);
const full = rows.filter((row) => row.worst === 100);

console.log(`\n${rows.length} files matched "${filter}" — ${full.length} at 100%, ${short.length} below.\n`);

if (short.length > 0) {
	console.log('BELOW 100% — each one is either an exclusion to justify or a test to write:\n');
	console.log(`  ${'stmts'} ${'branch'} ${'funcs'}  file`);
	for (const row of short) {
		console.log(
			`  ${show(row.metrics.statements)} ${show(row.metrics.branches)} ${show(row.metrics.functions)}  ${row.file}`,
		);
	}
}

if (full.length > 0) {
	console.log(`\nAT 100% — these can stay IN scope for free:\n`);
	for (const row of full) {
		console.log(`   ${row.file}`);
	}
}

if (short.length === 0) {
	console.log('\nNothing below 100% — no exclusion is needed for this filter.\n');
} else {
	console.log('\nStarting point for the exclusion list — every file below 100%:\n');
	for (const row of short) {
		console.log(`\t\t\t\t\t'**/${row.file.replace(/^packages\//u, '')}',`);
	}
	console.log(
		'\nThat is a STARTING POINT, not the answer: an entry here is an admission that wants a\n'
			+ 'one-line reason, and some of these are tests to write rather than exclusions to keep.\n',
	);
}
