/**
 * How Workers static assets decide whether a request runs the Worker script first, for guards that
 * reason about a `wrangler.jsonc` without deploying it.
 *
 * @remarks
 * Shared by `cloudflareDeploy.test.ts` (an app's `/about` must reach its `_redirects` rule, so the
 * Worker must not run first there) and `staticCorpusAssets.test.ts` (an API Worker's `/api/corpus/*`
 * must be answered by the assets, never by the Worker). One reading of the setting, so the two guards
 * cannot disagree about what a config does.
 *
 * @packageDocumentation
 */

/**
 * Whether a Workers `assets.run_worker_first` setting sends a path to the Worker before the assets.
 *
 * @remarks
 * The semantics Cloudflare documents for the array form
 * (https://developers.cloudflare.com/workers/static-assets/binding/#run_worker_first): each entry is
 * a route pattern where `*` matches any run of characters, including `/`; an entry starting with `!`
 * is negative; the Worker runs first when a non-negative pattern matches and no negative pattern
 * does, so negative patterns take precedence, and the order of entries is not significant. `true`
 * runs the Worker first for every path; `false` or an absent setting for none.
 *
 * @param runWorkerFirst - The setting.
 * @param path - A request path.
 * @returns `true` when the Worker answers the path before the assets do.
 */
export function workerRunsFirstFor(runWorkerFirst: boolean | undefined | readonly string[], path: string): boolean {
	if (typeof runWorkerFirst === 'boolean') {
		return runWorkerFirst;
	}
	const patterns = runWorkerFirst ?? [];
	const matches = (pattern: string): boolean => routePatternToRegExp(pattern).test(path);

	return patterns.some((pattern) => !pattern.startsWith('!') && matches(pattern))
		&& !patterns.some((pattern) => pattern.startsWith('!') && matches(pattern.slice(1)));
}

/**
 * Compile one route pattern: `*` matches any characters, everything else is literal.
 *
 * @param pattern - A non-negated pattern, e.g. `/api/*`.
 * @returns An anchored regular expression.
 */
function routePatternToRegExp(pattern: string): RegExp {
	const literalParts = pattern.split('*').map((part) => part.replaceAll(/[.*+?^${}()|[\]\\]/gu, String.raw`\$&`));

	return new RegExp(`^${literalParts.join('.*')}$`, 'u');
}
