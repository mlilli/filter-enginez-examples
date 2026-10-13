/**
 * Refuse to start the e2e suite while a dev server is already holding one of its ports.
 *
 * @remarks
 * ## Why this is a hard stop rather than a warning
 *
 * Reusing a running dev server sounds like a convenience and hides a real failure mode: the suite
 * silently tests **whatever that server happens to be serving**, which is not necessarily the working
 * tree. A server started before a change carries a stale module graph, and Vite resolves a linked
 * workspace package's `exports` map ONCE at startup — a subpath added mid-session does not exist for
 * that process no matter how many files are saved. A run against it can fail for reasons that are not
 * in the code, or pass over a change it never loaded, which is worse.
 *
 * `playwright.config.ts` therefore pins `reuseExistingServer: false` everywhere, which makes
 * Playwright refuse outright. It refuses with "Process from config.webServer was not able to start"
 * — an exit code, no mention of a port, and no hint that the fix is one `kill` away. That message is
 * this script's entire reason to exist: same verdict, arrived at first, said in English.
 *
 * ## Why it is a script and not just the config flag
 *
 * The two cover different ground. This runs from the `pretest:e2e*` hooks, so it sees `pnpm test:e2e`
 * and its siblings and nothing else; the config flag covers `pnpm exec playwright test`, the VS Code
 * Playwright extension and CI invoking `playwright test` directly, where no package script runs. Belt
 * and braces, and the belt is the one that talks.
 *
 * ## This file EXITS, so nothing may import it
 *
 * The probe and the `process.exit(1)` run at top level, which is right for a CLI and wrong for a
 * module. The parse therefore lives in `e2e-ports.mjs`, which `devServerPorts.test.ts` imports to pin
 * it; importing THIS file instead ran the whole check inside the test runner and killed the suite on
 * any machine that had a dev server up. `devServerPorts.test.ts` asserts that no one re-introduces
 * that import.
 *
 * The ports come from `playwright.config.ts` rather than being restated — see `e2e-ports.mjs` for
 * why, and for the parse itself.
 *
 * @packageDocumentation
 */

import { createConnection } from 'node:net';

import { e2ePortsFromConfig } from './e2e-ports.mjs';

/** ANSI helpers. Skipped when the stream is not a TTY, or when `NO_COLOR` is set. */
const useColor = process.stderr.isTTY === true && process.env['NO_COLOR'] === undefined;

/**
 * Wrap text in an ANSI sequence, or return it untouched when color is off.
 *
 * @param {string} codes - The SGR parameters, e.g. `'1;31'`.
 * @param {string} text - The text to wrap.
 * @returns {string} The decorated (or plain) text.
 */
function paint(codes, text) {
	return useColor ? `\u001B[${codes}m${text}\u001B[0m` : text;
}

/**
 * The vertical each port belongs to, and the script that starts it.
 *
 * @remarks
 * A label for the human reading the failure — the PORTS themselves are parsed from the config, so an
 * unlabelled port still reports correctly, just less helpfully.
 */
/** @type {Record<number, readonly [label: string, startCommand: string]>} */
const PORT_LABELS = {
	4200: ['Angular', 'pnpm dev:angular'],
	5174: ['React RTK', 'pnpm dev:rtk'],
	5175: ['SvelteKit', 'pnpm dev:svelte'],
	5176: ['React plain', 'pnpm dev:plain'],
	5178: ['Vue', 'pnpm dev:vue'],
	5179: ['vanilla', 'pnpm dev:vanilla'],
	5180: ['Docs site', 'pnpm --filter @filter-enginez/examples-docs dev'],
	5181: ['Landing site', 'pnpm dev:site'],
	8787: ['examples-server API', 'pnpm dev:api'],
};

/**
 * Whether something is already listening on a port.
 *
 * @remarks
 * A TCP connect rather than a bind. Binding to check would race the real server on a re-run, and on
 * macOS a `SO_REUSEADDR` bind can succeed against a listening socket and report the port free.
 *
 * @param {number} port - The port to probe.
 * @returns {Promise<boolean>} `true` when the connection is accepted.
 */
function isPortInUse(port) {
	return new Promise((resolve) => {
		const socket = createConnection({ host: '127.0.0.1', port });
		/** Resolve once and tear the socket down. @param {boolean} inUse - The verdict. */
		const settle = (inUse) => {
			socket.destroy();
			resolve(inUse);
		};

		socket.setTimeout(1000);
		socket.once('connect', () => {
			settle(true);
		});
		socket.once('timeout', () => {
			settle(false);
		});
		socket.once('error', () => {
			settle(false);
		});
	});
}

const ports = e2ePortsFromConfig();
/** @type {number[]} */
const occupied = [];

for (const port of ports) {
	// Sequential on purpose: eight sub-second probes, and a serial loop keeps the failure output in
	// port order without sorting a race.
	if (await isPortInUse(port)) {
		occupied.push(port);
	}
}

if (occupied.length > 0) {
	const isPlural = occupied.length > 1;
	const rows = occupied
		.map((port) => {
			const [label, command] = PORT_LABELS[port] ?? ['unknown vertical', ''];

			return `      ${paint('1;33', String(port).padEnd(5))} ${label.padEnd(20)} ${paint('2', command)}`;
		})
		.join('\n');

	process.stderr.write(
		`\n  ${paint('1;41;97', ' STOP YOUR DEV SERVERS ')}\n\n`
			+ `  ${paint('1;31', `✘ ${occupied.length} e2e port${isPlural ? 's are' : ' is'} already in use.`)}\n\n`
			+ `${rows}\n\n`
			+ `  ${paint('1', 'The suite will not run against them.')} Playwright would reuse whatever those\n`
			+ '  processes are serving, which is not necessarily your working tree — a dev server started\n'
			+ '  before a change carries a stale module graph, and Vite resolves a workspace package\'s\n'
			+ '  `exports` map only at startup. A pass would not mean what it looks like it means.\n\n'
			+ `  ${paint('1;36', 'Fix:')} stop the dev servers, then re-run. Playwright starts its own.\n\n`
			+ `       ${paint('2', `# whatever is holding them, e.g. the shell running \`pnpm dev\`, or:`)}\n`
			+ `       ${paint('1;36', `lsof -t ${occupied.map((port) => `-i :${port}`).join(' ')} | xargs kill`)}\n\n`,
	);
	process.exit(1);
}
