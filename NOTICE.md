# NOTICE

Filter EngineZ Copyright 2026 Mike Lilli

This product is licensed under the **Apache License, Version 2.0**. The full text is [`LICENSE.md`](./LICENSE.md).

The project is licensed under Apache-2.0 alone, so its express patent grant applies to every consumer.

This file carries the attribution obligations of the third-party components below, and — per Apache-2.0 §4(d), which
requires a NOTICE to travel with redistributions — the trademark and contribution terms. The SIL Open Font License
carries its own conditions on the bundled fonts.

---

## Trademarks

The license covers the **code**. It does not grant rights in the **Filter EngineZ** name, the logomark, the wordmark, or
the other brand assets in [`docs/branding/`](./docs/branding/) and `@filter-enginez/brand`. Apache-2.0 §6 says this
explicitly.

You may say your project uses Filter EngineZ. Please don't use the name or mark in a way that suggests endorsement, or
as the name of a fork.

## Contributions

Unless you state otherwise, any contribution intentionally submitted for inclusion in this work shall be licensed under
Apache-2.0 as above, without additional terms or conditions. See [`CONTRIBUTING.md`](./CONTRIBUTING.md) — this project
is maintainer-gated, and pull requests are restricted to collaborators.

---

## Bundled fonts — SIL Open Font License 1.1

**These are the only components here that are NOT covered by this project's own license.** They ship inside the
unpublished `@filter-enginez/brand` package, which serves them to every example app, so they reach anyone who deploys a
build of one:

| Font           | Directory               | Source file                      | Served subset                       | Copyright holder                   | Reserved Font Name |
| -------------- | ----------------------- | -------------------------------- | ----------------------------------- | ---------------------------------- | ------------------ |
| Inter          | `fonts/inter/`          | `Inter-VariableFont.ttf`         | `Inter-Subset.woff2`                | The Inter Project Authors          | none declared      |
| JetBrains Mono | `fonts/jetbrains-mono/` | `JetBrainsMono-VariableFont.ttf` | `JetBrainsMono-Subset.woff2`        | The JetBrains Mono Project Authors | none declared      |
| Orbitron       | `fonts/orbitron/`       | `Orbitron-VariableFont_wght.ttf` | `FilterEngineZDisplay-Subset.woff2` | The Orbitron Project Authors       | **"Orbitron"**     |

All three carry their own `OFL.txt`. The unmodified `.ttf` files live under `packages/brand/src/fonts/` and
`docs/branding/design-system/fonts/` — **both** trees, because both redistribute them. The sites serve the subsets
instead: WOFF2 files that `scripts/subset-brand-fonts.mjs` writes from the `.ttf` beside each, keeping every variation
axis and the characters the sites render. Each subset sits in its source font's directory, under that font's `OFL.txt`.

**Each font gets its own directory**, because every font's `OFL.txt` carries a different copyright line — and, as the
table shows, they do not even agree on whether a Reserved Font Name exists. A single flat `fonts/OFL.txt` could only
ever be correct for one of the three and would silently misattribute the other two.

Three conditions of the OFL are worth stating plainly, because they are easy to breach by accident:

1. **The license text must travel with the fonts.** Any redistribution — including an npm tarball or a deployed build
   that serves the fonts — must carry the corresponding `OFL.txt`. Every site deployed from this repository serves each
   font's license at `/licenses/fonts/<font>/OFL.txt`; the deploy job in `.github/workflows/ci.yml` adds them.
2. **The fonts may not be sold on their own.** They may be bundled and sold as part of a larger work; they may not be
   the product.
3. **A modified font may not keep its Reserved Font Name.** A subset is a modified font, so a subset of a font that
   declares a Reserved Font Name has to be renamed. Of the three, only Orbitron declares one. Its subset is named
   **Filter EngineZ Display** (PostScript name `FilterEngineZDisplay`) in every name record that names the family, and
   the stylesheets ask for it by that name; its copyright notice, which the license requires to stay, still credits The
   Orbitron Project Authors. Inter and JetBrains Mono reserve no name, and their subsets keep their own.

Filter EngineZ does not sell the fonts. It serves subsets of all three, under their licenses as described above, and
redistributes the unmodified files for the design system.

---

## Runtime dependencies

Every package listed keeps its own license. Reproduced here because several are Apache-2.0, whose §4 attribution
requirement applies to redistribution — relevant to any deployed build of an example app.

**The engine.** Every example app bundles the `@filter-enginez/*` engine packages, and with them the engine's own
runtime dependencies (`roaring-wasm`, `fuse.js`, `comlink`, `@preact/signals-core`, `rbush`, `zod` and others). Those
are attributed in the engine repository's [`NOTICE.md`](https://github.com/mlilli/filter-enginez/blob/main/NOTICE.md),
which ships inside each engine package.

**Apache License 2.0** — full text in [`LICENSE.md`](./LICENSE.md), which is also this project's license:

- `rxjs` — the Angular app's reactive surface
- `roaring-wasm` — a direct dependency of the SvelteKit app's server tier, besides reaching every app through the engine

**MIT** — each project's own license text ships in its npm package under `node_modules/<pkg>/LICENSE`; copyright remains
with each project.

- the app frameworks and routers — `react`, `react-dom`, `react-router`, `vue`, `vue-router`, `svelte`, `@sveltejs/kit`
  and the `@angular/*` packages
- `@reduxjs/toolkit` and `react-redux` — the RTK app's state layer
- `radix-ui` and `@radix-ui/react-toast` — accessible primitives in `@filter-enginez/react-ui` and the RTK app
- `@dnd-kit/*`, `recharts`, `react-hook-form`, `clsx`, `tailwind-merge` and `tailwindcss-animate` — the RTK app's UI
- `msw` — the mock API every app serves its datasets through in development
- `@preact/signals-core` — used directly by the vanilla app

**Other permissive licenses:** `leaflet` (BSD-2-Clause) draws the geo-radius maps; `lucide-react` (ISC) supplies the RTK
app's icons; `tslib` (0BSD) is the Angular app's TypeScript runtime helper.

Development-only dependencies (TypeScript, Vite, Vitest, Playwright, ESLint and their plugins, the build tooling) are
not redistributed and are not listed here.

---

## Mock data

The datasets in `@filter-enginez/mock-data` are **synthetic** — generated by seeded procedural generators in the engine
repository's `packages/mock-data/src/*/generate.ts`, not scraped or copied from any third party. Metro median prices
approximate public 2024 Zillow Home Value Index figures as distribution parameters only; no Zillow data is included. The
books generator likewise uses public reference distributions to shape synthetic records.

The wine generator's tables are aggregate statistics measured from the
[Kaggle "Wine Reviews"](https://www.kaggle.com/datasets/zynicide/wine-reviews) dataset by zackthoutt: how many reviews
fall in each origin, varietal, score and price band, vintage ages, and how often generic tasting words appear. Place and
grape names are facts and the counts are statistics; no review text, wine title, winery name or taster name is included,
and no record of the dataset can be reconstructed from them. Producer names and tasting notes are invented. The wine
demos generate their 150,000 wines from these tables in the browser.

### Optional real wine data (not distributed)

For local development, `pnpm regen:wine:real --accept-data-license` in the engine repository downloads the
[Kaggle "Wine Reviews"](https://www.kaggle.com/datasets/zynicide/wine-reviews) dataset by zackthoutt, scraped from
[WineEnthusiast](https://www.winemag.com/) in 2017, and converts it to JSON on that machine. That dataset is licensed
[CC BY-NC-SA 4.0](https://creativecommons.org/licenses/by-nc-sa/4.0/), and its review text and taster names are
WineEnthusiast's content. **None of it is part of this project or covered by its license.** It is gitignored, absent
from every published package, and stripped from the example apps' production builds; anything distributed from this
project uses the synthetic generators only. If you run the import, the dataset's terms apply to your copy: attribution,
non-commercial use only, and the same license for anything you adapt from it.
