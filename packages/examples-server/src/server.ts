/**
 * `server.ts` — a zero-dependency `node:http` server exposing the engine over HTTP. The same
 * `applyConfig` brain the CLI uses, behind `POST /filter`.
 *
 * @remarks
 * No framework — just `node:http` — to make the point that the isomorphic core needs nothing but a
 * runtime. Routing/validation live in the pure `handleRequest`; this file only reads the body, calls
 * it, and writes the response. Run via `tsx`: `pnpm --filter @filter-enginez/examples-server serve`.
 *
 * @packageDocumentation
 */

import { initializeBitmapAcceleration } from '@filter-enginez/core';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';

import { handleRequest } from './requestHandler.js';

/** Port to listen on (override with `PORT`). */
const PORT = Number(process.env['PORT'] ?? 5198);

/** Collect a request body into a string. */
async function readBody(request: IncomingMessage): Promise<string> {
	const chunks: Buffer[] = [];

	for await (const chunk of request) {
		chunks.push(chunk as Buffer);
	}

	return Buffer.concat(chunks).toString('utf8');
}

/** Pipe a real request through the pure handler and write the JSON response. */
function respond(request: IncomingMessage, response: ServerResponse): void {
	void (async () => {
		const method = request.method ?? 'GET';
		const path = (request.url ?? '/').split('?')[0] ?? '/';
		const body = method === 'POST' ? await readBody(request) : undefined;
		const { body: payload, status } = await handleRequest(method, path, body);

		response.writeHead(status, { 'content-type': 'application/json' });
		response.end(`${JSON.stringify(payload, null, 2)}\n`);
	})().catch((error: unknown) => {
		response.writeHead(500, { 'content-type': 'application/json' });
		response.end(JSON.stringify({ error: String(error) }));
	});
}

/** Boot the engine's WASM acceleration, then start listening. */
async function start(): Promise<void> {
	await initializeBitmapAcceleration();

	createServer(respond).listen(PORT, () => {
		process.stdout.write(
			`@filter-enginez/examples-server listening on http://localhost:${PORT}\n`
			+ '  GET  /datasets\n'
			+ '  GET  /corpus/<dataset>.json  full corpus (for a server-backed browser engine)\n'
			+ '  POST /filter   { "dataset": "books", "config": { ... }, "limit"?: 10 }\n'
			+ '  POST /query    same body (+ optional "query") — also returns result indices\n'
			+ '                 + predictive-disable facet metadata\n',
		);
	});
}

start().catch((error: unknown) => {
	process.stderr.write(`Fatal: ${String(error)}\n`);
	process.exitCode = 1;
});
