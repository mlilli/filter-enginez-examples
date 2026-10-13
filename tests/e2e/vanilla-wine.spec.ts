/**
 * `/wine` on the framework-less app — the worker tier over `reactive-signals`, hand-built DOM.
 *
 * @remarks
 * **Every case lives in `./wineFlow.ts`**, run identically by all six verticals — including the
 * corpus-tier assertion, the panel-scroll measurement and the `inert` check on the locked panel body
 * (see `wineFlow.ts`'s preset case). Every vertical asserts the same things, so nothing
 * vertical-specific remains here beyond the origin.
 *
 * @packageDocumentation
 */

import { vanillaUrl } from './vanillaBase.js';
import { describeWineVertical } from './wineFlow.js';

describeWineVertical({ id: 'vanilla', label: 'vanilla', url: vanillaUrl });
