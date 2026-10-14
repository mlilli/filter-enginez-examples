/**
 * Reading a stylesheet's cascade layers as text, for guards that assert WHERE a rule sits.
 *
 * @remarks
 * Shared by `cascadeLayers.test.ts` (element defaults must be in `@layer base`) and
 * `touchInputZoom.test.ts` (the touch font-size floor must be in `@layer base`, where its `!important`
 * outranks everything else). One reading of the brace structure, so the two guards cannot disagree
 * about which layer a rule is in.
 *
 * @packageDocumentation
 */

/**
 * Strip CSS comments, so prose describing a selector is never mistaken for one.
 *
 * @remarks
 * The shared sheets carry long explanatory comments that name the very selectors under test —
 * including the exact strings the guards search for. A test that matches documentation can pass
 * against a broken config.
 *
 * @param css - Raw stylesheet text.
 * @returns The text with `/* … *\/` blocks removed.
 */
export function stripCssComments(css: string): string {
	return css.replace(/\/\*[\s\S]*?\*\//gu, '');
}

/**
 * Find the layer enclosing a byte offset, tracking brace depth.
 *
 * @param css - Comment-stripped stylesheet text.
 * @param offset - Index of the rule of interest.
 * @returns The enclosing layer name, or `null` when the rule is unlayered.
 */
export function enclosingLayer(css: string, offset: number): string | null {
	const token = /@layer\s+([\w-]+)\s*\{|\{|\}/gu;
	const open: { depth: number; name: string }[] = [];
	let depth = 0;
	let match: RegExpExecArray | null = token.exec(css);

	while (match !== null && match.index < offset) {
		if (match[0].startsWith('@layer')) {
			open.push({ depth, name: match[1] ?? '' });
			depth += 1;
		} else if (match[0] === '{') {
			depth += 1;
		} else {
			depth -= 1;

			if (open.length > 0 && open[open.length - 1]?.depth === depth) {
				open.pop();
			}
		}

		match = token.exec(css);
	}

	return open.length > 0 ? (open[open.length - 1]?.name ?? null) : null;
}
