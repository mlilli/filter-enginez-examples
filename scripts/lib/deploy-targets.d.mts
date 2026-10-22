/**
 * Types for `deploy-targets.mjs`.
 *
 * @remarks
 * The module is plain JavaScript so the deploy job can run its CLI with bare `node` before anything is
 * installed. `tests/tooling` imports it, and that project lints with type information, which cannot
 * resolve types out of an unchecked `.mjs` — the same seam as `e2e-ports.d.mts`.
 *
 * @packageDocumentation
 */

/** The Wrangler configuration fields this repository uses. */
export interface WranglerConfig {
	readonly assets?: {
		readonly binding?: string;
		readonly directory?: string;
		readonly html_handling?: string;
		readonly not_found_handling?: string;
		readonly run_worker_first?: boolean | readonly string[];
	};
	readonly compatibility_date?: string;
	readonly compatibility_flags?: readonly string[];
	readonly main?: string;
	readonly name: string;
	readonly preview_urls?: boolean;
	readonly routes?: readonly { readonly custom_domain?: boolean; readonly pattern: string }[];
	readonly workers_dev?: boolean;
}

/** One deployable package. */
export interface DeployTarget {
	/**
	 * For a target whose `main` is {@link EXAMPLES_SERVER_WORKER_ENTRY}: the directory, relative to the
	 * repository root, the deploy job writes the corpus files into. `null` for every other target.
	 */
	readonly apiCorpusDirectory: string | null;
	/** The static-assets directory, relative to the repository root. */
	readonly assetsDirectory: string;
	/** The parsed config. */
	readonly config: WranglerConfig;
	/** The Wrangler config, relative to the repository root. */
	readonly configPath: string;
	/** Every custom-domain host the Worker is served on. */
	readonly hosts: readonly string[];
	/** The package's directory under `packages/`. */
	readonly packageDirectory: string;
	/** Its `package.json` name. */
	readonly packageName: string;
}

/** The Wrangler configuration file a deployable package carries, at its root. */
export const WRANGLER_CONFIG_FILE: 'wrangler.jsonc';

/** The examples-server Worker script, relative to the repository root. */
export const EXAMPLES_SERVER_WORKER_ENTRY: 'packages/examples-server/src/cloudflareWorker.ts';

/** Where, inside an API-Worker target's assets directory, the deploy job writes the corpus files. */
export const API_CORPUS_ASSETS_SUBDIRECTORY: 'api/corpus';

/**
 * Parse JSON with comments and trailing commas.
 *
 * @param text - The file contents.
 * @returns The parsed value.
 */
export function parseJsonc(text: string): unknown;

/**
 * Every package with a `wrangler.jsonc`, in directory order.
 *
 * @param repoRoot - The repository root. Defaults to this checkout's.
 * @returns One target per deployable package.
 */
export function listDeployTargets(repoRoot?: string): DeployTarget[];
