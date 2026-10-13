/**
 * `about/figures/textIndex` — framework-less port of the inverted-text-index illustration.
 *
 * @remarks
 * A whole-word phrase search ("buttery oak") splits into words; each word maps to a posting list, and
 * the answer is the intersection of those lists — resolved straight from the index, not a scan. The
 * intersect step pulses phosphor (engine working); words, postings, and matched docs are cyan (data).
 * Geometry is verbatim from the React figure; the `fe-fig-text__*` animation CSS lives in
 * `@filter-enginez/ui-styles`.
 *
 * @packageDocumentation
 */

import { el, svg } from '../../dom.js';
import { svgText } from './svgText.js';

/** A posting-list entry: a document id and whether it survives the intersection. */
interface Posting {
	readonly id: number;
	readonly isMatch: boolean;
}

const POSTINGS_A: readonly Posting[] = [
	{ id: 12, isMatch: false },
	{ id: 47, isMatch: true },
	{ id: 88, isMatch: true },
	{ id: 150, isMatch: false },
];
const POSTINGS_B: readonly Posting[] = [
	{ id: 47, isMatch: true },
	{ id: 88, isMatch: true },
	{ id: 201, isMatch: false },
];

/** The two query words tokenized from the phrase. */
const WORDS = [
	{ label: 'buttery', width: 78, x: 34 },
	{ label: 'oak', width: 52, x: 168 },
] as const;

/** The surviving matched document ids. */
const MATCHES = [47, 88] as const;

const ROW_STEP = 27;

/**
 * The two posting columns rendered by the figure. Replaces the Svelte `{#snippet postingColumn}`
 * (invoked twice via `{@render}`) with one data-driven mapping.
 */
const POSTING_COLUMNS = [
	{ postings: POSTINGS_A, top: 124, x: 34 },
	{ postings: POSTINGS_B, top: 124, x: 168 },
] as const;

/**
 * Build the inverted-text-index figure.
 *
 * @returns The figure root — pass it to `observeInView` to gate its animation.
 */
export function createTextIndexFigure(): HTMLElement {
	const words = WORDS.map((word) =>
		svg('g', {}, [
			svg('rect', { class: 'fe-fig-text__word', height: 26, rx: 13, width: word.width, x: word.x, y: 72 }),
			svgText({ class: 'fe-fig-text__word-label', x: word.x + word.width / 2, y: 85 }, word.label),
		]),
	);

	const postings = POSTING_COLUMNS.flatMap((column) =>
		column.postings.map((posting, index) =>
			svg(
				'g',
				{
					class: posting.isMatch ? 'fe-fig-text__post is-match' : 'fe-fig-text__post',
					...(posting.isMatch ? { style: `animation-delay: ${700 + index * 120}ms` } : {}),
				},
				[
					svg('rect', {
						class: 'fe-fig-text__post-box',
						height: 22,
						rx: 3,
						width: 80,
						x: column.x,
						y: column.top + index * ROW_STEP,
					}),
					svgText(
						{ class: 'fe-fig-text__post-id', x: column.x + 40, y: column.top + index * ROW_STEP + 11 },
						`#${posting.id}`,
					),
				],
			),
		),
	);

	const matches = MATCHES.map((id, index) =>
		svg('g', { class: 'fe-fig-text__match', style: `animation-delay: ${1100 + index * 160}ms` }, [
			svg('rect', { class: 'fe-fig-text__match-box', height: 24, rx: 4, width: 96, x: 332, y: 150 + index * 30 }),
			svgText({ class: 'fe-fig-text__match-id', x: 380, y: 162 + index * 30 }, `#${id}`),
		]),
	);

	return el('div', {
		attrs: {
			'aria-label':
				'A two-word search is split into words; each maps to a posting list of documents, and the matching documents are the intersection of the two lists.',
			role: 'img',
		},
		children: [
			svg(
				'svg',
				{ class: 'fe-fig__svg fe-fig-text__svg', viewBox: '0 0 460 250', xmlns: 'http://www.w3.org/2000/svg' },
				[
					// Search box
					svg('rect', { class: 'fe-fig-text__search', height: 34, rx: 6, width: 214, x: 20, y: 16 }),
					svg('circle', { class: 'fe-fig-text__glass', cx: 40, cy: 33, r: 6 }),
					svg('line', { class: 'fe-fig-text__glass-handle', x1: 44, x2: 49, y1: 37, y2: 42 }),
					svgText({ class: 'fe-fig-text__search-text', x: 60, y: 33 }, 'buttery oak'),
					// Word tokens
					...words,
					svgText({ class: 'fe-fig-text__eyebrow', x: 34, y: 116 }, 'postings'),
					svgText({ class: 'fe-fig-text__eyebrow', x: 168, y: 116 }, 'postings'),
					// Posting columns
					...postings,
					// Intersect
					svgText({ class: 'fe-fig-text__cap', x: 280, y: 158 }, '∩'),
					svg('circle', { class: 'fe-fig-text__pulse', cx: 280, cy: 172, r: 4 }),
					// Matches
					svg('rect', { class: 'fe-fig-text__result', height: 92, rx: 6, width: 124, x: 318, y: 120 }),
					svgText({ class: 'fe-fig-text__eyebrow is-centered', x: 380, y: 138 }, 'matches'),
					...matches,
				],
			),
		],
		className: 'fe-fig fe-fig-text',
	});
}
