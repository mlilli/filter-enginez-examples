/**
 * `/real-estate` on the plain-React app — the cases every app's real-estate page shares.
 *
 * @remarks
 * The plain-React app renders the same real-estate page as the RTK app with no Redux mirror, so its
 * own filter flow is `real-estate.spec.ts`'s. What it must still prove in a browser is that it binds
 * the shared cores the same way the other five do, which is exactly what `./realEstateParity.ts`
 * asserts.
 *
 * @packageDocumentation
 */

import { describeRealEstateParity } from './realEstateParity.js';

describeRealEstateParity({ id: 'react-plain', label: 'React plain' });
