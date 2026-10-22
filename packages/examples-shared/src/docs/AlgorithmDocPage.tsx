/**
 * `<AlgorithmDocPage />` — renders one `AlgorithmDoc` (`algorithms/:algoId` in the docs section): the simple →
 * advanced explanation and the animated illustration, the same figure the how-it-works page on
 * filterenginez.com animates. Pure template over the `ALGORITHM_DOCS` catalog.
 *
 * @packageDocumentation
 */

// The figures' stylesheet, loaded with this page rather than with the app: the eight algorithm
// illustrations and the rule figure are the only `fe-fig-*` markup, and only the two figure pages draw
// it. Imported here, the bundler puts the sheet beside this page's chunk and links it when the page
// loads, after the app's own sheet, which is the order the cascade needs (`figures.css` builds on the
// brand tokens and overrides nothing in `ui-styles`). The documentation site and both React apps'
// `/docs` routes all get it this way, and none of them carries it on any other page.
import '@filter-enginez/ui-styles/figures.css';

import { Link, Navigate, useParams } from 'react-router';

import { howItWorksUrl } from '../compare/origins.js';
import { ALGORITHM_DOCS, findAlgorithmDoc } from './content/algorithmsContent.js';
import { useDocsPath } from './docsBasePath.js';

/**
 * A single algorithm's documentation page.
 */
export const AlgorithmDocPage = (): React.ReactElement => {
	const { algoId } = useParams();
	const docsPath = useDocsPath();
	const algorithm = findAlgorithmDoc(algoId);

	if (algorithm === undefined) {
		return <Navigate to={docsPath('/')} replace />;
	}

	const index = ALGORITHM_DOCS.findIndex((candidate) => candidate.id === algorithm.id);
	const previous = index > 0 ? ALGORITHM_DOCS[index - 1] : undefined;
	const next = index < ALGORITHM_DOCS.length - 1 ? ALGORITHM_DOCS[index + 1] : undefined;
	const { Figure } = algorithm;

	return (
		<article className="fe-doc">
			<p className="fe-doc-eyebrow">algorithm</p>
			<h1 className="fe-doc-title">{algorithm.name}</h1>

			{algorithm.speedup === undefined ? null : (
				<div className="fe-doc-meta">
					<span className="fe-doc-chip fe-doc-chip--cyan">{algorithm.speedup}</span>
				</div>
			)}

			<p className="fe-doc-lead">{algorithm.simple}</p>

			<div className="fe-doc-figure">
				<Figure />
			</div>

			<h2 className="fe-doc-h2">How it works</h2>
			<p className="fe-doc-p">{algorithm.advanced}</p>

			<p className="fe-doc-p">
				See it animated in context on the <a href={howItWorksUrl(window.location)}>how-the-engine-works page</a>, where you can also
				benchmark the acceleration stack live.
			</p>

			<nav className="fe-doc-pager" aria-label="Algorithm pages">
				{previous === undefined ? <span /> : <Link to={docsPath(`/algorithms/${previous.id}`)}>← {previous.name}</Link>}
				{next === undefined ? <span /> : <Link to={docsPath(`/algorithms/${next.id}`)}>{next.name} →</Link>}
			</nav>
		</article>
	);
};
