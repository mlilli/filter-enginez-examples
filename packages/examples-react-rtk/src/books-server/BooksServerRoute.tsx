/**
 * `<BooksServerRoute />` — the `/books-server` route element.
 *
 * @remarks
 * Boots the HTTP-backed engine, then mounts the EXACT same `<BooksApp />` the in-browser `/books`
 * route uses, inside the same Redux + engine providers. The only differences from `<DatasetRoute>`
 * are (a) the engine is server-backed and (b) the boot/failure screens speak to the server rather
 * than a streaming corpus loader — a failed boot means the Node server isn't running, so the offline
 * screen tells you how to start it.
 *
 * @packageDocumentation
 */

import type { Book } from '@filter-enginez/mock-data/books';
import type { SignalsEngine } from '@filter-enginez/reactive-signals';

import { BrainSynapse } from '@filter-enginez/brand';
import { bootBooksServerEngine } from '@filter-enginez/examples-shared/books-server-core';
import { useUrlFormat } from '@filter-enginez/examples-shared/url';
import { verticalSubtitle } from '@filter-enginez/examples-shared/verticals';
import { FilterEngineProvider } from '@filter-enginez/react-signals';
import { createTaggedSerializer, FilterEngineUrlSync } from '@filter-enginez/url-state-router';
import { useEffect, useMemo, useState } from 'react';
import { Provider } from 'react-redux';

import { BooksApp } from '../books/BooksApp.js';
import { createBooksStore } from '../books/store.js';

/** The booted handle: the engine, its Redux mirror store, and a detach for teardown. */
interface BootedServer {
	readonly detach: () => void;
	readonly engine: SignalsEngine<Book>;
	readonly store: ReturnType<typeof createBooksStore>['store'];
}

/**
 * Boot + provide the server-backed books engine, then render `<BooksApp />`.
 */
export const BooksServerRoute = (): React.ReactElement => {
	const [booted, setBooted] = useState<BootedServer | null>(null);
	const [error, setError] = useState<Error | null>(null);

	useEffect(() => {
		let isCancelled = false;
		let handle: BootedServer | null = null;

		bootBooksServerEngine().then(
			(engine) => {
				// Unmounted before boot resolved — tear the just-created engine down immediately.
				if (isCancelled) {
					engine.dispose();

					return;
				}
				const { detach, store } = createBooksStore(engine.core);

				handle = { detach, engine, store };
				setBooted(handle);
			},
			(caught: unknown) => {
				if (!isCancelled) {
					setError(caught instanceof Error ? caught : new Error(String(caught)));
				}
			},
		);

		return () => {
			isCancelled = true;
			if (handle !== null) {
				handle.detach();
				handle.engine.dispose();
			}
		};
	}, []);

	// Shareable-URL serializer for the app-wide format toggle — same wiring as `<DatasetRoute>`.
	const urlFormat = useUrlFormat();
	const urlSerializer = useMemo(() => createTaggedSerializer(urlFormat), [urlFormat]);

	if (error !== null) {
		return <ServerOffline error={error} />;
	}
	if (booted === null) {
		return <ServerConnecting />;
	}

	return (
		<Provider store={booted.store}>
			<FilterEngineProvider engine={booted.engine}>
				<FilterEngineUrlSync engine={booted.engine.core} asyncConfig={booted.engine.asyncEngine} serializer={urlSerializer} />
				<BooksApp engineLabel="server engine over HTTP" subtitle={verticalSubtitle('Books', 'react-rtk', 'server')} />
			</FilterEngineProvider>
		</Provider>
	);
};

/** Full-screen "talking to the server" loader — the brand `<BrainSynapse>` + a server caption. */
const ServerConnecting = (): React.ReactElement => {
	return (
		<div
			className="min-h-screen flex flex-col items-center justify-center gap-6 px-6"
			style={{ background: 'var(--gray-0)' }}
		>
			<BrainSynapse width={520} ariaLabel="Connecting to the filter server" className="fe-boot-loader" />
			<p
				className="text-xs uppercase"
				style={{ color: 'var(--gray-8)', fontFamily: 'var(--font-mono)', letterSpacing: '0.16em' }}
			>
				Filtering on the Node server · fetching corpus + initial state
			</p>
		</div>
	);
};

/** Offline screen — a failed boot means the server isn't running; tell the user how to start it. */
const ServerOffline = ({ error }: { readonly error: Error }): React.ReactElement => {
	return (
		<div
			className="min-h-screen flex flex-col items-center justify-center gap-4 p-8 text-center"
			style={{ background: 'var(--gray-0)', color: 'var(--gray-10)' }}
		>
			<p className="text-lg font-semibold" style={{ color: 'var(--danger)', fontFamily: 'var(--font-display)' }}>
				Can&apos;t reach the filter server
			</p>
			<p style={{ color: 'var(--gray-9)', fontFamily: 'var(--font-mono)', fontSize: '13px' }}>{error.message}</p>
			<p className="text-xs" style={{ color: 'var(--gray-8)', fontFamily: 'var(--font-mono)' }}>
				Start it with <code>pnpm --filter @filter-enginez/examples-server serve:api</code>, then refresh.
			</p>
		</div>
	);
};
