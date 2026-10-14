/**
 * `<DatasetRoute />` — the per-dataset route element. Lazily boots the dataset's engine on first
 * visit, shows the brand loader while it streams, then swaps in the live dataset app inside its
 * engine provider. Every dataset route shares this one boot/provide path.
 *
 * @remarks
 * The signals-surface sibling of the RTK app's `<DatasetRoute>` — same shape, minus Redux: there's
 * no mirror store to wrap or detach, so this just provides the booted engine. Boot is **cached per
 * dataset** (the `examples-shared/<dataset>` slice memoizes it), so navigating away and back reuses
 * the already-loaded engine (and its filter state) — the corpus loads once, on first visit.
 *
 * @packageDocumentation
 */

import { BrainSynapse } from '@filter-enginez/brand';
import { bootCaptionParts } from '@filter-enginez/examples-shared/boot-caption';
import { createLinkSerializer } from '@filter-enginez/examples-shared/link-serializer';
import { useUrlFormat } from '@filter-enginez/examples-shared/url';
import { FilterEngineProvider } from '@filter-enginez/react-signals';
import { FilterEngineUrlSync } from '@filter-enginez/url-state-router';
import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';

import type { BootedDataset, DatasetEntry } from '../datasets.js';

/** No-op external-store subscribe for an entry that publishes no boot progress. */
const noopSubscribe = (): (() => void) => () => undefined;

/**
 * Boot + provide a dataset: the brand loader with a live caption while the engine boots, the failure
 * screen if boot rejects, then the dataset's `Component` inside the engine provider.
 */
export const DatasetRoute = ({ entry }: { readonly entry: DatasetEntry }): React.ReactElement => {
	const [booted, setBooted] = useState<BootedDataset | null>(null);
	const [error, setError] = useState<Error | null>(null);

	useEffect(() => {
		const boot = entry.boot;

		let isCancelled = false;

		boot().then(
			(next) => {
				if (!isCancelled) {
					setBooted(next);
				}
			},
			(err: unknown) => {
				if (!isCancelled) {
					setError(err instanceof Error ? err : new Error(String(err)));
				}
			},
		);

		return () => {
			isCancelled = true;
		};
	}, [entry]);

	// Shareable-URL serializer for the chosen format (from the app-wide toggle store), its decode reading
	// the origin rule as every app commits it (`examples-shared/src/url/linkSerializer.ts`). Memoized so the
	// instance is stable across renders — `<FilterEngineUrlSync>` keys effects on it.
	const urlFormat = useUrlFormat();
	const urlSerializer = useMemo(() => createLinkSerializer(urlFormat), [urlFormat]);

	if (error !== null) {
		return <BootError error={error} />;
	}

	const Component = entry.Component;

	if (booted === null) {
		return <DatasetBootScreen entry={entry} />;
	}

	return (
		<FilterEngineProvider engine={booted.engine}>
			{entry.supportsUrlState === true ? (
				<FilterEngineUrlSync engine={booted.engine.core} asyncConfig={booted.engine.asyncEngine} serializer={urlSerializer} />
			) : null}
			<Component />
		</FilterEngineProvider>
	);
};

/**
 * Full-screen boot loader — the brand `<BrainSynapse>` + a live "Loaded N of ~M <noun>" caption
 * driven by the dataset's boot-progress store.
 *
 * @internal
 */
const DatasetBootScreen = ({ entry }: { readonly entry: DatasetEntry }): React.ReactElement => {
	const progress = useSyncExternalStore(
		entry.subscribeProgress ?? noopSubscribe,
		entry.getProgressSnapshot ?? (() => null),
		() => null,
	);
	// The wording — including the zero-total guard — lives in `examples-shared/boot-caption`, shared by
	// every vertical. What stays here is the only React-specific part: turning a `value` segment into
	// an accent span. Cyan, never phosphor — a corpus arriving is data, and the engine is not computing
	// yet.
	const caption = bootCaptionParts(progress, { recordNoun: entry.recordNoun });

	return (
		<div
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
		</div>
	);
};

/**
 * Boot-failure screen. Surfaces the error message; recovery is a page refresh (no meaningful retry
 * at this layer).
 *
 * @internal
 */
const BootError = ({ error }: { readonly error: Error }): React.ReactElement => {
	return (
		<div
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
		</div>
	);
};
