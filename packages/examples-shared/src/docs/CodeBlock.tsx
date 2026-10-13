/**
 * `<CodeBlock />` — a keyboard-accessible, horizontally-scrollable code sample.
 *
 * @remarks
 * A `<pre>` with `overflow-x: auto` is a scrollable region; on narrow viewports axe's
 * `scrollable-region-focusable` rule (WCAG 2.1.1) requires it to be keyboard-reachable. Marking it
 * `role="group"` + `tabIndex={0}` makes it focusable/scrollable via the keyboard and satisfies the
 * shared `jsx-a11y/no-noninteractive-tabindex` allowance for `group` (same contract as react-ui's
 * `ScrollRegion`).
 *
 * @packageDocumentation
 */

/** Props for {@link CodeBlock}. */
export interface CodeBlockProps {
	/** Accessible name for the scrollable region. */
	readonly ariaLabel?: string;
	/** The code to display. */
	readonly code: string;
}

/**
 * A focusable, scrollable `<pre><code>` block styled with `.fe-doc-code`.
 */
export const CodeBlock = ({ ariaLabel = 'Code sample', code }: CodeBlockProps): React.ReactElement => {
	return (
		<pre className="fe-doc-code" role="group" tabIndex={0} aria-label={ariaLabel}>
			<code>{code}</code>
		</pre>
	);
};
