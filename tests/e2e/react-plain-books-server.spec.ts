/**
 * `/books-server` on the plain-React app — the cases every server-backed books page shares.
 *
 * @remarks
 * The plain-React app queries the same examples server as the RTK app, through the same `/api` proxy,
 * so it names the same two endpoints and the same start command. Its filter flow is
 * `books-server.spec.ts`'s; `./booksServerParity.ts` asserts what all four server-backed apps share.
 *
 * @packageDocumentation
 */

import { EXAMPLES_SERVER_START_COMMAND } from '../../packages/examples-shared/src/boot-caption/index.js';
import { describeBooksServerParity } from './booksServerParity.js';

describeBooksServerParity({
	corpusEndpoint: '**/api/corpus/books.json',
	id: 'react-plain',
	label: 'React plain',
	queryEndpoint: '**/api/query',
	startCommand: EXAMPLES_SERVER_START_COMMAND,
});
