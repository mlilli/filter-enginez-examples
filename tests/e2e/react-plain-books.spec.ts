/**
 * `/books` on the plain-React app — the cases every app's books page shares.
 *
 * @remarks
 * The plain-React app renders the same `<BooksApp>` as the RTK app over `reactive-signals` with no
 * Redux mirror, so its own filter flow is `books.spec.ts`'s. What it must still prove in a browser is
 * that it binds the shared cores the same way the other five do, which is exactly what
 * `./booksParity.ts` asserts.
 *
 * @packageDocumentation
 */

import { describeBooksParity } from './booksParity.js';

describeBooksParity({ id: 'react-plain', label: 'React plain' });
