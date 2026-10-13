/**
 * The header subtitle each app route paints — derived from the registry the apps read.
 *
 * @remarks
 * Every vertical renders `Dataset · Stack` under the wordmark from
 * `@filter-enginez/examples-shared/verticals`. A spec that restated that string would break on every
 * deliberate wording change, in every spec that copied it at once.
 *
 * So the specs do not restate it: the boot signal a spec
 * waits on is **"this route painted its own header"**, and that is a question the registry can answer.
 * A spec asking for `subtitle('Books', 'sveltekit', 'server')` also documents which of the six it is
 * driving and over which engine tier, which a literal would not.
 *
 * ### This deliberately does NOT pin the label text
 *
 * Rename `React RTK` and every spec follows silently. That is the intended trade. The literals are
 * pinned once, as a unit test, in `packages/examples-shared/src/verticals/verticals.test.ts`; an e2e
 * spec asserting them again is a second copy of someone else's contract, which would make a
 * deliberate improvement look like a wave of regressions. What these specs still assert is
 * the part only a browser can answer — that the route booted far enough to paint the header at all,
 * and (on the `*-server` specs) that it identifies itself as the tier it claims to be.
 *
 * ### Why the import is relative
 *
 * `@filter-enginez/examples-shared` is not a root dependency, and adding it would not help: the
 * package's `./verticals` export points at TypeScript **source**, and Playwright does not transform
 * files under `node_modules`. A relative path into the source is what `tests/tooling` already does for
 * the same module (`devServerPorts.test.ts` reads it to cross-check the port map). The module is pure
 * data with zero imports of its own, so nothing follows it across the boundary.
 *
 * @packageDocumentation
 */

export {
	type EngineTier,
	verticalSubtitle as subtitle,
	type VerticalId,
} from '../../packages/examples-shared/src/verticals/verticals.js';
