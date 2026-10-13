/**
 * eslint.config.js
 * Location: packages/site
 *
 * The landing page ships no JavaScript; the TypeScript here is the Cloudflare Worker (`src/`) and the
 * Vite config. The Worker runs on the Workers runtime — no DOM — so it takes the `nodeIsomorphic`
 * preset, as `examples-server` does.
 *
 * `tsconfigRootDir` anchors the preset's `allowDefaultProject` globs (`*.config.ts`) to this package,
 * so `vite.config.ts` resolves whether ESLint runs here (`turbo run lint`) or from the repo root (the
 * pre-commit hook's lint-staged pass).
 */
import { nodeIsomorphic } from '@filter-enginez/eslint/config';

export default [
	{
		ignores: ['.wrangler/**', 'dist/**'],
	},
	...nodeIsomorphic,
	{
		languageOptions: {
			parserOptions: {
				tsconfigRootDir: import.meta.dirname,
			},
		},
	},
];
