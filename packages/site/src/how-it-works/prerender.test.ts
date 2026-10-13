/**
 * Tests for `prerender.ts` — the build-time render of the how-it-works page's text.
 *
 * @remarks
 * What matters is that every word reaches the HTML, escaped, in the order the page reads, and that a
 * page template missing a slot fails the build instead of shipping without its text. The markup is
 * parsed back with the DOM rather than matched as strings, so the assertions are about the document a
 * browser (or a crawler) would actually see.
 *
 * @packageDocumentation
 */

import {
	formatDuration,
	HOW_IT_WORKS_ACT_TWO,
	HOW_IT_WORKS_DEMO_LINKS,
	HOW_IT_WORKS_SECTIONS,
	NAIVE_BASELINE_MS,
	REFERENCE_LABEL,
} from '@filter-enginez/examples-shared/how-it-works';
import { describe, expect, it } from 'vitest';

import {
	BENCHMARK_SECTION_ID,
	escapeHtml,
	HOW_IT_WORKS_SLOTS,
	prerenderHowItWorks,
	renderBands,
	renderBenchmarkReference,
	renderTableOfContents,
} from './prerender.js';

/**
 * Parse a fragment the way a browser would.
 *
 * @param html - The markup.
 * @returns A detached container holding it.
 */
function parse(html: string): HTMLElement {
	const container = document.createElement('div');

	container.innerHTML = html;

	return container;
}

/** A page template holding every slot once, as `how-it-works.html` does. */
const TEMPLATE = [...HOW_IT_WORKS_SLOTS.keys()].map((marker) => `<div>${marker}</div>`).join('\n');

describe('escapeHtml', () => {
	it('escapes the five characters HTML gives meaning to', () => {
		expect(escapeHtml(`a < b && "c" > 'd'`)).toBe('a &lt; b &amp;&amp; &quot;c&quot; &gt; &#39;d&#39;');
	});

	it('round-trips through the parser to the original text', () => {
		const text = `<script>alert("x")</script> & 'quotes'`;

		expect(parse(`<p title="${escapeHtml(text)}">${escapeHtml(text)}</p>`).querySelector('p')?.textContent).toBe(text);
		expect(parse(`<p title="${escapeHtml(text)}"></p>`).querySelector('p')?.getAttribute('title')).toBe(text);
	});
});

describe('renderBands', () => {
	const bands = parse(renderBands());

	it('renders every band with its eyebrow, title, body and code, verbatim', () => {
		for (const section of HOW_IT_WORKS_SECTIONS) {
			const band = bands.querySelector(`section[id="${section.id}"]`);

			expect(band, section.id).not.toBeNull();
			expect(band?.querySelector('.fe-about__eyebrow')?.textContent).toBe(section.eyebrow);
			expect(band?.querySelector('.fe-about__band-title')?.textContent).toBe(section.title);
			expect(band?.querySelector('.fe-about__body')?.textContent).toBe(section.body);
			// The code is full of `<`, quotes and newlines; it must survive exactly, not as markup.
			expect(band?.querySelector('.fe-about__code code')?.textContent).toBe(section.code);
		}
	});

	it('labels each band by its heading and leaves an empty placeholder for its figure', () => {
		for (const band of bands.querySelectorAll('section')) {
			expect(band.querySelector(`#${band.id}-title`)?.textContent).not.toBe('');
			expect(band.getAttribute('aria-labelledby')).toBe(`${band.id}-title`);

			const placeholder = band.querySelector<HTMLElement>('.fe-about__figure');

			expect(placeholder?.dataset['figure']).toBe(band.id);
			expect(placeholder?.childNodes).toHaveLength(0);
		}
	});

	it('alternates the figure side, starting on the left', () => {
		const reversed = [...bands.querySelectorAll('section')].map((band) => band.classList.contains('is-reversed'));

		expect(reversed).toEqual(HOW_IT_WORKS_SECTIONS.map((_, index) => index % 2 === 1));
	});

	it('puts the act-two divider immediately before the first "beyond" band, once', () => {
		const dividers = bands.querySelectorAll('.fe-about__act');
		const firstBeyond = HOW_IT_WORKS_SECTIONS.find((section) => section.group === 'beyond');

		expect(dividers).toHaveLength(1);
		expect(dividers[0]?.querySelector('.fe-about__act-title')?.textContent).toBe(HOW_IT_WORKS_ACT_TWO.title);
		expect(dividers[0]?.querySelector('.fe-about__act-lead')?.textContent).toBe(HOW_IT_WORKS_ACT_TWO.lead);
		expect(dividers[0]?.nextElementSibling?.id).toBe(firstBeyond?.id);
	});

	it('links exactly the demonstrated bands to the deployed lab, naming the vertical for the browser half', () => {
		const links = [...bands.querySelectorAll<HTMLAnchorElement>('.fe-about__demo-link')];

		expect(links.map((link) => String(link.closest('section')?.id)).sort()).toEqual(Object.keys(HOW_IT_WORKS_DEMO_LINKS).sort());
		for (const link of links) {
			expect(link.getAttribute('href')).toBe('https://react.filterenginez.com/lab');
			expect(link.dataset['vertical']).toBe('react-plain');
			expect(link.dataset['path']).toBe('/lab');
		}
	});
});

describe('renderTableOfContents', () => {
	it('links every band, then the benchmark, in page order', () => {
		const links = [...parse(renderTableOfContents()).querySelectorAll('a')];

		expect(links.map((link) => link.getAttribute('href'))).toEqual([
			...HOW_IT_WORKS_SECTIONS.map((section) => `#${section.id}`),
			`#${BENCHMARK_SECTION_ID}`,
		]);
		expect(links.map((link) => link.textContent)).toEqual([
			...HOW_IT_WORKS_SECTIONS.map((section) => section.tocLabel),
			'Try it live',
		]);
	});
});

describe('renderBenchmarkReference', () => {
	it('states the committed reference numbers and where they come from', () => {
		const text = parse(renderBenchmarkReference()).textContent;

		expect(text).toContain(formatDuration(NAIVE_BASELINE_MS));
		expect(text).toContain('faster');
		expect(text).toContain(REFERENCE_LABEL);
	});
});

describe('prerenderHowItWorks', () => {
	it('fills every slot and leaves no marker behind', () => {
		const html = prerenderHowItWorks(TEMPLATE);

		for (const marker of HOW_IT_WORKS_SLOTS.keys()) {
			expect(html).not.toContain(marker);
		}
		expect(parse(html).querySelectorAll('section')).toHaveLength(HOW_IT_WORKS_SECTIONS.length);
	});

	it('refuses a template that lost a slot, rather than shipping a page without its text', () => {
		expect(() => prerenderHowItWorks(TEMPLATE.replace('<!--how-it-works:bands-->', ''))).toThrow(/bands.*found 0/u);
	});

	it('refuses a template with a slot twice', () => {
		expect(() => prerenderHowItWorks(`${TEMPLATE}<!--how-it-works:toc-->`)).toThrow(/toc.*found 2/u);
	});
});
