/**
 * `<NotFoundPage>` — the React "filtered to zero" 404, shared by both React apps.
 *
 * @remarks
 * Renders the framework-neutral 404 (copy + chips + logic from `./core`) over the shared
 * `fe-notfound__*` classes (`@filter-enginez/ui-styles`). The gag: a cyan result count pinned at `0`,
 * the phosphor `NeuralCluster` "thinking" loader churning away (the engine perpetually searching and
 * never finding a match), and a dead-end filter row where every toggle still yields the empty set.
 *
 * @packageDocumentation
 */

import { NeuralCluster } from '@filter-enginez/brand';
import { useState } from 'react';
import { Link, useLocation } from 'react-router';

import { NOT_FOUND_CHIPS, NOT_FOUND_COPY, notFoundBody, toggleNotFoundChip } from './core.js';

/** The React 404 page — wire it as the router catch-all (`path: '*'`) via {@link notFoundRoute}. */
export const NotFoundPage = (): React.ReactElement => {
	const { pathname } = useLocation();
	const [selected, setSelected] = useState<readonly string[]>([]);

	/** Toggle a chip — the count never budges off zero, so there's nothing to recompute. */
	const handleToggle = (id: string): void => {
		setSelected((previous) => toggleNotFoundChip(previous, id));
	};

	return (
		<main className="fe-notfound">
			<p className="fe-notfound__eyebrow">{NOT_FOUND_COPY.eyebrow}</p>
			<p className="fe-notfound__count" aria-hidden="true">{NOT_FOUND_COPY.count}</p>
			<div className="fe-notfound__loader">
				<NeuralCluster size={168} ariaLabel="Still searching — zero results" />
			</div>
			<h1 className="fe-notfound__heading">{NOT_FOUND_COPY.heading}</h1>
			<p className="fe-notfound__body">{notFoundBody(pathname)}</p>
			<div className="fe-notfound__chips" role="group" aria-label="Dead-end filters — every option yields zero">
				{NOT_FOUND_CHIPS.map((chip) => {
					const isActive = selected.includes(chip.id);

					return (
						<button
							key={chip.id}
							type="button"
							className={isActive ? 'fe-notfound__chip fe-notfound__chip--selected' : 'fe-notfound__chip'}
							aria-pressed={isActive}
							onClick={() => {
								handleToggle(chip.id);
							}}
						>
							{chip.label}
							<span className="fe-notfound__chip-badge">0</span>
						</button>
					);
				})}
			</div>
			<Link className="fe-notfound__cta" to={NOT_FOUND_COPY.ctaHref}>{NOT_FOUND_COPY.ctaLabel}</Link>
		</main>
	);
};
