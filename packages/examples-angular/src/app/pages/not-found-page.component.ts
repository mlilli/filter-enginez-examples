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
 * @packageDocumentation
 */

import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import {
	NOT_FOUND_CHIPS,
	NOT_FOUND_COPY,
	notFoundBody,
	toggleNotFoundChip,
} from '@filter-enginez/examples-shared/notfound-core';

import { NeuralClusterComponent } from '../brand/neural-cluster.component.js';

/** Loader size on the 404 — large enough to read as the centerpiece it is. */
const LOADER_SIZE = 168;

@Component({
	changeDetection: ChangeDetectionStrategy.OnPush,
	imports: [NeuralClusterComponent, RouterLink],
	selector: 'fe-not-found-page',
	template: `
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

	/** The dead-end chip vocabulary. */
	protected readonly chips = NOT_FOUND_CHIPS;

	/** Shared copy — one source across every vertical. */
	protected readonly copy = NOT_FOUND_COPY;

	/** Loader size, exposed for the template. */
	protected readonly loaderSize = LOADER_SIZE;

	/** Which dead-end chips are lit. Purely cosmetic; the count never moves off zero. */
	protected readonly selected = signal<readonly string[]>([]);

	/** Body copy, naming the path that matched nothing. */
	protected readonly body = computed<string>(() =>
		notFoundBody(this._router.url === '' ? null : this._router.url),
	);

	/** Toggle a chip. There is nothing to recompute — that is the joke, and the truth. */
	protected toggle(id: string): void {
		this.selected.set(toggleNotFoundChip(this.selected(), id));
	}
}
