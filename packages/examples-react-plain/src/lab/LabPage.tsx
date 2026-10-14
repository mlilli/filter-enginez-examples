/**
 * `<LabPage />` — the `/lab` shell: chrome, framing copy, and the panes.
 *
 * @remarks
 * Rendered by `<DatasetRoute>` inside `<FilterEngineProvider>`, so every pane below has a booted
 * books engine in context and none of them boots anything themselves.
 *
 * The header is the compact one every page without dataset controls carries (the hub, the 404): the
 * shared header brand, naming the page `Lab`, plus a link back to `/books`. It is not the books app
 * chrome, because `/lab` is a route SURFACE rather than a dataset view — same reason its CSS block is
 * `fe-lab*` and not a dataset-prefixed name.
 *
 * ⚠ **The three panes are written out** rather than mapped over a config, because the three differ in every way that would matter to a shared container — one owns
 * a picker, one owns a recording effect, one owns a row-per-candidate list — and the only thing they
 * share is a wrapper class. Abstracting that is the premature abstraction the house standards
 * warn about; the honest extraction point is the six-vertical fan-out, where the shape is
 * forced rather than guessed.
 *
 * @packageDocumentation
 */

import { AppHeaderBrand, HEADER_PAGE_LABELS } from '@filter-enginez/examples-shared/app-header';
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
			<header className="fe-books-app__header">
				<AppHeaderBrand page={HEADER_PAGE_LABELS.lab} verticalId="react-plain" />
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
