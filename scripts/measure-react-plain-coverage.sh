#!/usr/bin/env bash
#
# measure-react-plain-coverage.sh — the measurement that authorizes narrowing an entry in
# `examples-react-plain`'s coverage exclusions (`vitest.coverage.config.ts`, pinned by
# `tests/tooling/reactPlainCoverageExclusions.test.ts`).
#
#     bash scripts/measure-react-plain-coverage.sh
#
# ── Why this is a WRAPPER and not a copy ────────────────────────────────────
#
# The measurement logic is generic apart from two strings: which package to run and which path
# prefix to summarize, and `assert-module-covered.mjs` and `summarize-coverage.mjs` are
# package-agnostic. So the shared half lives in `measure-package-coverage.sh` and both names are
# one-line wrappers. The vanilla name is kept verbatim because the register and its guard name it,
# and a rename would silently break those instructions. Extend, don't fork.
#
# ⚠ ONE SHARED ARTIFACT, AND IT FAILS CLOSED. `.coverage-probe/coverage-final.json` is a single
# path, so measuring react-plain overwrites a vanilla measurement and vice versa. That is safe
# rather than merely tolerable: `assert-module-covered.mjs` looks up the one report entry whose path
# ends with the module it was given, so a vanilla check run against a react-plain artifact finds
# nothing and REFUSES. Refusing on a stale measurement is precisely the behavior that guard exists
# for, so a per-package artifact would add a moving part without closing a hole.
#
set -uo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")/.."

exec bash scripts/measure-package-coverage.sh \
	examples-react-plain \
	'packages/examples-react-plain/src/**/*.{ts,tsx}' \
	'examples-react-plain/src'
