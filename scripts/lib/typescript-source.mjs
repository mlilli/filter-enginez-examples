/**
 * `typescript-source` — import a workspace TypeScript module from a plain Node script.
 *
 * @remarks
 * The packages here are TypeScript source written for `moduleResolution: "NodeNext"`, so a relative
 * import names the `.js` file the compiler would emit (`'./pageMeta.js'`) while the file on disk is
 * `pageMeta.ts`. Node strips the types of a `.ts` file by itself (the Node version `engines` requires
 * does so by default) but resolves a specifier exactly as written, and there is no `pageMeta.js`. This
 * module adds the one missing step: a resolve hook that, for a relative `.js` import from a `.ts` file
 * that does not exist, resolves the `.ts` file beside it. Everything else resolves as Node always does.
 *
 * Only for modules that are plain data and functions with erasable types (no enums, no namespaces, no
 * parameter properties), which is what Node's type stripping accepts. A Vite config loads such modules
 * through Vite's `runnerImport` instead (`critical-css.mjs`); this is for a build step that runs after
 * a bundler with no plugin hook, such as Angular's.
 *
 * @packageDocumentation
 */

import { existsSync } from 'node:fs';
import { registerHooks } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

let isRegistered = false;

/**
 * Register the resolve hook, once per process.
 */
function registerTypeScriptResolution() {
	if (isRegistered) {
		return;
	}
	isRegistered = true;
	registerHooks({
		resolve(specifier, context, nextResolve) {
			if (specifier.startsWith('.') && specifier.endsWith('.js') && context.parentURL?.endsWith('.ts') === true) {
				const javascript = new URL(specifier, context.parentURL);
				const typescript = new URL(`${specifier.slice(0, -'.js'.length)}.ts`, context.parentURL);

				if (!existsSync(fileURLToPath(javascript)) && existsSync(fileURLToPath(typescript))) {
					return nextResolve(typescript.href, context);
				}
			}

			return nextResolve(specifier, context);
		},
	});
}

/**
 * Import a TypeScript module by its path.
 *
 * @param {string} path - An absolute path to a `.ts` file.
 * @returns {Promise<unknown>} The module's namespace.
 */
export async function importTypeScript(path) {
	registerTypeScriptResolution();

	return import(pathToFileURL(path).href);
}
