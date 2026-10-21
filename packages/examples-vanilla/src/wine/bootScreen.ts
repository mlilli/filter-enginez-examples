/**
 * The wine routes' cold-boot screen — the signature loader over a live caption.
 *
 * @remarks
 * Shared by `/wine` and `/wine-server`, which need the same screen over a different caption.
 * Splitting the SHAPE from the WORDS is what makes it reusable: the layout, the loader and the caption
 * element are tier-agnostic, while what the caption says is entirely a property of how that tier gets
 * its corpus.
 *
 * ## Why a loader rather than a bare `<p>`
 *
 * Every vertical renders `<BrainSynapse width={520}>` here. A single line of text would make a
 * 150k-record boot look like nothing happening — indistinguishable, for the several seconds it
 * takes, from a page that failed to boot.
 *
 * **The synapse is the right loader, and which one it is carries meaning.** The three are a taxonomy:
 * orbit for idle, cluster for recompute, synapse for the rare fetch moment. The cluster here would be
 * phosphor, "the engine is firing right now", when the engine is not computing at all during a
 * corpus stream; it is waiting.
 *
 * ## The LAYOUT is inline rather than a class, deliberately — the CAPTION is not
 *
 * `ui-styles` has no boot-stage component: the copy and the layout differ per route, which is the
 * reason recorded on Vue's `.vue-wine__booting` and Angular's `.fe-wine-booting`. This app authors no
 * component CSS at all (`app.css` is imports plus `body`), so its idiom for a route-local layout is
 * the `el()` style bag.
 *
 * The caption inside it is a different case. It is a paragraph twelve sites render, and a copy in a
 * style bag would be the hardest of the twelve to compare against the others — a rule you can diff
 * against a stylesheet at least announces itself as a rule. `.fe-boot-caption--hero` is the shared
 * one.
 *
 * @packageDocumentation
 */

import { el } from '@filter-enginez/examples-shared/dom';

import { createBootLoader } from '../brand/indicators.js';
import { createBootFailure } from '../shell/bootFailure.js';

/** The cold-boot screen plus the handle its route uses to narrate progress. */
export interface WineBootScreen {
	/** The boot screen's root, appended to the route container until the engine is ready. */
	readonly element: HTMLElement;
	/** Replace the caption. Accepts text and elements, so a route can highlight its live numbers. */
	readonly setCaption: (...children: readonly (Node | string)[]) => void;
}

// `bootCaptionValue` lives in `../brand/indicators.js`, not here: `/real-estate` renders the same
// caption, and a helper under `wine/` would make one dataset's slice reach into another's for a brand
// affordance neither of them owns.

/**
 * Build the cold-boot screen.
 *
 * @param loaderLabel - The loader's accessible name, e.g. `'Loading wine reviews'`. It is a `role="img"`,
 *   so without a name a screen reader announces an unlabelled graphic where the page content should be.
 * @returns The screen and its caption setter.
 */
export function createWineBootScreen(loaderLabel: string): WineBootScreen {
	const caption = el('p', { className: 'fe-boot-caption fe-boot-caption--hero' });
	// A `<main>`: until the engine boots, the loader and its caption are the page's main content, and a
	// page with no main landmark fails the accessibility audit a visitor's tools run mid-boot.
	const element = el('main', {
		children: [createBootLoader(loaderLabel), caption],
		style: {
			alignItems: 'center',
			display: 'flex',
			flexDirection: 'column',
			gap: '1.5rem',
			justifyContent: 'center',
			minHeight: '60vh',
			padding: '24px',
		},
	});

	return {
		element,
		setCaption: (...children) => {
			caption.replaceChildren(...children);
		},
	};
}

/**
 * Build the screen `/wine` shows in place of the boot screen when the engine fails to boot.
 *
 * @remarks
 * The shared boot-failure screen (`../shell/bootFailure.ts`) over `BOOT_FAILURE_COPY.wine`, the words
 * every app's wine page shows: that the engine could not start, the error's own message, and why that
 * almost always means the worker (the 150,000 wines are generated inside it). The line after the hint
 * is this app's own: `VITE_WINE_TIER=default`, the switch that boots the 10,000-wine default tier on
 * the main thread instead.
 *
 * @param message - The boot error's message.
 * @returns The screen's root.
 */
export function createWineBootFailure(message: string): HTMLElement {
	return createBootFailure('wine', message, [
		'Set ',
		el('code', { text: 'VITE_WINE_TIER=default' }),
		' to boot the 10,000-wine default tier on the main thread instead.',
	]);
}
