/**
 * `<fe-landing-page>` — the Angular vertical's landing hub.
 *
 * @remarks
 * Visual parity with the React / Svelte / Vue / vanilla landings: a brand-forward hero over the ambient
 * glow + drifting grid, then a grid of dataset cards. Every `fe-landing__*` rule lives in
 * `@filter-enginez/ui-styles` (loaded app-wide via `app.css`), so this component contributes no CSS of
 * its own — which is the whole point of the shared presentation tier.
 *
 * The `fe-landing__server` CTA is phosphor rather than cyan on purpose: it is about where the ENGINE
 * fires, not about the data. Its rules live in `ui-styles` beside the rest of the landing styles.
 *
 * "How the engine works" is a plain `href`, not a `routerLink`: the page lives on the landing site,
 * another origin, resolved from this page's location so a local run reaches the local site server.
 *
 * @packageDocumentation
 */

import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { howItWorksUrl } from '@filter-enginez/examples-shared/compare-core';

import { type DatasetCard, landingDatasets } from '../landing.js';

@Component({
	changeDetection: ChangeDetectionStrategy.OnPush,
	imports: [RouterLink],
	selector: 'fe-landing-page',
	template: `
		<div class="fe-landing">
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
					<a class="fe-landing__about" [href]="howItWorksHref">How the engine works →</a>
					<!-- Second in the stack, matching every other vertical: what the engine does, then that
					     it does it everywhere. Cyan because the page is about WHICH state and WHICH stack —
					     data and identity — never about the engine computing, which is what the phosphor
					     server-demo pill below means. -->
					<a class="fe-landing__compare" routerLink="/compare">
						See one filter state in all six stacks →
					</a>
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
		</div>
	`,
})
export class LandingPageComponent {
	/** The dataset tiles, in display order. */
	protected readonly datasets: readonly DatasetCard[] = landingDatasets;

	/** The how-it-works page on the landing site, for this deployment layout. */
	protected readonly howItWorksHref: string = howItWorksUrl(window.location);
}
