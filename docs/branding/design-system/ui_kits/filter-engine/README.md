# Filter EngineZ — UI Kit

A high-fidelity interactive mockup of the Filter EngineZ demo apps' filter shell. One product, three example datasets
(real estate, wine, books) reachable via the top-nav dataset switcher.

## Files

- `index.html` — the running prototype. Loads React + Babel via CDN, mounts `App.jsx`.
- `App.jsx` — top-level app shell + route state, dataset switcher, undo/redo history, devtools panel toggle.
- `Header.jsx` — fixed app header with wordmark, dataset switcher, undo/redo, devtools toggle.
- `Sidebar.jsx` — filter panel: collapsible `FilterSection` groups with active-count badges, `CheckboxOption` rows with
  hover/selected/zero-result states, and a dual-thumb `RangeSlider` with histogram overlay.
- `ActiveChips.jsx` — pill-shaped active-filter chips bar.
- `ResultsGrid.jsx` — responsive result-card grid (`ResultCard`: icon tile + price + title + attribute row) with the
  ticking result counter.
- `BrainSynapseLoader.jsx` — the signature loader.
- `Loaders.jsx` — the Synaptic Orbit and Neural Cluster loaders.
- `Mark.jsx` — the canonical logomark.
- `Icon.jsx` — a small curated set of Lucide-style inline SVG icons (stroke 1.75, `currentColor`).
- `DevtoolsPanel.jsx` — slide-out devtools drawer with action log and time-travel scrubber.
- `data.js` — three hardcoded datasets (real estate, wine, books) and their filter-rule defs.
- `styles.css` — the kit's component styles over the design tokens.

## What's interactive

- Click filter options → chips appear in active-filters bar, result count ticks down.
- Click × on a chip → option deselects, count ticks back up.
- Click "Clear all" → all filters drop.
- Switch dataset via the top nav → filters + results swap, brain-synapse loader plays briefly.
- Toggle devtools (top-right button) → drawer slides in from the right, action log scrolls.
- Click undo/redo or press Cmd-Z / Cmd-Shift-Z → step backwards/forwards through filter changes.
- Click a stop on the devtools scrubber → jump the filter state to that point in the action history.

## What's simulated

- Filter-option result counts (e.g. "Burgundy · 147") are fixed values in `data.js`, not recomputed from the active
  rules, and the result count is an approximation (`simulateCount` in `App.jsx`) rather than engine output.
- The "zero-result" disabled treatment appears on the options whose fixed count is 0, for illustration; it is not a live
  computation.
