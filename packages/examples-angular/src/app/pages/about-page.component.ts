/**
 * `<fe-about-page>` — the Angular "How the engine works" page, at parity with the React `<AboutPage>`,
 * the SvelteKit `/about` route and the Vue `AboutPage.vue`.
 *
 * @remarks
 * Shares ONE narrative source with every other vertical: the section copy, order, and figure ids come
 * from `@filter-enginez/examples-shared/about-core` (framework-free), and it renders over the same
 * `fe-about__*` + `fe-fig-*` classes from `@filter-enginez/ui-styles` (loaded app-wide via `app.css`),
 * so this component contributes no CSS of its own. The eight algorithm figures are the ported
 * standalone Angular illustrations, looked up by `section.id` through the local `ABOUT_FIGURES`
 * registry and rendered with `NgComponentOutlet` — Angular's answer to Vue's `<component :is>`.
 *
 * Everything the template iterates is resolved ONCE into {@link bands}: the figure component, the
 * alternating-layout flag, and the "act two" divider flag. Angular templates re-evaluate plain method
 * calls on every change-detection pass, so pre-resolving is both cheaper and easier to read than the
 * helper functions the Vue port uses.
 *
 * A sticky mini table-of-contents tracks the section in view via an `IntersectionObserver` — the
 * Angular counterpart to React's `useActiveSection` hook, Svelte's scroll-spy `onMount` and Vue's
 * `onMounted`. It is wired in `ngAfterViewInit` rather than `ngOnInit` because the bands are rendered
 * by `@for`, so they do not exist in the DOM until the view has been created. Where there is no
 * `IntersectionObserver` (server render, jsdom) the TOC simply rests on the first section.
 *
 * The final CTA band deep-links the client-side books demo, the same single card the Vue app shows;
 * each vertical chooses which of its routes the band features.
 *
 * @packageDocumentation
 */

import { NgComponentOutlet } from '@angular/common';
import {
	type AfterViewInit,
	ChangeDetectionStrategy,
	Component,
	type OnDestroy,
	signal,
	type Type,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { ABOUT_SECTIONS, type AboutSection } from '@filter-enginez/examples-shared/about-core';

import { BenchmarkWidgetComponent } from '../about/benchmark-widget.component.js';
import { ABOUT_FIGURES } from '../about/figure-registry.js';

/** One rendered band: its section copy plus everything the template would otherwise have to derive. */
interface RenderedBand {
	/** The figure component for this section, or `null` when none is registered. */
	readonly figure: Type<unknown> | null;
	/** True when this band opens the "Beyond filtering" act (first `beyond`-group band). */
	readonly isBeyondStart: boolean;
	/** True on odd bands, which flip the figure to the right of the copy. */
	readonly isReversed: boolean;
	/** The shared narrative content. */
	readonly section: AboutSection;
}

/** The bands, fully resolved. Static content, so this is computed once at module scope. */
const BANDS: readonly RenderedBand[] = ABOUT_SECTIONS.map((section, index) => ({
	figure: ABOUT_FIGURES[section.id] ?? null,
	isBeyondStart: section.group === 'beyond' && ABOUT_SECTIONS[index - 1]?.group !== 'beyond',
	isReversed: index % 2 === 1,
	section,
}));

/** All scroll-spy targets, in document order (the eight bands + the benchmark payoff). */
const SECTION_IDS: readonly string[] = [...ABOUT_SECTIONS.map((section) => section.id), 'benchmark'];

/** Observer geometry — biased toward the upper half of the viewport, matching the other verticals. */
const OBSERVER_OPTIONS: IntersectionObserverInit = {
	rootMargin: '-8% 0px -45% 0px',
	threshold: [0.2, 0.5, 0.8],
};

@Component({
	changeDetection: ChangeDetectionStrategy.OnPush,
	imports: [BenchmarkWidgetComponent, NgComponentOutlet, RouterLink],
	selector: 'fe-about-page',
	templateUrl: './about-page.component.html',
})
export class AboutPageComponent implements AfterViewInit, OnDestroy {
	/** The live observer, kept so it can be disconnected on teardown. */
	private _observer: IntersectionObserver | null = null;

	/** Per-target intersection ratios, latest wins — the input to "which section is most in view". */
	private readonly _ratios: Record<string, number> = {};

	/** The section currently most in view — drives the sticky TOC highlight. */
	protected readonly activeId = signal<string>(ABOUT_SECTIONS[0]?.id ?? '');

	/** The fully-resolved bands, exposed for the template. */
	protected readonly bands = BANDS;

	/** The shared section content, for the table of contents. */
	protected readonly sections = ABOUT_SECTIONS;

	/** Start the scroll-spy once the `@for`-rendered bands actually exist in the DOM. */
	public ngAfterViewInit(): void {
		if (typeof IntersectionObserver === 'undefined') {
			return;
		}

		this._observer = new IntersectionObserver((entries) => {
			this._recordEntries(entries);
		}, OBSERVER_OPTIONS);

		for (const id of SECTION_IDS) {
			const element = document.getElementById(id);

			if (element !== null) {
				this._observer.observe(element);
			}
		}
	}

	/** Disconnect the observer with the page. */
	public ngOnDestroy(): void {
		this._observer?.disconnect();
		this._observer = null;
	}

	/**
	 * Fold a batch of observer entries into {@link activeId} — the section with the highest ratio wins.
	 *
	 * @param entries - The intersection changes reported by the observer.
	 */
	private _recordEntries(entries: readonly IntersectionObserverEntry[]): void {
		for (const entry of entries) {
			this._ratios[entry.target.id] = entry.isIntersecting ? entry.intersectionRatio : 0;
		}

		let best = '';
		let bestRatio = 0;

		for (const [id, ratio] of Object.entries(this._ratios)) {
			if (ratio > bestRatio) {
				bestRatio = ratio;
				best = id;
			}
		}

		if (best !== '') {
			this.activeId.set(best);
		}
	}
}
