/**
 * `<PanelHeader />` — the wine filter aside's title zone.
 *
 * @remarks
 * `margin-top: 20px` pushes the header down from the aside's top edge
 * (the aside has no internal padding), and `padding: 0 18px 14px` gives a tight inset matching the
 * filter sections below. It sits above the scroll container in normal flow — no `position: sticky`
 * needed since it's already outside the scrolling area.
 *
 * **No "clear all" button here.** By design the canonical clear-all
 * affordance lives in the ActiveFiltersBar inside `<ResultsHeader />`, where that single button calls
 * the shared `clearAllWineFilters`: every flat facet and expression mode, as in every vertical.
 *
 * @packageDocumentation
 */

/**
 * Panel header — the "Filters" title.
 */
export const PanelHeader = (): React.ReactElement => {
	return (
		<div
			className="flex items-center justify-between shrink-0"
			style={{
				borderBottom: '1px solid var(--gray-3)',
				marginTop: '20px',
				padding: '0 18px 14px 18px',
			}}
		>
			<h2 className="fe-filter-panel__title">Filters</h2>
		</div>
	);
};
