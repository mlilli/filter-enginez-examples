/**
 * The two edits the site's build makes to every page it writes, so the first render waits on nothing
 * but the HTML: the stylesheet goes into the page, and the fonts are requested from its head. And the
 * cut the demo apps' builds make first, so that what goes into their page is only the CSS its first
 * screen can use.
 *
 * @remarks
 * Vite writes each page's CSS to a hashed file and links it from the page's head, and a browser
 * renders nothing until that file arrives: a second round trip, after the HTML's, on every first visit.
 * The fonts the stylesheet declares are a third: a browser finds them only once it has parsed the CSS
 * and laid out text that uses them.
 *
 * - {@link inlineStylesheets} replaces each stylesheet link with a `<style>` holding the stylesheet
 *   itself. The site's pages are small and their CSS compresses to a few kilobytes more than the HTML,
 *   so carrying it in every page costs less than the round trip it removes.
 * - {@link preloadFonts} adds a `<link rel="preload">` for each font the first screen sets, ahead of the
 *   page's first other link, where the browser's preload scanner meets it within the HTML's first few
 *   kilobytes. It is the demo apps' font preload too, so it lives with theirs in
 *   `scripts/lib/font-preloads.mjs` and is re-exported here, where the site's build reads it.
 * - {@link criticalStylesheet} is for the demo apps, whose one stylesheet styles every route: it keeps
 *   the rules that the first screen's markup and scripts can match ({@link classUsage}), and
 *   {@link needsFullStylesheet} tells which code loaded later must bring the whole sheet with it.
 *   `scripts/lib/critical-css.mjs` is the Vite plugin that puts the cut into each app's page and loads
 *   the whole sheet with the code that needs it.
 *
 * Pure string functions, so they are tested on their own; `vite.config.ts` reads the built stylesheets
 * and fonts out of the bundle and calls them.
 *
 * @packageDocumentation
 */

export { preloadFonts } from '../../../scripts/lib/font-preloads.mjs';

/** A stylesheet link exactly as Vite writes one into a built page. */
const STYLESHEET_LINK = /<link rel="stylesheet" crossorigin href="([^"]+)">/gu;

/**
 * A `url()` whose target is relative to the stylesheet's own location.
 *
 * @remarks
 * Inlined, such a URL would resolve against the page instead, and point somewhere else. Vite writes
 * every asset URL from the site root (`/assets/…`) or as a `data:` URI, so a build should never contain
 * one; finding one fails the build rather than shipping a page whose fonts or images are missing.
 */
const RELATIVE_URL = /url\(\s*(?!\s|['"]?(?:data:|\/|#|https?:))/u;

/** What {@link inlineStylesheets} did to a page. */
export interface InlinedPage {
	/** The page, with each stylesheet link replaced by its stylesheet. */
	readonly html: string;
	/** The `href` of every stylesheet it inlined, in page order. */
	readonly inlined: readonly string[];
}

/**
 * Replace every stylesheet link in a built page with a `<style>` holding that stylesheet.
 *
 * @param html - The page, as Vite wrote it.
 * @param readStylesheet - The stylesheet a link's `href` names, or `undefined` if the build has none.
 * @returns The page, and which stylesheets went into it.
 * @throws {Error} When a link names a stylesheet the build does not have, or a stylesheet cannot be
 *   inlined as it is: one that would close its own `<style>` element, or one with a relative `url()`.
 */
export function inlineStylesheets(html: string, readStylesheet: (href: string) => string | undefined): InlinedPage {
	const inlined: string[] = [];
	const page = html.replaceAll(STYLESHEET_LINK, (_link, href: string) => {
		const css = readStylesheet(href);

		if (css === undefined) {
			throw new Error(`The page links ${href}, which is not in the build.`);
		}
		if (/<\/style/iu.test(css)) {
			throw new Error(`${href} contains "</style", which would end the inline <style> early.`);
		}
		if (RELATIVE_URL.test(css)) {
			throw new Error(`${href} has a relative url(), which would resolve against the page once inlined.`);
		}
		inlined.push(href);

		return `<style>${css}</style>`;
	});

	return { html: page, inlined };
}

/**
 * The class names a page's markup and scripts can write, read from their text by {@link classUsage}.
 *
 * @remarks
 * A class reaches an element as a string: in markup, a `class` attribute; in a script, a string or
 * template literal handed to `className`, `classList` or a framework's class binding. So the words of
 * the page's text include every class it can use. Reading them without parsing the text collects far
 * more than classes (every word of every string, and the code between them), and that costs only
 * bytes: a rule kept for a word that is no element's class is a rule that matches nothing.
 *
 * A class built at run time from a fixed start and a variable end (`` `fe-range-histogram__bar--${tier}` ``,
 * which a minifier may turn into `"fe-range-histogram__bar--"+t`) leaves only its start in the text.
 * Such a start ends in `-` or `_`, where a BEM element or modifier begins, so a word that ends that way
 * is also kept as a prefix: every class that starts with it counts as used.
 */
export interface ClassUsage {
	/** Every word of the text. */
	readonly words: ReadonlySet<string>;
	/** The words that end where a BEM element or modifier begins, each read as the start of a class. */
	readonly prefixes: readonly string[];
}

/**
 * What separates the words of markup or minified code: whitespace, quotes, backslashes (an escaped
 * quote in a string of markup), and the delimiters of a template literal's placeholders.
 *
 * @remarks
 * Not `:`, `[`, `(` or `,`, which occur inside Tailwind class names (`md:flex`, `min-h-[44px]`).
 * {@link CODE_PUNCTUATION} splits each word once more on those, so that a class written as an unquoted
 * object key (`{active:e}`, a framework's class binding) is read as well.
 */
const WORD_SEPARATOR = /[\s"'\\`]+|\$\{|\}/u;

/** The punctuation of code that a word may still carry around the identifiers inside it. */
const CODE_PUNCTUATION = /[!&()*+,:;<=>?[\]{|]+/u;

/** A word that ends where a BEM element or modifier would begin: `fe-chip--`, `fe-tree__`. */
const CLASS_PREFIX = /^-?[A-Z_a-z][\w-]*[_-]$/u;

/**
 * The shortest word that counts as a prefix. Shorter ones (`x-`, `on-`) are fragments of code that
 * would make nearly every class look used.
 */
const MIN_PREFIX_LENGTH = 5;

/**
 * Read the class names a page can use from its markup and the code of the scripts it runs.
 *
 * @param sources - The page's HTML, and the code of each script it loads.
 * @returns Every word of them, and the words that read as the start of a class.
 */
export function classUsage(sources: readonly string[]): ClassUsage {
	const words = new Set<string>();

	for (const source of sources) {
		for (const word of source.split(WORD_SEPARATOR)) {
			words.add(word);

			for (const part of word.split(CODE_PUNCTUATION)) {
				words.add(part);
			}
		}
	}
	words.delete('');

	return { prefixes: [...words].filter((word) => word.length >= MIN_PREFIX_LENGTH && CLASS_PREFIX.test(word)), words };
}

/**
 * Whether a page whose text reads as `usage` can put a class on an element.
 *
 * @param usage - What {@link classUsage} read from the page.
 * @param className - The class, unescaped (`md:flex`, not `md\:flex`).
 * @returns `true` when the class is one of the page's words, or starts with one of its prefixes.
 */
export function usesClass(usage: ClassUsage, className: string): boolean {
	return usage.words.has(className) || usage.prefixes.some((prefix) => className.startsWith(prefix));
}

/** One statement of a stylesheet, or of a block inside one, as {@link parseStatements} reads it. */
type CssStatement =
	| { readonly children: readonly CssStatement[]; readonly kind: 'group'; readonly prelude: string }
	| { readonly kind: 'keyframes'; readonly name: string; readonly text: string }
	| { readonly kind: 'other'; readonly text: string }
	| { readonly kind: 'rule'; readonly prelude: string; readonly text: string };

/** The at-rules whose block holds statements of its own, rather than declarations or keyframes. */
const GROUP_AT_RULES: ReadonlySet<string> = new Set(['-moz-document', 'container', 'document', 'layer', 'media', 'scope', 'starting-style', 'supports']);

/** The at-rules that hold keyframes. */
const KEYFRAMES_AT_RULE = /^(?:-[a-z]+-)?keyframes$/u;

/** A named `@layer` block, which declares its layer's place in the cascade even when it is empty. */
const NAMED_LAYER_BLOCK = /^@layer\s+\S/u;

/** A CSS identifier, escapes included, from the position the expression's `lastIndex` names. */
const CSS_IDENTIFIER = /(?:[\w-]|\P{ASCII}|\\(?:[\dA-Fa-f]{1,6}\s?|[^\n\dA-Fa-f]))+/uy;

/** One escape in a CSS identifier: a code point in hex, or a character taken literally. */
const CSS_ESCAPE = /\\(?:[\dA-Fa-f]{1,6}\s?|[^\n])/gu;

/**
 * The index just past the token of CSS that starts at `index`: a quoted string, a comment and an
 * escape are one token each, since they may hold `{`, `;` or `,` as text; any other character is a
 * token of its own.
 *
 * @param css - The stylesheet, or a selector.
 * @param index - Where the token starts.
 * @returns Where the next token starts.
 * @throws {Error} At a string or comment that never ends.
 */
function tokenEnd(css: string, index: number): number {
	const char = css.charAt(index);
	const close = char === '"' || char === "'" ? char : css.startsWith('/*', index) ? '*/' : '';

	if (char === '\\') {
		return index + 2;
	}
	if (close === '') {
		return index + 1;
	}

	let cursor = index + (close === '*/' ? 2 : 1);

	while (cursor < css.length && !css.startsWith(close, cursor)) {
		cursor += css.charAt(cursor) === '\\' && close !== '*/' ? 2 : 1;
	}
	if (cursor >= css.length) {
		throw new Error(`The stylesheet has a ${close === '*/' ? 'comment' : 'string'} that never ends, at offset ${String(index)}.`);
	}

	return cursor + close.length;
}

/**
 * The index of the `}` that closes the block opened at `open`.
 *
 * @param css - The stylesheet.
 * @param open - The index of the block's `{`.
 * @returns The index of its `}`. Braces inside strings, comments and parentheses (an unquoted `url()`)
 *   are text, not blocks.
 * @throws {Error} When the block never closes.
 */
function blockEnd(css: string, open: number): number {
	let braces = 1;
	let parentheses = 0;

	for (let cursor = open + 1; cursor < css.length; cursor = tokenEnd(css, cursor)) {
		const char = css.charAt(cursor);

		if (char === '(') {
			parentheses += 1;
		} else if (char === ')') {
			parentheses -= 1;
		} else if (parentheses === 0 && char === '{') {
			braces += 1;
		} else if (parentheses === 0 && char === '}') {
			braces -= 1;

			if (braces === 0) {
				return cursor;
			}
		}
	}

	throw new Error(`The stylesheet has a block that never closes, opened at offset ${String(open)}.`);
}

/**
 * Read the statements of a stylesheet, or of the block between `start` and `end`.
 *
 * @remarks
 * Enough of CSS's syntax to cut a stylesheet into the statements it is made of, each with its exact
 * text: style rules, the at-rules that group statements (`@media`, `@supports`, `@layer` and the
 * like, read recursively), `@keyframes`, and every other at-rule (`@font-face`, `@property`, a
 * `@layer` statement) as text. Comments are dropped, except a `/*!` one: that form marks a notice
 * that must stay with the code, as Tailwind's license does.
 *
 * @param css - The stylesheet.
 * @param start - Where the statements start.
 * @param end - Where they end: the stylesheet's length, or the index of a block's `}`.
 * @returns The statements, in order.
 * @throws {Error} When the text is not a run of statements: a block that never closes, a string or
 *   comment that never ends, or text left over at the end.
 */
function parseStatements(css: string, start: number, end: number): CssStatement[] {
	const statements: CssStatement[] = [];
	let index = start;

	while (index < end) {
		if (/\s/u.test(css.charAt(index))) {
			index += 1;
			continue;
		}
		if (css.startsWith('/*', index)) {
			const after = tokenEnd(css, index);

			if (css.startsWith('/*!', index)) {
				statements.push({ kind: 'other', text: css.slice(index, after) });
			}
			index = after;
			continue;
		}

		let cursor = index;
		let depth = 0;

		while (cursor < end && (depth > 0 || !'{;}'.includes(css.charAt(cursor)))) {
			const char = css.charAt(cursor);

			depth += char === '(' || char === '[' ? 1 : char === ')' || char === ']' ? -1 : 0;
			cursor = tokenEnd(css, cursor);
		}

		const terminator = css.charAt(cursor);

		if (cursor < end && terminator === ';') {
			statements.push({ kind: 'other', text: css.slice(index, cursor + 1) });
			index = cursor + 1;
			continue;
		}
		if (cursor >= end || terminator !== '{') {
			throw new Error(`The stylesheet has text that is not a statement, at offset ${String(index)}: ${css.slice(index, index + 60)}`);
		}

		const close = blockEnd(css, cursor);
		const prelude = css.slice(index, cursor).trim();
		const atRule = prelude.startsWith('@') ? prelude.slice(1).replace(/[\s(].*$/su, '').toLowerCase() : null;
		const text = css.slice(index, close + 1);

		if (atRule === null) {
			statements.push({ kind: 'rule', prelude, text });
		} else if (GROUP_AT_RULES.has(atRule)) {
			statements.push({ children: parseStatements(css, cursor + 1, close), kind: 'group', prelude });
		} else if (KEYFRAMES_AT_RULE.test(atRule)) {
			statements.push({ kind: 'keyframes', name: prelude.replace(/^@\S+\s*/u, '').replaceAll(/^["']|["']$/gu, ''), text });
		} else {
			statements.push({ kind: 'other', text });
		}
		index = close + 1;
	}

	return statements;
}

/**
 * Split a selector list at its top-level commas.
 *
 * @param prelude - A style rule's selector list.
 * @returns Each selector, as written.
 */
function splitSelectorList(prelude: string): string[] {
	const selectors: string[] = [];
	let depth = 0;
	let start = 0;

	for (let cursor = 0; cursor < prelude.length; cursor = tokenEnd(prelude, cursor)) {
		const char = prelude.charAt(cursor);

		if (char === '(' || char === '[') {
			depth += 1;
		} else if (char === ')' || char === ']') {
			depth -= 1;
		} else if (char === ',' && depth === 0) {
			selectors.push(prelude.slice(start, cursor));
			start = cursor + 1;
		}
	}
	selectors.push(prelude.slice(start));

	return selectors;
}

/**
 * The classes an element, or one of its ancestors or siblings, must have for a selector to match it.
 *
 * @remarks
 * Every class of the selector's compounds, unescaped (`.md\:flex` requires `md:flex`), except those
 * inside a functional pseudo-class: `:not(.a)` matches elements without the class, and `:is(.a, .b)`
 * requires only one of its classes. Leaving those out can only make a selector look matchable when it
 * is not, never the reverse, so a rule is kept rather than wrongly left out.
 *
 * @param selector - One selector of a selector list.
 * @returns Its required classes, in order.
 */
export function requiredClasses(selector: string): string[] {
	const classes: string[] = [];
	let depth = 0;
	let cursor = 0;

	while (cursor < selector.length) {
		const char = selector.charAt(cursor);

		if (char === '(' || char === '[') {
			depth += 1;
		} else if (char === ')' || char === ']') {
			depth -= 1;
		}
		CSS_IDENTIFIER.lastIndex = cursor + 1;
		const identifier = char === '.' && depth === 0 ? CSS_IDENTIFIER.exec(selector) : null;

		if (identifier === null) {
			cursor = tokenEnd(selector, cursor);
		} else {
			classes.push(
				identifier[0].replaceAll(CSS_ESCAPE, (escape) =>
					/^\\[\dA-Fa-f]/u.test(escape) ? String.fromCodePoint(Number.parseInt(escape.slice(1), 16)) : escape.slice(1),
				),
			);
			cursor += 1 + identifier[0].length;
		}
	}

	return classes;
}

/** What {@link criticalStylesheet} kept of a stylesheet, and what it left out. */
export interface CriticalStylesheet {
	/** The rules kept, in the stylesheet's order, each exactly as the stylesheet writes it. */
	readonly css: string;
	/** How many style rules the stylesheet has. */
	readonly ruleCount: number;
	/** How many of them were kept. */
	readonly keptRuleCount: number;
	/** The name of every `@keyframes` left out. */
	readonly omittedKeyframes: readonly string[];
	/** For every selector of every rule left out, the classes it requires ({@link requiredClasses}). */
	readonly omittedSelectors: readonly (readonly string[])[];
}

/**
 * Cut a stylesheet down to the rules a page whose text reads as `usage` can match.
 *
 * @remarks
 * A style rule is kept when any one of its selectors requires only classes the page uses
 * ({@link usesClass}); a selector that requires no class (`:root`, `body`, `*`) always counts. A
 * `@keyframes` is kept when the kept CSS or the page's text names it; every other at-rule
 * (`@font-face`, `@property`, a `@layer` statement) is kept as it is. A block at-rule is kept when
 * anything inside it is, and a named `@layer` block always, if only as `@layer name{}`, since the
 * order in which layers first appear is the order of the cascade.
 *
 * So the result is the stylesheet with rules taken out, never changed or reordered. That is what makes
 * the cut safe on both sides of the moment the whole sheet arrives:
 *
 * - **Before it**, an element on the page is matched by exactly the rules that match it in the whole
 *   sheet, in the same order: a rule left out requires a class the page cannot set.
 * - **After it**, every rule kept here appears again, identical and later, in the whole sheet: in the
 *   same layer, with the same specificity, under the same conditions. A later copy of a rule wins
 *   every contest the earlier one would, so the kept rules decide nothing, and the page renders as the
 *   whole sheet alone renders it. The layers appear first in the same order, too.
 *
 * @param css - The whole stylesheet, as the build wrote it.
 * @param usage - What {@link classUsage} read from the page and the scripts it starts with.
 * @returns The kept rules, and what was left out.
 * @throws {Error} When the stylesheet cannot be read as statements (see {@link parseStatements}).
 */
export function criticalStylesheet(css: string, usage: ClassUsage): CriticalStylesheet {
	const statements = parseStatements(css, 0, css.length);
	const keptRules = new Set<CssStatement>();
	const keyframeNames: string[] = [];
	const omittedSelectors: string[][] = [];
	let ruleCount = 0;

	const sortStatements = (list: readonly CssStatement[]): void => {
		for (const statement of list) {
			if (statement.kind === 'rule') {
				const selectors = splitSelectorList(statement.prelude).map(requiredClasses);

				ruleCount += 1;
				if (selectors.some((classes) => classes.every((name) => usesClass(usage, name)))) {
					keptRules.add(statement);
				} else {
					omittedSelectors.push(...selectors);
				}
			} else if (statement.kind === 'group') {
				sortStatements(statement.children);
			} else if (statement.kind === 'keyframes') {
				keyframeNames.push(statement.name);
			}
		}
	};
	const render = (list: readonly CssStatement[], keptKeyframes: ReadonlySet<string>): string =>
		list
			.map((statement) => {
				switch (statement.kind) {
					case 'group': {
						const inner = render(statement.children, keptKeyframes);

						return inner !== '' || NAMED_LAYER_BLOCK.test(statement.prelude) ? `${statement.prelude}{${inner}}` : '';
					}
					case 'keyframes':
						return keptKeyframes.has(statement.name) ? statement.text : '';
					case 'other':
						return statement.text;
					case 'rule':
						return keptRules.has(statement) ? statement.text : '';
				}
			})
			.join('');

	sortStatements(statements);

	const rulesText = render(statements, new Set());
	const keptKeyframes = new Set(
		keyframeNames.filter(
			(name) => usage.words.has(name) || new RegExp(`(?<![\\w-])${name.replaceAll(/[$()*+.?[\\\]^{|}]/gu, '\\$&')}(?![\\w-])`, 'u').test(rulesText),
		),
	);

	return {
		css: render(statements, keptKeyframes),
		keptRuleCount: keptRules.size,
		omittedKeyframes: keyframeNames.filter((name) => !keptKeyframes.has(name)),
		omittedSelectors,
		ruleCount,
	};
}

/**
 * Whether code that a page loads after its first screen must bring the whole stylesheet with it.
 *
 * @remarks
 * A selector the cut left out can start matching only when the last of the classes it requires
 * appears on screen. At least one of them is a class the first screen cannot write (that is why it was
 * left out), so some later code writes it. The rule here is that every piece of later code that writes
 * such a class, for a selector the app as a whole can match, brings the whole sheet: then whichever of
 * them puts the selector's last class on screen, the sheet has arrived before it renders. A selector
 * requiring a class nothing in the app writes can never match, and asks for nothing.
 *
 * A `@keyframes` the cut left out counts the same way when the code names it, as a script setting an
 * animation does.
 *
 * @param critical - What {@link criticalStylesheet} kept for the page's first screen.
 * @param usage - What the first screen can use (`startup`), what any code in the app can
 *   (`everything`), and what the code being loaded can (`loaded`), each read by {@link classUsage}.
 * @returns `true` when the loaded code writes, for some selector left out that the app can match, a
 *   class the first screen cannot write; or names a `@keyframes` left out.
 */
export function needsFullStylesheet(
	critical: CriticalStylesheet,
	usage: { readonly everything: ClassUsage; readonly loaded: ClassUsage; readonly startup: ClassUsage },
): boolean {
	return (
		critical.omittedSelectors.some(
			(classes) =>
				classes.every((name) => usesClass(usage.everything, name)) &&
				classes.some((name) => usesClass(usage.loaded, name) && !usesClass(usage.startup, name)),
		) || critical.omittedKeyframes.some((name) => usage.loaded.words.has(name))
	);
}
