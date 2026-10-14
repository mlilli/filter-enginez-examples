#!/usr/bin/env bash
#
# measure-e2e-parallelism.sh — what does a given Playwright worker count actually cost?
#
# ── Why this exists ──────────────────────────────────────────────────────────
#
# The suite runs hundreds of registrations across seven dev servers, so its worker count is the
# biggest lever on its wall time — but a guess is not a basis for changing the gate everything
# depends on, and there are real reasons parallelism could bite here:
#
#   * Each wine test boots a 150k-record corpus over a Comlink worker. N workers means N concurrent
#     116 MB streams and N bitmap-index builds. Memory, not CPU, may be the binding constraint.
#   * `svelte-wine-server.spec.ts` documents that its boot can race the Vite DEV server's on-demand
#     SSR transforms and return a transient 500. Concurrency makes that strictly worse — which is why
#     that spec carries its own `retries`.
#
# So this measures instead of arguing. It runs ONE representative slice — the six wine spec files on
# chromium only — at several worker counts and prints the wall time of each. The table in the
# `workers` docblock of `playwright.config.ts` is its output, and the current `workers` value was
# chosen from it.
#
# ── Why the wine slice, and why chromium only ────────────────────────────────
#
# The wine files are the heaviest thing in the suite (`wineFlow.ts` is Playwright's own "slow test
# file" report at 5.5m per project) and the most likely to break under concurrency, since they are
# the ones competing for memory. If parallelism holds here it holds everywhere; if it fails, it
# fails here first and cheaply.
#
# Chromium only, because the question is "does concurrency work", not "how long is the suite" — and
# halving the measurement halves the time to an answer.
#
# The wine specs need the wine corpus that `pnpm test:e2e` uses, so run this on a machine where that
# suite already passes.
#
# ── Read the output as a RATIO, not as a projection ──────────────────────────
#
# Multiply nothing. The full suite has a different shape (many more, lighter tests), the dev servers
# boot once per invocation and that fixed cost is included in every row here, and your machine's
# core count is not this script's business. What the rows tell you is whether concurrency helps at
# all, where it stops helping, and whether anything goes RED on the way — which is the finding that
# matters most.
#
# Usage:  bash scripts/measure-e2e-parallelism.sh [workerCounts...]     (default: 1 2 4)
#
# Logs land in `tmp/gates/e2e-workers-<count>.log` (gitignored).

set -uo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")/.."

# shellcheck source=./lib/dev-servers.sh
. scripts/lib/dev-servers.sh

WORKER_COUNTS=("$@")
if [[ ${#WORKER_COUNTS[@]} -eq 0 ]]; then
	WORKER_COUNTS=(1 2 4)
fi

WINE_SPECS=(
	tests/e2e/wine.spec.ts
	tests/e2e/react-plain-wine.spec.ts
	tests/e2e/svelte-wine.spec.ts
	tests/e2e/vue-wine.spec.ts
	tests/e2e/angular-wine.spec.ts
	tests/e2e/vanilla-wine.spec.ts
)

printf '\033[1m── stopping anything on an e2e port ──\033[0m\n'
# Word-splitting is intended: the helper prints a space-separated list.
# shellcheck disable=SC2207
e2ePorts=($(node --input-type=module -e \
	"import { e2ePortsFromConfig } from './scripts/e2e-ports.mjs'; console.log(e2ePortsFromConfig().join(' '));"))
for port in "${e2ePorts[@]}"; do
	devServersKillPortHolders "$port"
done
sleep 1
if ! devServersRequireE2ePortsFree; then
	exit 1
fi
printf '  clear\n\n'

mkdir -p tmp/gates
results=()

for workers in "${WORKER_COUNTS[@]}"; do
	printf '\033[1m── %s worker(s) ──\033[0m\n' "$workers"

	startedAt=$SECONDS
	# `--project chromium` and the wine files only. `--workers` overrides the config.
	pnpm exec playwright test "${WINE_SPECS[@]}" --project=chromium --workers="$workers" \
		>"tmp/gates/e2e-workers-$workers.log" 2>&1
	exitCode=$?
	elapsed=$((SECONDS - startedAt))

	if [[ "$exitCode" -eq 0 ]]; then
		printf '  \033[32m%s\033[0m in %ss\n\n' 'green' "$elapsed"
		results+=("$workers|${elapsed}s|green")
	else
		# The words live in ARGUMENTS: an ANSI escape ending in `m` fuses with a following word and
		# cspell reads the pair as one misspelling.
		printf '  \033[31m%s\033[0m in %ss — tail of tmp/gates/e2e-workers-%s.log:\n' 'RED' "$elapsed" "$workers"
		tail -15 "tmp/gates/e2e-workers-$workers.log"
		printf '\n'
		results+=("$workers|${elapsed}s|RED")
	fi
done

printf '\033[1m── result ──\033[0m\n'
printf '  %-9s %-10s %s\n' 'workers' 'wall' 'verdict'
for row in "${results[@]}"; do
	IFS='|' read -r workers elapsed verdict <<<"$row"
	printf '  %-9s %-10s %s\n' "$workers" "$elapsed" "$verdict"
done
printf '\n'
printf '  A RED row is the finding, not a failure of the experiment — it says concurrency breaks\n'
printf '  something at that count, and the log names what. Read the ratio between GREEN rows; do\n'
printf '  not extrapolate it to the full suite (see this script'"'"'s header).\n'
