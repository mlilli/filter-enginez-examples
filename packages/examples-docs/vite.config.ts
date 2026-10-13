/**
 * Vite configuration for `@filter-enginez/examples-docs` — the standalone documentation site.
 *
 * @remarks
 * Deliberately minimal versus the demo apps: the docs slice is self-contained (its styling ships as an
 * injected `DOCS_CSS` string, its only runtime workspace import is `@filter-enginez/core`, and the
 * in-browser playground runs `createFilterEngine` on the MAIN THREAD over a lazily-imported corpus).
 * So there is no Tailwind, no Leaflet, no worker chunk, and no `/api` proxy here — just the React
 * plugin, the `process.env` shim every browser bundle needs, and the load-bearing single-copy dedupe.
 */

import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
	build: {
		sourcemap: true,
		target: 'es2022',
	},
	/**
	 * Inline Node-style globals CJS-flavored transitive deps reference at module top. Without these the
	 * dev server runs but throws `ReferenceError: process is not defined` on the first `process.env`
	 * read. `process.env.NODE_ENV` becomes the string literal; other reads land on the empty-object stub
	 * (correct "unset" semantics in a browser). `global` → `globalThis` aliases the Node global object.
	 */
	define: {
		global: 'globalThis',
		'process.env': '{}',
		'process.env.NODE_ENV': JSON.stringify(process.env['NODE_ENV'] ?? 'development'),
	},
	optimizeDeps: {
		// Only bare npm deps — never the pnpm-linked `@filter-enginez/*` `.ts`-source workspace packages,
		// which Vite would snapshot once and then serve stale on every source edit.
		include: ['react', 'react-dom', 'react-dom/client'],
	},
	plugins: [react()],
	resolve: {
		// One React + one signals-core copy across the linked workspace graph. Comlink is kept in the
		// dedupe list for parity with the React apps even though the docs never spawn a worker.
		dedupe: ['react', 'react-dom', '@preact/signals-core', 'comlink'],
	},
	server: {
		host: '127.0.0.1',
		// 5180 — the next free slot after the demo apps + API server (see the port map in
		// `playwright.config.ts`). `strictPort` so a collision fails loudly instead of drifting.
		port: 5180,
		strictPort: true,
	},
});
