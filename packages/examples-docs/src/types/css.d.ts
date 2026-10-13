/**
 * Ambient module declaration for CSS side-effect imports — lets `import './app.css'`
 * typecheck under TypeScript strict mode without erroring on the missing module.
 *
 * Vite handles the runtime side at build time; TypeScript only needs to know "this import
 * is allowed" — we don't extract types from the CSS itself. Mirrors the sibling React apps'
 * `src/types/css.d.ts` (the docs site imports only plain global CSS — brand tokens +
 * `ui-styles`).
 */

declare module '*.css' {
	// CSS modules export an object of class-name strings; plain global CSS exports nothing.
	// Our project uses plain global CSS, so the default export is `undefined` at runtime,
	// but the declared shape is the permissive CSS-modules one, so a module-style import would
	// typecheck against this same declaration.
	const content: Record<string, string>;

	export default content;
}
