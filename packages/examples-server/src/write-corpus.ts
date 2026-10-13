/**
 * `write-corpus.ts` — write every registered dataset's corpus document into a directory, as the static
 * files an API Worker's assets serve at `/api/corpus/<dataset>.json`.
 *
 * @remarks
 * Run via `tsx` (`pnpm --filter @filter-enginez/examples-server corpus:write <directory>`, or
 * `corpus:check` to compare without writing). The deploy job in `.github/workflows/ci.yml` runs both
 * for every app whose `wrangler.jsonc` names `cloudflareWorker.ts`, writing into that app's
 * `<assets>/api/corpus/` before `wrangler deploy`. Exits 1 when any dataset's file is missing or
 * differs after the run, so a deploy never uploads assets without the corpus. The logic lives in the
 * unit-tested `corpusFiles.ts`; this file is argv and printing.
 *
 * A relative directory resolves against `INIT_CWD`, the directory pnpm was started from, because pnpm
 * runs the script from this package's directory.
 *
 * @packageDocumentation
 */

import { resolve } from 'node:path';

import { CORPUS_CLI_HELP_TEXT, findCorpusFileProblems, parseCorpusCliArgs, writeCorpusFiles } from './corpusFiles.js';

/** CLI entry. Returns a process exit code. */
async function main(): Promise<number> {
	const parse = parseCorpusCliArgs(process.argv.slice(2));

	switch (parse.kind) {
		case 'check':
		case 'write': {
			const outputDirectory = resolve(process.env['INIT_CWD'] ?? process.cwd(), parse.outputDirectory);

			if (parse.kind === 'write') {
				for (const file of await writeCorpusFiles(outputDirectory)) {
					process.stdout.write(`Wrote ${file.path} (${file.byteLength.toLocaleString('en-US')} bytes)\n`);
				}
			}
			const problems = await findCorpusFileProblems(outputDirectory);

			if (problems.length > 0) {
				process.stderr.write(`${problems.map((problem) => `Error: ${problem}`).join('\n')}\n`);

				return 1;
			}
			process.stdout.write(`Every corpus file in ${outputDirectory} matches its GET /corpus/<dataset>.json response.\n`);

			return 0;
		}
		case 'error':
			process.stderr.write(`Error: ${parse.message}\n\n${CORPUS_CLI_HELP_TEXT}`);

			return 2;
		case 'help':
			process.stdout.write(CORPUS_CLI_HELP_TEXT);

			return 0;
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
