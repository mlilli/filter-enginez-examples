#!/usr/bin/env bash
#
# measure-vanilla-coverage.sh — the measurement `examples-vanilla`'s coverage register needs before
# an entry can be deleted (the debt register in `vitest.coverage.config.ts`, pinned by
# `tests/tooling/vanillaCoverageExclusions.test.ts`).
#
#     bash scripts/measure-vanilla-coverage.sh
#
# ── Why this is a WRAPPER, and why the name is kept ──────────────────────────
#
# `examples-react-plain` needs the same measurement for `src/lab/`, and the body is generic apart
# from two strings: which package to run and which prefix to summarize. So the body lives in
# `measure-package-coverage.sh` (as `summarize-coverage.mjs` and `assert-module-covered.mjs` are
# package-agnostic) and both callers are one-liners: extend, don't fork, because a fix applied to one
# copy of two reaches neither reliably.
#
# **The NAME does not change.** The register's comments, its tooling guard and
# `assert-module-covered.mjs`'s own refusal messages all name `measure-vanilla-coverage.sh`.
# Renaming it would silently break those instructions, which is a worse outcome than a short file.
#
# ⚠ The include glob below stays `**/*.ts`, NOT `**/*.{ts,tsx}` — `examples-vanilla` is the
# framework-less vertical and has no `.tsx` at all. Widening it would be harmless now and would
# quietly change what is measured the first time somebody adds one.
#
# Everything else about the register — the module inventory, which files no test even imports — is
# computable without coverage; the per-file percentages are not, and they are the only thing that
# can decide the list.
#
set -uo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")/.."

exec bash scripts/measure-package-coverage.sh \
	examples-vanilla \
	'packages/examples-vanilla/src/**/*.ts' \
	'examples-vanilla/src'
