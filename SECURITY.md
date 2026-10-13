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
- **Email** — [security@filter-enginez.com](mailto:security@filter-enginez.com), or the author address in
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

## Accepted advisories

A small set of advisories are deliberately suppressed from `pnpm audit` via `auditConfig.ignoreGhsas` in
[`pnpm-workspace.yaml`](./pnpm-workspace.yaml). Each sits on a development or build-tooling path, and nothing in this
repository is published. Last reviewed 2026-10-07.

Suppressing an advisory hides it, including a high one, so each acceptance has a machine-checkable premise, and
something fails when that premise expires. Where an entry below says **no fix exists**, the latest published version of
the package is the vulnerable one: there is nothing to upgrade to, and an `overrides` pin cannot invent a release.

```bash
node scripts/recheck-accepted-advisories.mjs   # exits non-zero the day any premise below stops holding
```

Run it whenever `pnpm audit`'s counts change. `tests/tooling/acceptedAdvisoryParity.test.ts` keeps all three records —
the suppression list, this table, and that script's preconditions — naming the same set, so an acceptance cannot exist
without a stated premise. It also asserts the one premise that needs no network: that `.markdownlint-cli2.yaml` still
enables no math extension, which is what makes the KaTeX advisory unreachable here.

| Advisory                                                                 | Package                   | Path                                                                | Why it is accepted                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| ------------------------------------------------------------------------ | ------------------------- | ------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [GHSA-vfj7-8cjw-p6xm](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm) | `braces` (high)           | 38 dev paths via `micromatch`                                       | **No fix exists.** Verified 2026-10-04: `braces@3.0.3` is the latest published version, and `micromatch@4.0.8` is also latest and still declares `braces: ^3.0.3` — so the advisory's "Patched versions: None" is accurate and an `overrides` pin has nothing to point at. Every path is dev tooling (`lint-staged`, `markdownlint-cli2`, `@tailwindcss/cli > @parcel/watcher`); none is reachable from a shipped library package. Exploiting it requires a hostile glob **pattern**, and every glob here comes from a committed config file rather than from input. Re-review when `braces` publishes a fix or `micromatch` drops it. |
| [GHSA-rj75-hqrm-r3gf](https://github.com/advisories/GHSA-rj75-hqrm-r3gf) | `postcss-selector-parser` | `examples-react-rtk > @tailwindcss/typography` (build)              | **No in-major fix, and the forced major is the greater risk.** Patched only in `>=7.1.6`; the vulnerable `6.0.10` is pinned _exactly_ by `@tailwindcss/typography`, whose latest (0.5.20, checked 2026-10-07) still pins it. An override would force 6.x → 7.x on a plugin that uses the library to rewrite selectors, which risks breaking the build it runs in. One path, an **unpublished** demo app, at build time; exploiting it needs a hostile CSS **selector**, and every selector here comes from committed source.                                                                                                           |
| [GHSA-238p-pmpm-9mq7](https://github.com/advisories/GHSA-238p-pmpm-9mq7) | `katex` (low)             | `markdownlint-cli2 > markdownlint > micromark-extension-math` (dev) | **The vulnerable code never executes.** `.markdownlint-cli2.yaml` enables no math extension, so KaTeX renders nothing. Patched only in `>=0.18.2` against a resolved `0.16.47`, and in 0.x semver a minor bump is a breaking one — so an override would force a breaking change on a transitive dependency to fix a path that does not run.                                                                                                                                                                                                                                                                                            |

### Retired acceptances

An override that fully patches the tree needs no ignore at all: `pnpm audit` matches advisories against _resolved_
versions, so once an override removes the vulnerable version from the lockfile, the advisory stops matching. An ignore
is for exactly two cases — no fix exists, or the vulnerable copy survives on a path an override cannot reach. These
entries were retired on that basis:

| Advisory                                     | Package           | Retired    | Why                                                                                                                                                                                                                                  |
| -------------------------------------------- | ----------------- | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `GHSA-hp3w-g68c-fv3c`                        | `sprintf-js`      | 2026-10-10 | Reachable only through `@changesets/cli`, which this repository does not use; the lockfile resolves no `sprintf-js`. It stays accepted in the engine repository's policy, where Changesets runs releases.                            |
| `GHSA-mh99-v99m-4gvg`                        | `brace-expansion` | 2026-10-07 | Resolves to `1.1.21` / `5.0.12`, with no reference to the vulnerable `1.1.14` / `5.0.6`.                                                                                                                                             |
| `GHSA-r4xh-jqrq-34v2`                        | `smol-toml`       | 2026-10-07 | The `smol-toml` override removes `1.8.0` from the lockfile. The override itself stays: removing it restores `markdownlint-cli2`'s exact `1.8.0` pin and the advisory returns. Retire it when `markdownlint-cli2` moves past `1.8.0`. |
| `GHSA-52cp-r559-cp3m`, `GHSA-h67p-54hq-rp68` | `js-yaml`         | 2026-10-04 | `markdownlint-cli2@0.23.3` depends on `js-yaml@5.4.1`, outside the vulnerable range, and on `smol-toml@1.8.0`, which clears `GHSA-7w5x-hrqm-74c2`.                                                                                   |
