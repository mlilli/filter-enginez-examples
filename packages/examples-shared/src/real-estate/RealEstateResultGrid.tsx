/**
 * `<RealEstateResultGrid />` — incremental "load more" grid of `<RealEstateCard />` for the current
 * filter result set.
 *
 * @remarks
 * Mirrors the books `<BooksResultGrid />` (itself the mirror of `<WineResultGrid />`) exactly —
 * incremental render with a hard cap: render `results.slice(0, renderLimit)`, expand the limit when
 * an `IntersectionObserver` reports the bottom sentinel entering the scroller, and cap at
 * `HARD_CAP_RENDER`. The only real-estate-specific bits are the card + the "listings" record noun.
 *
 * @packageDocumentation
 */

import type { Listing } from '@filter-enginez/mock-data/real-estate';

import { useResultCount, useResults } from '@filter-enginez/react-signals';
import { ScrollRegion } from '@filter-enginez/react-ui';
import { memo, useCallback, useEffect, useRef, useState } from 'react';

import { RealEstateCard } from './RealEstateCard.js';

/** First page of cards shown before the user scrolls (fills a typical viewport + overscan). */
const INITIAL_BATCH = 60;

/** Page size for each subsequent "load more" trigger. */
const BATCH_INCREMENT = 60;

/** Hard cap on cards ever rendered at once — bounds worst-case DOM cost. */
const HARD_CAP_RENDER = 1500;

/**
 * The real-estate result grid.
 */
const RealEstateResultGridInner = (): React.ReactElement => {
	const results = useResults<Listing>();
	const totalCount = useResultCount();

	const [renderLimit, setRenderLimit] = useState(INITIAL_BATCH);
	const [renderLimitResults, setRenderLimitResults] = useState(results);
	const scrollerRef = useRef<HTMLDivElement | null>(null);
	const sentinelRef = useRef<HTMLDivElement | null>(null);

	// Reset the render limit + scroll to top whenever the result set's identity changes (a filter
	// change flips `results` to a fresh array); the user should see the new first page. The limit is
	// state, so it resets during render — the new results never mount at the old, deeper limit. The
	// scroll position belongs to the DOM, so that half stays in an effect.
	if (renderLimitResults !== results) {
		setRenderLimitResults(results);
		setRenderLimit(INITIAL_BATCH);
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
			const next = Math.min(current + BATCH_INCREMENT, results.length, HARD_CAP_RENDER);

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

	const renderedCount = Math.min(renderLimit, results.length, HARD_CAP_RENDER);
	const visible = results.slice(0, renderedCount);
	const isCappedShort = renderedCount >= HARD_CAP_RENDER && results.length > HARD_CAP_RENDER;

	return (
		<ScrollRegion ref={scrollerRef} ariaLabel="Listing results" className="flex-1 min-h-0 overflow-y-auto">
			{/* role="list" + label on the grid (direct parent of the listitem cards) keeps the
			    list→listitem ownership unbroken (a11y: aria-required-children). */}
			<div
				role="list"
				aria-label={`${totalCount.toLocaleString()} matching listings`}
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
				{renderedCount.toLocaleString()}
			</span>{' '}
			of <span style={{ color: 'var(--gray-9)' }}>{totalCount.toLocaleString()}</span>{' '}
			matches · narrow your filters to surface the rest
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
				No listings match the current filters.
			</p>
			<p className="text-sm" style={{ color: 'var(--gray-8)' }}>
				Try widening the price range or the search radius, or clearing a location.
			</p>
		</div>
	);
};

/**
 * Memoized public export — bails on parent re-renders; only re-renders when its own
 * `useResults` / `useResultCount` subscriptions change.
 */
export const RealEstateResultGrid = memo(RealEstateResultGridInner);
