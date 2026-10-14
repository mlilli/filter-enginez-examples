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
 * @packageDocumentation
 */

import type { Book } from '@filter-enginez/mock-data/books';
import type { SignalsEngine } from '@filter-enginez/reactive-signals';

import { BrainSynapse } from '@filter-enginez/brand';
import { bootBooksServerEngine } from '@filter-enginez/examples-shared/books-server-core';
import { createLinkSerializer } from '@filter-enginez/examples-shared/link-serializer';
import { useUrlFormat } from '@filter-enginez/examples-shared/url';
import { FilterEngineProvider } from '@filter-enginez/react-signals';
import { FilterEngineUrlSync } from '@filter-enginez/url-state-router';
import { useEffect, useMemo, useState } from 'react';

import { BooksApp } from './BooksApp.js';

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

	// Shareable-URL serializer for the app-wide format toggle — same wiring as `<DatasetRoute>`.
	const urlFormat = useUrlFormat();
	const urlSerializer = useMemo(() => createLinkSerializer(urlFormat), [urlFormat]);

	if (error !== null) {
		return <ServerOffline error={error} />;
	}
	if (engine === null) {
		return <ServerConnecting />;
	}

	return (
		<FilterEngineProvider engine={engine}>
			<FilterEngineUrlSync engine={engine.core} asyncConfig={engine.asyncEngine} serializer={urlSerializer} />
			<BooksApp engineLabel="server engine over HTTP" tier="server" />
		</FilterEngineProvider>
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
