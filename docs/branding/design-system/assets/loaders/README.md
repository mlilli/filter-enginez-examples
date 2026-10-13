# FilterEngineZ — Loaders

Three canonical loading animations. SVG + CSS only, no JavaScript at runtime.

## The three loaders

|       | Name               | Use for                                                                   | Don't use for                                                               |
| ----- | ------------------ | ------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| **A** | **Synaptic Orbit** | Ambient / passive loading — page load, idle background, route transitions | Short blocking spinners (<2s) — rhythm has no time to read                  |
| **B** | **Neural Cluster** | Active computation — query running, filter rebuild, processing            | Ambient/idle states — implies real work; using it for nothing feels anxious |
| **C** | **Brain Synapse**  | The signature loading moment — initial dataset fetch, dataset switch      | Spaces narrower than 480px, ambient or recurring states (use A or B)        |

## Colors

A and B have two canonical themes: **acid** (`#A3E635`) and **phosphor** (`#F97316`). Acid reads as
terminal/live-signal; phosphor reads as vintage-CRT/warm. Pick one per surface; don't mix on the same screen.

C is always the cyan brand `--accent` and does not take a theme.

## Where the assets live

- **`index.html`** — the source of truth showcase. Open in a browser. Has the color picker, all three loaders at hero
  scale, A and B at every utility size (32–192 px), and an inline integration guide.
- All animations are inline SVG inside the showcase. To use A or B in your app, copy the `<template id="tpl-a-orbit">`
  (or `tpl-b-cluster`) markup, the matching CSS keyframes + classes, and the six `--loader-*` CSS variables. That's it —
  no runtime JS required.
- In the demo apps, the React verticals render them from `@filter-enginez/brand` (`<SynapticOrbit />`,
  `<NeuralCluster />`, `<BrainSynapse />`); the other verticals render the same markup over the shared `ui-styles`
  keyframes, taking Brain Synapse's geometry from the brand package's `brain-synapse-geometry` export.

## Integration

```html
<style>
  :root {
    /* Pick a theme — acid or phosphor */
    --loader-glow: #d9f99d;
    --loader: #a3e635;
    --loader-deep: #84cc16;
    --loader-burnt: #65a30d;
    --loader-line: #1f2d14;
    --loader-node: #354820;
  }
  /* Paste keyframes from index.html source */
</style>

<!-- Paste the SVG template's contents inline -->
<svg viewBox="0 0 200 200" width="96" height="96">...</svg>
```

## Rules

- A and B: square aspect ratio only — viewBox is `0 0 200 200`. C is a wide `0 0 660 220` stage.
- Minimum render size for A and B: **32 px**. Below that the synapse flickers and node fires lose legibility.
- Maximum render size: no cap, but A and B feel best at **64–192 px** for in-product use and **240–320 px** for
  hero/splash moments.
- All animations respect `prefers-reduced-motion: reduce` — they freeze with the glow lit.
- GPU-only animation: `transform`, `opacity`, `filter`. Tested under 4% CPU on a mid-range laptop.
