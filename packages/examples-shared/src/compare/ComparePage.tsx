/**
 * `<ComparePage>` — one filter state, rendered as a link into each vertical serving the dataset.
 *
 * @remarks
 * The portability claim — that every vertical reads the same `?f=` param through a serializer whose
 * decode sniffs its own format tag — needs a demonstration. This page is the demonstration.
 *
 * **No engine is mounted here, deliberately.** The obvious alternative was to run a real books
 * engine on this page so a visitor could build state in place; that would make `/compare` a seventh
 * consumer of the filter-panel UI, and each of the six verticals would need its own copy of that
 * panel to host it. It would also duplicate what `/books` already is. The page instead takes state
 * as input: either a `?f=` someone arrived with, or one of the hand-authored presets.
 *
 * The comparison table's columns — framework, binding, surface, blurb — come straight from
 * `VERTICALS`; the registry's own docblock names this page as their consumer.
 *
 * @packageDocumentation
 */

import { useMemo } from 'react';
import { Link, useSearchParams } from 'react-router';

import { useUrlFormat } from '../url/urlFormatStore.js';
import {
	COMPARE_DATASETS,
	COMPARE_PRESETS,
	compareHeading,
	compareLinks,
	compareListLabel,
	DATASET_LABELS,
	DATASET_PARAM,
	PRESET_PARAM,
	readCompareDataset,
	resolveCompareState,
	URL_STATE_PARAM,
} from './core.js';

/**
 * The cross-app comparison page. Mount it at `/compare` via {@link compareRoute}.
 */
export const ComparePage = (): React.ReactElement => {
	const [searchParams] = useSearchParams();
	const urlFormat = useUrlFormat();
	const dataset = readCompareDataset(searchParams.get(DATASET_PARAM));
	const presets = COMPARE_PRESETS[dataset];
	const inboundState = searchParams.get(URL_STATE_PARAM);
	const presetId = searchParams.get(PRESET_PARAM);

	// The rule that decides WHAT is transported lives in `compare-core` — see `state.ts` — so every
	// shell shares one copy of an invariant whose violation looks like success (an inbound `?f=`
	// re-encoded still "works", and quietly demonstrates something weaker than the page claims).
	const { serialized, sourceLabel } = useMemo(
		() => resolveCompareState({ dataset, format: urlFormat, inboundState, presetId }),
		[dataset, inboundState, presetId, urlFormat],
	);

	const links = useMemo(
		() => compareLinks({ dataset, location: window.location, serialized }),
		[dataset, serialized],
	);

	return (
		<main className="fe-compare">
			<p className="fe-compare__eyebrow">Engine portability</p>
			<h1 className="fe-compare__heading">{compareHeading(dataset)}</h1>
			<p className="fe-compare__lede">
				Every vertical reads its state from the same <code>?f</code> parameter, through a serializer
				whose decode detects its own format tag. A link built here opens in any of them — React,
				Vue, Svelte, Angular, or no framework at all — and reproduces the identical result set.
			</p>

			<div className="fe-compare__controls">
				<div className="fe-compare__group" role="group" aria-label="Dataset">
					{COMPARE_DATASETS.map((candidate) => (
						<Link
							key={candidate}
							to={`?${DATASET_PARAM}=${candidate}`}
							className={
								candidate === dataset
									? 'fe-compare__toggle fe-compare__toggle--selected'
									: 'fe-compare__toggle'
							}
							aria-current={candidate === dataset ? 'true' : undefined}
						>
							{DATASET_LABELS[candidate]}
						</Link>
					))}
				</div>

				{inboundState === null ? (
					<div className="fe-compare__group" role="group" aria-label="Example state">
						{presets.map((preset) => {
							const isSelected = preset.id === (presetId ?? presets[0].id);

							return (
								<Link
									key={preset.id}
									to={`?${DATASET_PARAM}=${dataset}&${PRESET_PARAM}=${preset.id}`}
									className={
										isSelected
											? 'fe-compare__toggle fe-compare__toggle--selected'
											: 'fe-compare__toggle'
									}
									aria-current={isSelected ? 'true' : undefined}
									title={preset.description}
								>
									{preset.label}
								</Link>
							);
						})}
					</div>
				) : null}
			</div>

			<div className="fe-compare__state">
				<span className="fe-compare__state-label">{sourceLabel}</span>
				<code className="fe-compare__state-value">{serialized}</code>
			</div>

			<ul className="fe-compare__list" aria-label={compareListLabel(dataset)}>
				{links.map((link) => (
					<li key={link.vertical.id} className="fe-compare__row">
						<div className="fe-compare__row-head">
							<a className="fe-compare__row-name" href={link.href}>
								{link.vertical.name}
							</a>
							<span className="fe-compare__row-framework">{link.vertical.framework}</span>
						</div>
						<p className="fe-compare__row-blurb">{link.vertical.blurb}</p>
						<p className="fe-compare__row-binding">
							<code>{link.vertical.binding ?? 'no binding — bare core'}</code>
							<span className="fe-compare__row-surface">{link.vertical.surface}</span>
						</p>
					</li>
				))}
			</ul>

			<p className="fe-compare__footnote">
				Links are full navigations by design: four of the six hydrate <code>?f</code> only at mount,
				so a client-side transition would leave their engines untouched.{' '}
				<Link to="/">Back to the dataset hub</Link>
			</p>
		</main>
	);
};
