/**
 * `<DocsHomePage />` — the `/docs` overview: what the engine is, how the docs are organized, a
 * quick-start snippet, and cards into the major sections.
 *
 * @packageDocumentation
 */

import { Link } from 'react-router';

import { howItWorksUrl } from '../compare/origins.js';
import { CodeBlock } from './CodeBlock.js';
import { ALGORITHM_DOCS } from './content/algorithmsContent.js';
import { RULE_DOCS } from './content/rulesContent.js';

const QUICK_START = `import { createFilterEngine, inSet, range } from '@filter-enginez/core';

const engine = createFilterEngine({ sourceData: wines });
engine.addRule('color', inSet('color', ['red']));
engine.addRule('price', range('priceUsd', { min: 20, max: 60 }));

engine.getResults();      // the matching records
engine.getResultCount();  // …or just the count`;

/**
 * The docs overview page.
 */
export const DocsHomePage = (): React.ReactElement => {
	return (
		<div className="fe-doc">
			<p className="fe-doc-eyebrow">documentation</p>
			<h1 className="fe-doc-title">Filter EngineZ</h1>
			<p className="fe-doc-lead">
				A generic, isomorphic, framework-agnostic TypeScript filter engine — arbitrarily complex filters over
				arbitrarily shaped data, computed client-side (and server-side, unchanged). These docs cover every filter
				rule, the algorithms that make them fast, a live playground, and the API.
			</p>

			<h2 className="fe-doc-h2">Quick start</h2>
			<p className="fe-doc-p">
				Build an engine over your data, add rules (or load a JSON config), and read the results. Rules are inert
				data; the engine composes them and keeps the result set up to date.
			</p>
			<CodeBlock code={QUICK_START} ariaLabel="Quick-start code" />

			<h2 className="fe-doc-h2">Explore the docs</h2>
			<div className="fe-doc-cards">
				<Link to={`/docs/rules/${RULE_DOCS[0]?.id ?? 'value'}`} className="fe-doc-card">
					<span className="fe-doc-card__title">Filter rules</span>
					<span className="fe-doc-card__body">
						All {RULE_DOCS.length} rules — equality, ranges, sets, hierarchy, text, geo, membership, and Boolean
						composition — each with a simple and advanced explanation, real code, and an animated diagram.
					</span>
					<span className="fe-doc-card__go">Browse the rule catalog →</span>
				</Link>
				<Link to={`/docs/algorithms/${ALGORITHM_DOCS[0]?.id ?? 'roaring-bitmaps'}`} className="fe-doc-card">
					<span className="fe-doc-card__title">Algorithms</span>
					<span className="fe-doc-card__body">
						The {ALGORITHM_DOCS.length} data structures behind the speed — Roaring bitmaps, the exclusion graph,
						memoized simulation, R-tree, plus suggestions, similarity, membership, and text search.
					</span>
					<span className="fe-doc-card__go">See how it&apos;s fast →</span>
				</Link>
				<Link to="/docs/playground" className="fe-doc-card">
					<span className="fe-doc-card__title">Playground</span>
					<span className="fe-doc-card__body">
						Edit a JSON <code>FilterEngineConfig</code> against a real dataset and run the engine live in your
						browser — the same config that runs server-side via the Node <code>POST /filter</code> endpoint.
					</span>
					<span className="fe-doc-card__go">Try it live →</span>
				</Link>
				<Link to="/docs/api" className="fe-doc-card">
					<span className="fe-doc-card__title">API reference</span>
					<span className="fe-doc-card__body">
						The public surface — <code>createFilterEngine</code>, the rule factories, the config layer, and the
						reactive bindings — grouped with signatures.
					</span>
					<span className="fe-doc-card__go">Read the reference →</span>
				</Link>
			</div>

			<h2 className="fe-doc-h2">See it running</h2>
			<p className="fe-doc-p">
				Prefer to watch it work first? The <a href={howItWorksUrl(window.location)}>how-the-engine-works page</a> animates the
				algorithms and lets you benchmark the acceleration stack live, and the dataset demos (
				<Link to="/wine">wine</Link>, <Link to="/books">books</Link>, <Link to="/real-estate">real estate</Link>)
				exercise the whole catalog against real corpora.
			</p>
		</div>
	);
};
