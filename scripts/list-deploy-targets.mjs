#!/usr/bin/env node
/**
 * `list-deploy-targets` — print the deploy job's matrix: one entry per package with a `wrangler.jsonc`.
 *
 *     node scripts/list-deploy-targets.mjs                  # pretty JSON on stdout
 *     node scripts/list-deploy-targets.mjs --github-output  # also `targets=<json>` into $GITHUB_OUTPUT
 *
 * @remarks
 * The `gates` job in `.github/workflows/ci.yml` runs this on every event, so a malformed config fails
 * a pull request rather than the deploy after it merges; the `deploy` job reads the output as its
 * matrix. Each entry carries only what a deploy step needs — the package to build, the config to
 * deploy, the directory to check for the local-only corpus, and the hosts for the job's name.
 *
 * Fails when it finds no targets: an empty matrix would make the deploy job a silent no-op.
 *
 * @packageDocumentation
 */

import { appendFileSync } from 'node:fs';

import { listDeployTargets } from './lib/deploy-targets.mjs';

const targets = listDeployTargets().map((target) => ({
	assets: target.assetsDirectory,
	config: target.configPath,
	hosts: target.hosts.join(', '),
	package: target.packageName,
}));

if (targets.length === 0) {
	console.error('✗ list-deploy-targets: no packages/*/wrangler.jsonc found — nothing would deploy.');
	process.exit(1);
}

console.log(JSON.stringify(targets, null, 2));

if (process.argv.includes('--github-output')) {
	const outputFile = process.env['GITHUB_OUTPUT'];

	if (outputFile === undefined || outputFile === '') {
		console.error('✗ list-deploy-targets: --github-output needs $GITHUB_OUTPUT (run it inside GitHub Actions).');
		process.exit(1);
	}

	appendFileSync(outputFile, `targets=${JSON.stringify(targets)}\n`);
}
