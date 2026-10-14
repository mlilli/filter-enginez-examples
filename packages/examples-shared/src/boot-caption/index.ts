/**
 * The dataset boot caption — one implementation of the three states every cold-start screen narrates.
 *
 * @remarks
 * ### Why this exists
 *
 * Every cold-start screen in every vertical — both React `DatasetRoute`s and the SvelteKit, Vue,
 * Angular and vanilla boot screens — narrates the same states, and the edge cases are easy to get
 * wrong per copy. The sharpest one: `{ loaded: 0, total: 0 }` falls past `0 < 0` into the third
 * state unless something guards it, rendering "0 books loaded · constructing filter index", a
 * completed-load claim about a load that has not started. One implementation means one guard.
 *
 * ### Why PARTS rather than a string
 *
 * Every vertical's wine boot screen renders the live number in its own element so it can carry the
 * cyan accent — React, SvelteKit, Vue and Angular a `.fe-boot-caption__value` span, vanilla
 * `bootCaptionValue()`. Returning one string would force each of
 * them to find the number again by parsing it back out, which is how a shared helper ends up less
 * safe than a per-screen copy. Returning segments
 * lets every vertical map over them in its own idiom and decide what a `value` looks like — including
 * deciding it looks like nothing special, which is what the two-state real-estate screens do.
 *
 * **Cyan, never phosphor**, for any vertical that does highlight it: the brand's dual-accent
 * contract reads cyan as data and phosphor as engine activity. A corpus arriving is data; the engine
 * is not computing yet, it is waiting.
 *
 * ### Why it takes a structural `{ loaded, total }`
 *
 * There are five boot-progress types in this repo — `WineBootProgress`, `BooksBootProgress`,
 * `BooksConfigBootProgress`, `RealEstateBootProgress` and the React apps' `DatasetBootProgress` —
 * and every one of them is assignable to the fields this reads. Depending on any single one
 * would make a books route import a wine type to render a caption. {@link BootProgress} is the
 * intersection, declared here so the caption owns its own input.
 *
 * This module imports NOTHING. That is the strongest available form of the React-free promise
 * `tests/tooling/reactFreeSubpaths.test.ts` enforces: there is no transitive graph to taint.
 *
 * @packageDocumentation
 */

/** The default pre-stream caption. Overridden by routes whose cold start is not a worker spin-up. */
export const DEFAULT_IDLE_CAPTION = 'Spinning up worker thread';

/**
 * Records loaded out of the tier total.
 *
 * @remarks
 * The structural minimum every boot-progress type in the repo satisfies. Deliberately NOT imported
 * from one of them — see the module docblock.
 */
export interface BootProgress {
	/** Records parsed so far. */
	readonly loaded: number;
	/** The total. A stream that has not reported a length yet reports `0`. */
	readonly total: number;
	/**
	 * Whether `total` is an estimate rather than a count. Absent means exact.
	 *
	 * @remarks
	 * Only one source in the repo estimates: the local real wine corpus, streamed line by line, which
	 * cannot know its own length until it ends. Every other total is known before the first record — a
	 * server's page envelope reports it, and a generator is asked for a fixed number — so the caption
	 * prints `~` only when a reporter says the number is a guess.
	 */
	readonly isTotalEstimated?: boolean;
}

/**
 * One segment of a rendered caption.
 *
 * @remarks
 * `value` marks a live number the vertical may highlight; `text` is literal copy. A renderer that
 * treats both the same is a correct renderer — the distinction is an affordance, not a requirement.
 */
export interface BootCaptionPart {
	/** Which kind of segment this is. */
	readonly kind: 'text' | 'value';
	/** The rendered string. `value` parts are already locale-grouped. */
	readonly text: string;
}

/** How a route wants its caption worded. */
export interface BootCaptionOptions {
	/** The pre-stream caption. Defaults to {@link DEFAULT_IDLE_CAPTION}. */
	readonly idleCaption?: string;
	/** Plural record noun for this dataset, e.g. `bottles` / `books` / `listings`. */
	readonly recordNoun: string;
}

/**
 * Build the boot caption for a progress snapshot.
 *
 * @remarks
 * Three states, and the third is the one that earns its keep: after the last record lands there is
 * still a visible pause while the bitmap index builds, and a caption frozen on the final count reads
 * as a hang at precisely the moment a user reaches for reload.
 *
 * 🔴 **A zero total is the pre-stream moment, not a finished load.** `{ loaded: 0, total: 0 }` is not
 * `null` and does not satisfy `0 < 0`, so without the `<= 0` arm it lands in the third state. This
 * guard exists once, here, for every vertical.
 *
 * @param progress - The current snapshot, or `null` before the stream reports anything.
 * @param options - The route's wording.
 * @returns The caption's segments, in order.
 */
export function bootCaptionParts(
	progress: BootProgress | null,
	options: BootCaptionOptions,
): readonly BootCaptionPart[] {
	const idleCaption = options.idleCaption ?? DEFAULT_IDLE_CAPTION;

	if (progress === null || progress.total <= 0) {
		return [{ kind: 'text', text: idleCaption }];
	}

	const loaded = progress.loaded.toLocaleString();

	if (progress.loaded < progress.total) {
		return [
			{ kind: 'text', text: 'Loaded ' },
			{ kind: 'value', text: loaded },
			{
				kind: 'text',
				text: ` of ${progress.isTotalEstimated === true ? '~' : ''}${progress.total.toLocaleString()} ${options.recordNoun}`,
			},
		];
	}

	return [
		{ kind: 'value', text: loaded },
		{ kind: 'text', text: ` ${options.recordNoun} loaded · constructing filter index` },
	];
}

/**
 * Flatten a caption to plain text.
 *
 * @remarks
 * For assertions, accessible names, and any renderer with nowhere to put a highlight. Kept beside
 * the builder so the two cannot disagree about how segments join — they join by concatenation, and
 * the spacing lives inside the segments precisely so this stays a `join('')` rather than a rule.
 *
 * @param parts - Segments from {@link bootCaptionParts}.
 * @returns The concatenated caption.
 */
export function bootCaptionText(parts: readonly BootCaptionPart[]): string {
	return parts.map((part) => part.text).join('');
}
