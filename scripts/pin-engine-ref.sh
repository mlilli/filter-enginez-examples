#!/usr/bin/env bash
#
# pin-engine-ref.sh — record which engine commit this repo's lockfile was resolved against.
#
#     bash scripts/pin-engine-ref.sh
#
# Writes the HEAD commit of the sibling engine checkout (`../filter-enginez`) to `.github/engine-ref`.
# CI checks the engine out at exactly that commit, packs it, and installs with `--frozen-lockfile`,
# which verifies every engine tarball's integrity hash against `pnpm-lock.yaml`. The pin and the
# lockfile therefore have to move together:
#
#   1. commit the engine change in ../filter-enginez
#   2. bash scripts/pin-engine-ref.sh                       ← this script
#   3. (in ../filter-enginez) bash scripts/pack-engine-tarballs.sh
#   4. pnpm install here, so the lockfile picks up the new tarball hashes
#   5. commit `.github/engine-ref` and `pnpm-lock.yaml` together
#
# 🔴 It refuses a dirty engine tree. Tarballs packed from uncommitted changes cannot be reproduced
# from any commit, so pinning HEAD next to them would record a lockfile CI can never satisfy.
#
set -euo pipefail

# The script lives in `<repo>/scripts/`, so its parent is the repo root — no git required here.
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENGINE_ROOT="$REPO_ROOT/../filter-enginez"
REF_FILE="$REPO_ROOT/.github/engine-ref"

if ! git -C "$ENGINE_ROOT" rev-parse --is-inside-work-tree >/dev/null 2>&1; then
	printf '✗ %s is not a git checkout. Clone the engine beside this repo first.\n' "$ENGINE_ROOT"
	exit 1
fi

if [ -n "$(git -C "$ENGINE_ROOT" status --porcelain)" ]; then
	printf '✗ the engine checkout has uncommitted changes. Commit them first — a pin must name a commit\n'
	printf '  that reproduces the tarballs this lockfile was resolved against.\n'
	exit 1
fi

sha="$(git -C "$ENGINE_ROOT" rev-parse HEAD)"
printf '%s\n' "$sha" >"$REF_FILE"

printf '✓ pinned the engine at %s\n' "$sha"
printf '  Next: pack the engine tarballs, run pnpm install here, then commit .github/engine-ref with pnpm-lock.yaml.\n'
