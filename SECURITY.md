# Security Policy

## Supported versions

Nothing in this repository is published: every package is private, and the apps are demonstrations of the engine. There
are no release lines here, so only `main` is supported.

The published code is the engine, in [`filter-enginez`](https://github.com/mlilli/filter-enginez). Its
[security policy](https://github.com/mlilli/filter-enginez/blob/main/SECURITY.md) covers the `@filter-enginez/*`
packages and their supported versions.

## Reporting a vulnerability

**Please do not open a public GitHub issue for security problems.**

Report privately instead:

- **If the problem is in an engine package** — even if you found it through one of these apps — report it against the
  engine: <https://github.com/mlilli/filter-enginez/security/advisories/new>.
- **If it is confined to this repository** — use the "Report a vulnerability" button under this repository's
  **Security** tab, or <https://github.com/mlilli/filter-enginez-examples/security/advisories/new>.
- **Email** — [security@filterenginez.com](mailto:security@filterenginez.com), or the author address in
  [`README.md`](./README.md) if that alias does not answer.

If you are not sure which repository the bug lives in, report it to either one and I will take it from there. Please
include the app or package, the commit, the browser or runtime, a minimal reproduction or proof of concept, and the
impact you believe it has.

## What to expect

This is a solo-maintained project, so there is no guaranteed response time, but security reports come first. You can
expect an acknowledgment, a good-faith assessment of severity, a fix once the problem is confirmed, and credit in the
advisory if you would like it (or anonymity if you prefer).

## Scope

The apps, the shared UI packages, and the `examples-server` demo endpoint are demonstrations, not a shipped product.
Problems confined to them are handled as ordinary bugs unless they reveal a defect in an engine package — then report
them privately against the engine, as above.

## Dependency release age

A dependency version is installed here only once it is 7 days old. `minimumReleaseAge: 10080` in
[`pnpm-workspace.yaml`](./pnpm-workspace.yaml) makes pnpm refuse a younger version, both when it resolves one
(`pnpm add`, `pnpm update`) and when it verifies an existing lockfile (`--frozen-lockfile` included). Dependabot's
GitHub Actions updates wait the same 7 days (`cooldown.default-days` in
[`.github/dependabot.yml`](./.github/dependabot.yml)); `tests/tooling/releaseAgeCooldown.test.ts` keeps that cooldown at
least as long as the quarantine. npm dependencies here are updated by hand, because Dependabot cannot resolve the engine
tarballs this workspace installs.

When the fix for an advisory is younger than 7 days, the quarantine refuses it: asking for the exact version fails with
`ERR_PNPM_NO_MATURE_MATCHING_VERSION`, and a range resolves to the newest version that is old enough, which predates the
fix. To take the fix without waiting:

1. Exempt the exact patched version in `pnpm-workspace.yaml`, with a comment naming the advisory:

   ```yaml
   minimumReleaseAgeExclude:
     # GHSA-xxxx-xxxx-xxxx: fixed in 1.2.3
     - 'some-package@1.2.3'
   ```

   List one version, or a union of exact versions (`'some-package@1.2.3 || 1.2.4'`) when the fix needs two. pnpm rejects
   a range, and a bare package name would exempt every later release of the package too.

2. Install the patched version: `pnpm update some-package` for a direct dependency, or an `overrides` floor in
   `pnpm-workspace.yaml` for a transitive one. Commit the lockfile together with the exemption.
3. Delete the entry once the lockfile has moved past that version, or once the version is more than 7 days old, then run
   `pnpm install --frozen-lockfile`: it passes only if nothing in the lockfile still needs the exemption.

## Accepted advisories

A small set of advisories are deliberately suppressed from `pnpm audit` via `auditConfig.ignoreGhsas` in
[`pnpm-workspace.yaml`](./pnpm-workspace.yaml). Each sits on a development or build-tooling path or in a framework
feature the apps do not use, and nothing in this repository is published. Last reviewed 2026-11-05.

Suppressing an advisory hides it, including a high one, so each acceptance has a machine-checkable premise, and
something fails when that premise expires. Where an entry below says **no fix exists**, the latest published version of
the package is the vulnerable one: there is nothing to upgrade to, and an `overrides` pin cannot invent a release.

```bash
node scripts/recheck-accepted-advisories.mjs   # exits non-zero the day any premise below stops holding
```

Run it whenever `pnpm audit`'s counts change. `tests/tooling/acceptedAdvisoryParity.test.ts` keeps all three records —
the suppression list, this table, and that script's preconditions — naming the same set, so an acceptance cannot exist
without a stated premise. It also asserts the two premises that need no network: that `.markdownlint-cli2.yaml` still
enables no math extension, which is what makes the KaTeX advisory unreachable here, and that `examples-sveltekit` uses
neither `use:enhance` nor `setHeaders`, which is what makes the two SvelteKit advisories unreachable.

| Advisory                                                                 | Package                | Path                                                                                                                                                                                                         | Why it is accepted                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| ------------------------------------------------------------------------ | ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [GHSA-vfj7-8cjw-p6xm](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm) | `braces` (high)        | 38 dev paths via `micromatch`                                                                                                                                                                                | **No fix exists.** Verified 2026-10-04: `braces@3.0.3` is the latest published version, and `micromatch@4.0.8` is also latest and still declares `braces: ^3.0.3` — so the advisory's "Patched versions: None" is accurate and an `overrides` pin has nothing to point at. Every path is dev tooling (`lint-staged`, `markdownlint-cli2`, `@tailwindcss/cli > @parcel/watcher`); none is reachable from a shipped library package. Exploiting it requires a hostile glob **pattern**, and every glob here comes from a committed config file rather than from input. Re-review when `braces` publishes a fix or `micromatch` drops it.                                                                                                 |
| [GHSA-238p-pmpm-9mq7](https://github.com/advisories/GHSA-238p-pmpm-9mq7) | `katex` (low)          | `markdownlint-cli2 > markdownlint > micromark-extension-math` (dev)                                                                                                                                          | **The vulnerable code never executes.** `.markdownlint-cli2.yaml` enables no math extension, so KaTeX renders nothing. Patched only in `>=0.18.2` against a resolved `0.16.47`, and in 0.x semver a minor bump is a breaking one — so an override would force a breaking change on a transitive dependency to fix a path that does not run.                                                                                                                                                                                                                                                                                                                                                                                            |
| [GHSA-g3hv-75wg-m249](https://github.com/advisories/GHSA-g3hv-75wg-m249) | `minimatch` (moderate) | dev paths via eslint, `@eslint/config-array`, `@typescript-eslint/typescript-estree`, `eslint-plugin-jsx-a11y-x`; `@vue/test-utils > js-beautify` (its command-line tool only) via `glob` and `editorconfig` | **No in-major fix, and nothing here reaches the vulnerable code.** Patched only in `>=11.0.1` against a resolved `10.2.6`, and every dependent declares 10.x. minimatch 11 changed what `Minimatch#set` holds, which `glob` 13 walks, so an `overrides` pin to 11 would break glob. The pattern amplification runs only at `optimizationLevel` 2 or higher. The lint dependents use the default, 1; `glob` sets 2, and it and `editorconfig` are reached only through `js-beautify`'s command-line tool, which nothing here runs (`@vue/test-utils` loads its library, which loads neither). Every pattern comes from a committed config file. Re-review when eslint moves to minimatch 11, or another package starts depending on it. |
| [GHSA-3g3m-2fjr-6pw4](https://github.com/advisories/GHSA-3g3m-2fjr-6pw4) | `glob` (moderate)      | `@vue/test-utils > js-beautify` (its command-line tool only)                                                                                                                                                 | **No in-major fix, and the vulnerable code never executes.** Patched only in `>=14.0.2` against a resolved `13.0.6`, which `js-beautify` (latest) requires as `^13.0.6`. `@vue/test-utils` loads `js-beautify`'s library, which never loads glob; only its command-line tool does, and nothing here runs it. The advisory concerns a walk that keeps reading after an `AbortSignal` fires, and that tool passes none. Re-review when `js-beautify` moves to glob 14, or another package starts depending on glob.                                                                                                                                                                                                                      |
| [GHSA-gcqx-w48m-w2h4](https://github.com/advisories/GHSA-gcqx-w48m-w2h4) | `deepmerge` (low)      | `@sveltejs/vite-plugin-svelte`; `@sveltejs/adapter-node > @rollup/plugin-node-resolve` (build)                                                                                                               | **No fix exists.** `deepmerge@4.3.1` is the latest published version, and the advisory covers it. Both callers merge plugin options from committed configuration at build time, never input. Re-review when `deepmerge` publishes a fix.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| [GHSA-pfhg-q3qv-9q6r](https://github.com/advisories/GHSA-pfhg-q3qv-9q6r) | `@sveltejs/kit` (low)  | `examples-sveltekit`                                                                                                                                                                                         | **The vulnerable feature is never used.** An open redirect through `use:enhance` form actions on routes that accept paths starting with `//`. Patched only in kit 3.0.0, a major, against `2.70.3`. `examples-sveltekit` has no `use:enhance` form, which `acceptedAdvisoryParity.test.ts` asserts. Re-review when the app moves to kit 3.                                                                                                                                                                                                                                                                                                                                                                                             |
| [GHSA-27mw-82g8-phjj](https://github.com/advisories/GHSA-27mw-82g8-phjj) | `@sveltejs/kit` (low)  | `examples-sveltekit`                                                                                                                                                                                         | **The vulnerable feature is never used.** An XSS through a `cache-control` value passed to `setHeaders` on a prerendered page. Patched only in kit 3.0.0, a major, against `2.70.3`. `examples-sveltekit` never calls `setHeaders`, which `acceptedAdvisoryParity.test.ts` asserts. Re-review when the app moves to kit 3.                                                                                                                                                                                                                                                                                                                                                                                                             |

### Retired acceptances

An override that fully patches the tree needs no ignore at all: `pnpm audit` matches advisories against _resolved_
versions, so once an override removes the vulnerable version from the lockfile, the advisory stops matching. An ignore
is for exactly two cases — no fix exists, or the vulnerable copy survives on a path an override cannot reach. These
entries were retired on that basis:

| Advisory                                     | Package                   | Retired    | Why                                                                                                                                                                                                                                                                                                       |
| -------------------------------------------- | ------------------------- | ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GHSA-rj75-hqrm-r3gf`                        | `postcss-selector-parser` | 2026-11-05 | `@tailwindcss/typography` still pins `6.0.10`, but the advisory is patched on the 6.x line in `6.1.5`, so the `postcss-selector-parser@^6.0.0` override moves that copy to a fixed version inside the major the plugin was written for. Retire the override when the plugin moves past `6.0.10` upstream. |
| `GHSA-hp3w-g68c-fv3c`                        | `sprintf-js`              | 2026-10-10 | Reachable only through `@changesets/cli`, which this repository does not use; the lockfile resolves no `sprintf-js`. The engine repository retired it too, once Changesets 3 dropped the chain.                                                                                                           |
| `GHSA-mh99-v99m-4gvg`                        | `brace-expansion`         | 2026-10-07 | Resolves to `1.1.21` / `5.0.12`, with no reference to the vulnerable `1.1.14` / `5.0.6`.                                                                                                                                                                                                                  |
| `GHSA-r4xh-jqrq-34v2`                        | `smol-toml`               | 2026-10-07 | The `smol-toml` override removes `1.8.0` from the lockfile. The override itself stays: removing it restores `markdownlint-cli2`'s exact `1.8.0` pin and the advisory returns. Retire it when `markdownlint-cli2` moves past `1.8.0`.                                                                      |
| `GHSA-52cp-r559-cp3m`, `GHSA-h67p-54hq-rp68` | `js-yaml`                 | 2026-10-04 | `markdownlint-cli2@0.23.3` depends on `js-yaml@5.4.1`, outside the vulnerable range, and on `smol-toml@1.8.0`, which clears `GHSA-7w5x-hrqm-74c2`.                                                                                                                                                        |
