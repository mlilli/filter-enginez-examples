/**
 * The home page's module script (`<script type="module">` in `index.html`) — its only JavaScript.
 *
 * @remarks
 * Nothing but the call: the logic is in `installCopy.ts`, where it is tested against the page's markup.
 * `tests/tooling/cloudflareDeploy.test.ts` holds the home page to this one script.
 *
 * @packageDocumentation
 */

import { enhanceInstallCopy } from './installCopy.js';

enhanceInstallCopy(document, navigator);
