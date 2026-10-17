/**
 * `<DocsPlaygroundPage />` — the "try it live" surface: edit a JSON `FilterEngineConfig` against a
 * real dataset and run the actual engine in the browser. The point it makes is the isomorphic one —
 * this is the very same `createFilterEngine({ sourceData, config })` that the Node `POST /filter`
 * endpoint runs server-side.
 *
 * @remarks
 * The corpus is lazy-imported (a separate chunk) so the docs' initial bundle stays light. Engine +
 * config errors are caught and shown inline. Browser-only; lives in the browser-only examples slice.
 *
 * @packageDocumentation
 */

import { createFilterEngine, type FilterEngineConfig } from '@filter-enginez/core';
import { useCallback, useMemo, useState } from 'react';

import { CodeBlock } from './CodeBlock.js';

/** The datasets the playground can filter. */
type PlaygroundDataset = 'books' | 'wine';

/** A sensible starting config per dataset (real fields, deterministic non-empty result). */
const DEFAULT_CONFIGS: Readonly<Record<PlaygroundDataset, string>> = {
	books: JSON.stringify(
		{
			label: 'Recent, medium-length books',
			rules: [
				{ id: 'year', rule: { config: { max: 2025, min: 2010 }, field: 'publicationYear', type: 'RangeRule' }},
				{ id: 'pages', rule: { config: { max: 500, min: 200 }, field: 'pageCount', type: 'RangeRule' }},
			],
			version: 1,
		},
		null,
		2,
	),
	wine: JSON.stringify(
		{
			label: 'Highly-rated, affordable wines',
			rules: [
				{ id: 'points', rule: { config: { max: 100, min: 90 }, field: 'points', type: 'RangeRule' }},
				// `priceUsd`, the wine field — a range over a field the records do not have matches nothing.
				{ id: 'price', rule: { config: { max: 50, min: 10 }, field: 'priceUsd', type: 'RangeRule' }},
			],
			version: 1,
		},
		null,
		2,
	),
};

/** Lazy-load a dataset's committed default-tier corpus. */
async function loadCorpus(dataset: PlaygroundDataset): Promise<readonly unknown[]> {
	if (dataset === 'wine') {
		return (await import('@filter-enginez/mock-data/wine')).wines;
	}

	return (await import('@filter-enginez/mock-data/books')).books;
}

/** The outcome of a run. */
interface RunResult {
	readonly matched: number;
	readonly sample: readonly unknown[];
	readonly total: number;
}

/** Format one record as a compact `key=value` preview. */
function previewRecord(record: unknown): string {
	if (typeof record !== 'object' || record === null) {
		return String(record);
	}
	const parts: string[] = [];

	for (const [key, value] of Object.entries(record)) {
		if ((typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') && value !== '') {
			parts.push(`${key}=${String(value)}`);
			if (parts.length >= 4) {
				break;
			}
		}
	}

	return parts.join('  ');
}

/**
 * The live playground page.
 */
export const DocsPlaygroundPage = (): React.ReactElement => {
	const [dataset, setDataset] = useState<PlaygroundDataset>('books');
	const [configText, setConfigText] = useState<string>(DEFAULT_CONFIGS.books);
	const [result, setResult] = useState<RunResult | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [isBusy, setIsBusy] = useState(false);

	// Switching dataset resets the editor to that dataset's default config and clears the last run.
	// Done in the change handler, the one place the dataset changes, rather than in an effect that
	// would first render the new dataset beside the old dataset's config and results.
	const handleDatasetChange = useCallback((event: React.ChangeEvent<HTMLSelectElement>): void => {
		const nextDataset = event.target.value as PlaygroundDataset;

		setDataset(nextDataset);
		setConfigText(DEFAULT_CONFIGS[nextDataset]);
		setResult(null);
		setError(null);
	}, []);

	const run = useCallback(async (): Promise<void> => {
		setIsBusy(true);
		setError(null);

		try {
			const config = JSON.parse(configText) as FilterEngineConfig;
			const corpus = await loadCorpus(dataset);
			const engine = createFilterEngine({ config, sourceData: corpus });

			try {
				setResult({ matched: engine.getResultCount(), sample: engine.getResults().slice(0, 8), total: corpus.length });
			} finally {
				await engine.destroy();
			}
		} catch (caught) {
			setError((caught as Error).message);
			setResult(null);
		} finally {
			setIsBusy(false);
		}
	}, [configText, dataset]);

	const curlHint = useMemo(
		() => `curl -X POST localhost:24618/filter \\\n  -H 'content-type: application/json' \\\n  -d '${JSON.stringify({ config: '<the config on the left>', dataset })}'`,
		[dataset],
	);

	return (
		<div className="fe-doc">
			<style>{PLAYGROUND_CSS}</style>
			<p className="fe-doc-eyebrow">try it live</p>
			<h1 className="fe-doc-title">Playground</h1>
			<p className="fe-doc-lead">
				Edit a JSON <code>FilterEngineConfig</code> and run the real engine against a dataset, right here in your
				browser. This is the same engine and config that run server-side via the Node <code>POST /filter</code>{' '}
				endpoint — the isomorphic point, made testable.
			</p>

			<div className="fe-pg">
				<div className="fe-pg__editor">
					<div className="fe-pg__controls">
						<label className="fe-pg__label">
							<span>dataset</span>
							<select
								className="fe-pg__select"
								value={dataset}
								onChange={handleDatasetChange}
							>
								<option value="books">books (≈10k)</option>
								<option value="wine">wine (≈10k)</option>
							</select>
						</label>
						<button type="button" className="fe-pg__run" onClick={() => void run()} disabled={isBusy}>
							{isBusy ? 'running…' : 'Run ▸'}
						</button>
					</div>
					<textarea
						className="fe-pg__textarea"
						spellCheck={false}
						value={configText}
						aria-label="FilterEngineConfig JSON"
						onChange={(event) => {
							setConfigText(event.target.value);
						}}
					/>
				</div>

				<div className="fe-pg__output">
					{error !== null ? (
						<p className="fe-pg__error">{error}</p>
					) : result === null ? (
						<p className="fe-pg__hint">Press Run to filter {dataset} with the config on the left.</p>
					) : (
						<>
							<p className="fe-pg__count">
								<span className="fe-pg__count-num">{result.matched.toLocaleString()}</span> of{' '}
								{result.total.toLocaleString()} {dataset} match
							</p>
							<ul className="fe-pg__list">
								{result.sample.map((record) => (
									<li key={String((record as { id?: number | string }).id ?? previewRecord(record))} className="fe-pg__row">
										{previewRecord(record)}
									</li>
								))}
							</ul>
						</>
					)}
				</div>
			</div>

			<h2 className="fe-doc-h2">The same config, server-side</h2>
			<p className="fe-doc-p">
				Nothing here is browser-specific. The identical config runs unchanged in a plain Node process via the{' '}
				<code>@filter-enginez/examples-server</code> demo:
			</p>
			<CodeBlock code={curlHint} ariaLabel="Server curl example" />
		</div>
	);
};

/** Scoped playground styles. */
const PLAYGROUND_CSS = `
.fe-pg { display: grid; grid-template-columns: 1fr 1fr; gap: var(--space-4); margin: var(--space-4) 0 var(--space-2); }
@media (max-width: 760px) { .fe-pg { grid-template-columns: 1fr; } }
.fe-pg__editor { display: flex; flex-direction: column; gap: var(--space-2); }
.fe-pg__controls { display: flex; align-items: center; justify-content: space-between; gap: var(--space-3); }
.fe-pg__label { font-family: var(--font-mono); font-size: var(--text-xs); color: var(--gray-8); display: inline-flex; align-items: center; gap: var(--space-2); }
.fe-pg__select {
	font-family: var(--font-mono); font-size: var(--text-sm); color: var(--gray-10);
	background: var(--gray-1); border: 1px solid var(--gray-5); border-radius: var(--radius-sm); padding: 4px 8px;
}
.fe-pg__run {
	padding: 6px 18px; background: var(--accent-soft); border: 1px solid var(--accent);
	border-radius: var(--radius-md); color: var(--accent-glow);
	font-family: var(--font-mono); font-size: var(--text-sm); cursor: pointer;
}
.fe-pg__run:disabled { opacity: 0.5; cursor: default; }
.fe-pg__textarea {
	width: 100%; min-height: 260px; resize: vertical;
	padding: var(--space-3); background: var(--gray-1); color: var(--gray-10);
	border: 1px solid var(--gray-4); border-radius: var(--radius-md);
	font-family: var(--font-mono); font-size: var(--text-sm); line-height: var(--leading-normal);
	tab-size: 2;
}
.fe-pg__textarea:focus-visible { outline: none; border-color: var(--accent); }
.fe-pg__output {
	padding: var(--space-4); background: var(--gray-1);
	border: 1px solid var(--gray-4); border-radius: var(--radius-md); min-height: 260px;
}
.fe-pg__hint, .fe-pg__error { font-family: var(--font-mono); font-size: var(--text-sm); line-height: var(--leading-normal); }
.fe-pg__hint { color: var(--gray-8); }
.fe-pg__error { color: var(--danger); white-space: pre-wrap; }
.fe-pg__count { font-family: var(--font-mono); font-size: var(--text-base); color: var(--gray-9); margin: 0 0 var(--space-3); }
.fe-pg__count-num { color: var(--accent); font-weight: 600; font-variant-numeric: tabular-nums; }
.fe-pg__list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 4px; }
.fe-pg__row {
	font-family: var(--font-mono); font-size: var(--text-xs); color: var(--gray-9);
	padding: 4px 8px; background: var(--gray-2); border-radius: var(--radius-sm);
	overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
`;
