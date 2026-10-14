/**
 * The how-it-works page's build-time half: render its text into `how-it-works.html`.
 *
 * @remarks
 * The page is progressively enhanced. Everything it SAYS — the mini table of contents, the eight
 * algorithm bands with their eyebrows, titles, bodies and code, the act-two divider, the demo links and
 * the benchmark's reference numbers — is rendered here, as static HTML, from the same framework-free
 * content model (`@filter-enginez/examples-shared/how-it-works`) the browser half reads. A search
 * engine, a link preview or a reader with JavaScript off gets the whole narrative; `howItWorksPage.ts`
 * then mounts the figures and the live benchmark into the placeholders left here.
 *
 * The hand-written parts of the page (its `<head>`, the site header, the hero and the closing links)
 * stay in `how-it-works.html`, which marks where each generated fragment goes with an HTML comment from
 * {@link HOW_IT_WORKS_SLOTS}. `vite.config.ts` calls {@link prerenderHowItWorks} from a
 * `transformIndexHtml` hook, so `pnpm dev` and the production build serve the same markup.
 *
 * Pure string building with no DOM, so it runs inside the Vite config under Node and is tested there.
 * Every piece of content passes through {@link escapeHtml}: the code snippets are full of `<`, `>` and
 * quotes, and the content is data, never markup.
 *
 * @packageDocumentation
 */

import {
	computeSpeedup,
	formatDuration,
	formatSpeedup,
	HOW_IT_WORKS_ACT_TWO,
	HOW_IT_WORKS_DEMO_LINKS,
	HOW_IT_WORKS_SECTIONS,
	type HowItWorksSection,
	NAIVE_BASELINE_MS,
	REFERENCE_LABEL,
	referenceMsFor,
} from '@filter-enginez/examples-shared/how-it-works';
import { vertical } from '@filter-enginez/examples-shared/verticals';

import { escapeHtml } from '../escapeHtml.js';

/** The id of the benchmark section, the table of contents' last target. */
export const BENCHMARK_SECTION_ID = 'benchmark';

/** The table-of-contents label of the benchmark section. */
const BENCHMARK_TOC_LABEL = 'Try it live';

/**
 * One table-of-contents entry.
 *
 * @param id - The target section's id.
 * @param label - The entry's text.
 * @returns The link's markup.
 */
function tocLink(id: string, label: string): string {
	return (
		`<a class="fe-about__toc-link" href="#${escapeHtml(id)}">`
		+ `<span class="fe-about__toc-dot" aria-hidden="true"></span>${escapeHtml(label)}</a>`
	);
}

/**
 * The mini table of contents: one entry per band, then the benchmark.
 *
 * @returns The entries' markup, for the `<nav class="fe-about__toc">` in `how-it-works.html`.
 */
export function renderTableOfContents(): string {
	return [
		...HOW_IT_WORKS_SECTIONS.map((section) => tocLink(section.id, section.tocLabel)),
		tocLink(BENCHMARK_SECTION_ID, BENCHMARK_TOC_LABEL),
	].join('\n');
}

/**
 * The act-two divider, rendered before the first `beyond` band.
 *
 * @returns The divider's markup.
 */
function renderActTwo(): string {
	return [
		'<div class="fe-about__act">',
		`<p class="fe-about__eyebrow">${escapeHtml(HOW_IT_WORKS_ACT_TWO.eyebrow)}</p>`,
		`<h2 class="fe-about__act-title">${escapeHtml(HOW_IT_WORKS_ACT_TWO.title)}</h2>`,
		`<p class="fe-about__act-lead">${escapeHtml(HOW_IT_WORKS_ACT_TWO.lead)}</p>`,
		'</div>',
	].join('\n');
}

/**
 * A band's link to a running demonstration, when it has one.
 *
 * @remarks
 * Written with the vertical's DEPLOYED origin, so the static page links somewhere real; the browser
 * half re-resolves it from `data-vertical` and `data-path` for a local run.
 *
 * @param sectionId - The band's id.
 * @returns The link's markup, or an empty string.
 */
function renderDemoLink(sectionId: string): string {
	const demo = HOW_IT_WORKS_DEMO_LINKS[sectionId];

	if (demo === undefined) {
		return '';
	}

	const href = `${vertical(demo.verticalId).productionOrigin}${demo.path}`;

	return (
		`<a class="fe-about__demo-link" href="${escapeHtml(href)}" data-vertical="${escapeHtml(demo.verticalId)}"`
		+ ` data-path="${escapeHtml(demo.path)}">${escapeHtml(demo.label)} →</a>`
	);
}

/**
 * One algorithm band: an empty figure placeholder beside the copy.
 *
 * @param section - The band's content.
 * @param index - Its position; odd bands put the figure on the other side.
 * @returns The band's markup.
 */
function renderBand(section: HowItWorksSection, index: number): string {
	const id = escapeHtml(section.id);
	const demoLink = renderDemoLink(section.id);

	return [
		`<section id="${id}" class="fe-about__band${index % 2 === 1 ? ' is-reversed' : ''}" aria-labelledby="${id}-title">`,
		`<div class="fe-about__figure" data-figure="${id}"></div>`,
		'<div class="fe-about__copy">',
		`<p class="fe-about__eyebrow">${escapeHtml(section.eyebrow)}</p>`,
		`<h2 id="${id}-title" class="fe-about__band-title">${escapeHtml(section.title)}</h2>`,
		`<p class="fe-about__body">${escapeHtml(section.body)}</p>`,
		`<pre class="fe-about__code"><code>${escapeHtml(section.code)}</code></pre>`,
		...(demoLink === '' ? [] : [demoLink]),
		'</div>',
		'</section>',
	].join('\n');
}

/**
 * The eight algorithm bands, with the act-two divider before the first `beyond` band.
 *
 * @returns The bands' markup.
 */
export function renderBands(): string {
	const actTwoStart = HOW_IT_WORKS_SECTIONS.findIndex((section) => section.group === 'beyond');

	return HOW_IT_WORKS_SECTIONS.flatMap((section, index) =>
		index === actTwoStart ? [renderActTwo(), renderBand(section, index)] : [renderBand(section, index)],
	).join('\n');
}

/**
 * The benchmark's committed reference numbers, as a sentence: what the static page shows where the
 * live widget will mount.
 *
 * @returns The paragraph's markup.
 */
export function renderBenchmarkReference(): string {
	const allLayersMs = referenceMsFor({ bitmap: true, exclusionGraph: true, memoization: true });
	const speedup = formatSpeedup(computeSpeedup(NAIVE_BASELINE_MS, allLayersMs));

	return (
		'<p class="fe-about__bench-reference">'
		+ `With all three layers on, the sweep takes <strong>${escapeHtml(formatDuration(allLayersMs))}</strong>, `
		+ `against ${escapeHtml(formatDuration(NAIVE_BASELINE_MS))} for a naive linear scan — ${escapeHtml(speedup)} faster. `
		+ `<span class="fe-about__bench-source">${escapeHtml(REFERENCE_LABEL)}</span></p>`
	);
}

/**
 * The placeholders `how-it-works.html` marks with an HTML comment, and the renderer that fills each.
 *
 * @remarks
 * A `Map` so iteration order is the declaration order and a lookup by marker answers only for these.
 */
export const HOW_IT_WORKS_SLOTS: ReadonlyMap<string, () => string> = new Map([
	['<!--how-it-works:toc-->', renderTableOfContents],
	['<!--how-it-works:bands-->', renderBands],
	['<!--how-it-works:benchmark-reference-->', renderBenchmarkReference],
]);

/**
 * Fill every slot in the page's HTML with its rendered fragment.
 *
 * @param html - The contents of `how-it-works.html`.
 * @returns The HTML with each slot marker replaced.
 * @throws If a marker is missing or appears more than once — a page that silently lost its text would
 *   still build, and serve a page with nothing to say.
 */
export function prerenderHowItWorks(html: string): string {
	let output = html;

	for (const [marker, render] of HOW_IT_WORKS_SLOTS) {
		const occurrences = output.split(marker).length - 1;

		if (occurrences !== 1) {
			throw new Error(`how-it-works.html must contain ${marker} exactly once; found ${String(occurrences)}.`);
		}

		// A replacer FUNCTION, so a `$` in the content is never read as a replacement pattern.
		output = output.replace(marker, () => render());
	}

	return output;
}
