/**
 * `/wine-server` server `load` — the SSR / no-JS half of the wine server-filtering story.
 *
 * @remarks
 * The wine twin of `/books-server`'s `load`. Runs on every request to `/wine-server`, **on the
 * SvelteKit server**, and filters the wine corpus in-process (same isomorphic core as the endpoints)
 * so the very first paint already shows a real, server-computed result set — and so the route works
 * with JavaScript entirely disabled.
 *
 * Two request shapes:
 *   - **JS-on** — the booted client engine writes the full serialized filter state to `?f=<tagged>`.
 *     `load` decodes it (the tagged serializer auto-detects the format) for a faithful SSR paint that
 *     matches what the client will hydrate.
 *   - **JS-off** — the progressive-enhancement `<form method="GET">` submits legible params
 *     (`?color=…&minPoints=…&q=…`); {@link buildConfigFromParams} maps them to a config.
 *
 * The client then boots the live server-backed engine and replaces this fallback with the full
 * `<WineView>`. The SSR payload is deliberately light: the match count + a small sample grid (the
 * resident corpus and full result set are the client engine's job once it boots).
 *
 * @packageDocumentation
 */

import type { FilterEngineConfig } from '@filter-enginez/core';

import { createTaggedSerializer } from '@filter-enginez/url-state-router/serializers';
import { runDatasetQuery } from '$lib/server/datasetFilterService.js';
import { type AppliedParams, buildConfigFromParams, colorVocabulary, parseParams } from '$lib/server/wineServerParams.js';

import type { PageServerLoad } from './$types.js';

/** The dataset this route filters. */
const DATASET = 'wine';
/** How many result records to materialize for the SSR sample grid. */
const SSR_SAMPLE_LIMIT = 12;

/** A minimal, JSON-safe wine card for the SSR fallback grid. */
export interface SsrWineCard {
	readonly id: string;
	readonly color: string;
	readonly name: string;
	readonly points: number | null;
	readonly priceUsd: number | null;
	readonly varietal: string;
	readonly vintage: number | null;
	readonly winery: string;
}

/** Project a raw corpus record to the SSR card shape (defensive about field presence/types). */
function toSsrCard(record: unknown, index: number): SsrWineCard {
	const wine = record as {
		readonly id?: unknown;
		readonly color?: unknown;
		readonly name?: unknown;
		readonly points?: unknown;
		readonly priceUsd?: unknown;
		readonly varietal?: unknown;
		readonly vintage?: unknown;
		readonly winery?: unknown;
	};

	return {
		color: typeof wine.color === 'string' ? wine.color : '',
		id: typeof wine.id === 'string' ? wine.id : `ssr-${String(index)}`,
		name: typeof wine.name === 'string' ? wine.name : 'Unnamed wine',
		points: typeof wine.points === 'number' ? wine.points : null,
		priceUsd: typeof wine.priceUsd === 'number' ? wine.priceUsd : null,
		varietal: typeof wine.varietal === 'string' ? wine.varietal : '',
		vintage: typeof wine.vintage === 'number' ? wine.vintage : null,
		winery: typeof wine.winery === 'string' ? wine.winery : '',
	};
}

/** Resolve the request's filter config: prefer a JS-written `?f=`, else the no-JS form params. */
function resolveConfig(url: URL, applied: AppliedParams): { config: FilterEngineConfig; hasClientState: boolean } {
	const serialized = url.searchParams.get('f');

	if (serialized !== null && serialized !== '') {
		try {
			// `decode` auto-detects the tagged format regardless of the argument here.
			return { config: createTaggedSerializer('human-readable').decode(serialized), hasClientState: true };
		} catch {
			// Malformed `?f=` — fall through to the no-JS params (or a neutral config).
		}
	}

	return { config: buildConfigFromParams(applied), hasClientState: false };
}

export const load: PageServerLoad = async ({ url }) => {
	const applied = parseParams(url.searchParams);
	const { config, hasClientState } = resolveConfig(url, applied);
	// `query: {}` skips predictive-disable facet work — the SSR fallback only needs the count + sample.
	const result = await runDatasetQuery({ config, dataset: DATASET, limit: SSR_SAMPLE_LIMIT, query: {}});

	return {
		applied,
		colors: colorVocabulary(DATASET),
		hasClientState,
		ssr: {
			matched: result.matched,
			sample: result.results.map(toSsrCard),
			total: result.total,
		},
	};
};
