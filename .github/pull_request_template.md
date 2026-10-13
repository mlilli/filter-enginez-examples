<!--
⚠ Pull requests are accepted from COLLABORATORS ONLY — a native GitHub setting,
not an auto-close bot. See CONTRIBUTING.md. If you are not a collaborator, open
an issue first; a PR you cannot open is less frustrating than one that is closed
unread.

The checklist below is short on purpose. CI already enforces typecheck, lint,
markdown lint, Prettier, cspell, 100% unit coverage and the bundle-size budgets,
so asking you to confirm those by hand would be theatre. What is listed here is
only what CI CANNOT see.
-->

# What changed, and why

<!-- The "why" is the part that survives. A commit in this repo is expected to
explain the reasoning, not restate the diff. -->

## How it was verified

<!-- Name the commands you ran and what they said. "CI is green" is not a
verification claim: CI has no end-to-end job at all, because the wine suites
need the local-only real wine corpus. Run `pnpm test:e2e` locally for any
change a user can see, and say what it reported. -->

---

## Things CI cannot check

- [ ] **If this touched a `pnpm-workspace.yaml` override**, the replacement range still carries an upper major bound,
      and the lockfile was re-resolved. An unbounded override resolves to the highest match, which can silently cross a
      major and rename an API the SSR routes depend on.
- [ ] **If this changed how a CommonJS dependency is imported**, it was checked in _both_ plain Node ESM and an SSR
      runtime. These disagree: a named import throws in Node, a default import resolves to `undefined` under Vite SSR,
      and bundlers hide both.
- [ ] **If this depends on an engine change**, the engine change landed first, and `.github/engine-ref` was moved with
      `bash scripts/pin-engine-ref.sh` and committed together with `pnpm-lock.yaml`. CI checks out the engine at that
      pin, so an app change that needs newer engine code fails there until the pin moves.
- [ ] **If this added an `auditConfig.ignoreGhsas` entry**, it has a machine-checkable premise in
      `scripts/recheck-accepted-advisories.mjs`. An acceptance with no premise that can expire is a claim that stops
      being checked the day it stops being true.
- [ ] **If this added a guard**, it was run against a deliberately broken tree and observed to FAIL. A check that does
      not run looks exactly like a check that passes.

## Breaking changes

<!-- Delete if none. Otherwise: what breaks — a route, a URL parameter, a script
or a command someone runs. Nothing in this repository is published, so there
are no changesets here. -->
