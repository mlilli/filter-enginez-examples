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

import { createLinkSerializer } from '@filter-enginez/examples-shared/link-serializer';
import { useUrlFormat } from '@filter-enginez/examples-shared/url';
import { FilterEngineProvider } from '@filter-enginez/react-signals';
import { FilterEngineUrlSync } from '@filter-enginez/url-state-router';
import { useMemo } from 'react';

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
	// Shareable-URL serializer for the chosen format (from the app-wide toggle store), its decode reading
	// the origin rule as every app commits it (`examples-shared/src/url/linkSerializer.ts`). Memoized so the
	// instance is stable across renders — `<FilterEngineUrlSync>` keys effects on it.
	const urlFormat = useUrlFormat();
	const urlSerializer = useMemo(() => createLinkSerializer(urlFormat), [urlFormat]);

	return (
		<FilterEngineProvider engine={booted.engine}>
			{supportsUrlState ? (
				<FilterEngineUrlSync engine={booted.engine.core} asyncConfig={booted.engine.asyncEngine} serializer={urlSerializer} />
			) : null}
			<Component />
		</FilterEngineProvider>
	);
};
