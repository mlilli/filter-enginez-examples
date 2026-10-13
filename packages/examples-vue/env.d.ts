/// <reference types="vite/client" />

// Ambient shim so tools that resolve `.vue` imports with a plain TypeScript program (e.g.
// typescript-eslint's `no-unsafe-*` type-aware rules) see a typed component rather than an unresolved
// `error` type. `vue-tsc` resolves each `.vue` SFC to its real types, so this fallback never weakens
// the actual prop / emit checking — it only backstops the non-Volar lint program.
declare module '*.vue' {
	import type { DefineComponent } from 'vue';

	const component: DefineComponent<Record<string, unknown>, Record<string, unknown>, unknown>;

	export default component;
}
