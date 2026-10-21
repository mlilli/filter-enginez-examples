/**
 * Every app's filter panels share the markup the e2e parity cases find controls by.
 *
 * @remarks
 * ### What the e2e cases rely on
 *
 * The shared cases in `tests/e2e/` address a control the same way in all six apps: a section is a
 * `<section>` inside the panel's `.fe-filter-panel__scroller`, found by its `<h3>` heading matched
 * EXACTLY (`panelSection` in `parityProbes.ts`), and a chip is a `.fe-chip` button found by a
 * pattern anchored at its value (`/^red/`, `/^poetry/`). Playwright matches such a pattern against
 * the element's raw text, untrimmed.
 *
 * So the markup has two halves, and this guards both:
 *
 *   1. **Structure.** Each of the five panel implementations (the shared React panels both React apps
 *      render, then Angular, SvelteKit, vanilla and Vue) renders a scroller for all three datasets,
 *      writes its section headings as `<h3>` elements and its chips as `.fe-chip` buttons with the
 *      shared modifiers and count badge.
 *   2. **Text.** A heading's text is its label and a chip's text starts with its value — no
 *      whitespace before, after or between the pieces. JSX drops the line breaks between an
 *      expression and the next element, and the vanilla panels build text nodes directly, so the two
 *      are exact by construction. The three template languages are not: Vue keeps a space for a line
 *      break between an interpolation and the next element, Svelte keeps one wherever a line break
 *      separates two nodes, and Angular keeps one for EVERY line break beside an interpolation,
 *      including the first and last. A Vue or Angular heading laid out over three lines renders
 *      `Color ` or ` Color `, and an e2e case looking for the "Color" section finds nothing.
 *
 * The text rule is checked on the template source, framework by framework: inside every section
 * heading and every chip button, no whitespace run that holds a line break may sit between two pieces
 * of content (Vue, Svelte, Angular), and none may open or close the content (Angular, which keeps
 * those too). Tags and control-flow blocks are pieces; whitespace inside a tag (attributes over
 * several lines) is not content.
 *
 * ### Guards against passing for the wrong reason
 *
 * Comments are stripped before matching. Every implementation must contribute a heading and a chip,
 * and the scan must find the shared heading and chip controls of each template framework by path.
 */

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import { REPO_ROOT } from './support/repoFiles.js';

/** The three datasets every app's panels cover, as their source directories name them. */
const DATASETS = ['books', 'real-estate', 'wine'] as const;

/**
 * Each panel implementation's source roots. Both React apps render the shared React panels, whose
 * chip control is `react-ui`'s.
 */
const PANEL_IMPLEMENTATIONS: Readonly<Record<string, readonly string[]>> = {
	angular: ['packages/examples-angular/src'],
	'shared React panels': ['packages/examples-shared/src', 'packages/react-ui/src'],
	sveltekit: ['packages/examples-sveltekit/src'],
	vanilla: ['packages/examples-vanilla/src'],
	vue: ['packages/examples-vue/src'],
};

/** The extensions a panel can be written in. */
const PANEL_EXTENSIONS: readonly string[] = ['.html', '.svelte', '.ts', '.tsx', '.vue'];

/**
 * Every non-test source of one implementation.
 *
 * @param roots - The implementation's source roots.
 * @returns Repo-relative path → text with comments stripped.
 */
function readImplementation(roots: readonly string[]): ReadonlyMap<string, string> {
	return new Map(roots.flatMap((root) => [...readSources(root, PANEL_EXTENSIONS)]));
}

/** The template frameworks, the files their templates live in, and their shared heading + chip controls. */
const TEMPLATE_FRAMEWORKS = {
	angular: {
		controls: ['packages/examples-angular/src/app/controls/chip-toggle-group.component.ts', 'packages/examples-angular/src/app/controls/section-header.component.ts'],
		extensions: ['.html', '.component.ts'],
		root: 'packages/examples-angular/src',
	},
	sveltekit: {
		controls: ['packages/examples-sveltekit/src/lib/controls/ChipToggleGroup.svelte', 'packages/examples-sveltekit/src/lib/controls/SectionHeader.svelte'],
		extensions: ['.svelte'],
		root: 'packages/examples-sveltekit/src',
	},
	vue: {
		controls: ['packages/examples-vue/src/controls/ChipToggleGroup.vue', 'packages/examples-vue/src/controls/SectionHeader.vue'],
		extensions: ['.vue'],
		root: 'packages/examples-vue/src',
	},
} as const;

/** A template framework's name. */
type TemplateFramework = keyof typeof TEMPLATE_FRAMEWORKS;

/** One section heading or chip button found in a template. */
interface TextElement {
	/** The element's content, between its open and close tags. */
	readonly content: string;
	/** What the element is, for the failure message. */
	readonly kind: 'chip' | 'heading';
	/** The 1-based line its open tag starts on. */
	readonly line: number;
	/** The repo-relative file. */
	readonly path: string;
}

/**
 * Remove block, JSX and HTML comments, so a docblock that shows markup is not scanned as markup.
 *
 * @param source - A file's text.
 * @returns The text without comments, with each comment's line breaks kept so line numbers hold.
 */
function stripComments(source: string): string {
	const blank = (comment: string): string => comment.replaceAll(/[^\n]/gu, '');

	return source.replaceAll(/\/\*[\s\S]*?\*\//gu, blank).replaceAll(/<!--[\s\S]*?-->/gu, blank);
}

/**
 * Every non-test source file under a directory whose name ends with one of the extensions.
 *
 * @param directory - Repo-relative directory.
 * @param extensions - The accepted endings.
 * @returns Repo-relative path → text with comments stripped.
 */
function readSources(directory: string, extensions: readonly string[]): ReadonlyMap<string, string> {
	const sources = new Map<string, string>();
	const walk = (relativeDirectory: string): void => {
		for (const name of readdirSync(resolve(REPO_ROOT, relativeDirectory))) {
			const path = join(relativeDirectory, name);

			if (statSync(resolve(REPO_ROOT, path)).isDirectory()) {
				walk(path);
			} else if (extensions.some((extension) => name.endsWith(extension)) && !/\.(?:test|spec)\./u.test(name) && !name.endsWith('.d.ts')) {
				sources.set(path, stripComments(readFileSync(resolve(REPO_ROOT, path), 'utf8')));
			}
		}
	};

	walk(directory);

	return sources;
}

/**
 * The index just past the `>` that closes the tag opening at `start`.
 *
 * @remarks
 * Skips a `>` inside a quoted attribute value (`(click)="a > b"`, `@click="() => x"`) or inside a
 * brace expression (Svelte's `onclick={() => toggle(option)}`).
 *
 * @param source - The text.
 * @param start - The index of the tag's `<`.
 * @returns The index after the closing `>`, or `-1` when the tag never closes.
 */
function endOfTag(source: string, start: number): number {
	let quote: string | null = null;
	let depth = 0;

	for (let index = start + 1; index < source.length; index++) {
		const char = source.charAt(index);

		if (quote !== null) {
			if (char === quote) {
				quote = null;
			}
		} else if (char === '{') {
			depth++;
		} else if (char === '}') {
			depth--;
		} else if (depth === 0 && (char === '"' || char === '\'')) {
			quote = char;
		} else if (depth === 0 && char === '>') {
			return index + 1;
		}
	}

	return -1;
}

/**
 * Every section heading and chip button in a template source.
 *
 * @param path - The repo-relative file.
 * @param source - Its text, comments stripped.
 * @returns The elements, with their content.
 */
function findTextElements(path: string, source: string): TextElement[] {
	const found: TextElement[] = [];
	const openers = [
		{ close: '</h3>', kind: 'heading' as const, pattern: /<h3\b/gu },
		{ close: '</button>', kind: 'chip' as const, pattern: /<button\b/gu },
	];

	for (const { close, kind, pattern } of openers) {
		for (const match of source.matchAll(pattern)) {
			const tagEnd = endOfTag(source, match.index);
			const openTag = source.slice(match.index, tagEnd);
			const isWanted = kind === 'heading' ? /section-label/u.test(openTag) : /\bclass="fe-chip"/u.test(openTag);
			const closeAt = source.indexOf(close, tagEnd);

			if (tagEnd !== -1 && isWanted && closeAt !== -1) {
				found.push({
					content: source.slice(tagEnd, closeAt),
					kind,
					line: source.slice(0, match.index).split('\n').length,
					path,
				});
			}
		}
	}

	return found;
}

/**
 * An element's content with every tag and control-flow block replaced by one marker character and
 * every interpolation by another, so only the whitespace BETWEEN pieces of content is left to check.
 *
 * @param content - The element's content.
 * @returns The reduced content.
 */
function reduceContent(content: string): string {
	let reduced = '';

	for (let index = 0; index < content.length;) {
		if (content.charAt(index) === '<') {
			const end = endOfTag(content, index);

			reduced += '\u0001';
			index = end === -1 ? content.length : end;
		} else {
			reduced += content.charAt(index);
			index++;
		}
	}

	return reduced
		// Angular and Vue interpolations, then Svelte blocks and expressions.
		.replaceAll(/\{\{[\s\S]*?\}\}/gu, '\u0002')
		.replaceAll(/\{[#:/@][^}]*\}/gu, '\u0001')
		.replaceAll(/\{[^{}]*\}/gu, '\u0002')
		// Angular control flow: `@if (…) {` opens a block, a lone `}` closes one.
		.replaceAll(/@\w+(?:\s*\((?:[^()]|\([^()]*\))*\))?\s*\{/gu, '\u0001')
		.replaceAll('}', '\u0001');
}

/**
 * What is wrong with an element's text in a framework, if anything.
 *
 * @param framework - The template framework.
 * @param element - The element.
 * @returns A description of the stray whitespace, or `null` when the text is tight.
 */
function strayWhitespace(framework: TemplateFramework, element: TextElement): string | null {
	const reduced = reduceContent(element.content);

	if (/\S\s*\n\s*\S/u.test(reduced)) {
		return 'a line break between two pieces of its content';
	}
	if (framework === 'angular' && /^\s|\s$/u.test(reduced) && reduced.trim() !== '') {
		return 'whitespace before or after its content, which Angular keeps';
	}

	return null;
}

describe('filter-panel markup parity', () => {
	it('renders a panel scroller for all three datasets in every implementation', () => {
		for (const [implementation, roots] of Object.entries(PANEL_IMPLEMENTATIONS)) {
			const scrollerPaths = [...readImplementation(roots)]
				.filter(([, code]) => code.includes('fe-filter-panel__scroller'))
				.map(([path]) => path);

			for (const dataset of DATASETS) {
				expect(
					scrollerPaths.some((path) => path.includes(`/${dataset}/`)),
					`${implementation}: no ${dataset} panel renders .fe-filter-panel__scroller, the container every e2e section lookup starts from`,
				).toBe(true);
			}
		}
	});

	it('writes section headings as <h3> and chips as .fe-chip buttons with the shared modifiers in every implementation', () => {
		for (const [implementation, roots] of Object.entries(PANEL_IMPLEMENTATIONS)) {
			const code = [...readImplementation(roots).values()].join('\n');

			// The heading is an `<h3>` in markup, `el('h3', …)` in the vanilla DOM builder.
			expect(/<h3 class(?:Name)?="fe-filter-section-label"|el\('h3'/u.test(code), `${implementation}: no <h3> section heading`).toBe(true);
			expect(code.includes('fe-filter-section-label'), `${implementation}: no fe-filter-section-label heading`).toBe(true);

			for (const token of ['fe-chip', 'fe-chip--selected', 'fe-chip--unavailable', 'fe-chip__count']) {
				expect(code.includes(token), `${implementation}: its chip control never writes ${token}`).toBe(true);
			}
		}
	});

	it('keeps every section heading\'s and chip\'s text tight in the three template frameworks', () => {
		const problems: string[] = [];

		for (const [framework, { controls, extensions, root }] of Object.entries(TEMPLATE_FRAMEWORKS) as [TemplateFramework, (typeof TEMPLATE_FRAMEWORKS)[TemplateFramework]][]) {
			const elements = [...readSources(root, extensions)].flatMap(([path, source]) => findTextElements(path, source));
			const scannedPaths = new Set(elements.map((element) => element.path));

			// Vacuity: the scan found both kinds, in the framework's shared controls among other files.
			expect(elements.some((element) => element.kind === 'heading'), `${framework}: no section heading found`).toBe(true);
			expect(elements.some((element) => element.kind === 'chip'), `${framework}: no chip found`).toBe(true);
			for (const control of controls) {
				expect(scannedPaths.has(control), `${framework}: ${control} was not scanned`).toBe(true);
			}

			for (const element of elements) {
				const problem = strayWhitespace(framework, element);

				if (problem !== null) {
					problems.push(`${element.path}:${element.line} — the ${element.kind} has ${problem}`);
				}
			}
		}

		expect(
			problems,
			'Write the heading or chip with no whitespace between its tags, interpolations and blocks (e.g. `<h3 class="…">{{ label }}</h3>`, `>{{ label }}<span …>({{ count }})</span>`): the framework turns that whitespace into a space, and the e2e cases match the text exactly.',
		).toEqual([]);
	});
});
