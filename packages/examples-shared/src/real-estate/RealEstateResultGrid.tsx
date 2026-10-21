/**
 * `<RealEstateResultGrid />` — incremental infinite-scroll grid of `<RealEstateCard />` for the current
 * filter result set.
 *
 * @remarks
 * Mirrors the books `<BooksResultGrid />` (itself the mirror of `<WineResultGrid />`) exactly —
 * incremental render with a hard cap: render `results.slice(0, renderLimit)`, expand the limit when
 * an `IntersectionObserver` reports the bottom sentinel entering the scroller, and stop at
 * the cap — the shared `RESULT_GRID_WINDOW`, `nextRenderLimit` and `isRenderCapped`. The only
 * real-estate-specific bits are the card and the copy, `RESULT_COPY['real-estate']`.
 *
 * @packageDocumentation
 */

import type { Listing } from '@filter-enginez/mock-data/real-estate';

import { useResultCount, useResults } from '@filter-enginez/react-signals';
import { ScrollRegion } from '@filter-enginez/react-ui';
import { memo, useCallback, useEffect, useRef, useState } from 'react';

import { isRenderCapped, nextRenderLimit, RESULT_COPY, RESULT_GRID_WINDOW, resultCapNotice } from '../verticals/verticals.js';
import { RealEstateCard } from './RealEstateCard.js';

/** This dataset's result-column copy: the list and scroller names and the empty state. */
const COPY = RESULT_COPY['real-estate'];

/**
 * The real-estate result grid.
 */
const RealEstateResultGridInner = (): React.ReactElement => {
	const results = useResults<Listing>();
	const totalCount = useResultCount();

	const [renderLimit, setRenderLimit] = useState<number>(RESULT_GRID_WINDOW.initial);
	const [renderLimitResults, setRenderLimitResults] = useState(results);
	const scrollerRef = useRef<HTMLDivElement | null>(null);
	const sentinelRef = useRef<HTMLDivElement | null>(null);

	// Reset the render limit + scroll to top whenever the result set's identity changes (a filter
	// change flips `results` to a fresh array); the user should see the new first page. The limit is
	// state, so it resets during render — the new results never mount at the old, deeper limit. The
	// scroll position belongs to the DOM, so that half stays in an effect.
	if (renderLimitResults !== results) {
		setRenderLimitResults(results);
		setRenderLimit(RESULT_GRID_WINDOW.initial);
	}

	useEffect(() => {
		const el = scrollerRef.current;

		if (el !== null) {
			el.scrollTop = 0;
		}
	}, [results]);

	// Bottom-sentinel intersection — expands `renderLimit` when the user scrolls near the rendered
	// tail. `rootMargin: 200px` triggers a viewport-height early so the load feels continuous.
	const handleSentinelIntersection = useCallback((entries: IntersectionObserverEntry[]) => {
		const entry = entries[0];

		if (entry === undefined || !entry.isIntersecting) {
			return;
		}
		setRenderLimit((current) => {
			const next = nextRenderLimit(current, results.length);

			return next === current ? current : next;
		});
	}, [results.length]);

	useEffect(() => {
		const sentinel = sentinelRef.current;
		const scroller = scrollerRef.current;

		if (sentinel === null || scroller === null) {
			return;
		}
		const io = new IntersectionObserver(handleSentinelIntersection, {
			root: scroller,
			rootMargin: '200px',
			threshold: 0,
		});

		io.observe(sentinel);

		return () => {
			io.disconnect();
		};
	}, [handleSentinelIntersection]);

	if (totalCount === 0) {
		return <EmptyState />;
	}

	const renderedCount = Math.min(renderLimit, results.length, RESULT_GRID_WINDOW.cap);
	const visible = results.slice(0, renderedCount);
	// The notice only once the cap stops a larger result set; below it, scrolling renders more.
	const isCappedShort = isRenderCapped(renderedCount, results.length);

	return (
		<ScrollRegion ref={scrollerRef} ariaLabel={COPY.scrollerLabel} className="flex-1 min-h-0 overflow-y-auto">
			{/* role="list" + label on the grid (direct parent of the listitem cards) keeps the
			    list→listitem ownership unbroken (a11y: aria-required-children). */}
			<div
				role="list"
				aria-label={COPY.listLabel(totalCount)}
				className="grid gap-4"
				style={{
					gridTemplateColumns: 'repeat(auto-fill, minmax(min(280px, 100%), 1fr))',
				}}
			>
				{visible.map((listing) => (
					<RealEstateCard key={listing.id} listing={listing} />
				))}
			</div>
			<div ref={sentinelRef} aria-hidden="true" style={{ height: '1px' }} />
			{!!isCappedShort && (
				<RenderCapNotice renderedCount={renderedCount} totalCount={totalCount} />
			)}
		</ScrollRegion>
	);
};

/**
 * Notice shown when the render cap is reached and more results exist.
 *
 * @internal
 */
const RenderCapNotice = ({
	renderedCount,
	totalCount,
}: {
	readonly renderedCount: number;
	readonly totalCount: number;
}): React.ReactElement => {
	const notice = resultCapNotice(renderedCount, totalCount);

	return (
		<p
			className="text-xs mt-4 mb-2"
			style={{
				color: 'var(--gray-8)',
				fontFamily: 'var(--font-mono)',
				letterSpacing: '0.06em',
				textAlign: 'center',
			}}
		>
			Showing{' '}
			<span style={{ color: 'var(--accent)', fontWeight: 600 }}>
				{notice.rendered}
			</span>{' '}
			of <span style={{ color: 'var(--gray-9)' }}>{notice.total}</span>{' '}
			{notice.suffix}
		</p>
	);
};

/**
 * "No results" state.
 *
 * @internal
 */
const EmptyState = (): React.ReactElement => {
	return (
		<div
			className="flex flex-col items-center justify-center py-24 text-center"
			style={{
				background: 'var(--gray-1)',
				border: '1px dashed var(--gray-3)',
				borderRadius: 'var(--radius-lg)',
				color: 'var(--gray-8)',
			}}
		>
			<p
				className="text-lg font-semibold mb-2"
				style={{
					color: 'var(--gray-10)',
					fontFamily: 'var(--font-display)',
				}}
			>
				{COPY.emptyTitle}
			</p>
			<p className="text-sm" style={{ color: 'var(--gray-8)' }}>
				{COPY.emptyHint}
			</p>
		</div>
	);
};

/**
 * Memoized public export — bails on parent re-renders; only re-renders when its own
 * `useResults` / `useResultCount` subscriptions change.
 */
export const RealEstateResultGrid = memo(RealEstateResultGridInner);
