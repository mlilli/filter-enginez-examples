/**
 * `<fe-text-index-figure>` — the inverted-text-index illustration.
 *
 * @remarks
 * A whole-word phrase search ("buttery oak") splits into words; each word maps to a posting list, and
 * the answer is the intersection of those lists — resolved straight from the index, not a scan. The
 * intersect step pulses phosphor (engine working); words, postings, and matched docs are cyan (data).
 * Geometry is verbatim from the React / Vue figures; the `fe-fig-text__*` animation CSS lives in
 * `@filter-enginez/ui-styles`.
 *
 * **Do not add component styles to this file** — see the note on the Bayesian figure.
 *
 * @packageDocumentation
 */

import { ChangeDetectionStrategy, Component } from '@angular/core';

import { InViewDirective } from '../in-view.directive.js';

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

/** The two posting columns rendered by the figure. */
const POSTING_COLUMNS = [
	{ postings: POSTINGS_A, top: 124, x: 34 },
	{ postings: POSTINGS_B, top: 124, x: 168 },
] as const;

@Component({
	changeDetection: ChangeDetectionStrategy.OnPush,
	imports: [InViewDirective],
	selector: 'fe-text-index-figure',
	template: `
		<div
			feInView
			class="fe-fig fe-fig-text"
			role="img"
			aria-label="A two-word search is split into words; each maps to a posting list of documents, and the matching documents are the intersection of the two lists."
		>
			<svg viewBox="0 0 460 250" xmlns="http://www.w3.org/2000/svg" class="fe-fig__svg fe-fig-text__svg">
				<!-- Search box -->
				<rect x="20" y="16" width="214" height="34" rx="6" class="fe-fig-text__search" />
				<circle cx="40" cy="33" r="6" class="fe-fig-text__glass" />
				<line x1="44" y1="37" x2="49" y2="42" class="fe-fig-text__glass-handle" />
				<text x="60" y="33" class="fe-fig-text__search-text">buttery oak</text>

				<!-- Word tokens -->
				@for (word of words; track word.label) {
					<g>
						<rect [attr.x]="word.x" y="72" [attr.width]="word.width" height="26" rx="13" class="fe-fig-text__word" />
						<text [attr.x]="word.x + word.width / 2" y="85" class="fe-fig-text__word-label">{{ word.label }}</text>
					</g>
				}

				<text x="34" y="116" class="fe-fig-text__eyebrow">postings</text>
				<text x="168" y="116" class="fe-fig-text__eyebrow">postings</text>

				<!-- Posting columns -->
				@for (col of postingColumns; track col.x) {
					@for (posting of col.postings; track posting.id) {
						<g
							[class]="posting.isMatch ? 'fe-fig-text__post is-match' : 'fe-fig-text__post'"
							[style.animation-delay.ms]="posting.isMatch ? 700 + $index * 120 : null"
						>
							<rect
								[attr.x]="col.x"
								[attr.y]="col.top + $index * rowStep"
								width="80"
								height="22"
								rx="3"
								class="fe-fig-text__post-box"
							/>
							<text [attr.x]="col.x + 40" [attr.y]="col.top + $index * rowStep + 11" class="fe-fig-text__post-id"
								>#{{ posting.id }}</text
							>
						</g>
					}
				}

				<!-- Intersect -->
				<text x="280" y="158" class="fe-fig-text__cap">∩</text>
				<circle class="fe-fig-text__pulse" cx="280" cy="172" r="4" />

				<!-- Matches -->
				<rect x="318" y="120" width="124" height="92" rx="6" class="fe-fig-text__result" />
				<text x="380" y="138" class="fe-fig-text__eyebrow is-centered">matches</text>
				@for (id of matches; track id) {
					<g class="fe-fig-text__match" [style.animation-delay.ms]="1100 + $index * 160">
						<rect x="332" [attr.y]="150 + $index * 30" width="96" height="24" rx="4" class="fe-fig-text__match-box" />
						<text x="380" [attr.y]="162 + $index * 30" class="fe-fig-text__match-id">#{{ id }}</text>
					</g>
				}
			</svg>
		</div>
	`,
})
export class TextIndexFigureComponent {
	/** The surviving matched document ids. */
	protected readonly matches = MATCHES;

	/** The two posting columns, exposed for the template. */
	protected readonly postingColumns = POSTING_COLUMNS;

	/** Vertical pitch between posting rows. */
	protected readonly rowStep = ROW_STEP;

	/** The tokenized query words. */
	protected readonly words = WORDS;
}
