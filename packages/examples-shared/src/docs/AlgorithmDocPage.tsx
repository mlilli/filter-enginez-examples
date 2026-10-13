/**
 * `<AlgorithmDocPage />` — renders one `AlgorithmDoc` (`/docs/algorithms/:algoId`): the simple →
 * advanced explanation and the animated illustration, the same figure the how-it-works page on
 * filterenginez.com animates. Pure template over the `ALGORITHM_DOCS` catalog.
 *
 * @packageDocumentation
 */

import { Link, Navigate, useParams } from 'react-router';

import { howItWorksUrl } from '../compare/origins.js';
import { ALGORITHM_DOCS, findAlgorithmDoc } from './content/algorithmsContent.js';

/**
 * A single algorithm's documentation page.
 */
export const AlgorithmDocPage = (): React.ReactElement => {
	const { algoId } = useParams();
	const algorithm = findAlgorithmDoc(algoId);

	if (algorithm === undefined) {
		return <Navigate to="/docs" replace />;
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
				{previous === undefined ? <span /> : <Link to={`/docs/algorithms/${previous.id}`}>← {previous.name}</Link>}
				{next === undefined ? <span /> : <Link to={`/docs/algorithms/${next.id}`}>{next.name} →</Link>}
			</nav>
		</article>
	);
};
