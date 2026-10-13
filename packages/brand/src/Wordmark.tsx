/**
 * `<Wordmark />` — `FILTER ENGINEZ` set in Orbitron, with the trailing Z rendered as the
 * canonical cyan mark inline.
 *
 * @remarks
 * Ported from the design-system source at `docs/branding/design-system/assets/logomark/svg/
 * lockup-horizontal-primary.svg`. The wordmark is *not* pure type — the Z is the actual
 * `<Mark />` SVG inlined into the type baseline at the right side, where the "Z" would be.
 * This makes the Z load-bearing identity: it gets the full cyan + glow treatment of the mark
 * even when surrounded by static text.
 *
 * **Typography lock:**
 *   - **Font** — Orbitron, weight 800
 *   - **Letter-spacing** — `9px` at 64px size (≈ `0.14em`) so the wordmark reads as a system
 *     identifier rather than ordinary type
 *   - **Casing** — always UPPERCASE
 *   - **Color** — FILTER ENGINE in `--text-primary` (`#F1ECDF`); the trailing Z is the mark
 *
 * **Three modes:**
 *   - `'primary'` — cream type + cyan mark (canonical, the lockup-horizontal-primary.svg)
 *   - `'subdued'` — full grayscale, no glow, mark in subdued mono mode
 *   - `'monochrome'` — single `currentColor` for type, mark switches to outline-only sub mode
 *
 * @packageDocumentation
 */

import { Mark } from './Mark.js';

/**
 * Props for `<Wordmark />`.
 */
export interface WordmarkProps {
	/**
	 * Font size in pixels (controls type size; mark scales proportionally). Defaults to 64
	 * (the design-system canonical lockup size).
	 */
	readonly size?: number;

	/**
	 * Color treatment:
	 *
	 * - `'primary'` — cream type + cyan mark (default; matches lockup-horizontal-primary.svg)
	 * - `'subdued'` — grayscale type, mark in subdued mono mode (matches lockup-subdued.svg)
	 * - `'monochrome'` — single-color type via `color` prop or `currentColor`; mark in
	 *   outline-only mode using the same color
	 */
	readonly mode?: 'monochrome' | 'primary' | 'subdued';

	/**
	 * When `mode='monochrome'`, the color to use for both type AND mark outline. Defaults to
	 * `currentColor` (inherits from surrounding text context). Ignored for other modes.
	 */
	readonly color?: string;

	/** Optional `aria-label` override. Defaults to `'Filter EngineZ'`. */
	readonly ariaLabel?: string;

	/** Optional className for layout-context CSS hooks. */
	readonly className?: string;
}

/**
 * Type palette per mode. The mark palette is handled inside `<Mark />` itself via its `mode`
 * prop — only the type color varies here.
 *
 * @internal
 */
function getTypeColor(mode: 'monochrome' | 'primary' | 'subdued', color: string | undefined): string {
	if (mode === 'monochrome') {
		return color ?? 'currentColor';
	}
	if (mode === 'subdued') {
		return '#7C7669';
	}

	return '#F1ECDF';
}

/**
 * The FILTER ENGINEZ wordmark.
 *
 * @example
 *   <Wordmark size={64} />                          // hero header (default)
 *   <Wordmark size={32} mode="subdued" />           // footer
 *   <Wordmark size={48} mode="monochrome" color="#000" /> // print on light bg
 */
export const Wordmark = (props: WordmarkProps): React.ReactElement => {
	const {
		ariaLabel = 'Filter EngineZ',
		className,
		color,
		mode = 'primary',
		size = 64,
	} = props;

	const typeColor = getTypeColor(mode, color);
	const markMode = mode === 'primary' ? 'primary' : 'subdued';

	// The canonical lockup proportions: 64px type at 9px letter-spacing makes "FILTER ENGINE"
	// land at ~580px wide; the mark sits at the right occupying another ~70px (56% scale of
	// the 100×100 mark = 56px, with margins). Total viewBox is 700×120 in the source SVG; we
	// scale linearly with the `size` prop here so consumers don't have to do the arithmetic.
	const scale = size / 64;
	const totalWidth = 700 * scale;
	const totalHeight = 120 * scale;
	const markSize = 56 * scale;

	return (
		<span
			role="img"
			aria-label={ariaLabel}
			className={className}
			style={{
				alignItems: 'baseline',
				display: 'inline-flex',
				gap: `${10 * scale}px`,
				height: `${totalHeight}px`,
				// `lineHeight: 1` keeps the inline-flex container tight to the cap height
				// of the type so vertical centering against neighboring text works.
				lineHeight: 1,
				maxWidth: `${totalWidth}px`,
			}}
		>
			<span
				style={{
					// Vertical alignment: nudge to align with the inline mark's center
					alignSelf: 'center',
					color: typeColor,
					fontFamily: '"Orbitron", system-ui, sans-serif',
					fontSize: `${size}px`,
					fontWeight: 800,
					letterSpacing: `${9 * scale}px`,
					// `textTransform: 'uppercase'` so consumers passing lowercase children get the
					// brand spelling regardless. (We hardcode the children below, but the rule still
					// stands for safety.)
					textTransform: 'uppercase',
				}}
			>
				FILTER ENGINE
			</span>
			<Mark
				size={markSize}
				mode={markMode}
				noRings
				ariaLabel="Z"
			/>
		</span>
	);
};
