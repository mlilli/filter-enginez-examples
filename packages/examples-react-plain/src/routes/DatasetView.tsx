/**
 * `<DatasetView />` — a booted dataset on screen: its page inside the engine provider, plus URL sync
 * when the dataset keeps its filter state in the URL.
 *
 * @remarks
 * The render half of `<DatasetRoute>`, split from it because of what it imports. The provider and the
 * URL sync come from `react-signals` and `url-state-router`, and both import `@filter-enginez/core`,
 * whose bitmap index brings a WebAssembly build of CRoaring with it — about as much code as the whole
 * first screen. `<DatasetRoute>` renders the hub's boot screen and loads this module with the dataset's
 * own, so none of that is in the startup bundle and all of it arrives before the first dataset renders.
 *
 * @packageDocumentation
 */

import { useUrlSyncBindings } from '@filter-enginez/examples-shared/url';
import { FilterEngineProvider } from '@filter-enginez/react-signals';
import { FilterEngineUrlSync } from '@filter-enginez/url-state-router';

import type { BootedDataset } from '../datasets.js';

/** Props for {@link DatasetView}. */
export interface DatasetViewProps {
	/** The booted engine to provide. */
	readonly booted: BootedDataset;
	/** The dataset's page, rendered inside the provider. */
	readonly Component: React.ComponentType;
	/** Whether to mount `<FilterEngineUrlSync>` (see `DatasetEntry.supportsUrlState`). */
	readonly supportsUrlState: boolean;
}

/**
 * The booted dataset: `Component` inside the engine provider, with URL sync when the entry opts in.
 *
 * @param props - See {@link DatasetViewProps}.
 * @returns The provider tree.
 */
export const DatasetView = ({ booted, Component, supportsUrlState }: DatasetViewProps): React.ReactElement => {
	return (
		<FilterEngineProvider engine={booted.engine}>
			{supportsUrlState ? (
				<UrlSync booted={booted} />
			) : null}
			<Component />
		</FilterEngineProvider>
	);
};

/**
 * `<FilterEngineUrlSync>` over the booted dataset.
 *
 * @remarks
 * It takes the shared link serializer for the format the header toggle chose (its decode reads the
 * origin rule as every app commits it, `examples-shared/src/url/linkSerializer.ts`) and the engine
 * core, paired by `useUrlSyncBindings` so the sync never loads one of its own earlier writes back over
 * a newer state (`examples-shared/src/url/ownUrlWrites.ts`). Both stay stable across renders, as the
 * sync keys its effects on them. Its own component, so a route without URL state builds neither.
 *
 * @param props - The booted dataset.
 * @returns The sync.
 */
const UrlSync = ({ booted }: { readonly booted: BootedDataset }): React.ReactElement => {
	const urlSync = useUrlSyncBindings(booted.engine.core);

	return <FilterEngineUrlSync engine={urlSync.engine} asyncConfig={booted.engine.asyncEngine} serializer={urlSync.serializer} />;
};
