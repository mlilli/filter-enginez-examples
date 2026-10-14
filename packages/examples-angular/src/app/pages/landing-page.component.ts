/**
 * `<fe-landing-page>` — the Angular vertical's landing hub.
 *
 * @remarks
 * Visual parity with the React / Svelte / Vue / vanilla landings: a brand-forward hero over the ambient
 * glow + drifting grid, then a grid of dataset cards. Every `fe-landing__*` rule lives in
 * `@filter-enginez/ui-styles` (loaded app-wide via `app.css`), so this component contributes no CSS of
 * its own — which is the whole point of the shared presentation tier.
 *
 * Above the hero, the compact app header every page of this app carries (`<nav fe-app-header-brand>`):
 * the way home to the landing site, this app's name marked as the current page, and "All demos".
 *
 * The `fe-landing__server` CTA is phosphor rather than cyan on purpose: it is about where the ENGINE
 * fires, not about the data. Its rules live in `ui-styles` beside the rest of the landing styles.
 *
 * @packageDocumentation
 */

import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { HEADER_PAGE_LABELS } from '@filter-enginez/examples-shared/app-header-core';

import { type DatasetCard, landingDatasets } from '../landing.js';
import { AppHeaderBrandComponent } from '../shell/app-header-brand.component.js';

@Component({
	changeDetection: ChangeDetectionStrategy.OnPush,
	imports: [AppHeaderBrandComponent, RouterLink],
	selector: 'fe-landing-page',
	template: `
		<header class="fe-books-app__header">
			<nav fe-app-header-brand [page]="pageLabel"></nav>
		</header>
		<main class="fe-landing">
			<div class="fe-landing__inner">
				<header class="fe-landing__hero">
					<img
						class="fe-landing__mark"
						src="/mark.svg"
						width="72"
						height="72"
						alt="Filter EngineZ"
					/>
					<span class="fe-landing__wordmark">Filter EngineZ</span>
					<p class="fe-landing__tagline">
						A generic, isomorphic, framework-agnostic TypeScript filter engine: arbitrarily complex
						filters over arbitrarily shaped data, computed client-side. This is the Angular vertical.
					</p>
					<a class="fe-landing__server" routerLink="/books-server">
						Try the server-backed books demo →
					</a>
					<p class="fe-landing__prompt">Select a dataset to explore</p>
				</header>

				<div class="fe-landing__grid">
					@for (dataset of datasets; track dataset.id) {
						<a
							class="fe-landing__card fe-landing__card--live"
							[routerLink]="dataset.href"
							[attr.aria-label]="dataset.label"
						>
							<div class="fe-landing__card-top">
								<span class="fe-landing__card-title">{{ dataset.label }}</span>
								<span class="fe-landing__badge fe-landing__badge--live">Live</span>
							</div>
							<p class="fe-landing__card-blurb">{{ dataset.blurb }}</p>
							<span class="fe-landing__card-cta">Explore {{ dataset.recordNoun }}</span>
						</a>
					}
				</div>

				<p class="fe-landing__foot">
					Same engine, bound to Angular. Filtering happens in your browser.
				</p>
			</div>
		</main>
	`,
})
export class LandingPageComponent {
	/** The dataset tiles, in display order. */
	protected readonly datasets: readonly DatasetCard[] = landingDatasets;

	/** The header subtitle's page label: this page is the app's dataset hub. */
	protected readonly pageLabel = HEADER_PAGE_LABELS.hub;
}
