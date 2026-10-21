/**
 * `<WineResultGrid />` — incremental infinite-scroll grid of `<WineCard />` for the current
 * filter result set.
 *
 * @remarks
 * **Why not windowing virtualization.** Absolute-positioned windowing with a multi-megapixel inner
 * spacer fails two distinct ways here:
 *
 *   1. Window-scroll variant — the 12M-pixel-tall page breaks Radix Slider's pointer
 *      capture math in the sticky filter aside.
 *   2. Bounded-container variant — the same enormous inner spacer combined with
 *      compositor-layer churn from `will-change: opacity, transform` on remounting cards
 *      makes the page unresponsive and crash after seconds of idling.
 *
 * **Approach — incremental render with a hard cap.** No absolute positioning,
 * no virtualized spacer. The grid renders `results.slice(0, renderLimit)` using a normal
 * CSS Grid. The window is the shared `RESULT_GRID_WINDOW`, the same in all six apps: `renderLimit`
 * starts at 60, grows by 60 (`nextRenderLimit`) whenever an `IntersectionObserver` reports the
 * bottom sentinel intersecting the scroller's viewport, and stops at the 1,500 cap. Once the cap
 * stops a larger result set (`isRenderCapped`), the grid says so with the shared
 * `resultCapNotice` ("Showing N of M matches · narrow your filters to surface the rest"). Worst-case
 * DOM cost is 1,500 cards, which is tractable on every modern browser. Every word the column says
 * comes from `RESULT_COPY.wine`.
 *
 * **What we lose vs true virtualization.** Cards aren't recycled — appending more grows
 * the DOM monotonically until filter change resets it. For datasets where users
 * realistically only scroll the first N matches and rely on filters to narrow further,
 * this is fine. If real users routinely scroll past ~500 results, we should revisit
 * windowing with a more conservative design (e.g., react-window or @tanstack/react-virtual,
 * both battle-tested).
 *
 * **What we gain.** Predictable, bounded behavior. The slider works. The page doesn't
 * crash. Card mount animations fire cleanly on filter change (every visible card has a
 * fresh `wine.id` key) and on scroll-in (newly-loaded cards mount fresh).
 *
 * @packageDocumentation
 */

import type { Wine } from '@filter-enginez/mock-data/wine';

import { useResultCount, useResults } from '@filter-enginez/react-signals';
import { ScrollRegion } from '@filter-enginez/react-ui';
import { memo, useCallback, useEffect, useRef, useState } from 'react';

import { isRenderCapped, nextRenderLimit, RESULT_COPY, RESULT_GRID_WINDOW, resultCapNotice } from '../verticals/verticals.js';
import { WineCard } from './WineCard.js';

/** This dataset's result-column copy: the list and scroller names and the empty state. */
const COPY = RESULT_COPY.wine;

/**
 * The wine result grid.
 */
const WineResultGridInner = (): React.ReactElement => {
	const results = useResults<Wine>();
	const totalCount = useResultCount();

	const [renderLimit, setRenderLimit] = useState<number>(RESULT_GRID_WINDOW.initial);
	const [renderLimitResults, setRenderLimitResults] = useState(results);
	const scrollerRef = useRef<HTMLDivElement | null>(null);
	const sentinelRef = useRef<HTMLDivElement | null>(null);

	// Reset render limit whenever the result set's identity changes. A filter change
	// flips `results` to a fresh array (different bottles match); we want the user to
	// see the new first page, not the deep tail of the previous one. The limit is state, so
	// it resets during render — the new results never mount at the old, deeper limit.
	if (renderLimitResults !== results) {
		setRenderLimitResults(results);
		setRenderLimit(RESULT_GRID_WINDOW.initial);
	}

	// Also scroll back to top so the new result set's first page is visible. The scroll
	// position belongs to the DOM, so this half stays in an effect.
	useEffect(() => {
		const el = scrollerRef.current;

		if (el !== null) {
			el.scrollTop = 0;
		}
	}, [results]);

	// Bottom-sentinel intersection — expands renderLimit when the user scrolls within
	// striking distance of the currently-rendered tail. `rootMargin: 200px` triggers
	// expansion a viewport-height before the user actually hits the bottom, so the load feels
	// continuous rather than "I scrolled to the end, now wait."
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

	// ── Empty state short-circuit ─────────────────────────────────────────
	if (totalCount === 0) {
		return <EmptyState />;
	}

	const renderedCount = Math.min(renderLimit, results.length, RESULT_GRID_WINDOW.cap);
	const visible = results.slice(0, renderedCount);
	// The notice only once the cap stops a larger result set; below it, scrolling renders more.
	const isCappedShort = isRenderCapped(renderedCount, results.length);

	return (
		<ScrollRegion
			ref={scrollerRef}
			ariaLabel={COPY.scrollerLabel}
			// `flex-1 min-h-0 overflow-y-auto` — claims remaining vertical space in the
			// parent section and scrolls internally, so the filter aside doesn't have to
			// fight a page-tall scroll context (which breaks Radix's slider — see "Why
			// not windowing virtualization" in the module docs).
			className="flex-1 min-h-0 overflow-y-auto"
		>
			{/* role="list" + label on the grid (direct parent of the listitem cards) keeps the
			    list→listitem ownership unbroken (a11y: aria-required-children). The scroller itself is a
			    labelled, focusable `<ScrollRegion>` (role="group"), so keyboard users can reach + scroll it. */}
			<div
				role="list"
				aria-label={COPY.listLabel(totalCount)}
				className="grid gap-4"
				style={{
					// `min(280px, 100%)` caps the track floor at the container width so the card
					// never forces a horizontal scroll on viewports narrower than 280px (mobile-first
					// safety); above that it behaves as the usual auto-fill `minmax(280px, 1fr)`.
					gridTemplateColumns: 'repeat(auto-fill, minmax(min(280px, 100%), 1fr))',
				}}
			>
				{visible.map((wine) => (
					<WineCard key={wine.id} wine={wine} />
				))}
			</div>
			{/* Bottom sentinel — the IntersectionObserver watches this for "user is near
			    the end" and expands `renderLimit`. Zero-height so it doesn't add visible
			    space; `rootMargin: 200px` on the observer means it triggers a viewport-height
			    before the user actually reaches it. */}
			<div ref={sentinelRef} aria-hidden="true" style={{ height: '1px' }} />
			{!!isCappedShort && (
				<RenderCapNotice
					renderedCount={renderedCount}
					totalCount={totalCount}
				/>
			)}
		</ScrollRegion>
	);
};

/**
 * Notice shown when the render cap is reached and more results exist. Surfaces the
 * truncation explicitly so the user understands why scroll stopped expanding.
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
 * "No results" state. A pure-text affordance, by design — no illustration.
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
 * Memoized public export — with no props, the grid bails on parent (WineApp) re-renders and
 * only re-renders when its own `useResults` / `useResultCount` subscriptions change.
 */
export const WineResultGrid = memo(WineResultGridInner);
