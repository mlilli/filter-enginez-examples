#!/usr/bin/env node
/**
 * `check-startup-budget` — fail a build whose first screen downloads more JavaScript than its budget.
 *
 *     node ../../scripts/check-startup-budget.mjs dist --max-kb 400    # run from an app package, after `vite build`
 *
 * @remarks
 * The React apps render a first screen of links, and every page behind those links loads on demand:
 * in the two demo apps each dataset through its registry entry's `load`, the lab and the server-backed
 * route the same way, and in those apps and the documentation site the docs through `docsRoute`'s lazy
 * routes. That split holds only while nothing on the startup graph
 * imports a page statically, and nothing reports it breaking. A static import of a dataset module, a
 * page, or a barrel that re-exports one builds cleanly, passes every test and renders the same
 * screens; the only symptom is a startup bundle that has quietly grown by the engine and a page or two.
 * Vite's "chunks larger than 500 kB" warning does not catch it either: it judges chunks one at a
 * time, and a regression can spread across several chunks below the line, or stay under it while
 * still doubling what the hub costs.
 *
 * So each React app's `build` runs this, and the build fails when the first screen's JavaScript
 * exceeds the budget given. What it measures is what a browser fetches before the first render: the entry
 * `<script type="module">` in `index.html` plus every chunk the entry imports statically, transitively.
 * That is the set Vite lists as `<link rel="modulepreload">`, and it is the union of both that is
 * counted, so the figure does not depend on modulepreload being enabled. Sizes are the minified bytes
 * on disk, in kB of 1,000 bytes as Vite prints them; dynamic `import()`s are not followed, since a
 * page loaded on demand is exactly what the budget leaves out.
 *
 * A missing `index.html`, an entry that cannot be found, or a listed chunk that is not on disk is an
 * error rather than a pass: a budget check that measured nothing looks exactly like one that passed.
 * `tests/tooling/startupBudget.test.ts` pins this script's behavior and that every React app runs it.
 *
 * ### The budget
 *
 * Each app passes its own; all three pass 400 kB. React, ReactDOM and react-router are about 310 kB of
 * every one of them, and what the first screen adds on top is a few tens of kB of hub, header and boot
 * screens. The engine alone, with the WebAssembly bitmap library it carries, is about 350 kB, so a
 * static import that drags it onto the first screen cannot fit under the line, and neither can most
 * pages with their dependencies.
 *
 * @packageDocumentation
 */

import { existsSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';

/** How the script is called, for its error messages. */
const USAGE = 'usage: node check-startup-budget.mjs <build-output-dir> --max-kb <kB>';

/**
 * A static `import … from "./x.js"`, `import "./x.js"` or `export … from "./x.js"` in a built chunk.
 *
 * @remarks
 * The clause between the keyword and `from` may not contain a quote, a semicolon or a parenthesis,
 * which is what keeps a dynamic `import("./x.js")` out: its `(` can neither start the clause nor be
 * skipped over by it.
 */
const STATIC_IMPORT = /\b(?:import|export)\s*(?:[^"'`;()]*?\bfrom\s*)?["'`](\.{1,2}\/[^"'`]+?\.js)["'`]/gu;

/** One HTML tag's attributes, as name → value. */
const ATTRIBUTE = /([\w-]+)\s*=\s*"([^"]*)"/gu;

/**
 * Parse the command line.
 *
 * @param {readonly string[]} argv - The arguments after the script path.
 * @returns {{ directory: string, maxKb: number }} The build-output directory and the budget in kB.
 */
function parseArguments(argv) {
	const flagIndex = argv.indexOf('--max-kb');
	const maxKb = flagIndex === -1 ? Number.NaN : Number(argv[flagIndex + 1]);
	const positional = argv.filter((_, index) => index !== flagIndex && index !== flagIndex + 1);

	if (positional.length !== 1 || !(maxKb > 0)) {
		console.error(`✗ check-startup-budget: ${USAGE}`);
		process.exit(1);
	}

	return { directory: resolve(positional[0] ?? ''), maxKb };
}

/**
 * Read every tag of one kind from an HTML document.
 *
 * @param {string} html - The document.
 * @param {string} tagName - `script` or `link`.
 * @returns {Map<string, string>[]} Each tag's attributes.
 */
function readTags(html, tagName) {
	return [...html.matchAll(new RegExp(`<${tagName}\\b[^>]*>`, 'giu'))].map(
		([tag]) => new Map([...tag.matchAll(ATTRIBUTE)].map(([, name, value]) => [name?.toLowerCase() ?? '', value ?? ''])),
	);
}

/**
 * Resolve a root-relative URL from `index.html` (`/assets/x.js`) to its file in the build output.
 *
 * @param {string} directory - The build-output directory.
 * @param {string} url - The URL as written in the document.
 * @returns {string} The absolute file path.
 */
function fileForUrl(directory, url) {
	return join(directory, url.replace(/^\.?\//u, ''));
}

/**
 * The JavaScript a browser fetches before the first render: the entry module scripts, the
 * modulepreloaded chunks, and everything those import statically.
 *
 * @param {string} directory - The build-output directory.
 * @returns {Map<string, number>} Absolute file path → size in bytes.
 */
function startupFiles(directory) {
	const htmlPath = join(directory, 'index.html');

	if (!existsSync(htmlPath)) {
		console.error(`✗ check-startup-budget: ${htmlPath} does not exist — is the build script pointing at the right output?`);
		process.exit(1);
	}

	const html = readFileSync(htmlPath, 'utf8');
	const entries = readTags(html, 'script')
		.filter((attributes) => attributes.get('type') === 'module' && attributes.has('src'))
		.map((attributes) => fileForUrl(directory, attributes.get('src') ?? ''));
	const preloads = readTags(html, 'link')
		.filter((attributes) => attributes.get('rel') === 'modulepreload' && attributes.has('href'))
		.map((attributes) => fileForUrl(directory, attributes.get('href') ?? ''));

	if (entries.length === 0) {
		console.error(`✗ check-startup-budget: ${htmlPath} has no <script type="module" src> — there is no entry to measure.`);
		process.exit(1);
	}

	/** @type {Map<string, number>} */
	const sizes = new Map();
	const pending = [...entries, ...preloads];

	for (let file = pending.pop(); file !== undefined; file = pending.pop()) {
		if (sizes.has(file)) {
			continue;
		}
		if (!existsSync(file)) {
			console.error(`✗ check-startup-budget: ${relative(directory, file)} is part of the first screen but is not in the build output.`);
			process.exit(1);
		}

		sizes.set(file, statSync(file).size);

		for (const [, specifier] of readFileSync(file, 'utf8').matchAll(STATIC_IMPORT)) {
			pending.push(resolve(dirname(file), specifier ?? ''));
		}
	}

	return sizes;
}

/**
 * Format a byte count as Vite prints it.
 *
 * @param {number} bytes - The size in bytes.
 * @returns {string} The size in kB, to one decimal.
 */
function kilobytes(bytes) {
	return `${(bytes / 1000).toFixed(1)} kB`;
}

const { directory, maxKb } = parseArguments(process.argv.slice(2));
const sizes = startupFiles(directory);
const total = [...sizes.values()].reduce((sum, size) => sum + size, 0);
const summary = `${kilobytes(total)} of JavaScript before the first render (${sizes.size} files; budget ${maxKb} kB)`;

if (total > maxKb * 1000) {
	const largest = [...sizes]
		.sort(([, a], [, b]) => b - a)
		.map(([file, size]) => `    ${kilobytes(size).padStart(9)}  ${relative(directory, file)}`)
		.join('\n');

	console.error(`✗ check-startup-budget: ${directory}\n  ${summary}\n${largest}`);
	console.error(
		'  Something the first screen imports statically now pulls in code that should load on demand.\n' +
			'  Look for a new static import of a dataset module, a page, the engine, or a barrel that\n' +
			'  re-exports one, on the graph of the app\'s App.tsx, datasets.tsx or the route shells.',
	);
	process.exit(1);
}

console.log(`→ check-startup-budget: ${summary}`);
