/**
 * `<BooksServerRoute />` — the `/books-server` route element (signals-only sibling of the RTK app's
 * server-backed route).
 *
 * @remarks
 * Boots the HTTP-backed engine, then mounts the EXACT same `<BooksApp />` the in-browser `/books`
 * route uses, inside the engine provider. Same shape as `<DatasetRoute>` — minus Redux (this is the
 * signals-surface app, so there's no mirror store to wrap or detach): the only differences from the
 * client route are (a) the engine is server-backed and (b) the boot/failure screens speak to the
 * server rather than a streaming corpus loader. A failed boot means the Node server isn't running, so
 * the offline screen tells you how to start it.
 *
 * The router loads this module on the route's first visit (`React.lazy` in `App.tsx`), with
 * `<ServerConnecting>` as the fallback, so neither the HTTP engine nor the page it mounts is in the
 * startup bundle.
 *
 * @packageDocumentation
 */

import type { Book } from '@filter-enginez/mock-data/books';
import type { SignalsEngine } from '@filter-enginez/reactive-signals';

import { bootBooksServerEngine } from '@filter-enginez/examples-shared/books-server-core';
import { EXAMPLES_SERVER_START_COMMAND, SERVER_ROUTE_SCREEN_COPY } from '@filter-enginez/examples-shared/boot-caption';
import { useUrlSyncBindings } from '@filter-enginez/examples-shared/url';
import { FilterEngineProvider } from '@filter-enginez/react-signals';
import { FilterEngineUrlSync } from '@filter-enginez/url-state-router';
import { useEffect, useState } from 'react';

import { BooksApp } from './BooksApp.js';
import { ServerConnecting } from './ServerConnecting.js';

/**
 * Boot + provide the server-backed books engine, then render `<BooksApp />`.
 */
export const BooksServerRoute = (): React.ReactElement => {
	const [engine, setEngine] = useState<SignalsEngine<Book> | null>(null);
	const [error, setError] = useState<Error | null>(null);

	useEffect(() => {
		let isCancelled = false;
		let booted: SignalsEngine<Book> | null = null;

		bootBooksServerEngine().then(
			(next) => {
				// Unmounted before boot resolved — tear the just-created engine down immediately.
				if (isCancelled) {
					next.dispose();

					return;
				}
				booted = next;
				setEngine(next);
			},
			(caught: unknown) => {
				if (!isCancelled) {
					setError(caught instanceof Error ? caught : new Error(String(caught)));
				}
			},
		);

		return () => {
			isCancelled = true;
			if (booted !== null) {
				booted.dispose();
			}
		};
	}, []);

	if (error !== null) {
		return <ServerOffline error={error} />;
	}
	if (engine === null) {
		return <ServerConnecting />;
	}

	return <ServerBooksView engine={engine} />;
};

/**
 * The booted page: `<BooksApp />` inside the engine provider, with URL sync.
 *
 * @remarks
 * Its own component so the URL bindings are built only once an engine exists. They are the same as
 * `<DatasetView>`'s (`useUrlSyncBindings`).
 *
 * @param props - The booted server engine.
 * @returns The provider tree.
 */
const ServerBooksView = ({ engine }: { readonly engine: SignalsEngine<Book> }): React.ReactElement => {
	const urlSync = useUrlSyncBindings(engine.core);

	return (
		<FilterEngineProvider engine={engine}>
			<FilterEngineUrlSync engine={urlSync.engine} asyncConfig={engine.asyncEngine} serializer={urlSync.serializer} />
			<BooksApp engineLabel="server engine over HTTP" tier="server" />
		</FilterEngineProvider>
	);
};

/** Offline screen — a failed boot means the server isn't running; tell the user how to start it. */
const ServerOffline = ({ error }: { readonly error: Error }): React.ReactElement => {
	// `<main>`: with the server unreachable, this message is the page's main content.
	return (
		<main
			className="min-h-screen flex flex-col items-center justify-center gap-4 p-8 text-center"
			style={{ background: 'var(--gray-0)', color: 'var(--gray-10)' }}
		>
			<p className="text-lg font-semibold" style={{ color: 'var(--danger)', fontFamily: 'var(--font-display)' }}>
				{SERVER_ROUTE_SCREEN_COPY.offlineTitle}
			</p>
			<p style={{ color: 'var(--gray-9)', fontFamily: 'var(--font-mono)', fontSize: '13px' }}>{error.message}</p>
			<p className="text-xs" style={{ color: 'var(--gray-8)', fontFamily: 'var(--font-mono)' }}>
				{SERVER_ROUTE_SCREEN_COPY.offlineHintLead}
				<code>{EXAMPLES_SERVER_START_COMMAND}</code>
				{SERVER_ROUTE_SCREEN_COPY.offlineHintTail}
			</p>
		</main>
	);
};
