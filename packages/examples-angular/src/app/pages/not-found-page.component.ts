/**
 * `<fe-not-found-page>` — the "filtered to zero" 404.
 *
 * @remarks
 * The whole page is an in-joke on the engine: toggle every chip you like, the result set stays empty,
 * because a 404 *is* the empty set. Copy, chip vocabulary and toggle logic all come from
 * `@filter-enginez/examples-shared/notfound-core`, so this vertical says exactly what React, SvelteKit,
 * Vue and vanilla say — only the rendering is Angular's.
 *
 * The phosphor `NeuralCluster` churns away at 168px: the engine perpetually searching, never matching.
 *
 * Above the page, the compact app header every page of this app carries (`<nav fe-app-header-brand>`), so a
 * mistyped URL still offers the way home, back to this app's hub, and on to every other demo.
 *
 * @packageDocumentation
 */

import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterLink } from '@angular/router';
import { HEADER_PAGE_LABELS } from '@filter-enginez/examples-shared/app-header-core';
import {
	NOT_FOUND_CHIPS,
	NOT_FOUND_COPY,
	notFoundBody,
	toggleNotFoundChip,
} from '@filter-enginez/examples-shared/notfound-core';
import { filter, map } from 'rxjs';

import { NeuralClusterComponent } from '../brand/neural-cluster.component.js';
import { AppHeaderBrandComponent } from '../shell/app-header-brand.component.js';

/**
 * The pathname of a router URL: everything before its query or fragment.
 *
 * @param url - The router's serialized URL, e.g. `/no-such-route?f=x#top`.
 * @returns The pathname, e.g. `/no-such-route`.
 */
export function urlPathname(url: string): string {
	return url.replace(/[?#].*$/su, '');
}

/** Loader size on the 404 — large enough to read as the centerpiece it is. */
const LOADER_SIZE = 168;

@Component({
	changeDetection: ChangeDetectionStrategy.OnPush,
	imports: [AppHeaderBrandComponent, NeuralClusterComponent, RouterLink],
	selector: 'fe-not-found-page',
	template: `
		<header class="fe-books-app__header">
			<nav fe-app-header-brand [page]="pageLabel"></nav>
		</header>
		<main class="fe-notfound">
			<p class="fe-notfound__eyebrow">{{ copy.eyebrow }}</p>
			<p class="fe-notfound__count" aria-hidden="true">{{ copy.count }}</p>
			<div class="fe-notfound__loader">
				<fe-neural-cluster [size]="loaderSize" />
			</div>
			<h1 class="fe-notfound__heading">{{ copy.heading }}</h1>
			<p class="fe-notfound__body">{{ body() }}</p>
			<div
				class="fe-notfound__chips"
				role="group"
				aria-label="Dead-end filters — every option yields zero"
			>
				@for (chip of chips; track chip.id) {
					<button
						type="button"
						class="fe-notfound__chip"
						[class.fe-notfound__chip--selected]="selected().includes(chip.id)"
						[attr.aria-pressed]="selected().includes(chip.id)"
						(click)="toggle(chip.id)"
					>
						{{ chip.label }}
						<span class="fe-notfound__chip-badge">0</span>
					</button>
				}
			</div>
			<a class="fe-notfound__cta" [routerLink]="copy.ctaHref">{{ copy.ctaLabel }}</a>
		</main>
	`,
})
export class NotFoundPageComponent {
	private readonly _router = inject(Router);

	/**
	 * The router's URL, re-read after each navigation.
	 *
	 * @remarks
	 * A signal rather than a read of `router.url`: the catch-all route reuses this component from one
	 * unmatched URL to the next, and a `computed` over a plain property would keep quoting the first.
	 */
	private readonly _url = toSignal(
		this._router.events.pipe(
			filter((event) => event instanceof NavigationEnd),
			map(() => this._router.url),
		),
		{ initialValue: this._router.url },
	);

	/** The dead-end chip vocabulary. */
	protected readonly chips = NOT_FOUND_CHIPS;

	/** Shared copy — one source across every vertical. */
	protected readonly copy = NOT_FOUND_COPY;

	/** Loader size, exposed for the template. */
	protected readonly loaderSize = LOADER_SIZE;

	/** The header subtitle's page label: this page is the one no route matched. */
	protected readonly pageLabel = HEADER_PAGE_LABELS.notFound;

	/** Which dead-end chips are lit. Purely cosmetic; the count never moves off zero. */
	protected readonly selected = signal<readonly string[]>([]);

	/**
	 * Body copy, naming the path that matched nothing.
	 *
	 * @remarks
	 * The pathname only, as every app quotes it (the browser's `location.pathname`): `router.url` also
	 * carries the query and the fragment, which are not part of what failed to match.
	 */
	protected readonly body = computed<string>(() => notFoundBody(urlPathname(this._url())));

	/** Toggle a chip. There is nothing to recompute — that is the joke, and the truth. */
	protected toggle(id: string): void {
		this.selected.set(toggleNotFoundChip(this.selected(), id));
	}
}
