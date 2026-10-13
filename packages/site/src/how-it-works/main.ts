/**
 * The how-it-works page's module script (`<script type="module">` in `how-it-works.html`).
 *
 * @remarks
 * Nothing but the call: the page's text is already in the HTML, and everything this script adds lives
 * in `howItWorksPage.ts`, where it is tested against the prerendered markup. The page is never
 * unmounted, so the teardown that function returns is not needed here.
 *
 * @packageDocumentation
 */

import { enhanceHowItWorksPage } from './howItWorksPage.js';

enhanceHowItWorksPage(document, window.location);
