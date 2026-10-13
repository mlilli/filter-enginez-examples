/**
 * Which ports the e2e suite intends to bind — the pure half of the port preflight.
 *
 * @remarks
 * **This exists as its own module because a module that EXPORTS must not also EXIT.**
 * `check-e2e-ports.mjs` probes sockets and calls `process.exit(1)` at top level, which is correct for
 * a CLI and disastrous for an import: `devServerPorts.test.ts` imports the parse to pin it, and with
 * the two in one file that import would run the whole check. The suite would then die with
 * "process.exit unexpectedly called with 1" on any machine that had a dev server running — passing
 * only where the thing being guarded against was absent, which is the worst possible test outcome.
 *
 * So the split is not tidiness. The CLI imports this; nothing imports the CLI, and
 * `devServerPorts.test.ts` asserts that nothing ever does.
 *
 * The ports themselves are parsed out of `playwright.config.ts` rather than restated. That file's
 * docblock calls its port map "canonical — every other reference should cite this list", and a second
 * copy here is precisely the kind of citation that goes stale the first time a vertical moves.
 *
 * @packageDocumentation
 */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');

/**
 * Every port the e2e suite intends to bind, read from the Playwright config's `webServer` URLs.
 *
 * @returns {number[]} The ports, ascending and de-duplicated.
 */
export function e2ePortsFromConfig() {
	const source = readFileSync(join(repoRoot, 'playwright.config.ts'), 'utf8');
	/** @type {Set<number>} */
	const ports = new Set();

	for (const [, port] of source.matchAll(/https?:\/\/(?:localhost|127\.0\.0\.1):(\d{2,5})/g)) {
		// Guarded rather than asserted: the capture group is optional to the type system, and a `!`
		// here would be the one line in this file that lies about what it knows.
		if (port !== undefined) {
			ports.add(Number.parseInt(port, 10));
		}
	}

	return [...ports].sort((a, b) => a - b);
}
