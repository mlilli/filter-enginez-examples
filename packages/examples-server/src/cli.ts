/**
 * `cli.ts` — the command-line face of the server-side demo. Filters a mock dataset by a JSON
 * `FilterEngineConfig` and prints the outcome, all in a plain Node process.
 *
 * @remarks
 * Run via `tsx` (see package scripts): `pnpm --filter @filter-enginez/examples-server cli --list`.
 * The isomorphic proof is `applyConfig` — this file is just argv parsing + printing around it.
 *
 * @packageDocumentation
 */

import { initializeBitmapAcceleration } from '@filter-enginez/core';

import { applyConfig } from './applyConfig.js';
import { type CliOptions, HELP_TEXT, parseCliArgs } from './cliArgs.js';
import { getDataset, listDatasets } from './datasets.js';
import { formatReport, formatSummary } from './format.js';
import { readConfigFile } from './readConfig.js';

/** Run a filter and print the report. Returns a process exit code. */
async function runFilter(options: CliOptions): Promise<number> {
	await initializeBitmapAcceleration();

	let config;

	try {
		config = options.configPath === undefined ? getDataset(options.dataset).defaultConfig : readConfigFile(options.configPath);
	} catch (error) {
		process.stderr.write(`Error: ${(error as Error).message}\n`);

		return 1;
	}

	try {
		const result = await applyConfig(options.dataset, config, { limit: options.countOnly ? 0 : options.limit });

		process.stdout.write(`${options.countOnly ? formatSummary(result) : formatReport(result)}\n`);

		return 0;
	} catch (error) {
		process.stderr.write(`Error: ${(error as Error).message}\n`);

		return 1;
	}
}

/** CLI entry. */
async function main(): Promise<number> {
	const parse = parseCliArgs(process.argv.slice(2));

	switch (parse.kind) {
		case 'error':
			process.stderr.write(`Error: ${parse.message}\n\n${HELP_TEXT}`);

			return 2;
		case 'help':
			process.stdout.write(HELP_TEXT);

			return 0;
		case 'list':
			for (const dataset of listDatasets()) {
				process.stdout.write(`  ${dataset.id.padEnd(8)} ${dataset.recordCount.toLocaleString().padStart(9)} ${dataset.recordNoun}\n`);
			}

			return 0;
		case 'run':
			return runFilter(parse.options);
	}
}

main()
	.then((code) => {
		process.exitCode = code;
	})
	.catch((error: unknown) => {
		process.stderr.write(`Fatal: ${String(error)}\n`);
		process.exitCode = 1;
	});
