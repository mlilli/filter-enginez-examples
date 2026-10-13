/**
 * `<LabPage />` — the `/lab` shell: chrome, framing copy, and the panes.
 *
 * @remarks
 * Rendered by `<DatasetRoute>` inside `<FilterEngineProvider>`, so every pane below has a booted
 * books engine in context and none of them boots anything themselves.
 *
 * The topbar follows `/about`'s shape rather than the books app chrome, because `/lab` is a route
 * SURFACE (like `/about`, `/compare` and the 404) rather than a dataset view — same reason its CSS
 * block is `fe-lab*` and not a dataset-prefixed name.
 *
 * ⚠ **The three panes are written out** rather than mapped over a config, because the three differ in every way that would matter to a shared container — one owns
 * a picker, one owns a recording effect, one owns a row-per-candidate list — and the only thing they
 * share is a wrapper class. Abstracting that is the premature abstraction the house standards
 * warn about; the honest extraction point is the six-vertical fan-out, where the shape is
 * forced rather than guessed.
 *
 * @packageDocumentation
 */

import { Mark } from '@filter-enginez/brand';
import { Link } from 'react-router';

import { SimilarityPane } from './SimilarityPane.js';
import { SimulationPane } from './SimulationPane.js';
import { SuggestionPane } from './SuggestionPane.js';

/**
 * The lab page — a demonstration surface for the engine capabilities the docs describe.
 */
export const LabPage = (): React.ReactElement => {
	return (
		<div className="fe-lab">
			<header className="fe-lab__topbar">
				<Link to="/" className="fe-lab__brand" aria-label="Filter EngineZ — back to the dataset hub">
					<span className="fe-lab__brand-mark" aria-hidden="true">
						<Mark size={28} />
					</span>
					<span className="fe-lab__brand-word">Filter EngineZ</span>
				</Link>
				<Link to="/books" className="fe-lab__back">
					← books
				</Link>
			</header>

			<section className="fe-lab__hero">
				<p className="fe-lab__eyebrow">the lab</p>
				<h1 className="fe-lab__hero-title">Engine capabilities, running</h1>
				<p className="fe-lab__hero-lead">
					Filtering is the part of the engine every demo already shows. These are the parts it
					does not: projection, similarity and suggestion, driven against the same live books
					corpus as{' '}
					<Link to="/books" className="fe-lab__inline-link">
						/books
					</Link>
					{' '}— and against the same engine instance, so any filters you left there are still
					applied here.
				</p>
			</section>

			<SimulationPane />
			<SimilarityPane />
			<SuggestionPane />
		</div>
	);
};
