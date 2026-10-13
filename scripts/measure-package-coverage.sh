#!/usr/bin/env bash
#
# measure-package-coverage.sh — run ONE package's suite under coverage and leave the artifact that
# `assert-module-covered.mjs` reads. The shared body of `measure-vanilla-coverage.sh`, lifted out when
# `examples-react-plain`'s `src/lab/` needed the same measurement.
#
#     bash scripts/measure-package-coverage.sh <package-dir> <include-glob> <summary-prefix>
#
# Prefer the named wrappers — `measure-vanilla-coverage.sh`, `measure-react-plain-coverage.sh` —
# which are how `vitest.coverage.config.ts` and the tooling guards refer to this measurement.
#
# ⚠ `--coverage` is slow and memory-hungry over a whole vertical's suite. Run it on a workstation
# with headroom, not on a constrained CI runner or a small virtual machine.
#
# ── Why it is shaped the way it is ───────────────────────────────────────────
#
# It is a PROBE, not the gate. Thresholds are pinned to 0 so the exit code means "the tests passed"
# rather than "coverage met policy". Nothing here touches `vitest.config.ts`; the real config edit is
# deleting a register entry, after this output has been read.
#
# 🔴 The root config's `coverage.thresholds` are GLOBAL aggregates — there is no `perFile` — so a
# module brought in scope at 94% does not fail "that file", it drags the whole repo's number under
# 100 and turns the pre-push gate red. That makes the constraint stricter than it first reads:
# everything NOT excluded must already be at exactly 100%, so the list is settled by measurement
# rather than by arguing which modules are "presentation".
#
set -uo pipefail

# Resolved from this script's own location rather than from version control, so the measurement
# runs the same way in a fresh clone, an exported tarball or a checkout with no `.git` at all.
cd "$(dirname "${BASH_SOURCE[0]}")/.."

PACKAGE="${1:?usage: measure-package-coverage.sh <package-dir> <include-glob> <summary-prefix>}"
INCLUDE_GLOB="${2:?missing include glob}"
SUMMARY_PREFIX="${3:?missing summary prefix}"

REPORT_DIR="coverage/${PACKAGE}-probe"

# ── Why a dry-run mode exists ────────────────────────────────────────────────
#
# Generalizing this script meant editing a measurement that is expensive to run: a refactor of the
# argument plumbing that is only ever checked by a full coverage run is a claim with no cheap
# evidence behind it, and its failure would surface mid-task looking like a coverage problem rather
# than an argument-plumbing one.
#
# `MEASURE_DRY_RUN=1` prints the resolved invocation instead of running it, so both wrappers can be
# checked to produce the right arguments in under a second. It is not a substitute for the real run;
# it is the difference between a refactor that was checked and one that was merely believed.
if [ "${MEASURE_DRY_RUN:-}" = '1' ]; then
	printf 'package=%s\nreport_dir=%s\ninclude=%s\nsummary_prefix=%s\n' \
		"$PACKAGE" "$REPORT_DIR" "$INCLUDE_GLOB" "$SUMMARY_PREFIX"

	exit 0
fi

printf '\033[1m── running %s'"'"'s suite with coverage (this is the slow part) ──\033[0m\n\n' "$PACKAGE"

pnpm exec vitest run "packages/$PACKAGE" \
	--coverage \
	--coverage.reportsDirectory="$REPORT_DIR" \
	--coverage.reporter=json \
	--coverage.reporter=text-summary \
	--coverage.include="$INCLUDE_GLOB" \
	--coverage.exclude='**/*.test.{ts,tsx}' \
	--coverage.thresholds.lines=0 \
	--coverage.thresholds.branches=0 \
	--coverage.thresholds.functions=0 \
	--coverage.thresholds.statements=0
VITEST_STATUS=$?

if [ "$VITEST_STATUS" -ne 0 ]; then
	printf '\n\033[31m  vitest exited %s — the tests themselves failed, so the numbers below are not trustworthy.\033[0m\n' "$VITEST_STATUS"
fi

if [ ! -f "$REPORT_DIR/coverage-final.json" ]; then
	printf '\n\033[31m  no %s/coverage-final.json was written — nothing to summarize.\033[0m\n' "$REPORT_DIR"

	exit 1
fi

# 🔴 The artifact is COPIED out of `coverage/`, and that is not tidiness — it is the whole reason
# `assert-module-covered.mjs` can be trusted.
#
# `coverage/` belongs to the root `pnpm test:coverage` run, whose provider CLEANS its reports
# directory before writing. So with the artifact left there, the natural sequence — measure, run
# the gates, then edit the exclusion list — would destroy its own authorization halfway through: a
# measurement taken minutes earlier would be gone by the time it was needed, and the guard would
# report "no measurement", which reads as "you forgot to measure" rather than "something else deleted
# it".
#
# Fixture assertions cannot find that, because they CONSTRUCT the artifact themselves. A fixture that creates a file cannot discover that a different
# tool removes it.
#
# `.coverage-probe/` is owned by these scripts alone, so nothing else's lifecycle reaches it.
STABLE_DIR='.coverage-probe'
mkdir -p "$STABLE_DIR"
cp "$REPORT_DIR/coverage-final.json" "$STABLE_DIR/coverage-final.json"

printf '\n\033[1m── per-file, worst first ──\033[0m\n'
node scripts/summarize-coverage.mjs "$REPORT_DIR/coverage-final.json" "$SUMMARY_PREFIX"

printf '\033[2m  %s/ is throwaway, and inside the already-gitignored coverage/; delete it whenever.\033[0m\n' "$REPORT_DIR"
printf '\033[2m  %s/coverage-final.json is the copy `assert-module-covered.mjs` reads — it outlives `pnpm test:coverage`.\033[0m\n\n' "$STABLE_DIR"
