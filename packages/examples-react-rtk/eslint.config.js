/**
 * eslint.config.js
 * Location: packages/examples-react-rtk
 *
 * Browser + React package — consumes the shared `react` preset. Every shared
 * rule lives in `@filter-enginez/eslint/config`.
 *
 * `tsconfigRootDir` anchors the preset's `allowDefaultProject` globs (`*.config.ts`) to this
 * package, so `vite.config.ts` resolves whether ESLint runs here (`turbo run lint`) or from the
 * repo root (the pre-commit hook's lint-staged pass).
 */
import { react } from '@filter-enginez/eslint/config';

export default [
	...react,
	{
		languageOptions: {
			parserOptions: {
				tsconfigRootDir: import.meta.dirname,
			},
		},
	},
];
