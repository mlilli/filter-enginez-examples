/**
 * Render this page at build time: its HTML holds the boot caption, and the build then writes the
 * booted page's snapshot into it (`scripts/prerender-routes.mjs`), as every app's build does for its
 * dataset routes. The engine still boots in the browser on mount.
 */
export const prerender = true;
