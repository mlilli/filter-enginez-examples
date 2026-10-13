/**
 * `@filter-enginez/examples-shared/devtools` — the engine's time-travel surface, belonging to no
 * dataset and no state library.
 *
 * @remarks
 * **What this is not.** It is not Redux DevTools, and it does not need Redux. `engine.core.devtools`
 * is an LRU action log plus a time-travel cursor implemented in `@filter-enginez/core` — the same
 * `ActionLog` / `TimeTravel` / `Replay` / `Diff` modules every vertical already boots. The Redux-free
 * React app has always carried an identical panel for exactly that reason. Core's separate
 * `ReduxDevtoolsBridge` pipes the same log out to the browser EXTENSION over JSON-RPC; that is an
 * optional export channel, orthogonal to this.
 *
 * That distinction is what makes this slice worth its own subpath. It lived under `./wine` and was
 * mounted on one route of six, which read as "time travel is a wine feature". It is an ENGINE feature,
 * and the engine is what all six verticals share.
 *
 * ### Porting it to the non-React verticals
 *
 * Only the view is React. The wiring below is thirty lines of framework-agnostic logic over a public
 * core API, and the styling is already shared — `ui-styles` carries the whole `.fe-devtools-*` block
 * (panel, timeline, rows, dots, the computing dim). A Svelte / Vue / Angular / vanilla port needs the
 * markup and the cursor bookkeeping, and nothing else.
 *
 * @packageDocumentation
 */

export { DevtoolsPanel, type DevtoolsPanelProps } from './DevtoolsPanel.js';
export { HeaderIconButton, type HeaderIconButtonProps } from './HeaderIconButton.js';
export { TimeTravelControls, type TimeTravelControlsProps } from './TimeTravelControls.js';
