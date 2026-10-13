/**
 * `<Mark />` — the canonical FilterEngineZ logomark.
 *
 * @remarks
 * Geometry ported byte-faithfully from the design system source at
 * `docs/branding/design-system/assets/logomark/svg/mark-primary.svg` (with
 * `mark-subdued.svg` as the `mode='subdued'` source). The visual identity is locked there;
 * this component is the React wrapper that surfaces it with prop-driven sizing, mode
 * switching, optional ring suppression for favicon-scale use, and an opt-in breathing-synapse
 * animation hook.
 *
 * **The geometry (locked):**
 *   - viewBox `0 0 100 100` (square)
 *   - Three crescent arcs at increasing radii (42, 29, 16) — the "synapse halo"
 *   - Three Z-shape paths with asymmetric chamfers (7u baseline, 10u flare on right side)
 *   - Center synapse node — 3.2r cyan glow circle + 1.6r cream core
 *   - Drop-shadow glow filter on the Z group (cyan, dual-radius)
 *
 * **Modes:**
 *   - `'primary'` — cyan + neon glow on dark surfaces (canonical home)
 *   - `'subdued'` — mono-gray outline-only on light surfaces, or to recede
 *
 * **Favicon adaptation:** at `size ≤ 16` we drop the outline (anti-aliasing eats the 1.6u
 * stroke at small sizes); at `size ≤ 12` set `noRings={true}` to also drop the arcs and
 * render the Z block alone. The design-system separate `favicon-primary.svg` already encodes
 * this stripped form; this component approximates it via the prop combo for runtime use.
 *
 * @packageDocumentation
 */

/**
 * Props for `<Mark />`.
 */
export interface MarkProps {
	/**
	 * Render size in pixels (square). Defaults to 200. The mark adapts at small sizes:
	 * ≤16px drops the outline (anti-aliasing eats it); set `noRings` for ≤12px favicon mode.
	 */
	readonly size?: number;

	/**
	 * `'primary'` for cyan + neon glow on dark surfaces; `'subdued'` for mono-gray outline-
	 * only on light surfaces. Default `'primary'`.
	 */
	readonly mode?: 'primary' | 'subdued';

	/**
	 * If `true`, suppresses the three crescent arcs — useful when the mark needs to read as
	 * a pure Z (in-line type contexts, dense UI, favicon mode). Default `false`.
	 */
	readonly noRings?: boolean;

	/**
	 * If `true`, the center synapse node breathes (2.4s ease-in-out scale pulse via
	 * `.fez-synapse-breathe`). Off by default so the mark doesn't compete with active
	 * loaders on the same screen.
	 */
	readonly animated?: boolean;

	/** Optional `aria-label` override. Defaults to `'Filter EngineZ logo'`. */
	readonly ariaLabel?: string;

	/** Optional className for layout-context CSS hooks. */
	readonly className?: string;
}

/**
 * Internal — palette for `mode='primary'`. Sourced from `mark-primary.svg`; documented as
 * brand tokens but inlined here so the SVG renders correctly even in consumer surfaces that
 * haven't loaded `tokens.css`. The cyan halo uses `#22D3EE` (the `--accent` token) with
 * `#67E8F9` (`--accent-glow`) as the drop-shadow inner ring and `#0EA5C7` (`--accent-deep`)
 * as the outer.
 *
 * @internal
 */
const PRIMARY_PALETTE = {
	arcInner: '#7C7669',
	arcOuter: '#605C53',
	core: '#F1ECDF',
	coreGlow: '#67E8F9',
	dropShadow1: '#67E8F9',
	dropShadow2: '#0EA5C7',
	z: '#22D3EE',
	zOpacity: 0.7,
	zStroke: '#22D3EE',
} as const;

/**
 * Internal — palette for `mode='subdued'`. Sourced from `mark-subdued.svg`. Pure grayscale,
 * no glow. Outline-only Z; the core node is also outline-only.
 *
 * @internal
 */
const SUBDUED_PALETTE = {
	arcInner: '#56524A',
	arcOuter: '#3A3731',
	core: '#56524A',
	zStroke: '#56524A',
} as const;

/**
 * The canonical FilterEngineZ logomark.
 *
 * @example
 *   <Mark size={48} mode="primary" animated />
 *   <Mark size={16} />                              // favicon (outline auto-drops)
 *   <Mark size={12} noRings />                      // favicon, pure Z
 *   <Mark size={200} mode="subdued" />              // print / light surface
 */
export const Mark = (props: MarkProps): React.ReactElement => {
	const {
		animated: isAnimated = false,
		ariaLabel = 'Filter EngineZ logo',
		className,
		mode = 'primary',
		noRings: hasNoRings = false,
		size = 200,
	} = props;

	// Outline-drop heuristic: at favicon sizes the 1.6u stroke disappears into aliasing artifacts.
	// We render with `stroke-width=0` at small sizes so the fill carries the whole shape.
	const shouldDropOutline = size <= 16;

	if (mode === 'subdued') {
		const p = SUBDUED_PALETTE;

		return (
			<svg
				xmlns="http://www.w3.org/2000/svg"
				viewBox="0 0 100 100"
				width={size}
				height={size}
				role="img"
				aria-label={ariaLabel}
				className={className}
			>
				{!hasNoRings && (
					<>
						<path d="M 71.00 13.63 A 42 42 0 0 1 29.00 86.37" fill="none" stroke={p.arcOuter} strokeWidth="1.8" strokeLinecap="round" />
						<path d="M 64.50 75.11 A 29 29 0 0 1 35.50 24.89" fill="none" stroke={p.arcOuter} strokeWidth="1.8" strokeLinecap="round" />
						<path d="M 34.00 50.00 A 16 16 0 0 1 66.00 50.00" fill="none" stroke={p.arcInner} strokeWidth="2" strokeLinecap="round" />
					</>
				)}
				<g>
					<path d="M 21 14 L 86 14 L 86 24 L 22 24 L 14 24 L 14 21 Z" fill="none" stroke={p.zStroke} strokeWidth={shouldDropOutline ? 0 : 1.8} strokeLinejoin="miter" />
					<path d="M 86 24 L 86 34 L 23 76 L 22 76 L 22 69 L 88 24 Z" fill="none" stroke={p.zStroke} strokeWidth={shouldDropOutline ? 0 : 1.8} strokeLinejoin="miter" />
					<path d="M 14 76 L 78 76 L 86 76 L 86 76 L 76 86 L 14 86 Z" fill="none" stroke={p.zStroke} strokeWidth={shouldDropOutline ? 0 : 1.8} strokeLinejoin="miter" />
				</g>
				<circle cx="50" cy="50" r="3.2" fill="none" stroke={p.core} strokeWidth="1.4" />
			</svg>
		);
	}

	// Primary mode — cyan + glow
	const p = PRIMARY_PALETTE;
	const dropShadowFilter = `drop-shadow(0 0 1.20px ${p.dropShadow1}) drop-shadow(0 0 5.00px ${p.dropShadow2})`;
	const coreGlowFilter = `drop-shadow(0 0 2px ${p.coreGlow}) drop-shadow(0 0 6px ${p.coreGlow})`;

	return (
		<svg
			xmlns="http://www.w3.org/2000/svg"
			viewBox="0 0 100 100"
			width={size}
			height={size}
			role="img"
			aria-label={ariaLabel}
			className={className}
		>
			{!hasNoRings && (
				<>
					<path d="M 71.00 13.63 A 42 42 0 0 1 29.00 86.37" fill="none" stroke={p.arcOuter} strokeWidth="1.8" strokeLinecap="round" />
					<path d="M 64.50 75.11 A 29 29 0 0 1 35.50 24.89" fill="none" stroke={p.arcOuter} strokeWidth="1.8" strokeLinecap="round" />
					<path d="M 34.00 50.00 A 16 16 0 0 1 66.00 50.00" fill="none" stroke={p.arcInner} strokeWidth="2" strokeLinecap="round" />
				</>
			)}
			<g style={{ filter: dropShadowFilter }}>
				<path d="M 21 14 L 86 14 L 86 24 L 22 24 L 14 24 L 14 21 Z" fill={p.z} opacity={p.zOpacity} />
				<path d="M 86 24 L 86 34 L 23 76 L 22 76 L 22 69 L 88 24 Z" fill={p.z} opacity={p.zOpacity} />
				<path d="M 14 76 L 78 76 L 86 76 L 86 76 L 76 86 L 14 86 Z" fill={p.z} opacity={p.zOpacity} />
				{!shouldDropOutline && (
					<>
						<path d="M 21 14 L 86 14 L 86 24 L 22 24 L 14 24 L 14 21 Z" fill="none" stroke={p.zStroke} strokeWidth="1.6" strokeLinejoin="miter" />
						<path d="M 86 24 L 86 34 L 23 76 L 22 76 L 22 69 L 88 24 Z" fill="none" stroke={p.zStroke} strokeWidth="1.6" strokeLinejoin="miter" />
						<path d="M 14 76 L 78 76 L 86 76 L 86 76 L 76 86 L 14 86 Z" fill="none" stroke={p.zStroke} strokeWidth="1.6" strokeLinejoin="miter" />
					</>
				)}
			</g>
			<g
				className={isAnimated ? 'fez-synapse-breathe' : undefined}
				style={{ filter: coreGlowFilter, transformOrigin: '50px 50px' }}
			>
				<circle cx="50" cy="50" r="3.2" fill={p.coreGlow} />
				<circle cx="50" cy="50" r="1.6" fill={p.core} />
			</g>
		</svg>
	);
};
