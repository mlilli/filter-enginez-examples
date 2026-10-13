/**
 * eslint.config.js
 * Location: packages/examples-server
 *
 * Node-only demo package — consumes the shared `nodeIsomorphic` preset (Node + ECMA globals, plus
 * the `@filter-enginez` boundary rules). The CLI + node:http server deliberately use `node:`
 * builtins + `process` + `console`, all of which the preset permits.
 */
import { nodeIsomorphic } from '@filter-enginez/eslint/config';

export default nodeIsomorphic;
