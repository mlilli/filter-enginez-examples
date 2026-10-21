/**
 * `useEditableBounds` — the two editable bound fields under a `<RangeSlider />`.
 *
 * @remarks
 * Every app's slider commits a typed bound the same way, and this hook is the React half of that
 * contract:
 *
 *   - Typing changes only the field. Enter or blur commits; nothing commits per keystroke.
 *   - The text goes through the slider's `parse`, then the shared `resolveTypedBound`: snapped to
 *     `step` and clamped into the available zone, exactly where a drag to the same spot would land.
 *   - Text that is not a number, or a value equal to the committed bound, puts the committed value
 *     back in the field and writes nothing.
 *   - A lower bound typed above the upper one (or the reverse) swaps, so min ≤ max always holds.
 *   - Escape puts the committed value back and commits nothing, including on the blur it causes.
 *
 * Kept apart from the component so the slider stays about its three track layers, and so the field
 * rules read in one place.
 *
 * @packageDocumentation
 */

import { type Dispatch, type KeyboardEvent, type SetStateAction, useCallback, useRef, useState } from 'react';

import type { NumericBounds } from './bounds.js';

import { resolveTypedBound } from './thumbs.js';

/** Which editable bound a field edits. */
type BoundSide = 'lower' | 'upper';

/** What {@link useEditableBounds} needs from the slider. */
export interface EditableBoundsParams {
	/** The zone the thumbs can reach; typed values clamp into it. */
	readonly available: NumericBounds;
	/** The slider's single commit path. Called only with a real change, `min ≤ max`. */
	readonly commit: (min: number, max: number) => void;
	/** Value → field text. A new identity re-renders both fields through it. */
	readonly format: (value: number) => string;
	/** The committed (displayed) lower bound. */
	readonly lower: number;
	/** Field text → value; `NaN` for text that is not a number. */
	readonly parse: (raw: string) => number;
	/** The slider's value step; typed values snap to it. */
	readonly step: number;
	/** The committed (displayed) upper bound. */
	readonly upper: number;
}

/** The props one editable bound field takes. */
export interface EditableBoundField {
	/** Commit on blur, unless the blur is the one Enter or Escape caused. */
	readonly onBlur: (event: { readonly target: HTMLInputElement }) => void;
	/** Keep the draft text; nothing commits per keystroke. */
	readonly onChange: (event: { readonly target: HTMLInputElement }) => void;
	/** Enter commits, Escape reverts; both leave the field. */
	readonly onKeyDown: (event: KeyboardEvent<HTMLInputElement>) => void;
	/** The field's text. */
	readonly value: string;
}

/**
 * Local text for one editable bound: seeded from the committed value, re-synced whenever that value
 * or the formatter changes from outside, and free to hold a draft in between.
 *
 * @remarks
 * The re-sync happens during render, against the value and formatter it last synced from, rather than
 * in an effect — so the input never paints the stale text first. `Object.is` is the comparison an
 * effect's dependency array would make, so a `NaN` bound reads as unchanged rather than re-syncing on
 * every render. Each field re-syncs only when ITS committed value changes, so a remote change to one
 * bound never discards a draft typed into the other.
 *
 * @param committed - The bound's committed (prop-derived) value.
 * @param format - The readout formatter; a new identity re-renders the text through it.
 * @returns The input's text, and its setter for keystrokes and commits.
 * @internal
 */
function useCommittedText(
	committed: number,
	format: (value: number) => string,
): [string, Dispatch<SetStateAction<string>>] {
	const [text, setText] = useState(() => format(committed));
	const [syncedFrom, setSyncedFrom] = useState({ committed, format });

	if (!Object.is(syncedFrom.committed, committed) || syncedFrom.format !== format) {
		setSyncedFrom({ committed, format });
		setText(format(committed));
	}

	return [text, setText];
}

/**
 * Bind the slider's two editable bound fields.
 *
 * @param params - The committed bounds, the reachable zone, the text conversions and the commit path.
 * @returns The lower and upper fields' props.
 */
export function useEditableBounds(params: EditableBoundsParams): { readonly lower: EditableBoundField; readonly upper: EditableBoundField } {
	const { available, commit, format, lower, parse, step, upper } = params;
	const [lowerText, setLowerText] = useCommittedText(lower, format);
	const [upperText, setUpperText] = useCommittedText(upper, format);
	// Set only while `leaveField` blurs a field after Enter or Escape. The blur that follows reads the
	// DOM's text, which still holds what was typed because the reverted state has not rendered yet, so
	// it must not commit: after Escape that text is exactly what the user discarded.
	const isLeavingFieldRef = useRef(false);

	const commitTypedBound = useCallback((side: BoundSide, raw: string): void => {
		const committed = side === 'lower' ? lower : upper;
		const setText = side === 'lower' ? setLowerText : setUpperText;
		const resolved = resolveTypedBound(parse(raw), step, available);

		if (resolved === null || resolved === committed) {
			setText(format(committed));

			return;
		}
		const other = side === 'lower' ? upper : lower;
		const nextMin = Math.min(resolved, other);
		const nextMax = Math.max(resolved, other);

		// Reflect the committed value back in the field at once, then commit through the slider's path.
		setText(format(side === 'lower' ? nextMin : nextMax));
		commit(nextMin, nextMax);
	}, [available, commit, format, lower, parse, setLowerText, setUpperText, step, upper]);

	const leaveField = useCallback((input: HTMLInputElement): void => {
		isLeavingFieldRef.current = true;
		input.blur();
		isLeavingFieldRef.current = false;
	}, []);

	const bindField = (side: BoundSide): EditableBoundField => ({
		onBlur: (event) => {
			if (!isLeavingFieldRef.current) {
				commitTypedBound(side, event.target.value);
			}
		},
		onChange: (event) => {
			(side === 'lower' ? setLowerText : setUpperText)(event.target.value);
		},
		onKeyDown: (event) => {
			const input = event.currentTarget;

			if (event.key === 'Enter') {
				event.preventDefault();
				commitTypedBound(side, input.value);
				leaveField(input);
			} else if (event.key === 'Escape') {
				(side === 'lower' ? setLowerText : setUpperText)(format(side === 'lower' ? lower : upper));
				leaveField(input);
			}
		},
		value: side === 'lower' ? lowerText : upperText,
	});

	return { lower: bindField('lower'), upper: bindField('upper') };
}
