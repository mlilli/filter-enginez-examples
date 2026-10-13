/**
 * `/books-server` server `load` — the SSR / no-JS half of the server-filtering story.
 *
 * @remarks
 * Runs on every request to `/books-server`, **on the SvelteKit server**, and filters the books corpus
 * in-process (same isomorphic core as the endpoints) so the very first paint already shows a real,
 * server-computed result set — and so the route works with JavaScript entirely disabled.
 *
 * Two request shapes:
 *   - **JS-on** — the booted client engine writes the full serialized filter state to `?f=<tagged>`.
 *     `load` decodes it (the tagged serializer auto-detects the format) for a faithful SSR paint that
 *     matches what the client will hydrate.
 *   - **JS-off** — the progressive-enhancement `<form method="GET">` submits legible params
 *     (`?genre=…&minRating=…&q=…`); {@link buildConfigFromParams} maps them to a config.
 *
 * The client then boots the live engine and replaces this fallback with the full `<BooksView>`. The
 * SSR payload is deliberately light: the match count + a small sample grid (the resident corpus and
 * full result set are the client engine's job once it boots).
 *
 * @packageDocumentation
 */

import type { FilterEngineConfig } from '@filter-enginez/core';

import { createTaggedSerializer } from '@filter-enginez/url-state-router/serializers';
import { type AppliedParams, buildConfigFromParams, genreVocabulary, parseParams } from '$lib/server/booksServerParams.js';
import { runDatasetQuery } from '$lib/server/datasetFilterService.js';

import type { PageServerLoad } from './$types.js';

/** The dataset this route filters. */
const DATASET = 'books';
/** How many result records to materialize for the SSR sample grid. */
const SSR_SAMPLE_LIMIT = 12;

/** A minimal, JSON-safe book card for the SSR fallback grid. */
export interface SsrBookCard {
	readonly id: string;
	readonly authors: string;
	readonly averageRating: number | null;
	readonly genre: string;
	readonly title: string;
	readonly year: number | null;
}

/** Project a raw corpus record to the SSR card shape (defensive about field presence/types). */
function toSsrCard(record: unknown, index: number): SsrBookCard {
	const book = record as {
		readonly id?: unknown;
		readonly authors?: readonly unknown[];
		readonly averageRating?: unknown;
		readonly genre?: unknown;
		readonly publicationYear?: unknown;
		readonly title?: unknown;
	};
	const authors = Array.isArray(book.authors) ? book.authors.filter((value): value is string => typeof value === 'string') : [];

	return {
		authors: authors.join(', '),
		averageRating: typeof book.averageRating === 'number' ? book.averageRating : null,
		genre: typeof book.genre === 'string' ? book.genre : '',
		id: typeof book.id === 'string' ? book.id : `ssr-${String(index)}`,
		title: typeof book.title === 'string' ? book.title : 'Untitled',
		year: typeof book.publicationYear === 'number' ? book.publicationYear : null,
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
		genres: genreVocabulary(DATASET),
		hasClientState,
		ssr: {
			matched: result.matched,
			sample: result.results.map(toSsrCard),
			total: result.total,
		},
	};
};
