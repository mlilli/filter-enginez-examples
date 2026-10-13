/**
 * The header control cluster renders in the same order in every vertical.
 *
 * @remarks
 * Six shells build the same four-control cluster — time travel, the URL-format toggle, copy link,
 * compare link — out of six framework-specific component sets, in six hand-written orders. Nothing
 * but this guard makes those orders agree, and a divergence is invisible unless two verticals are
 * open side by side.
 *
 * The order is load-bearing, not cosmetic: when a narrow header overflows, WHICH control is pushed
 * off the edge depends on its position. Two shells that disagree about the order lose different
 * controls at the same width, and a mobile spec that clicks only one of them passes in one vertical
 * while the other is unusable.
 *
 * ### What this asserts, and what it deliberately does not
 *
 * A **subsequence**, not an exact match. `/books-config` and Angular's `/books-server` have no
 * time-travel controls, and that absence is correct. What is never correct is two controls swapping
 * places.
 *
 * ### Why the file roster is derived
 *
 * Scanned rather than listed, so a seventh vertical — or a new route on an existing one — is covered
 * without editing this file. A hand-kept roster would quietly cover a shrinking share of the headers
 * while reporting the same green.
 */

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

/** The order every vertical's header renders, left to right. */
const CANONICAL_ORDER = ['time-travel', 'url-format', 'copy-link', 'compare-link'] as const;

type ControlRole = (typeof CANONICAL_ORDER)[number];

/**
 * How each framework spells each control.
 *
 * @remarks
 * Keyed on the RENDER site, never the import: `<TimeTravelControls` matches JSX and Svelte and Vue
 * templates but not `import { TimeTravelControls }`, and Angular is keyed on its element selector
 * rather than its component class for the same reason. Import order is sorted by ESLint and has no
 * relationship to render order — a scan that caught it would report a violation in every file.
 */
const MARKERS: Readonly<Record<ControlRole, readonly string[]>> = {
	'compare-link': ['<CompareLinkButton', '<fe-compare-link-button', 'compareLink.element'],
	'copy-link': ['<CopyLinkButton', '<fe-copy-link-button', 'copyLink.element'],
	'time-travel': ['<TimeTravelControls', '<fe-time-travel-controls', 'devtools.headerControls'],
	'url-format': ['<UrlFormatToggle', '<fe-url-format-toggle', 'formatToggle.element'],
};

/** The verticals that must each contribute at least one header to the scan. */
const VERTICAL_PACKAGES = [
	'examples-angular',
	'examples-react-plain',
	'examples-react-rtk',
	'examples-sveltekit',
	'examples-vanilla',
	'examples-vue',
] as const;

/**
 * Strip comments, so prose about a control is never mistaken for the control.
 *
 * @remarks
 * The same precaution `cascadeLayers.test.ts` takes, and for the same reason — these headers carry
 * long explanatory comments, one of which discusses the time-travel cluster three lines above where
 * it renders. Covers block, line, JSX and HTML comment syntax, since the scan spans five languages.
 *
 * @param source - Raw file contents.
 * @returns The source with comments removed.
 */
function stripComments(source: string): string {
	return source
		.replaceAll(/\{\/\*[\s\S]*?\*\/\}/gu, '')
		.replaceAll(/<!--[\s\S]*?-->/gu, '')
		.replaceAll(/\/\*[\s\S]*?\*\//gu, '')
		.replaceAll(/^\s*\/\/.*$/gmu, '');
}

/**
 * Every source file under a directory, recursively.
 *
 * @param dir - Absolute directory to walk.
 * @returns Absolute file paths.
 */
function sourceFiles(dir: string): string[] {
	return readdirSync(dir).flatMap((entry) => {
		const path = join(dir, entry);

		return statSync(path).isDirectory() ? sourceFiles(path) : [path];
	});
}

/**
 * The control roles a file renders, in the order it renders them.
 *
 * @param source - Comment-stripped file contents.
 * @returns The roles, ordered by first appearance.
 */
function renderedOrder(source: string): ControlRole[] {
	const positions: { position: number; role: ControlRole }[] = [];

	for (const role of CANONICAL_ORDER) {
		const found = MARKERS[role]
			.map((marker) => source.indexOf(marker))
			.filter((index) => index >= 0);

		if (found.length > 0) {
			positions.push({ position: Math.min(...found), role });
		}
	}

	return positions.sort((a, b) => a.position - b.position).map(({ role }) => role);
}

/** Every file in the demo apps that renders two or more of the four controls. */
const headerFiles = readdirSync(resolve(REPO_ROOT, 'packages'))
	.filter((name) => name.startsWith('examples-'))
	.map((name) => resolve(REPO_ROOT, 'packages', name, 'src'))
	.filter((dir) => {
		try {
			return statSync(dir).isDirectory();
		} catch {
			return false;
		}
	})
	.flatMap(sourceFiles)
	.map((file) => ({ file, source: stripComments(readFileSync(file, 'utf8')) }))
	// Two or more, so the shared definitions of individual controls are not mistaken for headers.
	.filter(({ source }) => renderedOrder(source).length >= 2)
	.map(({ file, source }) => ({
		order: renderedOrder(source),
		path: file.replace(`${REPO_ROOT}/`, ''),
	}));

describe('header control order', () => {
	it('found headers in all six verticals', () => {
		// The assertion that keeps every assertion below meaningful. A marker map that silently stops
		// matching a framework — a renamed selector, a component moved behind a wrapper — turns this
		// suite green by examining nothing, which is the failure mode every derived roster has to guard
		// against.
		const covered = new Set(
			headerFiles.map(({ path }) => path.split('/')[1] ?? '').filter((name) => name !== ''),
		);

		expect([...covered].sort()).toEqual([...VERTICAL_PACKAGES].sort());
	});

	it('found more than one header per vertical on average', () => {
		// Six files would satisfy the test above while covering one route each; there are three books
		// headers in SvelteKit alone. A number rather than a list, because the exact count is expected
		// to move as routes land.
		expect(headerFiles.length).toBeGreaterThan(VERTICAL_PACKAGES.length);
	});

	it.each(headerFiles.map(({ order, path }) => [path, order] as const))(
		'%s renders %j in canonical order',
		(_path, order) => {
			// A subsequence check: absences are legitimate (no time travel on /books-config or Angular's
			// /books-server), transpositions are not.
			let cursor = 0;

			for (const role of order) {
				const index = CANONICAL_ORDER.indexOf(role, cursor);

				expect(
					index,
					`"${role}" renders out of order — every vertical's header is `
						+ `${CANONICAL_ORDER.join(' → ')}, and this one is ${order.join(' → ')}`,
				).toBeGreaterThanOrEqual(0);
				cursor = index + 1;
			}
		},
	);
});
