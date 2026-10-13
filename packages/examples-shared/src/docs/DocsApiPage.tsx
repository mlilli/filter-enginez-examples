/**
 * `<DocsApiPage />` — the curated API reference, rendered from `API_GROUPS`.
 *
 * @packageDocumentation
 */

import { API_GROUPS } from './content/apiContent.js';

/**
 * The API reference page.
 */
export const DocsApiPage = (): React.ReactElement => {
	return (
		<div className="fe-doc">
			<style>{API_CSS}</style>
			<p className="fe-doc-eyebrow">reference</p>
			<h1 className="fe-doc-title">API reference</h1>
			<p className="fe-doc-lead">
				The load-bearing public surface, grouped by area. Every rule also has its own page under Filter rules;
				this is the at-a-glance index of signatures.
			</p>

			{API_GROUPS.map((group) => (
				<section key={group.title} className="fe-api__group">
					<h2 className="fe-doc-h2">{group.title}</h2>
					<p className="fe-api__from">{group.from}</p>
					<p className="fe-doc-p">{group.blurb}</p>
					<dl className="fe-api__list">
						{group.entries.map((entry) => (
							<div key={entry.name} className="fe-api__entry">
								<dt className="fe-api__sig">{entry.signature}</dt>
								<dd className="fe-api__desc">{entry.description}</dd>
							</div>
						))}
					</dl>
				</section>
			))}

			<p className="fe-doc-p fe-api__note">
				This is the hand-curated at-a-glance index. For the exhaustive reference — every exported symbol,
				its full type, and its TSDoc — run <code>pnpm docs:api</code> in the{' '}
				<a className="fe-api__gen-link" href="https://github.com/mlilli/filter-enginez" rel="noopener">
					engine repository
				</a>{' '}
				to generate the TypeDoc API reference directly from the core source. In these demo apps and on the
				standalone documentation site, this curated index is the reference.
			</p>
		</div>
	);
};

/** Scoped API-reference styles. */
const API_CSS = `
.fe-api__group { margin-bottom: var(--space-8); }
.fe-api__from {
	font-family: var(--font-mono); font-size: var(--text-xs); color: var(--accent);
	margin: 0 0 var(--space-2);
}
.fe-api__list { margin: var(--space-3) 0 0; display: flex; flex-direction: column; gap: var(--space-3); }
.fe-api__entry {
	padding: var(--space-3) var(--space-4); background: var(--gray-1);
	border: 1px solid var(--gray-3); border-left: 2px solid var(--accent-dim); border-radius: var(--radius-md);
}
.fe-api__sig {
	font-family: var(--font-mono); font-size: var(--text-sm); color: var(--gray-11);
	margin: 0 0 4px; white-space: pre-wrap; overflow-wrap: anywhere;
}
.fe-api__desc { font-family: var(--font-sans); font-size: var(--text-sm); color: var(--gray-9); margin: 0; }
.fe-api__note { margin-top: var(--space-10); color: var(--gray-8); font-size: var(--text-sm); }
.fe-api__gen-link { color: var(--accent); text-decoration: underline; text-underline-offset: 2px; }
.fe-api__gen-link:hover { color: var(--accent-bright, var(--accent)); }
`;
