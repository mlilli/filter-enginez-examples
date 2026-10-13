#!/usr/bin/env bash
#
# lib/dev-servers.sh — boot, await and stop the apps' dev servers. SOURCED, never executed.
#
# ── Why this exists ──────────────────────────────────────────────────────────
#
# Any script that brings app dev servers up to be looked at — a held browser pass, a screenshot
# sweep, a probe against two verticals at once — needs the same four things: refuse to start over
# a busy port, boot, wait until each answers, and stop cleanly. One copy means one answer to the
# question that matters most: **how a server is stopped**.
#
# **Kill-by-PORT is the shared behavior, and it is measured rather than assumed.**
# `pnpm --filter X dev` spawns turbo, which spawns vite, so killing the recorded `$!` signals the
# wrapper and orphans the child that actually holds the socket. A wrapper shell that backgrounds a
# listener grandchild, then `kill <recorded $!>`: the port stays served and `lsof -t` still names
# the grandchild. Killing by port frees it. What that establishes is the MECHANISM — a single
# `kill` signals one PID, not the process group.
#
# It matters because a stray dev server is not a cosmetic leak: one left on :4200 turns every
# Angular e2e spec red across healthy routes, and the failures point anywhere but the port.
#
# In this repository its callers are `scripts/clear-angular-cache.sh`, which `pretest:e2e` runs, and
# `scripts/measure-e2e-parallelism.sh`, which uses the port helpers; the boot, wait and stop helpers
# serve any script that needs to hold servers up.
#
# ── The roster format ────────────────────────────────────────────────────────
#
# Every caller declares its verticals as `id|port|workspacePackage` entries, mirroring
# `playwright.config.ts`'s `webServer` array — whose docblock calls its port map
# "canonical — every other reference should cite this list". Cite it; do not restate it.
#
#     VERTICALS=(
#         'vue|5178|@filter-enginez/examples-vue'
#         'angular|4200|@filter-enginez/examples-angular'
#     )
#
# ── Usage ────────────────────────────────────────────────────────────────────
#
#     source "$(dirname "${BASH_SOURCE[0]}")/lib/dev-servers.sh"    # from a script in scripts/
#
# Nothing here runs on source, sets shell options, or changes directory: a sourced file
# that mutates its caller's shell is the kind of action-at-a-distance these scripts exist
# to avoid. Callers keep their own `set` line and their own `cd`.
#
# cspell:ignore pkill -- the process-kill utility's real name.

# ── Preflight ───────────────────────────────────────────────────────────────

# Fail unless every named port is free, printing who holds each one.
#
# Both apps that pin `strictPort` turn an occupied port into a hard failure, but the message
# lands hundreds of lines into a dev-server log. Say it here instead.
#
# Arguments: one or more port numbers.
# Returns:   0 if all free, 1 otherwise.
devServersRequirePortsFree() {
	local port
	local didFindHolder=0

	for port in "$@"; do
		if lsof -nP -iTCP:"$port" -sTCP:LISTEN >/dev/null 2>&1; then
			printf '\033[31m  ✗ port %s is already in use.\033[0m Stop whatever holds it and re-run:\n\n' "$port"
			lsof -nP -iTCP:"$port" -sTCP:LISTEN
			printf '\n'
			didFindHolder=1
		fi
	done

	return "$didFindHolder"
}

# Fail unless EVERY port the e2e suite binds is free — the same preflight `pretest:e2e` runs.
#
# Deliberately broader than {@link devServersRequirePortsFree}: a caller that boots six
# verticals is one stray server away from the failure above, and the e2e port list is the
# authoritative statement of which sockets that suite needs. Use this when the roster is
# effectively "the whole suite"; use the narrow one when it genuinely is not.
#
# Returns: 0 if clear, 1 otherwise.
devServersRequireE2ePortsFree() {
	if ! node scripts/check-e2e-ports.mjs; then
		printf '\n  (that message comes from the same preflight `pnpm test:e2e` runs)\n'

		return 1
	fi

	return 0
}

# ── Angular's build cache ───────────────────────────────────────────────────

# Remove `packages/examples-angular/.angular/cache`, if present.
#
# A cached compilation of a symlinked workspace package outside the project root is exactly
# the seam where "a green gate over stale code" hides — see `clear-angular-cache.sh` for the
# mechanism. One cold rebuild is a cheap way to make a run mean what it says.
#
# Opt-in rather than automatic: it costs a slow first compile, and only a caller booting
# Angular to be BELIEVED needs it.
devServersClearAngularCache() {
	if [ -d packages/examples-angular/.angular/cache ]; then
		printf '\033[1m── clearing Angular build cache ──\033[0m\n'
		rm -rf packages/examples-angular/.angular/cache
		printf '  ✓ packages/examples-angular/.angular/cache removed (first compile will be slower)\n\n'
	fi
}

# ── Boot ────────────────────────────────────────────────────────────────────

# Start one vertical's dev server in the background, logging to `<logDir>/dev-<id>.log`.
#
# Backgrounded inside a subshell and deliberately NOT recorded: the recorded pid is the
# wrapper, not the socket holder (see this file's header), so recording it invites a
# cleanup that kills the wrong process. {@link devServersStopByPort} is the counterpart.
#
# Arguments: 1 id, 2 workspace package, 3 log directory.
devServersStart() {
	local id="$1" workspacePackage="$2" logDir="$3"

	(pnpm --filter "$workspacePackage" dev >"$logDir/dev-$id.log" 2>&1 &)
}

# Block until a vertical answers on its port, or give up and tail its log.
#
# `ng serve` runs the AOT template compile before it listens, so it is far slower to first
# byte than Vite. The default budget matches the 180s Playwright `webServer` timeout for the
# same reason rather than being tuned.
#
# Arguments: 1 id, 2 port, 3 log directory, 4 deadline in seconds (default 180).
# Returns:   0 once answering, 1 on timeout.
devServersWaitUntilAnswering() {
	local id="$1" port="$2" logDir="$3" deadlineSeconds="${4:-180}"
	local elapsedSeconds=0

	printf '  %-12s :%s ' "$id" "$port"

	while ((elapsedSeconds < deadlineSeconds)); do
		if curl -sf -o /dev/null --max-time 2 "http://127.0.0.1:$port/"; then
			printf '\033[32mup\033[0m\n'

			return 0
		fi
		sleep 2
		elapsedSeconds=$((elapsedSeconds + 2))
	done

	# The words live in ARGUMENTS, not inline in the format string. An ANSI escape ending in
	# `m` immediately followed by a word fuses into one token, and cspell reads that token as a
	# misspelling. `%s` keeps them apart — the existing idiom in these scripts, and the reason
	# this is not written the obvious way.
	printf '\033[31m%s\033[0m — tail of %s/dev-%s.log:\n' 'never came up' "$logDir" "$id"
	tail -20 "$logDir/dev-$id.log"

	return 1
}

# ── Stop ────────────────────────────────────────────────────────────────────

# Kill whatever holds a port. The port half of {@link devServersStopByPort}.
#
# **Split out because one caller knows a port and does NOT know whose it is.**
# `measure-e2e-parallelism.sh` discovers its port list by parsing `playwright.config.ts` (via
# `scripts/e2e-ports.mjs`), precisely so the canonical map is cited rather than restated —
# and a port learned that way carries no workspace package to hand the `pkill`
# backstop. Passing a fabricated one would either match nothing (dishonest) or match too much
# (dangerous, see the backstop note below). Killing by port alone is the honest operation, and
# the port is the thing that has to end up free.
#
# Arguments: 1 port.
devServersKillPortHolders() {
	local port="$1"
	local socketHolders

	# Not `xargs -r` — that flag is GNU-only and errors out on macOS's BSD xargs, which is
	# the machine these scripts run on.
	socketHolders="$(lsof -t -i ":$port" 2>/dev/null)"

	if [[ -n "$socketHolders" ]]; then
		# Word-splitting is intended: `lsof -t` emits one pid per line.
		# shellcheck disable=SC2086
		kill $socketHolders 2>/dev/null
	fi

	return 0
}

# Stop whatever holds a vertical's port, then sweep its wrapper processes.
#
# **Port first, name second.** The port is the thing we need free, so it is the thing we
# assert on; `pkill -f` follows only as a backstop for the parents that would otherwise
# linger. Reversing the order leaves the socket holder running.
#
# **The backstop matches the whole invocation, not the bare package name**, and that
# narrowing is deliberate. `pkill -f` tests the pattern against every process's full command
# line, so a bare `@filter-enginez/examples-vue` also matches any shell, editor or other
# process that merely MENTIONS the package — and killing one of those can take the calling
# run down with it.
# `pnpm --filter <pkg> dev` is the exact command {@link devServersStart} issues, so it still
# reaps the intended wrapper and nothing else.
#
# Arguments: 1 port, 2 workspace package.
devServersStopByPort() {
	local port="$1" workspacePackage="$2"

	devServersKillPortHolders "$port"

	pkill -f "pnpm --filter $workspacePackage dev" 2>/dev/null

	return 0
}

# Report any port still held after a stop, naming it as an e2e hazard.
#
# Worth printing rather than swallowing: a port that survived cleanup is invisible until it
# fails a suite somewhere else.
#
# Arguments: 1 id, 2 port.
# Returns:   0 if free, 1 if still held.
devServersReportStillHeld() {
	local id="$1" port="$2"

	if lsof -t -i ":$port" >/dev/null 2>&1; then
		printf '  \033[31m:%s (%s) is STILL held — stop it before the next e2e run\033[0m\n' "$port" "$id"

		return 1
	fi

	return 0
}

# ── Hold ────────────────────────────────────────────────────────────────────

# Block so the caller's cleanup trap stays armed while a human uses the servers.
#
# `read` rather than `wait`: {@link devServersStart} disowns its children, so the calling
# shell has no job to wait on and `wait` would return immediately. The TTY guard matters
# too — with stdin redirected, `read` also returns at once, and without the guard the
# cleanup would fire before anyone had seen anything.
devServersHoldUntilInterrupted() {
	if [[ -t 0 ]]; then
		read -r -d '' _ignoredHoldInput
	else
		printf '  \033[33m(stdin is not a TTY — stopping now. Re-run in a terminal for the live pass.)\033[0m\n'
	fi
}
