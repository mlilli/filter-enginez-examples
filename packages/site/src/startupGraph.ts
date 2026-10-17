/**
 * The build's check that no page loads the engine at startup.
 *
 * @remarks
 * Only the how-it-works page's live benchmark runs the engine, and it fetches it on demand
 * (`how-it-works/benchmarkEngine.ts`). What keeps the engine out of every page's first download is
 * easy to undo without noticing: a static import of the workload anywhere on a page's import graph, a
 * barrel that re-exports it, or a bundler setting that stops treating the engine's modules as free of
 * side effects. Each still builds, passes every test and renders the same page; the only symptom is
 * some 350 kB more JavaScript at startup, which Vite also lists as `<link rel="modulepreload">`.
 *
 * So the site's build (`vite.config.ts`) runs {@link findDeferredModulesAtStartup} over what it wrote,
 * and fails when a page's startup graph holds one of the {@link DEFERRED_MODULES}. A page's startup
 * graph is every chunk its HTML loads — its module scripts and its modulepreload links — and every
 * chunk those import statically, transitively. A dynamic `import()` is not followed: a chunk loaded on
 * demand is exactly what the check allows.
 *
 * A check that inspects nothing passes, so these are errors: a build with no pages, a page that names a
 * script the build does not have, and a deferred group that matches no module anywhere in the build
 * (its pattern no longer describes the dependency it was written for).
 *
 * @packageDocumentation
 */

/** What the check reads of one JavaScript chunk in the build. */
export interface BuiltChunk {
	/** The chunks it imports statically, by file name (`assets/x-Hash.js`). */
	readonly imports: readonly string[];
	/** The absolute ids of the modules bundled into it. */
	readonly moduleIds: readonly string[];
}

/** A group of modules no page may load at startup. */
export interface DeferredModules {
	/** What the group is, for the error message. */
	readonly name: string;
	/** Matches the id of every module in the group. */
	readonly pattern: RegExp;
}

/** A deferred module that some page loads at startup. */
export interface StartupViolation {
	/** The page, by its file name in the build (`compare.html`). */
	readonly page: string;
	/** The chunk on the page's startup graph that holds the module. */
	readonly chunk: string;
	/** The group the module belongs to. */
	readonly group: string;
	/** The module's id. */
	readonly moduleId: string;
}

/**
 * Everything the live benchmark fetches on demand: the engine and the libraries only it uses, and the
 * wine corpus the workload runs over.
 *
 * @remarks
 * The engine's error classes (`@filter-enginez/core/dist/errors/`) are left out: the comparison page
 * decodes shared links with url-state-router's serializer, which throws one of them on a malformed
 * link, so a few hundred bytes of the engine rightly start with that page.
 */
export const DEFERRED_MODULES: readonly DeferredModules[] = [
	{
		name: 'the engine (@filter-enginez/core, apart from its error classes)',
		pattern: /[/\\]node_modules[/\\]@filter-enginez[/\\]core[/\\]dist[/\\](?!errors[/\\])/u,
	},
	{ name: 'roaring-wasm, the engine’s WebAssembly bitmaps', pattern: /[/\\]node_modules[/\\]roaring-wasm[/\\]/u },
	{ name: 'fuse.js, the engine’s fuzzy search', pattern: /[/\\]node_modules[/\\]fuse\.js[/\\]/u },
	{ name: 'rbush, the engine’s R-tree', pattern: /[/\\]node_modules[/\\]rbush[/\\]/u },
	{ name: 'the wine corpus (@filter-enginez/mock-data)', pattern: /[/\\]node_modules[/\\]@filter-enginez[/\\]mock-data[/\\]/u },
];

/** One HTML start tag, with its attributes. */
const START_TAG = /<(script|link)\b([^>]*)>/giu;

/** One attribute of a start tag: a name, and a quoted, unquoted or absent value. */
const ATTRIBUTE = /([\w-]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/gu;

/**
 * The JavaScript files a built page loads before anything asks: its module scripts and the modules it
 * preloads.
 *
 * @param html - The page, as the build wrote it.
 * @returns Their file names in the build, without the leading `/`, in page order. Scripts on another
 *   origin are left out.
 */
export function pageStartupScripts(html: string): string[] {
	const scripts: string[] = [];

	// Both groups of START_TAG and the name group of ATTRIBUTE always take part in a match, so `String()`
	// only narrows their type; a fallback would be a branch nothing can reach.
	for (const [, tagGroup, attributeGroup] of html.matchAll(START_TAG)) {
		const tagName = String(tagGroup).toLowerCase();
		const attributes = new Map(
			[...String(attributeGroup).matchAll(ATTRIBUTE)].map(([, name, doubleQuoted, singleQuoted, bare]) => [
				String(name).toLowerCase(),
				doubleQuoted ?? singleQuoted ?? bare ?? '',
			]),
		);
		const isScript = tagName === 'script' && attributes.get('type') === 'module';
		const isPreload = tagName === 'link' && attributes.get('rel')?.toLowerCase().split(/\s+/u).includes('modulepreload') === true;
		const url = isScript ? attributes.get('src') : isPreload ? attributes.get('href') : undefined;

		if (url !== undefined && url.startsWith('/') && !url.startsWith('//')) {
			scripts.push(url.slice(1));
		}
	}

	return scripts;
}

/**
 * Every chunk a page loads at startup: the scripts it names and their static imports, transitively.
 *
 * @param scripts - The page's startup scripts ({@link pageStartupScripts}).
 * @param chunks - Every chunk in the build, by file name.
 * @returns Those chunks, by file name.
 * @throws {Error} When a script or an import is not a chunk in the build.
 */
export function startupChunks(scripts: readonly string[], chunks: ReadonlyMap<string, BuiltChunk>): Map<string, BuiltChunk> {
	const seen = new Map<string, BuiltChunk>();
	const pending = [...scripts];

	for (let fileName = pending.pop(); fileName !== undefined; fileName = pending.pop()) {
		if (!seen.has(fileName)) {
			const chunk = chunks.get(fileName);

			if (chunk === undefined) {
				throw new Error(`${fileName} is loaded at startup but is not a JavaScript chunk in the build.`);
			}
			seen.set(fileName, chunk);
			pending.push(...chunk.imports);
		}
	}

	return seen;
}

/**
 * Every deferred module that some page loads at startup.
 *
 * @param pages - Every built page's HTML, by its file name in the build.
 * @param chunks - Every chunk in the build, by file name.
 * @param deferred - The groups no page may load at startup.
 * @returns One entry per page, chunk and module that breaks the rule; empty when none does.
 * @throws {Error} When there are no pages, when a page names a script the build does not have, or when a
 *   group matches no module in the whole build.
 */
export function findDeferredModulesAtStartup(
	pages: ReadonlyMap<string, string>,
	chunks: ReadonlyMap<string, BuiltChunk>,
	deferred: readonly DeferredModules[] = DEFERRED_MODULES,
): StartupViolation[] {
	if (pages.size === 0) {
		throw new Error('The build has no HTML pages to check.');
	}

	const allModuleIds = [...chunks.values()].flatMap((chunk) => chunk.moduleIds);

	for (const group of deferred) {
		if (!allModuleIds.some((moduleId) => group.pattern.test(moduleId))) {
			throw new Error(`No module in the build matches ${group.name} (${String(group.pattern)}); update DEFERRED_MODULES in src/startupGraph.ts.`);
		}
	}

	return [...pages].flatMap(([page, html]) =>
		[...startupChunks(pageStartupScripts(html), chunks)].flatMap(([chunk, { moduleIds }]) =>
			moduleIds.flatMap((moduleId) =>
				deferred.filter((group) => group.pattern.test(moduleId)).map((group) => ({ chunk, group: group.name, moduleId, page })),
			),
		),
	);
}

/**
 * The build error for a list of violations.
 *
 * @param violations - What {@link findDeferredModulesAtStartup} found; at least one.
 * @returns The message: each page and the deferred group it loads, through which chunk, with one module
 *   each as an example, and what to do about it.
 */
export function describeStartupViolations(violations: readonly StartupViolation[]): string {
	const lines = new Map<string, string>();

	for (const violation of violations) {
		const key = `${violation.page} ${violation.group}`;

		if (!lines.has(key)) {
			lines.set(key, `  ${violation.page} loads ${violation.group} at startup, in ${violation.chunk} (e.g. ${violation.moduleId})`);
		}
	}

	return [
		'A page loads JavaScript at startup that only the live benchmark needs, on demand:',
		...lines.values(),
		'Import it through how-it-works/benchmarkEngine.ts with a dynamic import(), and keep the engine’s modules declared side-effect free in vite.config.ts.',
	].join('\n');
}
