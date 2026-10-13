/**
 * `<SimilarityPane />` — the `/lab` pane that drives `useSimilar`, the second of the three engine
 * capabilities the docs advertise and nothing calls.
 *
 * @remarks
 * Anchors on a book from the visitor's CURRENT filtered results and shows its nearest neighbors by
 * estimated Jaccard similarity, with the subject overlap that produced each score.
 *
 * ### Why the neighbor list is its own component
 *
 * `useSimilar` takes the anchor as an argument, and there is no anchor when the visitor has filtered
 * down to nothing. A hook cannot be called conditionally, so the choice is between calling it with a
 * placeholder anchor and rendering it only when an anchor exists. The placeholder is worse than it
 * looks: `findSimilar(undefined)` does not throw, it extracts an EMPTY feature set and returns
 * whichever items happen to share the resulting all-max signature — plausible-looking neighbors with
 * no relationship to anything. {@link NeighborList} keeps the hook behind a real anchor, which is
 * the same "one component per hook call" shape `<CandidateRow>` uses next door.
 *
 * @packageDocumentation
 */

import type { Book } from '@filter-enginez/mock-data/books';

import { useResults, useSimilar } from '@filter-enginez/react-signals';
import { useState } from 'react';

import {
	describeSharedSubjects,
	formatAffinity,
	pickAnchor,
	SIMILARITY_CONFIG,
	SIMILARITY_QUERY,
} from './labSimilarity.js';

/** How many books the visitor may choose an anchor from. */
const ANCHOR_CHOICE_COUNT = 8;

/**
 * The similarity pane — an anchor picker, then that anchor's nearest neighbors.
 */
export const SimilarityPane = (): React.ReactElement => {
	const results = useResults<Book>();
	const [preferredId, setPreferredId] = useState<string | undefined>(undefined);
	const anchor = pickAnchor(results, preferredId);

	return (
		<section className="fe-lab__pane" aria-labelledby="fe-lab-similarity-title">
			<h2 className="fe-lab__pane-title" id="fe-lab-similarity-title">
				Nearest neighbors
			</h2>
			<p className="fe-lab__pane-lead">
				Pick a book and the engine finds the ones most like it — not by scanning the corpus, but by
				reducing every book to a MinHash signature and looking in the buckets its signature lands
				in. Scores are estimated Jaccard overlap across subjects, authors, genre, format and
				language; the tags under each result are the subjects it shares with your pick.
			</p>

			{anchor === undefined ? (
				<p className="fe-lab__empty">
					Your current filters match no books, so there is nothing to find neighbors for. Widen a
					filter on <span className="fe-lab__empty-route">/books</span> and this pane fills back in.
				</p>
			) : (
				<>
					<div className="fe-lab__anchor">
						<span className="fe-lab__anchor-label" id="fe-lab-anchor-label">
							Similar to
						</span>
						<select
							aria-labelledby="fe-lab-anchor-label"
							className="fe-lab__anchor-select"
							onChange={(event) => {
								setPreferredId(event.target.value);
							}}
							value={anchor.id}
						>
							{results.slice(0, ANCHOR_CHOICE_COUNT).map((book) => (
								<option key={book.id} value={book.id}>
									{book.title}
								</option>
							))}
						</select>
					</div>
					<NeighborList anchor={anchor} />
				</>
			)}
		</section>
	);
};

/** Props for {@link NeighborList}. */
interface NeighborListProps {
	/** The book to find neighbors for. Never `undefined` — see the module docblock. */
	readonly anchor: Book;
}

/**
 * One anchor's nearest neighbors, or an honest note when it has none.
 *
 * @remarks
 * The empty arm is a REAL branch. `bandSize: 4` reduced empty results to zero across 200 sampled
 * anchors over the full corpus (see `labSimilarity.ts`), but that sampling ran over the UNFILTERED
 * corpus — a visitor who has filtered to a handful of books can still land on one whose bucket
 * neighbors were all filtered away, and `findSimilar` reports that by returning `[]` rather than by
 * throwing. A pane that rendered an empty `<ul>` there would look broken rather than empty.
 *
 * @internal
 */
const NeighborList = ({ anchor }: NeighborListProps): React.ReactElement => {
	const neighbors = useSimilar<Book>(anchor, SIMILARITY_QUERY, SIMILARITY_CONFIG);

	if (neighbors.length === 0) {
		return (
			<p className="fe-lab__empty">
				No book in the corpus shares enough with <strong>{anchor.title}</strong> to clear the
				similarity threshold. That is an answer, not a failure — the signature simply lands in a
				bucket of its own.
			</p>
		);
	}

	return (
		<ul className="fe-lab__neighbors">
			{neighbors.map(({ item, similarity }) => (
				<NeighborRow anchor={anchor} key={item.id} neighbor={item} similarity={similarity} />
			))}
		</ul>
	);
};

/** Props for {@link NeighborRow}. */
interface NeighborRowProps {
	/** The book the search ran from, for the shared-subject readout. */
	readonly anchor: Book;
	/** The neighbor this row describes. */
	readonly neighbor: Book;
	/** Estimated Jaccard similarity in `[0, 1]`. */
	readonly similarity: number;
}

/**
 * One neighbor: its title, its estimated affinity, and the subjects it shares with the anchor.
 *
 * @internal
 */
const NeighborRow = ({ anchor, neighbor, similarity }: NeighborRowProps): React.ReactElement => {
	const shared = describeSharedSubjects(anchor, neighbor);

	return (
		<li className="fe-lab__neighbor">
			<div className="fe-lab__neighbor-text">
				<span className="fe-lab__neighbor-title">{neighbor.title}</span>
				<span className="fe-lab__neighbor-meta">
					{neighbor.genre} · {neighbor.format}
				</span>
				{shared.length === 0 ? (
					// Reachable: the score can come from authors, genre, format and language alone.
					<span className="fe-lab__neighbor-shared fe-lab__neighbor-shared--none">
						no shared subjects — matched on the other attributes
					</span>
				) : (
					<span className="fe-lab__neighbor-shared">
						{shared.map((subject) => (
							<span className="fe-lab__tag" key={subject}>
								{subject}
							</span>
						))}
					</span>
				)}
			</div>
			<span className="fe-lab__affinity">{formatAffinity(similarity)}</span>
		</li>
	);
};
