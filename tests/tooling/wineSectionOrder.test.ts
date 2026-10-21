/**
 * The React, Svelte and Vue wine panels must render the same facets in the same order.
 *
 * @remarks
 * Each panel is written by hand in its own framework, so they diverge easily and quietly: a section
 * missing from one, an extra control another never had, the same facet labelled two ways ("Price" vs
 * "Price (USD)"), sections in a different order.
 *
 * None of that is catchable by any one app's own tests, because each panel is internally consistent.
 * The divergence only exists in the COMPARISON, so the assertion has to live here.
 *
 * Parsed from the real components rather than restated. A hardcoded list of fourteen labels would
 * pass while the panels drifted underneath it, which is precisely the failure being guarded.
 *
 * The sliders and the two searches take their labels from the shared copy in `wine-domain`
 * (`WINE_SLIDER_COPY`, `WINE_SEARCHES`), so a section that names one of those (by a `ruleId` /
 * `searchId` on its tag, or by reference in its own file) resolves to that entry's label.
 */

import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import { WINE_SEARCHES, WINE_SLIDER_COPY } from '../../packages/examples-shared/src/wine/wine-domain/panelCopy.js';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

/**
 * Canonicalize a label so a template literal compares equal to its rendered form.
 *
 * @remarks
 * The varietal header carries a live option count — `Varietal (${allVarietals.length})` in React,
 * the Svelte equivalent in Svelte. Comparing the raw strings would fail on the interpolation syntax
 * while the two are in fact identical. Collapsing any `${…}` to `N` compares what the user sees.
 *
 * @param label - The authored label.
 * @returns The label with interpolations collapsed.
 */
function canonical(label: string): string {
	return label.replace(/\$\{[^}]*\}/gu, 'N');
}

/** A shared label table, read by an id parsed out of a source, which may name no entry. */
type LabelTable = Readonly<Record<string, { readonly label: string } | undefined>>;

/** The search fields' labels, by search id. */
const SEARCH_LABELS: LabelTable = WINE_SEARCHES;

/** The sliders' labels, by rule id. */
const SLIDER_LABELS: LabelTable = WINE_SLIDER_COPY;

/** The shared label tables, by the name a source refers to them by. */
const SHARED_LABEL_TABLES: Readonly<Record<string, LabelTable | undefined>> = {
	WINE_SEARCHES: SEARCH_LABELS,
	WINE_SLIDER_COPY: SLIDER_LABELS,
};

/**
 * The shared-copy label a panel tag names through its `ruleId` / `searchId` attribute.
 *
 * @param tag - The section's opening tag, in any of the three frameworks' syntaxes.
 * @returns The label, or `undefined` when the tag names no shared entry.
 */
function labelFromSharedId(tag: string): string | undefined {
	const sliderId = /\brule-?[Ii]d="(\w+)"/u.exec(tag)?.[1];
	const searchId = /\bsearch-?[Ii]d="(\w+)"/u.exec(tag)?.[1];

	if (searchId !== undefined) {
		return SEARCH_LABELS[searchId]?.label;
	}

	return sliderId === undefined ? undefined : SLIDER_LABELS[sliderId]?.label;
}

/**
 * The shared-copy label a section's own source refers to (`WINE_SLIDER_COPY.vintage`,
 * `WINE_SEARCHES.notes`).
 *
 * @param source - The section's source.
 * @returns The label, or `undefined` when the file names no shared entry.
 */
function labelFromSharedReference(source: string): string | undefined {
	// A label attribute bound straight to an entry wins; otherwise the file's first reference, for a
	// section that reads its entry into a local (`const copy = WINE_SEARCHES.notes`).
	const reference = /(?<![-\w])label=\{?"?(WINE_SEARCHES|WINE_SLIDER_COPY)\.(\w+)\.label\b/u.exec(source)
		?? /\b(WINE_SEARCHES|WINE_SLIDER_COPY)\.(\w+)\b/u.exec(source);

	return reference === null ? undefined : SHARED_LABEL_TABLES[reference[1] ?? '']?.[reference[2] ?? '']?.label;
}

/**
 * Section labels in render order for the REACT panel.
 *
 * @remarks
 * Two shapes to resolve. Parameterized sections carry `label="…"` inline; self-contained ones
 * (`<OriginFilterSection />`, `<VintageFilterSection />`, …) hold their label in their OWN file, so
 * the panel alone under-reports by five. Following the component to its `SectionHeader` keeps this
 * parsed from source rather than restated — a hardcoded map would drift the moment a label changed.
 *
 * @returns The labels, in source order.
 */
function reactSectionLabels(): readonly string[] {
	const panelPath = 'packages/examples-shared/src/wine/WineFilterPanel.tsx';
	const source = readFileSync(resolve(REPO_ROOT, panelPath), 'utf8');
	const start = source.indexOf('<FilterSectionGuard topSlot={<SmartFilterPresets />}>');
	const end = source.indexOf('</FilterSectionGuard>', start);

	expect(start, `${panelPath}: no start marker`).toBeGreaterThan(-1);

	const out: string[] = [];

	const lines = source.slice(start, end).split('\n');

	for (let index = 0; index < lines.length; index += 1) {
		let trimmed = (lines[index] ?? '').trim();

		if (!trimmed.startsWith('<') || trimmed.startsWith('<FilterSectionGuard')) {
			continue;
		}
		// Gather a tag that spans several lines (the varietal section's does), up to its `/>`.
		while (!/\/>\s*$/u.test(trimmed) && index + 1 < lines.length) {
			index += 1;
			trimmed += ` ${(lines[index] ?? '').trim()}`;
		}

		const inline = /\blabel=\{?["`]([^"`]+)["`]\}?/u.exec(trimmed)?.[1] ?? labelFromSharedId(trimmed);

		if (inline !== undefined) {
			out.push(canonical(inline));
			continue;
		}

		const component = /^<(\w+)/u.exec(trimmed)?.[1];

		if (component === undefined) {
			continue;
		}

		const own = readFileSync(resolve(REPO_ROOT, `packages/examples-shared/src/wine/filters/${component}.tsx`), 'utf8');
		// `SectionHeader` first; a few sections (Vintage) label their SLIDER instead and have no
		// separate header, so fall back to the first `label=` in the file.
		const label = (/<SectionHeader label=\{?["`]([^"`]+)["`]\}?/u.exec(own)?.[1])
			?? (/\blabel=\{?["`]([^"`]+)["`]\}?/u.exec(own)?.[1])
			?? labelFromSharedReference(own);

		expect(label, `${component} has no resolvable label`).toBeDefined();
		out.push(canonical(label ?? ''));
	}

	return out;
}

/**
 * Section labels in render order for the SVELTE panel.
 *
 * @remarks
 * Same two shapes as React, and the scan has to be ELEMENT-based rather than line-based to tell them
 * apart. A section either carries its label inline at the call site — which for
 * `<WineChipSection>` / `<WineRangeSection>` sits several lines below the opening tag — or holds it in
 * its own file (`<ScoreCompareSection>`, `<WineOriginSection>`, …).
 *
 * **A line-based scan gets this wrong.** It sees `<WineRangeSection` on one line, finds a matching
 * file, follows it, and fails on a component whose label is a PROP. Gathering the whole opening tag
 * is what tells the two shapes apart.
 *
 * @returns The labels, in source order.
 */
function svelteSectionLabels(): readonly string[] {
	const path = 'packages/examples-sveltekit/src/lib/wine/WineFilterPanel.svelte';
	const source = readFileSync(resolve(REPO_ROOT, path), 'utf8');
	const start = source.indexOf('class="fe-filter-panel__body"');

	expect(start, `${path}: no start marker`).toBeGreaterThan(-1);

	// The panel has no `<style>` block, and `indexOf` returning -1 would silently slice to the
	// second-to-last character. Falling back to the end of the file is what that means.
	const styleAt = source.indexOf('<style>', start);
	const body = source.slice(start, styleAt === -1 ? source.length : styleAt);
	const out: string[] = [];
	const lines = body.split('\n');

	for (let index = 0; index < lines.length; index += 1) {
		const component = /^<([A-Z]\w+)/u.exec((lines[index] ?? '').trim())?.[1];

		if (component === undefined) {
			continue;
		}

		// Gather the whole opening tag, which for most sections spans several lines. NOT a regex over
		// `[^>]*`: an attribute like `format={(price) => …}` contains a `>`, so a character-class scan
		// stops at the arrow and misses a `label` on any later line. Prettier puts the self-closing `/>`
		// at the end of the tag's last line, so that is the reliable terminator.
		let tag = lines[index] ?? '';

		while (!/\/>\s*$/u.test(tag) && index + 1 < lines.length) {
			index += 1;
			tag += `\n${lines[index] ?? ''}`;
		}

		const inline = /\blabel=\{?["`]([^"`]+)["`]\}?/u.exec(tag)?.[1] ?? labelFromSharedId(tag);

		if (inline !== undefined) {
			out.push(canonical(inline));
			continue;
		}

		// Only follow EXTRACTED sections. Controls rendered directly by the panel would also match the
		// component pattern, so a missing file here means "not a section", not a failure.
		const ownPath = resolve(REPO_ROOT, `packages/examples-sveltekit/src/lib/wine/sections/${component}.svelte`);

		if (!existsSync(ownPath)) {
			continue;
		}

		const own = readFileSync(ownPath, 'utf8');
		// `SectionHeader` first; `<WineVintageSection>` labels its SLIDER instead and has no separate
		// header, so fall back to the first `label=` in the file — the same two-step React needs.
		const label = (/<SectionHeader label=\{?["`]([^"`]+)["`]\}?/u.exec(own)?.[1])
			?? (/\blabel=\{?["`]([^"`]+)["`]\}?/u.exec(own)?.[1])
			?? labelFromSharedReference(own);

		expect(label, `${component} has no resolvable label`).toBeDefined();
		out.push(canonical(label ?? ''));
	}

	return out;
}

/**
 * Section labels in render order for the VUE panel.
 *
 * @remarks
 * Same two shapes as the other two panels, with one Vue-specific wrinkle: a dynamic label is a BOUND
 * attribute holding a template literal — `:label="`Varietal (${…})`"` — so the quote character the
 * value is wrapped in is a double quote and the literal's own backticks sit INSIDE it. The Svelte
 * regex, which expects the backticks to be the delimiter, matches nothing there and the varietal
 * section would silently vanish from the scan. Two alternatives, bound form first.
 *
 * @returns The labels, in source order.
 */
function vueSectionLabels(): readonly string[] {
	const path = 'packages/examples-vue/src/wine/WineFilterPanel.vue';
	const source = readFileSync(resolve(REPO_ROOT, path), 'utf8');
	const start = source.indexOf('class="fe-filter-panel__body"');

	expect(start, `${path}: no start marker`).toBeGreaterThan(-1);

	const out: string[] = [];
	const lines = source.slice(start).split('\n');

	for (let index = 0; index < lines.length; index += 1) {
		const component = /^<([A-Z]\w+)/u.exec((lines[index] ?? '').trim())?.[1];

		if (component === undefined) {
			continue;
		}

		// Gather the whole opening tag — same reasoning as the Svelte scan: an attribute value can
		// contain a `>`, so a character-class scan stops early. Prettier puts the self-closing `/>` at
		// the end of the tag's last line.
		let tag = lines[index] ?? '';

		while (!/\/>\s*$/u.test(tag) && index + 1 < lines.length) {
			index += 1;
			tag += `\n${lines[index] ?? ''}`;
		}

		const bound = /:label="`([^`]+)`"/u.exec(tag)?.[1];
		const literal = /(?<![-:\w])label="([^"]+)"/u.exec(tag)?.[1];
		const inline = bound ?? literal ?? labelFromSharedId(tag);

		if (inline !== undefined) {
			out.push(canonical(inline));
			continue;
		}

		// Only follow EXTRACTED sections; a control rendered directly by the panel would also match the
		// component pattern, so a missing file means "not a section", not a failure.
		const ownPath = resolve(REPO_ROOT, `packages/examples-vue/src/wine/sections/${component}.vue`);

		if (!existsSync(ownPath)) {
			continue;
		}

		const own = readFileSync(ownPath, 'utf8');
		// `SectionHeader` first; `<WineVintageSection>` labels its SLIDER instead and has no separate
		// header, so fall back to the first `label=` in the file — the same two-step the others need.
		const label = (/<SectionHeader label="([^"]+)"/u.exec(own)?.[1])
			?? (/(?<![-:\w])label="([^"]+)"/u.exec(own)?.[1])
			?? labelFromSharedReference(own);

		expect(label, `${component} has no resolvable label`).toBeDefined();
		out.push(canonical(label ?? ''));
	}

	return out;
}

/** The agreed order: most-used first, each rule-type demo beside its relative. */
const EXPECTED: readonly string[] = [
	'Price (USD)',
	'Points',
	'Score comparison',
	'Color',
	'Single color (exact)',
	'Varietal (N)',
	'Origin',
	'Vintage',
	'ABV (%)',
	'Body',
	'Sweetness',
	'Tasting notes search',
	'Winery (typo-tolerant)',
];

describe('wine panel section order', () => {
	it('React renders the agreed order', () => {
		expect(reactSectionLabels()).toEqual(EXPECTED);
	});

	it('Svelte renders the SAME order', () => {
		expect(svelteSectionLabels()).toEqual(EXPECTED);
	});

	it('Vue renders the SAME order', () => {
		// Three panels agreeing is what makes this file worth more than a comment: the order is a UX
		// decision nothing else enforces, and each new vertical is another chance for it to drift by
		// one section that nobody compares side by side.
		expect(vueSectionLabels()).toEqual(EXPECTED);
	});

	it('every panel carries all fourteen facets, counting the presets', () => {
		// Thirteen labelled sections plus the smart-filter block, which is labelled through its own
		// component rather than inline and so does not appear in the scan.
		expect(EXPECTED).toHaveLength(13);

		for (const path of [
			'packages/examples-shared/src/wine/WineFilterPanel.tsx',
			'packages/examples-sveltekit/src/lib/wine/WineFilterPanel.svelte',
			'packages/examples-vue/src/wine/WineFilterPanel.vue',
		]) {
			expect(readFileSync(resolve(REPO_ROOT, path), 'utf8'), `${path} is missing the presets`)
				.toMatch(/SmartFilter/u);
		}
	});
});
