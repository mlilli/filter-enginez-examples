/**
 * `<DevtoolsPanel />` — the wine route's binding of the shared devtools panel.
 *
 * @remarks
 * The implementation lives in `../devtools`, which is neutral: the action log and the time-travel
 * cursor are `@filter-enginez/core`'s, not any dataset's and not Redux's. This file is the two-line
 * wiring that hands the shared panel WINE's busy tracker, so the two React wine shells render a plain
 * `<DevtoolsPanel open onClose />`. Their undo / redo / toggle header cluster is the shared
 * `<TimeTravelControls />` from the same module.
 *
 * @packageDocumentation
 */

import { DevtoolsPanel as SharedDevtoolsPanel } from '../devtools/index.js';
import { markUserAction, useIsEngineBusy } from './engineBusy.js';

/**
 * Props for `<DevtoolsPanel />`.
 */
export interface DevtoolsPanelProps {
	/** Called when the user dismisses the panel. */
	readonly onClose: () => void;
	/** Whether the panel is currently visible. Toggled from the page header. */
	readonly open: boolean;
}

/**
 * The wine devtools panel — the shared surface, bound to the wine route's busy tracker.
 */
export const DevtoolsPanel = (props: DevtoolsPanelProps): React.ReactElement | null => {
	const { onClose, open: isOpen } = props;
	const isComputing = useIsEngineBusy();

	return (
		<SharedDevtoolsPanel
			isComputing={isComputing}
			markBusy={markUserAction}
			onClose={onClose}
			open={isOpen}
		/>
	);
};
