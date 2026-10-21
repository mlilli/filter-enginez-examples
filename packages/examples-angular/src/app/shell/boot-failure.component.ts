/**
 * `<fe-boot-failure>` — what a dataset route shows when its engine could not start.
 *
 * @remarks
 * The same screen in every app: a `<main>` holding an element with `role="alert"`, which carries the
 * dataset's `BOOT_FAILURE_COPY` title, the error's own message, and the copy's hint. The alert sits
 * INSIDE the `<main>` rather than on it, because a `role` on the landmark element would replace the
 * landmark.
 *
 * Projected content follows the hint, for what is a fact about this app's build rather than about the
 * engine: the wine route uses it to name `WINE_DATASET_SIZE` in `wineBoot.ts`, this app's way to boot
 * the 10,000-wine main-thread tier instead.
 *
 * Rendered by `/wine` itself (its page owns the boot) and by the root component for `/books` and
 * `/real-estate`, whose engines boot in route resolvers (see `dataset-boot-error.ts`).
 *
 * @packageDocumentation
 */

import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { BOOT_FAILURE_COPY, type BootFailureDataset } from '@filter-enginez/examples-shared/boot-caption';

@Component({
	changeDetection: ChangeDetectionStrategy.OnPush,
	selector: 'fe-boot-failure',
	// Local to the one component every route's boot failure renders through; `ui-styles` has no
	// boot-error component.
	styles: [
		`
			.fe-boot-error {
				margin: 3rem auto;
				max-width: 34rem;
				padding: 1.5rem;
				border: 1px solid var(--gray-4);
				border-radius: var(--radius-lg);
				background: var(--gray-1);
			}

			.fe-boot-error__title {
				margin: 0 0 0.5rem;
				color: var(--danger);
				font-weight: 600;
			}

			.fe-boot-error__detail {
				margin: 0 0 0.5rem;
				color: var(--gray-9);
				font-family: var(--font-mono);
				font-size: 0.8125rem;
			}

			.fe-boot-error__hint {
				margin: 0;
				color: var(--gray-9);
				font-size: 0.875rem;
			}
		`,
	],
	template: `
		<main>
			<div class="fe-boot-error" role="alert">
				<p class="fe-boot-error__title">{{ copy().title }}</p>
				<p class="fe-boot-error__detail">{{ message() }}</p>
				<p class="fe-boot-error__hint">
					{{ copy().hint }}
					<ng-content />
				</p>
			</div>
		</main>
	`,
})
export class BootFailureComponent {
	/** Which dataset failed; picks the title and the hint. */
	public readonly dataset = input.required<BootFailureDataset>();

	/** The error's message. */
	public readonly message = input.required<string>();

	/** The dataset's title and hint. */
	protected readonly copy = computed(() => BOOT_FAILURE_COPY[this.dataset()]);
}
