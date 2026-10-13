#!/usr/bin/env node
/**
 * `strip-local-corpus` — remove the local-only real wine corpus from a production build.
 *
 *     node ../../scripts/strip-local-corpus.mjs dist            # run from an app package, after its build
 *
 * @remarks
 * `scripts/link-wine-corpus.mjs` links the real wine corpus (`data-real-full.json` / `.ndjson`, ~116 MB
 * each) into every wine app's static-asset directory so the dev servers can stream it. Every bundler
 * here copies that directory into its build output verbatim — Vite's `publicDir`, SvelteKit's
 * `static/`, Angular's `public/` — so on a machine where the corpus is linked, a production build
 * would carry it into anything deployed from that build.
 *
 * 🔴 That corpus must never be distributed. It comes from the Kaggle "Wine Reviews" dataset, which is
 * CC BY-NC-SA 4.0 (non-commercial, share-alike) and holds WineEnthusiast's review text, while this
 * project is Apache-2.0 and may be used commercially. Each app's `build` script therefore ends with this
 * step, and `tests/tooling/buildsStripLocalCorpus.test.ts` fails if one does not. With the corpus
 * removed, a deployed app falls back to the synthetic generators, exactly as it does in CI.
 *
 * Walks every directory given (without following symlinked directories), deletes each file whose name
 * starts with `data-real-` or `winemag-data` (`lib/local-corpus.mjs`), and reports what it removed. A directory that does not
 * exist is an error: it means a build script points this at the wrong output path, and a strip that
 * silently checks nothing looks exactly like one that found nothing.
 *
 * @packageDocumentation
 */

import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

import { stripLocalCorpus } from './lib/local-corpus.mjs';

const directories = process.argv.slice(2).map((argument) => resolve(argument));

if (directories.length === 0) {
	console.error('✗ strip-local-corpus: pass at least one build-output directory.');
	process.exit(1);
}

for (const directory of directories) {
	if (!existsSync(directory)) {
		console.error(`✗ strip-local-corpus: ${directory} does not exist — is the build script pointing at the right output?`);
		process.exit(1);
	}

	const removed = stripLocalCorpus(directory);

	if (removed.length > 0) {
		console.log(`→ strip-local-corpus: removed ${removed.length} local-only wine corpus file(s) from ${directory}`);
		console.log('  (CC BY-NC-SA 4.0 data — never deployed; the build falls back to synthetic wines)');
	}
}
