/**
 * `@filter-enginez/examples-shared/about` — the shared "How the engine works" page.
 *
 * @remarks
 * A single `<AboutPage />` composed of eight animated algorithm illustrations and a live
 * benchmark widget, reused by both React apps behind a thin `/about` route wrapper. Browser-only. The
 * illustrations and the benchmark's pure helpers are re-exported for reuse and testing.
 *
 * @packageDocumentation
 */

export { ABOUT_SECTIONS, type AboutSection } from './aboutContent.js';
export { type AboutDemoLink, AboutPage, type AboutPageProps } from './AboutPage.js';
export {
	type BenchmarkConfig,
	BenchmarkWidget,
	computeSpeedup,
	formatDuration,
	formatSpeedup,
	logBarWidthPercent,
	measureConfig,
	referenceMsFor,
} from './benchmark/index.js';
export {
	ExclusionGraphFigure,
	MemoizedSimulationFigure,
	RoaringBitmapsFigure,
	RTreeFigure,
} from './illustrations/index.js';
export { useInView, type UseInViewOptions } from './useInView.js';
