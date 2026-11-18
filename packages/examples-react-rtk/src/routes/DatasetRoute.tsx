/**
 * `<DatasetRoute />` — the per-dataset route element. Loads the dataset's code and boots its engine on
 * first visit, shows the dataset's boot screen while that happens, then swaps in the live dataset app inside its
 * Redux + engine providers. Every dataset route shares this one load/boot/provide path.
 *
 * @remarks
 * Boot is **cached per dataset** (the `examples-shared/<dataset>` slice memoizes it), so navigating
 * away and back re-attaches a fresh Redux mirror but reuses the already-loaded engine (and its
 * filter state) — the corpus loads once, on first visit, not up front.
 *
 * ### What is in the startup bundle, and what is not
 *
 * This module is: the hub links to every dataset route, so the route element and its boot screen are
 * part of the first screen's code. Everything the screen hands over TO is not. The dataset's own code
 * (its page, its store, the engine) arrives through its registry entry's `load` (`datasets.tsx`), and
 * the provider tree that renders a booted engine arrives as `./DatasetView.js`, the two fetched
 * together on the route's first visit. Until both have arrived the boot screen shows its idle caption,
 * which is the caption a boot starts on anyway; from then on it follows the dataset's progress store.
 * So a visitor sees one screen from its first frame through to the live app, and the first caption is
 * the idle one that `tests/e2e/bootCaption.ts` requires.
 *
 * ⚠ **One instance per dataset.** The route keeps the loaded module and the booted engine in state
 * and does not reset them when `entry` changes; the router renders it keyed by dataset id (`App.tsx`),
 * so a different dataset is a fresh instance. The cancellation guard still matters for that: a
 * dataset left mid-boot unmounts this instance, and its late resolution must not land.
 *
 * @packageDocumentation
 */

import type * as AddressFilterState from '@filter-enginez/examples-shared/address-filter-state';

import { BrainSynapse } from '@filter-enginez/brand';
import { BOOT_FAILURE_COPY, type BootCaptionPart, bootCaptionParts, type BootFailureDataset } from '@filter-enginez/examples-shared/boot-caption';
import { hasPrerender, useDismissPrerender } from '@filter-enginez/examples-shared/prerender';
import { Fragment, useEffect, useState, useSyncExternalStore } from 'react';

import type { BootedDataset, DatasetEntry, DatasetModule } from '../datasets.js';
import type { DatasetView } from './DatasetView.js';

/** No-op external-store subscribe for a module that publishes no boot progress, or none yet. */
const noopSubscribe = (): (() => void) => () => undefined;

/** The snapshot of a progress store that does not exist (yet): no progress. */
const nullSnapshot = (): null => null;

/**
 * Load the render half of the route — see {@link DatasetView}.
 *
 * @returns The view component, once its chunk has arrived.
 */
const loadDatasetView = async (): Promise<typeof DatasetView> => (await import('./DatasetView.js')).DatasetView;

/**
 * The reader of a shared link's filter state, loaded with the dataset's code rather than in the startup
 * bundle (`examples-shared/src/url/addressFilterState.ts`).
 */
const loadAddressFilterState = async (): Promise<typeof AddressFilterState> => import('@filter-enginez/examples-shared/address-filter-state');

/** A dataset ready to render: its code loaded, its engine booted and its mirror store wired. */
interface ReadyDataset {
	/** The booted engine and its mirror store. */
	readonly booted: BootedDataset;
	/** The dataset's page. */
	readonly Component: React.ComponentType;
	/** The provider tree that renders it. */
	readonly View: typeof DatasetView;
}

/**
 * Start fetching a dataset route's code without booting anything — what the hub calls when a dataset
 * card is hovered or focused, so the chunk is usually in hand by the time the click lands.
 *
 * @remarks
 * Fetches exactly what {@link DatasetRoute} fetches on arrival and nothing more: the engine boot, the
 * corpus it streams and the mirror store all still wait for the route. A failed prefetch is dropped
 * rather than reported, because nothing is waiting on it — the route's own load runs again on arrival
 * and puts any failure on the boot-error screen, where it belongs.
 *
 * @param entry - The dataset whose code to fetch.
 */
export function prefetchDatasetRoute(entry: DatasetEntry): void {
	Promise.all([entry.load(), loadDatasetView()]).catch(() => undefined);
}

/**
 * Load + boot + provide a dataset: the dataset's boot screen (see {@link DatasetBootScreen}) while the
 * code loads and the engine boots, the failure screen if either rejects, then the dataset's `Component` inside the
 * Redux + engine providers.
 */
export const DatasetRoute = ({ entry }: { readonly entry: DatasetEntry }): React.ReactElement => {
	const [datasetModule, setDatasetModule] = useState<DatasetModule | null>(null);
	const [ready, setReady] = useState<ReadyDataset | null>(null);
	const [error, setError] = useState<Error | null>(null);

	useEffect(() => {
		let isCancelled = false;
		let handle: BootedDataset | null = null;

		Promise.all([entry.load(), loadDatasetView(), loadAddressFilterState()])
			.then(async ([loaded, View, { loadFilterStateFromAddress }]): Promise<ReadyDataset> => {
				// The boot screen subscribes to the module's progress store as soon as it is in hand, so the
				// caption follows the boot from its first progress event.
				if (!isCancelled) {
					setDatasetModule(loaded);
				}

				const booted = await loaded.bootAndWire();

				// A shared link opens on its own state from the first frame: loaded between the boot and the
				// first render, as every other app does, rather than by the URL sync after it (which painted
				// the unfiltered count first).
				if (entry.supportsUrlState === true) {
					loadFilterStateFromAddress(booted.engine.core);
				}

				return { booted, Component: loaded.Component, View };
			})
			.then(
				(next) => {
					// Unmounted before boot resolved — detach the just-created mirror immediately.
					if (isCancelled) {
						next.booted.detach();

						return;
					}
					handle = next.booted;
					setReady(next);
				},
				(err: unknown) => {
					if (!isCancelled) {
						setError(err instanceof Error ? err : new Error(String(err)));
					}
				},
			);

		return () => {
			isCancelled = true;
			handle?.detach();
		};
	}, [entry]);

	if (error !== null) {
		return <BootError dataset={entry.bootFailure} error={error} />;
	}

	if (ready === null) {
		return <DatasetBootScreen entry={entry} datasetModule={datasetModule} />;
	}

	const { booted, Component, View } = ready;

	return <View booted={booted} Component={Component} supportsUrlState={entry.supportsUrlState === true} />;
};

/** Props for {@link DatasetBootScreen}. */
interface DatasetBootScreenProps {
	/** The dataset's code, once loaded; `null` until then. */
	readonly datasetModule: DatasetModule | null;
	/** The dataset being booted — its boot-screen shape, idle caption and record noun. */
	readonly entry: DatasetEntry;
}

/**
 * The cold-start screen, in the shape every app shows for the dataset.
 *
 * @remarks
 * Two shapes, chosen by the registry entry rather than by this screen, so each reads the same as the
 * other five apps' boot of the same dataset:
 *
 *   - **The hero loader** (wine, whose entry names a `heroLoaderLabel`): the brand `<BrainSynapse>`
 *     over a live "Loaded N of ~M bottles" caption, for a worker boot long enough to need narrating.
 *   - **The inline caption alone** (books, real estate): a main-thread boot over a static file, short
 *     enough that a 520px loader would only flash. Real estate's caption follows its progress store;
 *     books' module publishes none, so its caption is the idle sentence throughout.
 *
 * The wording — including the zero-total guard — lives in `examples-shared/boot-caption`, shared by
 * every vertical. What stays here is the only React-specific part: turning a `value` segment into an
 * accent span. Cyan, never phosphor — a corpus arriving is data, and the engine is not computing yet.
 *
 * @internal
 */
const DatasetBootScreen = ({ datasetModule, entry }: DatasetBootScreenProps): React.ReactElement | null => {
	const progress = useSyncExternalStore(
		datasetModule?.subscribeProgress ?? noopSubscribe,
		datasetModule?.getProgressSnapshot ?? nullSnapshot,
		nullSnapshot,
	);
	const caption = renderCaption(bootCaptionParts(progress, { idleCaption: entry.idleCaption, recordNoun: entry.recordNoun }));

	// While the prerendered page is up it stands in for this screen: the snapshot of the booted page
	// shows until the dataset view replaces it (`examples-shared/prerender`).
	if (hasPrerender()) {
		return null;
	}

	// `<main>` in both shapes: until the dataset arrives, the loader and its caption are the page's main
	// content, and a page with no main landmark fails the accessibility audit a visitor's tools run
	// mid-boot.
	if (entry.heroLoaderLabel === undefined) {
		return (
			<main>
				<p className="fe-boot-caption fe-boot-caption--inline">{caption}</p>
			</main>
		);
	}

	return (
		<main
			className="min-h-screen flex flex-col items-center justify-center gap-6 px-6"
			style={{ background: 'var(--gray-0)' }}
		>
			<BrainSynapse width={520} ariaLabel={entry.heroLoaderLabel} className="fe-boot-loader" />
			<p className="fe-boot-caption fe-boot-caption--hero">{caption}</p>
		</main>
	);
};

/**
 * A caption's segments as React children: each `value` segment in its accent span, text as-is.
 *
 * @remarks
 * Every segment is keyed by its wording, text too (a keyed fragment), so a segment whose wording changes
 * is a new text node rather than an old one rewritten. Without keys, React rewrote the idle caption's
 * text node into the first words of the streamed count's caption, and the browser saw that node jump
 * 37px left on the centered hero line: a layout shift of 0.0004 at a desktop width, on `/wine` without
 * the snapshot. A new node is an insertion, not a shift. The other four apps already replace the node.
 *
 * @param parts - Segments from `bootCaptionParts`.
 * @returns The children to render inside the caption element.
 */
function renderCaption(parts: readonly BootCaptionPart[]): React.ReactNode[] {
	return parts.map((part) =>
		part.kind === 'value' ? (
			<span key={`${part.kind}:${part.text}`} className="fe-boot-caption__value">{part.text}</span>
		) : (
			<Fragment key={`${part.kind}:${part.text}`}>{part.text}</Fragment>
		),
	);
}

/** Props for {@link BootError}. */
interface BootErrorProps {
	/** Whose failure copy to show (`BOOT_FAILURE_COPY`). */
	readonly dataset: BootFailureDataset;
	/** Why the boot failed. */
	readonly error: Error;
}

/**
 * Boot-failure screen: the dataset's shared failure copy around the error's own message. Recovery is a
 * page refresh (no meaningful retry at this layer).
 *
 * @remarks
 * The words are `BOOT_FAILURE_COPY[dataset]`, the same in all six apps. They sit in an element with
 * `role="alert"` INSIDE `<main>`, not on it: a `role` on the `<main>` element would replace its
 * landmark role, and the failure is still the page's main content.
 *
 * Wine's hint names the one failure there with a workaround, a Web Worker that cannot start, and this
 * app follows it with how its own build selects the main-thread tier instead: the `VITE_WINE_TIER`
 * setting every Vite app reads.
 *
 * @internal
 */
const BootError = ({ dataset, error }: BootErrorProps): React.ReactElement => {
	const copy = BOOT_FAILURE_COPY[dataset];

	// A boot that failed replaces the prerendered page at once, or the snapshot would claim a working page.
	useDismissPrerender();

	return (
		<main
			className="min-h-screen flex flex-col items-center justify-center p-8 text-center"
			style={{ background: 'var(--gray-0)', color: 'var(--gray-10)' }}
		>
			<div role="alert" className="flex flex-col items-center gap-4 max-w-xl">
				<p
					className="text-lg font-semibold"
					style={{ color: 'var(--danger)', fontFamily: 'var(--font-display)' }}
				>
					{copy.title}
				</p>
				<p style={{ color: 'var(--gray-9)', fontFamily: 'var(--font-mono)', fontSize: '13px' }}>
					{error.message}
				</p>
				<p className="text-xs" style={{ color: 'var(--gray-8)', fontFamily: 'var(--font-mono)' }}>
					{copy.hint}
				</p>
				{dataset === 'wine' ? (
					<p className="text-xs" style={{ color: 'var(--gray-8)', fontFamily: 'var(--font-mono)' }}>
						Set <code>VITE_WINE_TIER=default</code> to boot the 10,000-wine default tier on the main thread
						instead.
					</p>
				) : null}
			</div>
		</main>
	);
};
