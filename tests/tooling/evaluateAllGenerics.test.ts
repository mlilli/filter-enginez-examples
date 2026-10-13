/**
 * Every `evaluateAll` call passes THREE type arguments, so the element type reaches `E`.
 *
 * @remarks
 * ## The signature
 *
 * Playwright before 1.63 declared two overloads:
 *
 * ```ts
 * evaluateAll<R, Arg, E extends SVGElement | HTMLElement = …>(fn: PageFunctionOn<E[], Arg, R>, arg: Arg): Promise<R>;
 * evaluateAll<R, E extends SVGElement | HTMLElement = …>(fn: PageFunctionOn<E[], void, R>): Promise<R>;
 * ```
 *
 * 1.63 **collapsed them into one**, making `arg` optional:
 *
 * ```ts
 * evaluateAll<R, Arg, E extends SVGElement | HTMLElement = …>(fn: PageFunctionOn<E[], Arg, R>, arg?: Arg): Promise<R>;
 * ```
 *
 * So there is no no-arg two-generic form: `evaluateAll<R, E>(fn)` silently binds its element type to
 * **`Arg`** while `E` falls back to `SVGElement | HTMLElement`.
 *
 * ## Why a guard rather than a comment
 *
 * A comment at the call site explaining why the element generic is named cannot help: the hazard is
 * the position of the argument in an upstream signature, which no amount of local prose anticipates.
 *
 * 🔴 **And a wrong call does not reliably fail anywhere else.** A callback reading `href` fails under
 * `tsc`, because `href` does not exist on `SVGElement` at all. One reading `className` does not:
 * TypeScript 6's `lib.dom.d.ts` declares `SVGElement.className` as `readonly className: any` (it is
 * deprecated), so the union's `.className` is `any` and the expression type-checks fine — only typed
 * lint's `no-unsafe-*` rules object. A call site reading only `textContent` or `id` compiles AND lints
 * clean while `E` is wrong, and the first symptom is a spec asserting something subtly different from
 * what its author wrote. This case removes that possibility by checking the shape of the call instead
 * of the type of its body.
 *
 * ## Why it does not assert WHICH types
 *
 * `Arg` is legitimately a real type when a call passes an argument, and `E` legitimately varies. The
 * only invariant is the COUNT: three type arguments means the element type landed in the third slot.
 * Asserting more would make the guard fail on a correct call that passes an argument, and a guard that
 * fires on correct code is a guard somebody deletes.
 */

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

/**
 * Trees that may contain Playwright calls.
 *
 * @remarks
 * `tests` only, and deliberately. `@playwright/test` is a ROOT devDependency and no package declares
 * it, so a call site under `packages/` could not resolve the import — scanning there buys nothing and
 * costs over a thousand files. It would also walk into self-referential pnpm entries
 * (`packages/ui-styles/ui-styles`) that `statSync` cannot read in some container mounts, throwing
 * EACCES out of the walk and failing both cases below with zero sites found.
 */
const SEARCH_ROOTS = ['tests'] as const;

/** Extensions worth scanning. */
const SOURCE_EXTENSIONS = ['.ts', '.tsx'] as const;

/** One explicit-generic `evaluateAll` call site. */
interface CallSite {
	/** The text between the angle brackets. */
	readonly typeArguments: string;
	/** Repo-relative path. */
	readonly path: string;
}

/**
 * Every source file under a directory, recursively, skipping generated and vendored trees.
 *
 * @remarks
 * `statSync` is guarded because it can throw: a pnpm workspace contains self-referential entries that
 * are unreadable in some container mounts, and an unhandled throw here takes the whole guard out rather
 * than skipping one path.
 *
 * @param dir - Absolute directory.
 * @returns Absolute file paths.
 */
function sourceFiles(dir: string): string[] {
	return readdirSync(dir).flatMap((entry) => {
		if (entry === 'node_modules' || entry === 'dist' || entry === '.svelte-kit') {
			return [];
		}

		const path = join(dir, entry);
		let isDirectory = false;

		try {
			isDirectory = statSync(path).isDirectory();
		} catch {
			return [];
		}

		if (isDirectory) {
			return sourceFiles(path);
		}

		return SOURCE_EXTENSIONS.some((extension) => path.endsWith(extension)) ? [path] : [];
	});
}

/**
 * Strip comments, so prose about `evaluateAll` is not mistaken for a call to it.
 *
 * @remarks
 * 🔴 This file's own docblock quotes both Playwright signatures, INCLUDING the two-generic form the
 * guard exists to reject — so without this it would flag itself. It is the same hazard the brand-mark
 * guard handles for a class name written in prose inside a CSS comment.
 *
 * Handled by CATEGORY rather than by instance: comments are removed from every file before matching,
 * because a comment can DESCRIBE a call and can never BE one. Excluding this file by name would say
 * nothing about the next doc comment that mentions the signature.
 *
 * @param source - File contents.
 * @returns The same source with block and line comments blanked.
 */
function withoutComments(source: string): string {
	return source.replaceAll(/\/\*[\s\S]*?\*\//gu, '').replaceAll(/\/\/[^\n]*/gu, '');
}

/**
 * Count top-level commas in a type-argument list.
 *
 * @remarks
 * Depth-aware rather than a `split(',')`, because a legitimate argument can be generic itself —
 * `evaluateAll<Record<string, string>, undefined, HTMLElement>` has four commas and three arguments.
 * A naive split would report that correct call as wrong, which is how a guard earns its deletion.
 *
 * @param typeArguments - The text between the angle brackets.
 * @returns How many type arguments were written.
 */
function countTypeArguments(typeArguments: string): number {
	let depth = 0;
	let count = 1;

	for (const character of typeArguments) {
		if (character === '<' || character === '[' || character === '(' || character === '{') {
			depth += 1;
		} else if (character === '>' || character === ']' || character === ')' || character === '}') {
			depth -= 1;
		} else if (character === ',' && depth === 0) {
			count += 1;
		}
	}

	return count;
}

/**
 * Every `evaluateAll<…>` call site with explicit type arguments.
 *
 * @returns The sites found, in path order.
 */
function explicitGenericCallSites(): CallSite[] {
	const found: CallSite[] = [];

	for (const root of SEARCH_ROOTS) {
		for (const path of sourceFiles(resolve(REPO_ROOT, root))) {
			const text = readFileSync(path, 'utf8');

			for (const match of withoutComments(text).matchAll(/evaluateAll<([^;]*?)>\s*\(/gu)) {
				found.push({ path: relative(REPO_ROOT, path), typeArguments: match[1] ?? '' });
			}
		}
	}

	return found.sort((left, right) => left.path.localeCompare(right.path));
}

describe('Locator.evaluateAll type arguments', () => {
	it('finds the call sites it is meant to check', () => {
		// The vacuity guard. A regex that stops matching — because the calls were refactored behind a
		// helper, say — would make the case below pass over an empty list, which is indistinguishable
		// from a repo where every call is correct.
		expect(explicitGenericCallSites().length, 'no evaluateAll call sites found — did the regex rot?').toBeGreaterThanOrEqual(3);
	});

	it('passes three of them at every site, so the element type reaches E', () => {
		// Two is the failure: since Playwright 1.63 the second slot is `Arg`, so a two-argument call
		// binds the element type there and `E` falls back to `SVGElement | HTMLElement`.
		const offenders = explicitGenericCallSites()
			.map((site) => ({ ...site, count: countTypeArguments(site.typeArguments) }))
			.filter((site) => site.count !== 3);

		expect(
			offenders.map((site) => `${site.path}: ${site.count} type argument(s) — <${site.typeArguments}>`),
			'evaluateAll takes <R, Arg, E> since Playwright 1.63 — pass `undefined` for Arg when no argument is sent',
		).toEqual([]);
	});
});
