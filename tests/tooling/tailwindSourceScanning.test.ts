/**
 * Guard: every Tailwind-using consumer of `examples-shared` must `@source`-scan it.
 *
 * @remarks
 * **The failure this exists to prevent.** Tailwind v4 auto-detects source files from the project root and deliberately
 * excludes `node_modules` — which is precisely where pnpm symlinks workspace packages. So a utility class used ONLY
 * inside `examples-shared` is never seen by the scanner, never generated, and the markup silently renders without it.
 *
 * The stakes are concrete. `min-h-0` and `overflow-y-auto` sit on the shared filter panel's scroll container, in
 * `examples-shared`, and appear in neither React app's own source. Without the scan, the panel never scrolls and every
 * control below the fold is unreachable — surfacing only as Playwright timeouts ("element is outside of the
 * viewport"), with nothing pointing at the CSS.
 *
 * **Why the failure is worth a test rather than a comment.** There is no build error, no console warning, and no
 * missing import. The page looks plausible; it is just subtly wrong, in a way only a human scrolling the panel or a
 * click below the fold will find. Nothing else in the toolchain can see it.
 *
 * **Why this test lives at the repo root** rather than inside a package. The invariant spans packages — it is a
 * relationship between an app's CSS entrypoint and a dependency's source tree — so no single package owns it. The
 * obvious home looked like `examples-shared`, since that is the package that BREAKS. But this test reads the
 * filesystem, and `examples-shared` is browser-only: its tsconfig carries no Node types, so `tsc` and ESLint both
 * reject it there. Adding `node` to that package's types would buy one test's placement at the cost of
 * letting any browser-only source file import `node:fs` unremarked, which is a bad trade for a repo whose central
 * discipline is exactly this kind of boundary.
 *
 * So it sits in the `tooling` Vitest project, whose whole purpose is repo-level build-configuration invariants that
 * belong to no package. Discovering by directory scan (rather than a hardcoded list) means a NEW Tailwind consumer
 * is covered the moment it is added, with nobody needing to remember this file exists.
 *
 * Consumers that do not use Tailwind at all (`examples-angular`, `-vue`, `-sveltekit`, `-vanilla`) are correctly
 * ignored — they render through the semantic `fe-*` classes in `ui-styles`, which ships plain CSS and needs no
 * scanning.
 */

import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * Strip `/* … *␘/` comments so prose cannot be mistaken for a directive.
 *
 * @remarks
 * The comment that documents WHY `@source` must follow every `@import` naturally contains the word `@import`,
 * positioned after the real `@source`. Analyzing raw text would report the file as out of order — the documentation
 * of the rule breaking the check for the rule.
 *
 * @param css - Raw stylesheet text.
 * @returns The same text with comment bodies blanked, preserving every byte offset so positions stay comparable.
 */
function stripComments(css: string): string {
	return css.replace(/\/\*[\s\S]*?\*\//g, (comment) => ' '.repeat(comment.length));
}

/** Absolute path to `packages/`, resolved from this file (`tests/tooling/`) rather than from a cwd Vitest varies. */
const PACKAGES_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', 'packages');

/** The package whose source must be scanned, as consumers name it in `package.json`. */
const SHARED_PACKAGE = '@filter-enginez/examples-shared';

/** That package's directory name under `packages/`. */
const SHARED_DIR = 'examples-shared';

/** How Tailwind v4 is pulled in. Its presence is what makes a package subject to the scanning rule. */
const TAILWIND_IMPORT = "@import 'tailwindcss'";

interface TailwindConsumer {
	/** Directory name under `packages/`, e.g. `examples-react-rtk`. */
	readonly packageName: string;
	/** Path of the CSS entrypoint that imports Tailwind, relative to `packages/`. */
	readonly cssPath: string;
	/** Full text of that CSS entrypoint. */
	readonly css: string;
}

/**
 * Recursively collect files under a directory, tolerating absence.
 *
 * @param dir - Directory to walk.
 * @param extension - File extension to match, including the dot.
 * @returns Absolute paths of matching files.
 */
function filesWithExtension(dir: string, extension: string): string[] {
	let entries;

	try {
		entries = readdirSync(dir, { withFileTypes: true });
	} catch {
		return [];
	}

	return entries.flatMap((entry) => {
		const full = join(dir, entry.name);

		if (entry.isDirectory()) {
			return entry.name === 'node_modules' || entry.name === 'dist' ? [] : filesWithExtension(full, extension);
		}

		return entry.name.endsWith(extension) ? [full] : [];
	});
}

/**
 * Every package that both depends on `examples-shared` AND imports Tailwind.
 *
 * @returns One entry per Tailwind-importing CSS entrypoint in a dependent package.
 */
function tailwindConsumers(): TailwindConsumer[] {
	const consumers: TailwindConsumer[] = [];

	for (const packageName of readdirSync(PACKAGES_DIR)) {
		const packageDir = join(PACKAGES_DIR, packageName);
		let manifest: string;

		try {
			manifest = readFileSync(join(packageDir, 'package.json'), 'utf8');
		} catch {
			continue;
		}

		// Only packages that actually consume examples-shared can be broken by the scanning gap.
		if (packageName === SHARED_DIR || !manifest.includes(`"${SHARED_PACKAGE}"`)) {
			continue;
		}

		for (const cssFile of filesWithExtension(join(packageDir, 'src'), '.css')) {
			const css = readFileSync(cssFile, 'utf8');

			if (css.includes(TAILWIND_IMPORT)) {
				consumers.push({ css, cssPath: cssFile.replace(`${PACKAGES_DIR}/`, ''), packageName });
			}
		}
	}

	return consumers;
}

describe('Tailwind source scanning', () => {
	const consumers = tailwindConsumers();

	// If this ever finds nothing, the test below would vacuously pass and the guard would be silently dead.
	it('finds the Tailwind-using consumers of examples-shared', () => {
		expect(consumers.map((consumer) => consumer.packageName).sort()).toEqual([
			'examples-react-plain',
			'examples-react-rtk',
		]);
	});

	it.each(consumers)('$packageName declares an @source covering examples-shared', ({ css, cssPath }) => {
		const sourceDirectives = [...stripComments(css).matchAll(/@source\s+['"]([^'"]+)['"]/g)]
			.map((match) => match[1])
			.filter((directive): directive is string => directive !== undefined);
		const isSharedScanned = sourceDirectives.some((directive) => {
			// Resolve relative to the CSS file's own directory, exactly as Tailwind does.
			const resolved = resolve(dirname(join(PACKAGES_DIR, cssPath)), directive);

			return join(PACKAGES_DIR, SHARED_DIR, 'src').startsWith(resolved);
		});

		expect(
			isSharedScanned,
			`${cssPath} imports Tailwind and depends on ${SHARED_PACKAGE}, but no @source covers ${SHARED_DIR}/src. ` +
				`Any utility class used only in examples-shared will be silently dropped from the generated CSS. ` +
				`Add: @source '../../examples-shared/src';  (after every @import — CSS requires @import to come first)`,
		).toBe(true);
	});

	it.each(consumers)('$packageName places @source after every @import', ({ css, cssPath }) => {
		// CSS requires @import to precede other at-rules. An @source wedged between two @imports risks a parser
		// dropping the later one — which here would strip every fe-* component style from ui-styles.
		const code = stripComments(css);
		const lastImport = code.lastIndexOf('@import');
		const firstSource = code.indexOf('@source');

		expect(
			firstSource === -1 || firstSource > lastImport,
			`${cssPath} has an @source before its last @import. CSS requires @import to precede other at-rules, ` +
				`so a later @import may be dropped — silently removing the ui-styles component CSS.`,
		).toBe(true);
	});
});
