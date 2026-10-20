#!/usr/bin/env node
/**
 * `check-startup-budget` — fail a build whose first screen downloads more JavaScript than its budget,
 * or waits on a stylesheet before it renders.
 *
 *     node ../../scripts/check-startup-budget.mjs dist --max-kb 400                    # a Vite app, after `vite build`
 *     node ../../scripts/check-startup-budget.mjs dist/browser --max-kb 300            # Angular, after `ng build`
 *     node ../../scripts/check-startup-budget.mjs <client-dir> --html <page> --max-kb 120   # a page served from elsewhere
 *
 * @remarks
 * Every demo app renders a first screen of links — the hub — and loads each dataset page on demand:
 * the React apps through each registry entry's `load`, Vue through its router's lazy components,
 * vanilla through a dynamic `import()` in each route's `render`, Angular through `loadComponent` and
 * resolvers that `import()` their boot, SvelteKit through its per-route nodes; the documentation
 * through `docsRoute`'s lazy routes. That split holds only while nothing on the startup graph imports
 * a page statically, and nothing reports it breaking. A static import of a dataset module, a page, or
 * a barrel that re-exports one builds cleanly, passes every test and renders the same screens; the
 * only symptom is a startup bundle that has quietly grown by the engine and a page or two. Vite's
 * "chunks larger than 500 kB" warning does not catch it either: it judges chunks one at a time, and a
 * regression can spread across several chunks below the line, or stay under it while still doubling
 * what the hub costs.
 *
 * So each app's `build` runs this, and the build fails when the first screen's JavaScript exceeds the
 * budget given. What it measures is what a browser fetches before the first render of the built page
 * (`index.html` in the build directory, or the page `--html` names): the `<script type="module" src>`
 * entries, the modules an inline script `import()`s at once (how a prerendered SvelteKit page starts),
 * every `<link rel="modulepreload">`, and every chunk any of those imports statically, transitively.
 * The union is counted, so the figure does not depend on modulepreload being enabled. Sizes are the
 * minified bytes on disk, in kB of 1,000 bytes as Vite prints them; dynamic `import()`s inside chunks
 * are not followed, since a page loaded on demand is exactly what the budget leaves out. URLs resolve
 * against the build directory, whichever way the page writes them: root-relative (`/assets/x.js`),
 * page-relative (`./_app/x.js`), or bare (`chunk-x.js`, as Angular writes them beside `<base href="/">`).
 * HTML comments are skipped, so markup quoted in one is not read as a tag.
 *
 * A missing page, an entry that cannot be found, or a listed chunk that is not on disk is an error
 * rather than a pass: a budget check that measured nothing looks exactly like one that passed.
 *
 * ### No stylesheet holds up the first render
 *
 * The same page fails, too, when it links a stylesheet the browser must download before it renders
 * anything: a `<link rel="stylesheet">` that is not `disabled` and not loaded as `media="print"` (the
 * idiom for loading a sheet without blocking, and swapping it in once it arrives), or an `@import` in an
 * inline `<style>`. Markup inside `<noscript>` is skipped, since a browser running scripts never loads
 * it. Each app keeps its stylesheets off that path its own way: the Vite apps inline their first
 * screen's part of the sheet and load the rest with the routes that use it
 * (`scripts/lib/critical-css.mjs`), SvelteKit inlines every page's CSS (`inlineStyleThreshold` in its
 * `svelte.config.js`), and Angular inlines its critical CSS and loads the sheet as `media="print"`
 * (its `optimization.styles.inlineCritical`, on by default). A change that brought a blocking link
 * back would cost every first visit a round trip and break nothing else, so the build is where it shows.
 * `tests/tooling/startupBudget.test.ts` pins this script's behavior and that every app runs it.
 *
 * ### The budgets
 *
 * Each app passes its own, set from what its hub measures plus modest headroom, and well below what
 * the engine alone costs: the core with the WebAssembly bitmap library it carries is about 350 kB, so
 * a static import that drags it onto a first screen cannot fit under any of them. The React apps and
 * the documentation site start with React, ReactDOM and React Router in its declarative mode (about
 * 300 kB of each first screen; the documentation site also preloads its layout and home page); Vue,
 * Angular and SvelteKit with their own runtimes; the framework-free app with nothing but itself.
 *
 * @packageDocumentation
 */

import { existsSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';

/** How the script is called, for its error messages. */
const USAGE = 'usage: node check-startup-budget.mjs <build-output-dir> [--html <page>] --max-kb <kB>';

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

/** An inline `<script>` element's body (a script with a `src` has none worth reading). */
const INLINE_SCRIPT = /<script\b(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/giu;

/** A dynamic `import("./x.js")` of a relative module, as an inline script starts an app with it. */
const INLINE_IMPORT = /\bimport\(\s*["'`](\.{0,2}\/[^"'`]+?\.js)["'`]\s*\)/gu;

/** An HTML comment, which may quote markup that is not part of the page. */
const HTML_COMMENT = /<!--[\s\S]*?-->/gu;

/** A `<noscript>` element, whose markup a browser running scripts never loads. */
const NOSCRIPT = /<noscript\b[\s\S]*?<\/noscript>/giu;

/** A `<link>` whose `rel` names a stylesheet, however its attributes are quoted. */
const STYLESHEET_LINK = /<link\b(?=[^>]*\brel\s*=\s*["']?(?:[^"'>]*\s)?stylesheet\b)[^>]*>/giu;

/** A `<link>` attribute that keeps a stylesheet from holding up the first render. */
const NON_BLOCKING_ATTRIBUTE = /\sdisabled(?=[\s/>=])|\smedia\s*=\s*["']?print["'\s/>]/iu;

/** An inline `<style>` that imports a stylesheet, which the first render then waits for. */
const STYLE_IMPORT = /<style\b[^>]*>(?:(?!<\/style)[\s\S])*?@import\b/iu;

/**
 * Parse the command line.
 *
 * @param {readonly string[]} argv - The arguments after the script path.
 * @returns {{ directory: string, htmlPath: string, maxKb: number }} The build-output directory, the
 *   page to measure, and the budget in kB.
 */
function parseArguments(argv) {
	const budgetFlag = argv.indexOf('--max-kb');
	const htmlFlag = argv.indexOf('--html');
	const maxKb = budgetFlag === -1 ? Number.NaN : Number(argv[budgetFlag + 1]);
	const htmlArgument = htmlFlag === -1 ? undefined : argv[htmlFlag + 1];
	const flagged = new Set([budgetFlag, htmlFlag].filter((index) => index >= 0).flatMap((index) => [index, index + 1]));
	const positional = argv.filter((_, index) => !flagged.has(index));

	if (positional.length !== 1 || !(maxKb > 0) || (htmlFlag !== -1 && (htmlArgument === undefined || htmlArgument.startsWith('--')))) {
		console.error(`✗ check-startup-budget: ${USAGE}`);
		process.exit(1);
	}

	const directory = resolve(positional[0] ?? '');

	return { directory, htmlPath: htmlArgument === undefined ? join(directory, 'index.html') : resolve(htmlArgument), maxKb };
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
 * Resolve a URL from the page — root-relative (`/assets/x.js`), page-relative (`./x.js`) or bare
 * (`x.js`) — to its file in the build output, which is served from the site root.
 *
 * @param {string} directory - The build-output directory.
 * @param {string} url - The URL as written in the document.
 * @returns {string} The absolute file path.
 */
function fileForUrl(directory, url) {
	return join(directory, url.replace(/^\.?\//u, ''));
}

/**
 * The JavaScript a browser fetches before the first render: the entry module scripts, the modules
 * inline scripts import at once, the modulepreloaded chunks, and everything those import statically.
 *
 * @param {string} directory - The build-output directory.
 * @param {string} htmlPath - The built page.
 * @returns {Map<string, number>} Absolute file path → size in bytes.
 */
function startupFiles(directory, htmlPath) {
	if (!existsSync(htmlPath)) {
		console.error(`✗ check-startup-budget: ${htmlPath} does not exist — is the build script pointing at the right output?`);
		process.exit(1);
	}

	const html = readFileSync(htmlPath, 'utf8').replaceAll(HTML_COMMENT, '');
	const entries = [
		...readTags(html, 'script')
			.filter((attributes) => attributes.get('type') === 'module' && attributes.has('src'))
			.map((attributes) => attributes.get('src') ?? ''),
		...[...html.matchAll(INLINE_SCRIPT)].flatMap(([, body]) => [...(body ?? '').matchAll(INLINE_IMPORT)].map(([, url]) => url ?? '')),
	].map((url) => fileForUrl(directory, url));
	const preloads = readTags(html, 'link')
		.filter((attributes) => attributes.get('rel') === 'modulepreload' && attributes.has('href'))
		.map((attributes) => fileForUrl(directory, attributes.get('href') ?? ''));

	if (entries.length === 0) {
		console.error(
			`✗ check-startup-budget: ${htmlPath} has no <script type="module" src> and no inline import() — there is no entry to measure.`,
		);
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
 * Every stylesheet the page makes its first render wait for.
 *
 * @param {string} htmlPath - The built page.
 * @returns {string[]} Each blocking `<link>`, as written, and a note for each inline `@import`.
 */
function renderBlockingStylesheets(htmlPath) {
	const html = readFileSync(htmlPath, 'utf8').replaceAll(HTML_COMMENT, '').replaceAll(NOSCRIPT, '');

	return [
		...[...html.matchAll(STYLESHEET_LINK)].map(([tag]) => tag).filter((tag) => !NON_BLOCKING_ATTRIBUTE.test(tag)),
		...(STYLE_IMPORT.test(html) ? ['an @import in an inline <style>'] : []),
	];
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

const { directory, htmlPath, maxKb } = parseArguments(process.argv.slice(2));
const sizes = startupFiles(directory, htmlPath);
const blockingStylesheets = renderBlockingStylesheets(htmlPath);

if (blockingStylesheets.length > 0) {
	const tags = blockingStylesheets.map((stylesheet) => `    ${stylesheet}`).join('\n');

	console.error(
		`✗ check-startup-budget: ${htmlPath} makes its first render wait for a stylesheet:\n${tags}\n` +
			"  Carry the first screen's CSS in the page instead: the Vite apps through scripts/lib/critical-css.mjs,\n" +
			'  SvelteKit through its inlineStyleThreshold, Angular through its inlined critical CSS.',
	);
	process.exit(1);
}

const total = [...sizes.values()].reduce((sum, size) => sum + size, 0);
const summary = `${kilobytes(total)} of JavaScript before the first render (${sizes.size} files; budget ${maxKb} kB), and no stylesheet holds it up`;

if (total > maxKb * 1000) {
	const largest = [...sizes]
		.sort(([, a], [, b]) => b - a)
		.map(([file, size]) => `    ${kilobytes(size).padStart(9)}  ${relative(directory, file)}`)
		.join('\n');

	console.error(`✗ check-startup-budget: ${directory}\n  ${summary}\n${largest}`);
	console.error(
		'  Something the first screen imports statically now pulls in code that should load on demand.\n' +
			'  Look for a new static import of a dataset module, a page, the engine, or a barrel that\n' +
			'  re-exports one, on the graph of the app\'s entry, its route table or its hub page.',
	);
	process.exit(1);
}

console.log(`→ check-startup-budget: ${summary}`);
