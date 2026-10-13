/**
 * `gen-sample.ts` — regenerates `sample-configs/books.json`, a committed, guaranteed-valid
 * `FilterEngineConfig` that filters the books corpus to a clear subset.
 *
 * @remarks
 * Dev tooling, run once via `tsx` (`pnpm --filter @filter-enginez/examples-server gen:sample`); the
 * output JSON is committed as the CLI/HTTP sample input. Building it through the real rule factories +
 * `exportConfig` guarantees the serialized shape matches what `loadConfig` expects.
 *
 * @packageDocumentation
 */

import { createFilterEngine, exportConfig, inSet, range } from '@filter-enginez/core';
import { books } from '@filter-enginez/mock-data/books';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/** The most common genre in the corpus — guarantees the InSet rule matches a real subset. */
function mostCommonGenre(): string {
	const counts = new Map<string, number>();

	for (const book of books) {
		const genre = (book as { genre?: unknown }).genre;

		if (typeof genre === 'string') {
			counts.set(genre, (counts.get(genre) ?? 0) + 1);
		}
	}

	let best = '';
	let bestCount = -1;

	for (const [genre, count] of counts) {
		if (count > bestCount) {
			bestCount = count;
			best = genre;
		}
	}

	return best;
}

async function main(): Promise<void> {
	const genre = mostCommonGenre();
	const engine = createFilterEngine({ sourceData: books });

	engine.addRule('genre', inSet('genre', [genre]));
	engine.addRule('publication-year', range('publicationYear', { max: 2025, min: 2000 }));

	const config = { ...exportConfig(engine), label: `${genre} · published 2000–2025` };
	const matched = engine.getResultCount();

	await engine.destroy();

	const outPath = join(dirname(fileURLToPath(import.meta.url)), '..', 'sample-configs', 'books.json');

	mkdirSync(dirname(outPath), { recursive: true });
	writeFileSync(outPath, `${JSON.stringify(config, null, 2)}\n`);
	process.stdout.write(`Wrote ${outPath}\n  "${config.label}" matches ${matched.toLocaleString()} of ${books.length.toLocaleString()} books\n`);
}

main().catch((error: unknown) => {
	process.stderr.write(`Fatal: ${String(error)}\n`);
	process.exitCode = 1;
});
