/**
 * Measure how much code each demo app had to write for itself.
 *
 * @remarks
 * The second half of the comparison evidence, beside the engine's `size-limit` budgets. Writes
 * `benchmarks/vertical-sizes.json`, creating the directory on a fresh clone.
 *
 * ## What is being counted, and why it is not "lines of code"
 *
 * Comparing frameworks by raw LOC is a famously bad idea, and this is deliberately a narrower claim.
 * All six verticals render the SAME datasets through the SAME shared slice (`examples-shared`,
 * `react-ui`, `ui-styles`, `brand`), so what remains in each app's own `src` is the part that could
 * not be shared — the glue between one engine and one framework's reactivity. That residue is worth
 * counting; "Angular is more verbose than Svelte" is not, and this file does not say it.
 *
 * **The two React rows are small for a reason that is not about React, and the table must say so.**
 * The shared slice is WRITTEN in React: `examples-shared` and `react-ui` are ~10,800 lines of code
 * that the React apps consume directly and the other four cannot. So React RTK's ~2,000 lines are not
 * "what React needed" — they are what remains once everything shareable lives in a React library. The
 * non-React verticals re-express that same surface in their own idiom, and their larger numbers are
 * mostly THAT, not framework verbosity. Anyone quoting these six figures without the `shared` block
 * beside them is quoting a fabrication; that is why `shared` is in the same file rather than a
 * footnote someone can drop.
 *
 * Blank lines and comment lines are separated out rather than dropped, because this repo's comment
 * style is unusually heavy and a raw total would mostly measure prose. `code` is the number to quote;
 * `comment` is reported so nobody has to wonder whether it was included.
 *
 * ## What is excluded, and why each exclusion matters
 *
 *   - **Tests and specs.** They are a choice about rigor, not about what the framework demanded.
 *   - **`mockServiceWorker.js`.** Vendored from MSW, byte-identical in all six, and 300-odd lines of
 *     someone else's code would flatter whichever app had the fewest of its own.
 *   - **Generated output** — `dist`, `build`, `.svelte-kit`, `node_modules`, the TypeDoc `api` dump.
 *
 * The shared slice is measured too, as one row, so a reader can see the denominator: the six numbers
 * are small BECAUSE that row is large, and quoting them without it would be the misleading version of
 * this table.
 *
 * @packageDocumentation
 */

import { mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');

/** Extensions that count as vertical source. */
const COUNTED = new Set(['.css', '.html', '.svelte', '.ts', '.tsx', '.vue']);

/** Directory names never descended into. */
const SKIP_DIRS = new Set([
	'.angular',
	'.svelte-kit',
	'.turbo',
	'api',
	'build',
	'coverage',
	'dist',
	'node_modules',
]);

/** Files excluded by name — vendored or generated, not written by the vertical. */
const SKIP_FILES = new Set(['mockServiceWorker.js']);

/**
 * Whether a file is test code rather than app code.
 *
 * @param {string} name - The file's basename.
 * @returns {boolean} `true` for a test or spec file.
 */
function isTest(name) {
	return /\.(?:spec|test)\.[cm]?[jt]sx?$/u.test(name);
}

/**
 * Every counted file under a directory.
 *
 * @param {string} dir - Absolute directory path.
 * @returns {string[]} Absolute file paths.
 */
function walk(dir) {
	/** @type {string[]} */
	const found = [];
	/** @type {string[]} */
	const queue = [dir];

	while (queue.length > 0) {
		const current = queue.pop();

		if (current === undefined) {
			break;
		}
		for (const entry of readdirSync(current, { withFileTypes: true })) {
			if (entry.isDirectory()) {
				if (!SKIP_DIRS.has(entry.name)) {
					queue.push(join(current, entry.name));
				}
				continue;
			}
			if (SKIP_FILES.has(entry.name) || isTest(entry.name) || !COUNTED.has(extname(entry.name))) {
				continue;
			}
			found.push(join(current, entry.name));
		}
	}

	return found;
}

/**
 * Split one file's lines into blank, comment and code.
 *
 * @remarks
 * The comment detection is a line-oriented approximation: `//`, `<!--`, and anything inside a `/* *\/`
 * run. It cannot be exact without parsing six languages, and it does not need to be — the number it
 * feeds is "roughly how much of this is prose", reported beside the code count rather than subtracted
 * silently from it.
 *
 * @param {string} source - The file's contents.
 * @returns {{ blank: number, code: number, comment: number }} The tallies.
 */
function tally(source) {
	let blank = 0;
	let code = 0;
	let comment = 0;
	let inBlock = false;

	for (const raw of source.split('\n')) {
		const line = raw.trim();

		if (line === '') {
			blank += 1;
			continue;
		}
		if (inBlock) {
			comment += 1;
			if (line.includes('*/')) {
				inBlock = false;
			}
			continue;
		}
		if (line.startsWith('/*')) {
			comment += 1;
			inBlock = !line.includes('*/');
			continue;
		}
		if (line.startsWith('//') || line.startsWith('*') || line.startsWith('<!--')) {
			comment += 1;
			continue;
		}
		code += 1;
	}

	return { blank, code, comment };
}

/**
 * Measure one tree.
 *
 * @param {string} relative - Path relative to the repo root.
 * @returns {{ blank: number, code: number, comment: number, files: number, total: number }} Its tallies.
 */
function measure(relative) {
	const root = join(repoRoot, relative);

	let blank = 0;
	let code = 0;
	let comment = 0;
	let files = 0;

	for (const file of walk(root)) {
		const counts = tally(readFileSync(file, 'utf8'));

		blank += counts.blank;
		code += counts.code;
		comment += counts.comment;
		files += 1;
	}

	return { blank, code, comment, files, total: blank + code + comment };
}

/**
 * The trees measured, in the registry's presentation order.
 *
 * @remarks
 * Kept in step with `examples-shared/verticals` by `tests/tooling/verticalSizes.test.ts`, which
 * asserts one entry per vertical id. Adding a seventh vertical without a row here would leave a blank
 * column on `/compare` rather than an error.
 */
const TREES = [
	{ id: 'react-rtk', path: 'packages/examples-react-rtk/src' },
	{ id: 'react-plain', path: 'packages/examples-react-plain/src' },
	{ id: 'sveltekit', path: 'packages/examples-sveltekit/src' },
	{ id: 'vue', path: 'packages/examples-vue/src' },
	{ id: 'angular', path: 'packages/examples-angular/src' },
	{ id: 'vanilla', path: 'packages/examples-vanilla/src' },
];

/** The denominator: what all six render THROUGH, and therefore did not each have to write. */
const SHARED = [
	{ id: 'examples-shared', path: 'packages/examples-shared/src' },
	{ id: 'react-ui', path: 'packages/react-ui/src' },
	{ id: 'ui-styles', path: 'packages/ui-styles/src' },
];

const report = {
	generatedAt: new Date().toISOString(),
	note:
		'Counts each vertical’s OWN src only; tests, vendored mockServiceWorker.js and generated output are excluded. Quote `code`; `comment` is reported so its exclusion is visible rather than assumed. READ WITH `shared`: that slice is written in React, so the two React verticals consume ~10,800 lines the other four had to re-express in their own idiom. These figures are NOT a framework-verbosity comparison.',
	shared: Object.fromEntries(SHARED.map(({ id, path }) => [id, measure(path)])),
	verticals: Object.fromEntries(TREES.map(({ id, path }) => [id, measure(path)])),
};

const outPath = join(repoRoot, 'benchmarks/vertical-sizes.json');

// The directory is this script's own output location, and nothing else in the repo creates it.
mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(outPath, `${JSON.stringify(report, null, '\t')}\n`);

process.stdout.write(`vertical sizes → benchmarks/vertical-sizes.json\n\n`);
for (const [id, counts] of Object.entries(report.verticals)) {
	process.stdout.write(
		`  ${id.padEnd(12)} ${String(counts.code).padStart(6)} code  ${String(counts.comment).padStart(6)} comment  ${String(counts.files).padStart(4)} files\n`,
	);
}
process.stdout.write('\n  shared (the denominator)\n');
for (const [id, counts] of Object.entries(report.shared)) {
	process.stdout.write(
		`  ${id.padEnd(12)} ${String(counts.code).padStart(6)} code  ${String(counts.comment).padStart(6)} comment  ${String(counts.files).padStart(4)} files\n`,
	);
}

void statSync(outPath);
