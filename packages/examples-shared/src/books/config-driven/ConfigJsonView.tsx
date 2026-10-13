/**
 * `<ConfigJsonView />` — the raw `FilterEngineConfig` JSON, rendered beside the panel it generates.
 *
 * @remarks
 * The thesis-seller for the config-driven showcase: showing the
 * declarative JSON next to the auto-generated controls makes "the filter UI is a function of the
 * data" legible at a glance. Pure presentation — pretty-prints the config and styles it as a mono
 * code block; no engine coupling, so it reuses anywhere a config needs displaying.
 *
 * @packageDocumentation
 */

import type { FilterEngineConfig } from '@filter-enginez/core';

import { ScrollRegion } from '@filter-enginez/react-ui';
import { useMemo } from 'react';

/**
 * Props for `<ConfigJsonView />`.
 */
export interface ConfigJsonViewProps {
	/** Accessible label for the code region. Defaults to a generic description. */
	readonly ariaLabel?: string;
	/** The config to display. */
	readonly config: FilterEngineConfig;
	/**
	 * A concrete scroll cap for the code block (e.g. `'40vh'`, `'calc(100vh - 8rem)'`). A concrete
	 * value is required for the `overflow: auto` to actually scroll — a percentage can't resolve
	 * against an auto-height parent, so the block would grow unbounded and overflow its container.
	 * Defaults to `'60vh'`.
	 */
	readonly maxHeight?: string;
}

/**
 * The raw-config code block.
 */
export const ConfigJsonView = (props: ConfigJsonViewProps): React.ReactElement => {
	const { ariaLabel = 'Filter engine configuration (JSON)', config, maxHeight = '60vh' } = props;
	const json = useMemo(() => JSON.stringify(config, null, 2), [config]);

	return (
		// `<ScrollRegion>` (role="group" + tabIndex) makes this scrollable code block keyboard-reachable
		// — it holds only static text, so without a focusable container it'd be unreachable (WCAG 2.1.1).
		<ScrollRegion
			ariaLabel={ariaLabel}
			className="text-xs"
			style={{
				background: 'var(--gray-0)',
				border: '1px solid var(--gray-3)',
				borderRadius: 'var(--radius-md)',
				maxHeight,
				overflow: 'auto',
			}}
		>
			<pre
				style={{
					color: 'var(--gray-10)',
					fontFamily: 'var(--font-mono)',
					lineHeight: 1.6,
					margin: 0,
					padding: '1rem',
					tabSize: 2,
				}}
			>
				<code>{json}</code>
			</pre>
		</ScrollRegion>
	);
};
