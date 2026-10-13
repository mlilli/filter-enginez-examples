/**
 * Pure CLI argument parser — separated from `cli.ts` so the flag logic unit-tests without spawning a
 * process or touching the engine.
 *
 * @packageDocumentation
 */

/** Parsed options for a filter run. */
export interface CliOptions {
	/** Print only the match count, no records. */
	readonly countOnly: boolean;
	/** Path to a JSON `FilterEngineConfig`; when absent, the dataset's built-in config is used. */
	readonly configPath: string | undefined;
	/** Dataset id to filter. */
	readonly dataset: string;
	/** Max records to print (`< 0` = all). */
	readonly limit: number;
}

/** The result of parsing argv: a run, a list request, help, or an error. */
export type CliParse =
	| { readonly kind: 'error'; readonly message: string }
	| { readonly kind: 'help' }
	| { readonly kind: 'list' }
	| { readonly kind: 'run'; readonly options: CliOptions };

const DEFAULT_DATASET = 'books';
const DEFAULT_LIMIT = 10;

/**
 * Parse CLI arguments (everything after `node cli.ts`).
 *
 * @param argv - The raw argument list (e.g. `process.argv.slice(2)`).
 * @returns A discriminated parse outcome.
 *
 * @example
 *   parseCliArgs(['--dataset', 'books', '--config', 'c.json', '--limit', '5'])
 */
export function parseCliArgs(argv: readonly string[]): CliParse {
	let dataset = DEFAULT_DATASET;
	let configPath: string | undefined;
	let limit = DEFAULT_LIMIT;
	let isCountOnly = false;

	for (let index = 0; index < argv.length; index += 1) {
		const arg = argv[index];

		switch (arg) {
			case '--config':
			case '-c': {
				const value = argv[index + 1];

				if (value === undefined) {
					return { kind: 'error', message: `${arg} requires a file path` };
				}
				configPath = value;
				index += 1;
				break;
			}
			case '--count-only':
				isCountOnly = true;
				break;
			case '--dataset':
			case '-d': {
				const value = argv[index + 1];

				if (value === undefined) {
					return { kind: 'error', message: `${arg} requires a dataset id` };
				}
				dataset = value;
				index += 1;
				break;
			}
			case '--help':
			case '-h':
				return { kind: 'help' };
			case '--limit':
			case '-n': {
				const value = argv[index + 1];
				const parsed = Number(value);

				if (value === undefined || !Number.isInteger(parsed)) {
					return { kind: 'error', message: `${arg} requires an integer` };
				}
				limit = parsed;
				index += 1;
				break;
			}
			case '--list':
				return { kind: 'list' };
			default:
				// `String(arg)` rather than `arg ?? ''`: the loop condition is `index < argv.length`, so
				// `argv[index]` always exists and a `??` fallback could never run — it would exist only to
				// satisfy `noUncheckedIndexedAccess`, leaving a permanently uncoverable branch. `String`
				// takes no branch at all, and would read "undefined" rather than an empty string in the
				// impossible case, which is the more diagnostic of the two.
				return { kind: 'error', message: `Unknown argument: ${String(arg)}` };
		}
	}

	return { kind: 'run', options: { configPath, countOnly: isCountOnly, dataset, limit }};
}

/** The `--help` text. */
export const HELP_TEXT = `filter-enginez server-side demo — filter a mock dataset by a JSON config, in Node.

Usage:
  pnpm --filter @filter-enginez/examples-server cli [options]

Options:
  -d, --dataset <id>     Dataset to filter: books | wine   (default: books)
  -c, --config <path>    Path to a JSON FilterEngineConfig  (default: the dataset's built-in config)
  -n, --limit <n>        Max records to print, or -1 for all (default: 10)
      --count-only       Print only the match count
      --list             List available datasets and exit
  -h, --help             Show this help

Examples:
  cli --list
  cli --dataset books --config sample-configs/books.json --limit 5
  cli --dataset wine --count-only
`;
