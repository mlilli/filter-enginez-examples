/**
 * The boot-failure screen — what a dataset route shows when its engine could not start.
 *
 * @remarks
 * The same screen in every app: a `<main>` holding an element with `role="alert"`, which carries the
 * dataset's `BOOT_FAILURE_COPY` title, the error's own message, and the copy's hint. The alert sits
 * INSIDE the `<main>` rather than on it, because a `role` on the landmark element would replace the
 * landmark. `role="alert"` makes a screen reader announce the failure where it was announcing boot
 * progress. Without this screen the boot caption would sit there forever, which reads as a hang and
 * sends someone looking in the wrong place.
 *
 * An optional extra line follows the hint, for what is a fact about this app's build rather than
 * about the engine: `/wine` uses it to name `VITE_WINE_TIER=default`, the Vite apps' way to boot the
 * 10,000-wine main-thread tier instead.
 *
 * The card is the other apps' boot-error card (`fe-boot-error`: a bordered `--gray-1` panel, a
 * `--danger` title, mono details). `ui-styles` has no rule for it and this app authors no component
 * CSS (`app.css` is imports plus `body`), so it is drawn through the `el()` style bag, this app's
 * idiom for a route-local layout.
 *
 * @packageDocumentation
 */

import { BOOT_FAILURE_COPY, type BootFailureDataset } from '@filter-enginez/examples-shared/boot-caption';
import { el } from '@filter-enginez/examples-shared/dom';

/** The detail lines' type: mono, small, quiet. */
const BOOT_FAILURE_DETAIL_STYLE: Readonly<Record<string, string>> = {
	color: 'var(--gray-9)',
	fontFamily: 'var(--font-mono)',
	fontSize: '0.8125rem',
	margin: '0',
};

/**
 * The message a boot failure shows for whatever the boot rejected with.
 *
 * @param error - The rejection reason; anything, since a promise can reject with anything.
 * @returns An `Error`'s message, or the reason as text.
 */
export function bootFailureMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

/**
 * Build the screen a dataset route shows in place of its boot screen when the engine fails to start.
 *
 * @param dataset - Which dataset failed; picks the title and the hint from `BOOT_FAILURE_COPY`.
 * @param message - The boot error's message, rendered as text.
 * @param extraLine - What follows the hint in the same paragraph, after a space: this app's own remedy.
 * @returns The screen's root, one main landmark.
 */
export function createBootFailure(
	dataset: BootFailureDataset,
	message: string,
	extraLine: readonly (Node | string)[] = [],
): HTMLElement {
	const copy = BOOT_FAILURE_COPY[dataset];
	const alert = el('div', {
		attrs: { role: 'alert' },
		children: [
			el('p', {
				style: { color: 'var(--danger)', fontWeight: '600', margin: '0 0 0.5rem' },
				text: copy.title,
			}),
			el('p', { style: BOOT_FAILURE_DETAIL_STYLE, text: message }),
			el('p', {
				children: extraLine.length === 0 ? [copy.hint] : [copy.hint, ' ', ...extraLine],
				style: { ...BOOT_FAILURE_DETAIL_STYLE, marginTop: '0.5rem' },
			}),
		],
		style: {
			background: 'var(--gray-1)',
			border: '1px solid var(--gray-4)',
			borderRadius: 'var(--radius-lg)',
			margin: '3rem auto',
			maxWidth: '34rem',
			padding: '1.5rem',
		},
	});

	return el('main', { children: [alert]});
}
