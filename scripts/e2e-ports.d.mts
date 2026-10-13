/**
 * Types for `e2e-ports.mjs`.
 *
 * @remarks
 * The module is plain JavaScript so `pretest:e2e` can run its CLI with bare `node` — no build step,
 * no `tsx`, nothing that could itself fail before the check it is guarding. But `tests/tooling`
 * imports `e2ePortsFromConfig` to pin the parse, and that project lints with type information, which
 * cannot resolve types out of an unchecked `.mjs`. This declaration is the seam: one exported
 * function, so the surface it describes is small enough to stay honest.
 *
 * @packageDocumentation
 */

/**
 * Every port the e2e suite intends to bind, read from `playwright.config.ts`'s `webServer` URLs.
 *
 * @returns The ports, ascending and de-duplicated.
 */
export function e2ePortsFromConfig(): number[];
