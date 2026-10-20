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

/** The detail lines' type: mono, small, quiet — the error message and the hint below it. */
const BOOT_FAILURE_DETAIL_STYLE: Readonly<Record<string, string>> = {
	color: 'var(--gray-9)',
	fontFamily: 'var(--font-mono)',
	fontSize: '0.8125rem',
	margin: '0',
};

/**
 * Build the screen `/wine` shows in place of the boot screen when the engine fails to boot.
 *
 * @remarks
 * The same three lines the Vue, SvelteKit and Angular wine pages show: that the engine could not
 * start, the error's own message, and why that almost always means the worker — the 150,000 wines are
 * generated inside it — with the switch that boots the 10,000-wine default tier on the main thread
 * instead. Without it the boot screen would animate forever, which reads as a hang and sends someone
 * looking in the wrong place.
 *
 * `role="alert"`, so a screen reader announces the failure where it was announcing progress, inside
 * a `<main>`, because the failure is the page's main content (a `role` on the `<main>` itself would
 * replace its landmark role). The block is the other apps' boot-error card (`fe-boot-error`: a bordered `--gray-1` panel, a
 * `--danger` title, mono details), authored as a style bag for the reason given above for the boot
 * screen's layout.
 *
 * @param message - The boot error's message.
 * @returns The screen's root.
 */
export function createWineBootFailure(message: string): HTMLElement {
	const alert = el('div', {
		attrs: { role: 'alert' },
		children: [
			el('p', {
				style: { color: 'var(--danger)', fontWeight: '600', margin: '0 0 0.5rem' },
				text: 'The wine engine could not start.',
			}),
			el('p', { style: BOOT_FAILURE_DETAIL_STYLE, text: message }),
			el('p', {
				children: [
					'The 150,000 wines are generated inside a Web Worker, so a failure here almost always means the worker could not start. Set ',
					el('code', { text: 'VITE_WINE_TIER=default' }),
					' to boot the 10,000-wine default tier on the main thread instead.',
				],
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
