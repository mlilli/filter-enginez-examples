#!/usr/bin/env bash
#
# clear-angular-cache.sh — remove `packages/examples-angular/.angular/cache`.
#
# A one-line entry point so `pretest:e2e` can clear the cache without owning a copy of the path.
# The implementation lives in `lib/dev-servers.sh`; this is the door npm scripts can knock on.
#
# ── Why the e2e gate must clear it, and it is not belt-and-braces ────────────
#
# `@angular/build`'s dev server PRE-BUNDLES every linked workspace package into
# `.angular/cache/<version>/examples-angular/vite/deps/` — `@filter-enginez/examples-shared`,
# `core`, `brand`, `reactive-rxjs` and the rest. Vite keys that cache on the lockfile and the
# config, NOT on the contents of a linked package's source. So adding, renaming or removing an
# EXPORT in a workspace package leaves Angular importing a bundle that predates it, and the import
# resolves to `undefined` rather than failing.
#
# That is a runtime `TypeError` in whichever component called it, and it takes down every route
# rendering that component while leaving the rest of the app healthy — which reads as a product bug
# in a specific feature rather than as a stale cache.
#
# **No build-time gate can see it.** A stale export can turn every Angular spec red on every route
# that renders the affected component while `tsc --noEmit`, `ngc`, `ng build`, `ng test` and a
# cold-cache `ng serve` are all green — because every one of those either bundles from scratch or
# never executes the app. Only a browser against a WARM cache can see it, which is to
# say: only the e2e suite, and only when it is not the thing clearing the cache.
#
# ── Why not `prebundle: { exclude: [...] }` ─────────────────────────────────
#
# Excluding the workspace packages in `angular.json`'s dev-server options removes the class outright
# — the schema supports it, with zero `@filter-enginez` entries in `vite/deps` and the same ~10s to
# first response.
#
# It is not used because it breaks transitive resolution. Pre-bundled, the workspace packages'
# own third-party dependencies resolve from where those packages live; bundled into the app, Vite
# looks for them beside the app and does not find them — `Failed to resolve import "comlink"`,
# `"lz-string"`, `"fuse.js"`. `lz-string` is the URL serializer, so that is every route carrying
# `?f=`. Making it work needs those packages declared on `examples-angular`, which means a
# `pnpm install` and dependencies the app does not actually use — a bigger change than the
# problem, which this script's cheap clear already solves.
#
# Usage:  bash scripts/clear-angular-cache.sh
#
set -euo pipefail

# The script lives in `<repo>/scripts/`, so its parent is the repo root — no git required.
cd "$(dirname "${BASH_SOURCE[0]}")/.."

# shellcheck source=./lib/dev-servers.sh
. scripts/lib/dev-servers.sh

devServersClearAngularCache
