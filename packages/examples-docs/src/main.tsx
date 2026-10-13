/**
 * Standalone documentation site — React entry point. Mounts `<App />` into `#root` from `index.html`.
 *
 * @remarks
 * Vite + React 19 + StrictMode, matching the React apps' entry shape. `app.css` (brand tokens +
 * `ui-styles`) is imported first so the CSS custom properties the docs read are defined before the
 * tree renders.
 *
 * @packageDocumentation
 */

import './app.css';

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import { App } from './App.js';

const rootElement = document.getElementById('root');

if (rootElement === null) {
	throw new Error('main.tsx: #root element not found in index.html');
}

createRoot(rootElement).render(
	<StrictMode>
		<App />
	</StrictMode>,
);
