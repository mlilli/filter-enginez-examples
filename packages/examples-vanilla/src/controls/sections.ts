/**
 * `controls/sections` — the two structural headings every filter panel is built from: the aside's
 * title zone and the per-section label.
 *
 * @remarks
 * The framework-less counterparts to Vue's `<SectionHeader>` / `<PanelHeader>` and Angular's
 * `<fe-section-header>` / `<fe-panel-header>`. Neither is a `Control` — they hold no state and
 * never update, so a `{ element, update }` pair would be a contract with an empty half. A function
 * returning an element is the honest shape, and it composes: `section('Price', slider.element)`.
 *
 * ### Why this is a module and not a private helper
 *
 * `section` lived inside `books/panel.ts` as an unexported function, which was right while books was
 * the only panel. Real estate has fourteen sections, so leaving it there would have meant either a
 * cross-dataset import from one panel into another or a second copy — and a second copy of a heading
 * is exactly where a stray class name creeps in and one panel quietly stops matching the rest.
 *
 * ### The class names are the dataset-neutral ones
 *
 * `fe-filter-section-label` / `fe-filter-panel__header`, not the `fe-books-*` forms. `ui-styles`
 * declares the two as comma-joined aliases so both render identically, but the neutral name is the
 * one that stays true when a real-estate or wine panel renders it. Cyan left rule, per the dual-accent
 * contract — a section label names WHAT is being filtered (the data axis); phosphor here would claim
 * the section is computing.
 *
 * @packageDocumentation
 */

import { el } from '../dom.js';

/** The panel title used by every vertical, so most call sites pass nothing. */
const DEFAULT_PANEL_LABEL = 'Filters';

/**
 * A labelled panel section wrapping one control.
 *
 * @remarks
 * The optional `note` is a second line under the heading — a unit, a caveat, or a hint about the
 * facet's semantics (`'(expression mode)'`, `'miles from the pin'`). It is tested for emptiness as
 * well as absence, mirroring Vue's `v-if="note"`: an empty string is a note nobody wrote, and
 * rendering it would add a blank line and a stray `<br>` under the heading.
 *
 * @param label - The section's name, e.g. `Price`.
 * @param content - The control this section labels.
 * @param note - Optional qualifier rendered beneath the label.
 * @returns The `<section>` element, ready to append.
 */
export function section(label: string, content: HTMLElement, note?: string): HTMLElement {
	const hasNote = note !== undefined && note !== '';

	return el('section', {
		children: [
			el('h3', {
				children: [
					label,
					hasNote && el('br'),
					hasNote && el('span', { className: 'fe-filter-section-label__note', text: note }),
				],
				className: 'fe-filter-section-label',
			}),
			content,
		],
	});
}

/**
 * The filter aside's title zone.
 *
 * @remarks
 * The measurements are load-bearing and all live in `fe-filter-panel__header`: the aside deliberately
 * carries NO internal padding so the scroll container's scrollbar can hug its right edge, which means
 * the header has to supply its own `0 18px 14px` inset and a `20px` top margin. Get those wrong and
 * the header either collides with the aside edge or floats away from the sections.
 *
 * It sits OUTSIDE the scroll container in normal flow, so it stays put while the sections scroll — no
 * `position: sticky` needed.
 *
 * **Deliberately no "clear all" here.** The canonical clear-all lives in the results header's
 * active-filters bar, where one action produces one engine call and one log entry.
 *
 * @param label - The panel's title. Defaults to `'Filters'`.
 * @returns The header element, ready to append above the scroller.
 */
export function panelHeader(label: string = DEFAULT_PANEL_LABEL): HTMLElement {
	return el('div', {
		children: [el('h2', { className: 'fe-filter-panel__title', text: label })],
		className: 'fe-filter-panel__header',
	});
}
