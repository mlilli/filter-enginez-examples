/**
 * Ambient module declaration for CSS side-effect imports — lets `import './globals.css'`
 * typecheck under TypeScript strict mode without erroring on the missing module.
 *
 * Vite + the `@tailwindcss/vite` plugin handle the runtime side at build time. TypeScript
 * only needs to know "this import is allowed" — we don't extract types from the CSS itself.
 */

declare module '*.css' {
	// CSS modules export an object of class-name strings; plain global CSS exports nothing.
	// Our project uses plain global CSS, so the default export is `undefined` at runtime,
	// but we declare a permissive object shape so the same declaration also covers a
	// CSS-modules import.
	const content: Record<string, string>;

	export default content;
}
