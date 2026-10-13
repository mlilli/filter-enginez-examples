/**
 * Corpus files — every registered dataset's corpus document, written to disk as the exact bytes the
 * API sends for `GET /corpus/<dataset>.json`.
 *
 * @remarks
 * The apps whose `/api` is answered by `cloudflareWorker.ts` serve the corpus as a static asset rather
 * than from the Worker: the deploy job runs `write-corpus.ts` into `<assets>/api/corpus/`, and each
 * app's `wrangler.jsonc` excludes `/api/corpus/*` from `run_worker_first`, so those requests never
 * reach Worker code. See `corpusDocument.ts` for why (the Workers Free plan's 10 ms CPU limit).
 *
 * The bytes come from {@link handleRequest} itself rather than from a second serializer, so a file and
 * the route it stands in for cannot disagree: each file is `JSON.stringify` of the route's response
 * body, which is what the Worker's `Response.json` sends. {@link findCorpusFileProblems} re-reads a
 * directory and compares, so a deploy cannot upload a missing or stale file. A missing file is the
 * failure that matters: these apps answer unknown paths with `index.html` (the single-page-application
 * fallback), so a browser asking for a missing corpus could get a page of HTML instead of an error.
 *
 * Node-only (`node:fs`): imported by the `write-corpus.ts` CLI and its tests, never by the Worker.
 *
 * @packageDocumentation
 */

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { corpusFileName, corpusPath } from './corpusDocument.js';
import { datasetIds } from './datasets.js';
import { handleRequest } from './requestHandler.js';

/** One corpus file written by {@link writeCorpusFiles}. */
export interface WrittenCorpusFile {
	/** The file's size in bytes (UTF-8). */
	readonly byteLength: number;
	/** The dataset it holds. */
	readonly datasetId: string;
	/** Where it was written. */
	readonly path: string;
}

/** The outcome of parsing the `write-corpus.ts` arguments. */
export type CorpusCliParse =
	| { readonly kind: 'check'; readonly outputDirectory: string }
	| { readonly kind: 'error'; readonly message: string }
	| { readonly kind: 'help' }
	| { readonly kind: 'write'; readonly outputDirectory: string };

/** Usage text for the `write-corpus.ts` CLI. */
export const CORPUS_CLI_HELP_TEXT = `Write every registered dataset's corpus document to <directory>/<dataset>.json.

Usage:
  pnpm --filter @filter-enginez/examples-server corpus:write <directory>
  pnpm --filter @filter-enginez/examples-server corpus:check <directory>

Each file holds exactly the bytes GET /corpus/<dataset>.json sends. After writing, every file is read
back and compared; --check (corpus:check) only compares. Either exits 1 when a file is missing or
differs. A relative <directory> resolves against the directory pnpm was started from.
`;

/**
 * Parse the `write-corpus.ts` arguments: `[--check] <directory>`, or `--help`.
 *
 * @param argv - The arguments after the script path. A leading `--` (pnpm's argument separator) is
 *   ignored.
 * @returns What to do.
 */
export function parseCorpusCliArgs(argv: readonly string[]): CorpusCliParse {
	const args = argv[0] === '--' ? argv.slice(1) : argv;

	if (args.includes('--help') || args.includes('-h')) {
		return { kind: 'help' };
	}
	const unknownFlag = args.find((arg) => arg.startsWith('-') && arg !== '--check');

	if (unknownFlag !== undefined) {
		return { kind: 'error', message: `Unknown option "${unknownFlag}".` };
	}
	const directories = args.filter((arg) => arg !== '--check');
	const [outputDirectory, ...extraDirectories] = directories;

	if (outputDirectory === undefined || extraDirectories.length > 0) {
		return { kind: 'error', message: `Expected exactly one output directory; got ${String(directories.length)}.` };
	}

	return { kind: args.includes('--check') ? 'check' : 'write', outputDirectory };
}

/**
 * The bytes the API sends for a dataset's corpus document.
 *
 * @param datasetId - A registered dataset id.
 * @returns `JSON.stringify` of the `GET /corpus/<datasetId>.json` response body.
 * @throws {Error} When the route does not answer 200 (an unregistered dataset).
 */
export async function corpusFileContents(datasetId: string): Promise<string> {
	const path = corpusPath(datasetId);
	const response = await handleRequest('GET', path, undefined);

	if (response.status !== 200) {
		throw new Error(`GET ${path} answered ${String(response.status)}: ${JSON.stringify(response.body)}`);
	}

	return JSON.stringify(response.body);
}

/**
 * Write every registered dataset's corpus document into a directory, creating it if needed.
 *
 * @param outputDirectory - The directory to write `<dataset>.json` files into.
 * @returns One entry per file written, in registry order.
 */
export async function writeCorpusFiles(outputDirectory: string): Promise<readonly WrittenCorpusFile[]> {
	mkdirSync(outputDirectory, { recursive: true });

	const written: WrittenCorpusFile[] = [];

	for (const datasetId of datasetIds()) {
		const contents = await corpusFileContents(datasetId);
		const path = join(outputDirectory, corpusFileName(datasetId));

		writeFileSync(path, contents);
		written.push({ byteLength: Buffer.byteLength(contents), datasetId, path });
	}

	return written;
}

/**
 * Check a directory against what {@link writeCorpusFiles} would write there.
 *
 * @param outputDirectory - The directory to check.
 * @returns One message per registered dataset whose file is missing or holds different bytes; empty
 *   when every file is present and current.
 */
export async function findCorpusFileProblems(outputDirectory: string): Promise<readonly string[]> {
	const problems: string[] = [];

	for (const datasetId of datasetIds()) {
		const path = join(outputDirectory, corpusFileName(datasetId));
		let actual: string;

		try {
			actual = readFileSync(path, 'utf8');
		} catch {
			problems.push(`${path} is missing.`);
			continue;
		}
		if (actual !== (await corpusFileContents(datasetId))) {
			problems.push(`${path} differs from GET ${corpusPath(datasetId)}.`);
		}
	}

	return problems;
}
