/**
 * The comparison page's module script (`<script type="module">` in `compare.html`).
 *
 * @remarks
 * Nothing but the call: the logic is in `comparePage.ts`, where it is tested against the page's markup.
 *
 * @packageDocumentation
 */

import { enhanceComparePage } from './comparePage.js';

enhanceComparePage(document, window.location);
