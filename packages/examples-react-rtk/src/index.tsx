/**
 * @filter-enginez/examples-react-rtk
 *
 * Demo app: React 19 + Redux Toolkit + react-signals + redux-bridge +
 * url-state-router + worker-bridge. Three datasets (`/wine`, `/books`, `/real-estate`), plus
 * `/books-config` (books driven by a JSON config), `/books-server` (books filtered on the
 * Node `examples-server`), an `/about` page explaining how the engine works, and `/compare`.
 *
 * @remarks
 * **Entry point.** The actual Vite entry is `src/main.tsx`, which mounts `<App />`
 * (defined in `src/App.tsx`) into the `#root` element from `index.html`. This file exists
 * as a convenience re-export so other packages or scripts can `import { App } from
 * '@filter-enginez/examples-react-rtk'` if they ever need to embed the app in a host shell
 * (e.g., a docs site mounting the wine app inside a "live demo" frame).
 *
 * @packageDocumentation
 */

export { App } from './App.js';
