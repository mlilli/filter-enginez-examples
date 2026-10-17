#!/usr/bin/env node
/**
 * `check-site-css` — fail a landing-site build in which a page uses a class its CSS has no rule for,
 * or carries more CSS than its budget.
 *
 *     node ../../scripts/check-site-css.mjs dist \
 *       --reference @filter-enginez/ui-styles/styles.css --budget index.html=29    # from packages/site
 *
 * @remarks
 * ### Why
 *
 * Every page of the landing site carries its stylesheet inline, so each one ships only the
 * `@filter-enginez/ui-styles` partials it draws (`ui-styles/src/styles.css` explains the split). That
 * keeps the pages small, and it has one silent way to break: a page that starts using a component from
 * a partial it does not import. The build succeeds, every test passes, and the page renders the
 * component unstyled. So the site's `build` runs this after `vite build`, over the pages it wrote.
 *
 * ### What it checks, page by page
 *
 * - **Every class the page uses has a rule in the page's CSS**, when any stylesheet the site draws
 *   from has one. The classes a page uses are those in its HTML, and those its scripts can create:
 *   every class-like word in the JavaScript the page loads — its module scripts and every chunk they
 *   import, statically or on demand — that starts with `fe-` or has a BEM element (`__`). Plain words
 *   are left out, because minified code and bundled data are full of them (`home`, `install`), and
 *   every class the site's scripts create is namespaced; a class the build writes into the HTML is
 *   read from the HTML. The stylesheets the site draws from are the `--reference` sheets, with
 *   everything they import, plus every page's own CSS. A class with a rule nowhere is a hook for a
 *   script or a test, and is left alone.
 * - **The page's CSS fits its budget,** in kB of 1,000 bytes of the minified CSS as the page carries it.
 *   Each page has its own, a little above what the page carries; the whole `ui-styles` sheet alone is
 *   over 65 kB minified, past every page's budget, so a page that imports it whole cannot fit.
 *
 * ### What fails rather than passes
 *
 * A check that measured nothing looks exactly like one that passed, so these are errors: a build with
 * no pages; a page with no inline stylesheet, or one that still links a stylesheet (whose CSS this
 * would not read); a module script that is not in the build; a page with no budget, or a budget for a
 * page the build does not have; and reference sheets with no class selectors at all.
 *
 * `tests/tooling/siteCss.test.ts` pins this script's behavior and that the site's build runs it.
 *
 * @packageDocumentation
 */

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { basename, dirname, join, relative, resolve } from 'node:path';

/** How the script is called, for its error messages. */
const USAGE = 'usage: node check-site-css.mjs <build-output-dir> --reference <stylesheet>... --budget <page.html>=<kB>...';

/** A CSS comment. */
const CSS_COMMENT = /\/\*[\s\S]*?\*\//gu;

/**
 * A `url(…)` or a quoted CSS string, whose contents may hold a `.`, `{` or `;` that is not syntax. A
 * quoted URL is matched as a whole, because an inline SVG in one can hold a `)` of its own.
 */
const CSS_STRING_OR_URL = /url\(\s*(?:"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|[^"')]*)\s*\)|"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'/giu;

/** The text before a `{`: a selector list, or an at-rule's prelude. */
const CSS_PRELUDE = /([^{};]*)\{/gu;

/** A class selector inside a prelude. A digit cannot start one, so `.5em` in a media query is not. */
const CSS_CLASS = /\.(-?[A-Z_a-z][\w-]*)/gu;

/** An `@import` and its specifier, quoted or in `url()`. */
const CSS_IMPORT = /@import\s+(?:url\(\s*)?["']([^"']+)["']/gu;

/** A `<style>` element's contents. */
const STYLE_ELEMENT = /<style\b[^>]*>([\s\S]*?)<\/style>/giu;

/** A `<script>` element, with its contents. */
const SCRIPT_ELEMENT = /<script\b[^>]*>[\s\S]*?<\/script>/giu;

/** A `<link>` that loads a stylesheet. */
const STYLESHEET_LINK = /<link\b[^>]*\brel\s*=\s*["']?stylesheet\b[^>]*>/iu;

/** A `class` attribute's value, double- or single-quoted. */
const CLASS_ATTRIBUTE = /\sclass\s*=\s*(?:"([^"]*)"|'([^']*)')/giu;

/** A `<script src>` and its URL. */
const SCRIPT_SOURCE = /<script\b[^>]*\bsrc\s*=\s*["']([^"']+)["'][^>]*>/giu;

/** A quoted `.js` file name in a built chunk: a static import, a dynamic `import()` or a preload list entry. */
const CHUNK_REFERENCE = /["'`]([\w./-]+\.js)["'`]/gu;

/** A word that could be a class name, in a built chunk. */
const SCRIPT_WORD = /[A-Z_a-z][\w-]*/gu;

/**
 * Stop with an error.
 *
 * @param {string} message - What is wrong, and what to do about it.
 * @returns {never} Never returns.
 */
function fail(message) {
	console.error(`✗ check-site-css: ${message}`);
	process.exit(1);
}

/**
 * Parse the command line.
 *
 * @param {readonly string[]} argv - The arguments after the script path.
 * @returns {{ budgets: Map<string, number>, directory: string, references: string[] }} The build-output
 *   directory, the reference stylesheets as given, and each page's budget in kB.
 */
function parseArguments(argv) {
	/** @type {string[]} */
	const positional = [];
	/** @type {string[]} */
	const references = [];
	/** @type {Map<string, number>} */
	const budgets = new Map();

	for (let index = 0; index < argv.length; index += 1) {
		const argument = argv[index] ?? '';
		const value = argv[index + 1];

		if (argument === '--reference' && value !== undefined) {
			references.push(value);
			index += 1;
		} else if (argument === '--budget' && value !== undefined) {
			const [, page = '', budgetKb = ''] = /^([^=]+)=(.*)$/u.exec(value) ?? [];

			if (!(Number(budgetKb) > 0)) {
				fail(`--budget ${value} is not <page.html>=<kB>.\n  ${USAGE}`);
			}
			budgets.set(page, Number(budgetKb));
			index += 1;
		} else {
			positional.push(argument);
		}
	}

	if (positional.length !== 1 || references.length === 0 || budgets.size === 0) {
		fail(USAGE);
	}

	return { budgets, directory: resolve(positional[0] ?? ''), references };
}

/**
 * The classes a stylesheet's selectors name.
 *
 * @param {string} css - The stylesheet.
 * @returns {Set<string>} Each class named in a selector, without its dot.
 */
function selectorClasses(css) {
	const code = css.replace(CSS_COMMENT, '').replace(CSS_STRING_OR_URL, '""');
	const classes = new Set();

	for (const [, prelude = ''] of code.matchAll(CSS_PRELUDE)) {
		for (const [, name = ''] of prelude.matchAll(CSS_CLASS)) {
			classes.add(name);
		}
	}

	return classes;
}

/**
 * A stylesheet's text followed by that of everything it imports, transitively.
 *
 * @param {string} file - The stylesheet's absolute path.
 * @param {Set<string>} seen - Sheets already read, against an import cycle.
 * @returns {string} The texts, joined. Order is not kept: only the classes they name are read.
 */
function readWithImports(file, seen) {
	if (seen.has(file)) {
		return '';
	}
	seen.add(file);

	const css = readFileSync(file, 'utf8');
	const resolveFrom = createRequire(file);
	const imported = [...css.replace(CSS_COMMENT, '').matchAll(CSS_IMPORT)].map(([, specifier = '']) =>
		readWithImports(resolveFrom.resolve(specifier), seen),
	);

	return [css, ...imported].join('\n');
}

/**
 * The classes the reference stylesheets name, with everything they import.
 *
 * @param {readonly string[]} references - Specifiers, resolved from the working directory as an
 *   `@import` in it would be: a package export (`@filter-enginez/ui-styles/styles.css`) or a path.
 * @returns {Set<string>} Their classes.
 */
function referenceClasses(references) {
	const resolveFrom = createRequire(join(process.cwd(), 'package.json'));
	const seen = new Set();
	const classes = new Set();

	for (const reference of references) {
		/** @type {string} */
		let file;

		try {
			file = resolveFrom.resolve(reference);
		} catch {
			return fail(`--reference ${reference} does not resolve from ${process.cwd()}.`);
		}
		for (const name of selectorClasses(readWithImports(file, seen))) {
			classes.add(name);
		}
	}

	if (classes.size === 0) {
		fail(`the reference stylesheets (${references.join(', ')}) have no class selectors — is the --reference right?`);
	}

	return classes;
}

/**
 * The JavaScript files a page loads: its scripts, and every chunk they name, transitively.
 *
 * @remarks
 * A chunk is found by any quoted `.js` file name in a chunk already found, which covers static
 * imports, dynamic `import()` and Vite's preload lists alike. Vite writes every chunk of a build to one
 * directory, so a name is looked up beside the chunk that names it; a quoted name that is not a file
 * there (a string in bundled data) is skipped.
 *
 * @param {string} directory - The build-output directory.
 * @param {string} page - The page's file name.
 * @param {string} html - The page.
 * @returns {string[]} Absolute paths, entries first.
 */
function pageScripts(directory, page, html) {
	const entries = [...html.matchAll(SCRIPT_SOURCE)]
		.map(([, url = '']) => url)
		.filter((url) => !/^(?:[a-z]+:)?\/\//iu.test(url))
		.map((url) => join(directory, url.replace(/^\.?\//u, '')));
	/** @type {string[]} */
	const files = [];

	for (const entry of entries) {
		if (!existsSync(entry)) {
			fail(`${page} loads ${relative(directory, entry)}, which is not in the build output.`);
		}
	}

	const pending = [...entries];

	while (pending.length > 0) {
		const file = pending.shift() ?? '';

		if (!files.includes(file)) {
			files.push(file);
			for (const [, name = ''] of readFileSync(file, 'utf8').matchAll(CHUNK_REFERENCE)) {
				const chunk = join(dirname(file), basename(name));

				if (existsSync(chunk)) {
					pending.push(chunk);
				}
			}
		}
	}

	return files;
}

/**
 * What one built page carries and uses.
 *
 * @typedef {object} Page
 * @property {string} name - The page's file name.
 * @property {string} css - Its inline CSS.
 * @property {Map<string, string>} used - Each class it uses, and where it was found first: `the HTML` or
 *   a script's path in the build.
 */

/**
 * Read one built page.
 *
 * @param {string} directory - The build-output directory.
 * @param {string} name - The page's file name.
 * @returns {Page} The page's CSS and the classes it uses.
 */
function readPage(directory, name) {
	const html = readFileSync(join(directory, name), 'utf8');
	const css = [...html.matchAll(STYLE_ELEMENT)].map(([, contents = '']) => contents).join('\n');

	if (STYLESHEET_LINK.test(html)) {
		fail(`${name} links a stylesheet. The site's pages carry their CSS inline, and this check reads only that.`);
	}
	if (css.trim() === '') {
		fail(`${name} has no inline stylesheet — did the build stop inlining its CSS?`);
	}

	/** @type {Map<string, string>} */
	const used = new Map();
	const markup = html.replace(STYLE_ELEMENT, '').replace(SCRIPT_ELEMENT, '');

	for (const [, doubleQuoted, singleQuoted] of markup.matchAll(CLASS_ATTRIBUTE)) {
		for (const className of (doubleQuoted ?? singleQuoted ?? '').split(/\s+/u).filter(Boolean)) {
			used.set(className, used.get(className) ?? 'the HTML');
		}
	}
	for (const file of pageScripts(directory, name, html)) {
		for (const [word] of readFileSync(file, 'utf8').matchAll(SCRIPT_WORD)) {
			if (word.startsWith('fe-') || word.includes('__')) {
				used.set(word, used.get(word) ?? relative(directory, file));
			}
		}
	}

	return { css, name, used };
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

const { budgets, directory, references } = parseArguments(process.argv.slice(2));

if (!existsSync(directory)) {
	fail(`${directory} does not exist — is the build script pointing at the right output?`);
}

const pages = readdirSync(directory)
	.filter((entry) => entry.endsWith('.html'))
	.sort()
	.map((name) => readPage(directory, name));

if (pages.length === 0) {
	fail(`${directory} has no pages.`);
}

const styled = referenceClasses(references);

for (const page of pages) {
	for (const name of selectorClasses(page.css)) {
		styled.add(name);
	}
}

/** @type {string[]} */
const problems = [];
/** @type {string[]} */
const summaries = [];

for (const page of pages) {
	const shipped = selectorClasses(page.css);
	const checked = [...page.used].filter(([className]) => styled.has(className));
	const missing = checked.filter(([className]) => !shipped.has(className));
	const size = Buffer.byteLength(page.css);
	const budget = budgets.get(page.name);

	for (const [className, source] of missing) {
		problems.push(`${page.name} uses .${className} (in ${source}), and its CSS has no rule for it.`);
	}
	if (budget === undefined) {
		problems.push(`${page.name} has no budget: add --budget ${page.name}=<kB> to the site's build script.`);
	} else if (size > budget * 1000) {
		problems.push(`${page.name} carries ${kilobytes(size)} of CSS, over its ${budget} kB budget.`);
	}
	summaries.push(`${page.name}: ${kilobytes(size)} of CSS (budget ${budget ?? '?'} kB), ${checked.length} styled classes used`);
}

for (const name of budgets.keys()) {
	if (!pages.some((page) => page.name === name)) {
		problems.push(`--budget names ${name}, which is not in the build.`);
	}
}

if (problems.length > 0) {
	console.error(`✗ check-site-css: ${directory}\n${problems.map((problem) => `  ${problem}`).join('\n')}`);
	console.error(
		'  A missing rule means the page draws a component from a ui-styles partial its stylesheet does not\n' +
			'  import: import that partial, in the order ui-styles/src/styles.css lists it. A page over its\n' +
			'  budget is carrying CSS it does not draw with, such as the whole ui-styles sheet.',
	);
	process.exit(1);
}

console.log(`→ check-site-css: every class has its rule\n${summaries.map((summary) => `  ${summary}`).join('\n')}`);
