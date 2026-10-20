/**
 * `<DatasetRoute />` — the per-dataset route element. Loads the dataset's code and boots its engine on
 * first visit, shows the brand loader while that happens, then swaps in the live dataset app inside its
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

import { BrainSynapse } from '@filter-enginez/brand';
import { bootCaptionParts } from '@filter-enginez/examples-shared/boot-caption';
import { useEffect, useState, useSyncExternalStore } from 'react';

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
 * Load + boot + provide a dataset: the brand loader with a live caption while the code loads and the
 * engine boots, the failure screen if either rejects, then the dataset's `Component` inside the
 * Redux + engine providers.
 */
export const DatasetRoute = ({ entry }: { readonly entry: DatasetEntry }): React.ReactElement => {
	const [datasetModule, setDatasetModule] = useState<DatasetModule | null>(null);
	const [ready, setReady] = useState<ReadyDataset | null>(null);
	const [error, setError] = useState<Error | null>(null);

	useEffect(() => {
		let isCancelled = false;
		let handle: BootedDataset | null = null;

		Promise.all([entry.load(), loadDatasetView()])
			.then(async ([loaded, View]): Promise<ReadyDataset> => {
				// The boot screen subscribes to the module's progress store as soon as it is in hand, so the
				// caption follows the boot from its first progress event.
				if (!isCancelled) {
					setDatasetModule(loaded);
				}

				return { booted: await loaded.bootAndWire(), Component: loaded.Component, View };
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
		return <BootError error={error} />;
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
	/** The dataset being booted — its label and record noun. */
	readonly entry: DatasetEntry;
}

/**
 * Full-screen boot loader — the brand `<BrainSynapse>` + a live "Loaded N of ~M <noun>" caption
 * driven by the dataset's boot-progress store.
 *
 * @internal
 */
const DatasetBootScreen = ({ datasetModule, entry }: DatasetBootScreenProps): React.ReactElement => {
	const progress = useSyncExternalStore(
		datasetModule?.subscribeProgress ?? noopSubscribe,
		datasetModule?.getProgressSnapshot ?? nullSnapshot,
		nullSnapshot,
	);
	// The wording — including the zero-total guard — lives in `examples-shared/boot-caption`, shared by
	// every vertical. What stays here is the only React-specific part: turning a `value` segment into
	// an accent span. Cyan, never phosphor — a corpus arriving is data, and the engine is not computing
	// yet.
	const caption = bootCaptionParts(progress, { recordNoun: entry.recordNoun });

	// `<main>`: until the dataset arrives, the loader and its caption are the page's main content, and
	// a page with no main landmark fails the accessibility audit a visitor's tools run mid-boot.
	return (
		<main
			className="min-h-screen flex flex-col items-center justify-center gap-6 px-6"
			style={{ background: 'var(--gray-0)' }}
		>
			<BrainSynapse width={520} ariaLabel={`Loading ${entry.label}`} className="fe-boot-loader" />
			<p className="fe-boot-caption fe-boot-caption--hero">
				{caption.map((part) =>
					part.kind === 'value' ? (
						<span key={`${part.kind}:${part.text}`} className="fe-boot-caption__value">{part.text}</span>
					) : (
						part.text
					),
				)}
			</p>
		</main>
	);
};

/**
 * Boot-failure screen. Surfaces the error message; recovery is a page refresh (no meaningful retry
 * at this layer).
 *
 * @internal
 */
const BootError = ({ error }: { readonly error: Error }): React.ReactElement => {
	// `<main>`, as the boot screen is: the failure is the page's main content.
	return (
		<main
			className="min-h-screen flex flex-col items-center justify-center gap-4 p-8 text-center"
			style={{ background: 'var(--gray-0)', color: 'var(--gray-10)' }}
		>
			<p
				className="text-lg font-semibold"
				style={{ color: 'var(--danger)', fontFamily: 'var(--font-display)' }}
			>
				Engine failed to boot
			</p>
			<p style={{ color: 'var(--gray-9)', fontFamily: 'var(--font-mono)', fontSize: '13px' }}>
				{error.message}
			</p>
			<p className="text-xs" style={{ color: 'var(--gray-8)', fontFamily: 'var(--font-mono)' }}>
				Refresh the page to retry.
			</p>
		</main>
	);
};
