/**
 * `<DocsLayout />` — the documentation shell: a sticky sidebar navigation (a mobile drawer below the
 * `lg` breakpoint) around a react-router `<Outlet />`. The nav is generated from the rule + algorithm
 * catalogs, so adding a page is a data edit, never a nav edit.
 *
 * @remarks
 * Lives in the shared `examples-shared/docs` slice and is mounted as a layout route, at `/docs` in each
 * React app and at the root of the standalone documentation site; its links follow that base path
 * (`./docsBasePath.ts`). Its sticky topbar carries the header brand every demo page carries, naming
 * the page `Docs`: inside a React app it names that app (read from `AppVerticalContext`) and links back
 * to the app's hub; on the documentation site, which is not one of the apps, it names the page alone.
 *
 * @packageDocumentation
 */

import { useState } from 'react';
import { NavLink, Outlet } from 'react-router';

import { AppHeaderBrand } from '../app-header/AppHeaderBrand.js';
import { HEADER_PAGE_LABELS } from '../app-header/core.js';
import { ALGORITHM_DOCS } from './content/algorithmsContent.js';
import { RULE_DOCS } from './content/rulesContent.js';
import { type RuleGroup } from './content/types.js';
import { useDocsPath } from './docsBasePath.js';

/** Human labels + order for the rule groups in the sidebar. */
const RULE_GROUP_LABELS: readonly { group: RuleGroup; label: string }[] = [
	{ group: 'value', label: 'Equality' },
	{ group: 'range', label: 'Numeric & date' },
	{ group: 'set', label: 'Sets & hierarchy' },
	{ group: 'text', label: 'Text' },
	{ group: 'spatial', label: 'Spatial' },
	{ group: 'special', label: 'Special' },
	{ group: 'composite', label: 'Composition' },
];

/**
 * The docs shell.
 */
export const DocsLayout = (): React.ReactElement => {
	const [isNavOpen, setIsNavOpen] = useState(false);
	const docsPath = useDocsPath();

	const closeNav = (): void => {
		setIsNavOpen(false);
	};

	return (
		<div className="fe-docs">
			<style>{DOCS_CSS}</style>

			<header className="fe-docs__topbar">
				<AppHeaderBrand page={HEADER_PAGE_LABELS.docs} />
				<button
					type="button"
					className="fe-docs__nav-toggle"
					aria-expanded={isNavOpen}
					onClick={() => {
						setIsNavOpen((open) => !open);
					}}
				>
					{isNavOpen ? 'Close' : 'Menu'}
				</button>
			</header>

			<div className="fe-docs__body">
				<nav className={`fe-docs__nav${isNavOpen ? ' is-open' : ''}`} aria-label="Documentation">
					<NavLink to={docsPath('/')} end className={navLinkClass} onClick={closeNav}>
						Overview
					</NavLink>

					<p className="fe-docs__nav-heading">Filter rules</p>
					{RULE_GROUP_LABELS.map(({ group, label }) => {
						const rules = RULE_DOCS.filter((rule) => rule.group === group);

						if (rules.length === 0) {
							return null;
						}

						return (
							<div key={group} className="fe-docs__nav-group">
								<p className="fe-docs__nav-subheading">{label}</p>
								{rules.map((rule) => (
									<NavLink key={rule.id} to={docsPath(`/rules/${rule.id}`)} className={navLinkClass} onClick={closeNav}>
										{rule.name}
									</NavLink>
								))}
							</div>
						);
					})}

					<p className="fe-docs__nav-heading">Algorithms</p>
					{ALGORITHM_DOCS.map((algorithm) => (
						<NavLink key={algorithm.id} to={docsPath(`/algorithms/${algorithm.id}`)} className={navLinkClass} onClick={closeNav}>
							{algorithm.name}
						</NavLink>
					))}

					<p className="fe-docs__nav-heading">Try &amp; reference</p>
					<NavLink to={docsPath('/playground')} className={navLinkClass} onClick={closeNav}>
						Playground
					</NavLink>
					<NavLink to={docsPath('/api')} className={navLinkClass} onClick={closeNav}>
						API reference
					</NavLink>
				</nav>

				<main className="fe-docs__main">
					<Outlet />
				</main>
			</div>
		</div>
	);
};

/** NavLink className callback — highlights the active page. */
function navLinkClass({ isActive }: { isActive: boolean }): string {
	return `fe-docs__nav-link${isActive ? ' is-active' : ''}`;
}

/** Scoped shell styles over the brand tokens. */
const DOCS_CSS = `
/*
 * The topbar's height is set rather than left to its content, because the sidebar below sticks
 * (and, on narrow screens, opens) directly under it and reads the same value: the 44px header brand
 * plus 12px above and below it, plus the 1px rule.
 */
.fe-docs { --fe-docs-topbar-height: 69px; min-height: 100vh; background: var(--gray-0); }
.fe-docs__topbar {
	display: flex;
	align-items: center;
	justify-content: space-between;
	gap: var(--space-3);
	height: var(--fe-docs-topbar-height);
	padding: 0 var(--space-4);
	border-bottom: 1px solid var(--gray-3);
	position: sticky;
	top: 0;
	z-index: 20;
	background: var(--gray-0);
}
.fe-docs__nav-toggle {
	display: none;
	flex-shrink: 0;
	min-height: 44px;
	padding: 8px 16px; background: transparent; border: 1px solid var(--gray-5);
	border-radius: var(--radius-md); color: var(--gray-9);
	font-family: var(--font-mono); font-size: var(--text-xs); cursor: pointer;
}
.fe-docs__body { display: grid; grid-template-columns: 260px 1fr; align-items: start; }
.fe-docs__nav {
	position: sticky; top: var(--fe-docs-topbar-height); align-self: start;
	height: calc(100vh - var(--fe-docs-topbar-height)); overflow-y: auto;
	padding: var(--space-6) var(--space-4) var(--space-16);
	border-right: 1px solid var(--gray-3);
	display: flex; flex-direction: column; gap: 2px;
}
.fe-docs__nav-heading {
	font-family: var(--font-mono); font-size: 10px; letter-spacing: 0.14em;
	text-transform: uppercase; color: var(--gray-8);
	margin: var(--space-5) 0 var(--space-2);
}
.fe-docs__nav-subheading {
	font-family: var(--font-sans); font-size: 11px; color: var(--gray-8);
	margin: var(--space-3) 0 2px var(--space-2);
}
.fe-docs__nav-link {
	display: block; padding: 5px var(--space-3);
	font-family: var(--font-mono); font-size: var(--text-sm); color: var(--gray-9);
	border-radius: var(--radius-sm); border-left: 2px solid transparent;
	transition: color var(--dur-fast) var(--ease-out), background var(--dur-fast) var(--ease-out);
}
.fe-docs__nav-link:hover { color: var(--accent-glow); background: var(--gray-2); }
.fe-docs__nav-link.is-active {
	color: var(--accent); border-left-color: var(--accent); background: var(--gray-1);
}
.fe-docs__main { min-width: 0; padding: var(--space-10) var(--space-8) var(--space-24); max-width: 860px; }

@media (min-width: 1024px) {
	.fe-docs__topbar { padding: 0 var(--space-6); }
}
@media (max-width: 1023px) {
	.fe-docs__nav-toggle { display: inline-flex; align-items: center; }
	.fe-docs__body { grid-template-columns: 1fr; }
	.fe-docs__nav {
		position: fixed; top: var(--fe-docs-topbar-height); left: 0; width: min(300px, 82vw);
		background: var(--gray-1); z-index: 15;
		transform: translateX(-105%); transition: transform var(--dur-mid) var(--ease-out);
		box-shadow: var(--shadow-lg);
	}
	.fe-docs__nav.is-open { transform: translateX(0); }
	.fe-docs__main { padding: var(--space-6) var(--space-5) var(--space-20); }
}
@media (prefers-reduced-motion: reduce) {
	.fe-docs__nav { transition: none; }
}

/* ── Shared page / prose styles (all docs pages render inside .fe-docs__main) ── */
.fe-doc-eyebrow {
	font-family: var(--font-mono); font-size: var(--text-xs); letter-spacing: 0.16em;
	text-transform: uppercase; color: var(--gray-8); margin: 0 0 var(--space-3);
}
.fe-doc-title {
	font-family: var(--font-display); font-size: var(--text-3xl); font-weight: 700;
	letter-spacing: var(--tracking-tight); color: var(--gray-11); margin: 0 0 var(--space-3);
}
.fe-doc-lead { font-size: var(--text-lg); line-height: var(--leading-relaxed); color: var(--gray-10); margin: 0 0 var(--space-6); }
.fe-doc-h2 {
	font-family: var(--font-display); font-size: var(--text-xl); font-weight: 600;
	color: var(--gray-11); margin: var(--space-10) 0 var(--space-3);
}
.fe-doc-p { font-size: var(--text-base); line-height: var(--leading-relaxed); color: var(--gray-9); margin: 0 0 var(--space-4); }
.fe-doc-figure {
	margin: var(--space-6) 0; padding: var(--space-5);
	background: linear-gradient(180deg, var(--gray-1), var(--gray-0));
	border: 1px solid var(--gray-3); border-radius: var(--radius-lg);
}
.fe-doc-code {
	margin: var(--space-2) 0 var(--space-4); padding: var(--space-4);
	background: var(--gray-1); border: 1px solid var(--gray-3);
	border-left: 2px solid var(--accent-dim); border-radius: var(--radius-md);
	overflow-x: auto; font-family: var(--font-mono); font-size: var(--text-sm);
	line-height: var(--leading-normal); color: var(--gray-10); white-space: pre;
}
.fe-doc-code-caption { font-family: var(--font-mono); font-size: var(--text-xs); color: var(--gray-8); margin: var(--space-4) 0 0; }
.fe-doc-chip {
	display: inline-block; padding: 3px 10px; border-radius: var(--radius-full);
	font-family: var(--font-mono); font-size: 11px; letter-spacing: 0.04em;
}
.fe-doc-chip--cyan { color: var(--accent); background: var(--accent-soft); border: 1px solid var(--accent-dim); }
.fe-doc-chip--warn { color: var(--warn); background: var(--warn-soft); border: 1px solid var(--warn-strong); }
.fe-doc-meta { display: flex; flex-wrap: wrap; gap: var(--space-2); margin: 0 0 var(--space-6); }
.fe-doc-pager { display: flex; justify-content: space-between; gap: var(--space-4); margin-top: var(--space-16); border-top: 1px solid var(--gray-2); padding-top: var(--space-6); }
.fe-doc-pager a { font-family: var(--font-mono); font-size: var(--text-sm); color: var(--accent); }
.fe-doc-cards { display: grid; grid-template-columns: 1fr 1fr; gap: var(--space-4); margin: var(--space-6) 0; }
@media (max-width: 640px) { .fe-doc-cards { grid-template-columns: 1fr; } }
.fe-doc-card {
	display: flex; flex-direction: column; gap: var(--space-2);
	padding: var(--space-5); border: 1px solid var(--gray-3); border-radius: var(--radius-lg);
	background: linear-gradient(180deg, var(--gray-1), var(--gray-0));
	transition: border-color var(--dur-fast) var(--ease-out), transform var(--dur-fast) var(--ease-out);
}
.fe-doc-card:hover { border-color: var(--accent); transform: translateY(-2px); }
.fe-doc-card__title { font-family: var(--font-display); font-size: var(--text-lg); font-weight: 600; color: var(--gray-11); }
.fe-doc-card__body { font-size: var(--text-sm); line-height: var(--leading-normal); color: var(--gray-9); }
.fe-doc-card__go { margin-top: var(--space-1); font-family: var(--font-mono); font-size: var(--text-xs); color: var(--accent); }
@media (prefers-reduced-motion: reduce) { .fe-doc-card:hover { transform: none; } }
.fe-doc-see-also { margin: 0 0 var(--space-4); padding-left: var(--space-5); }
.fe-doc-see-also li { font-size: var(--text-base); line-height: var(--leading-relaxed); color: var(--gray-9); margin: 0 0 var(--space-1); }
/*
 * Links sitting INSIDE a text block (the "See also" items, inline prose links) must be
 * distinguishable from the surrounding gray text without relying on color alone — WCAG 1.4.1
 * (axe \`link-in-text-block\`). Cyan-on-gray fails the 3:1 sibling-contrast path, so we take the
 * other path the rule allows: an underline. Standalone links (pager nav, cards, sidebar) are not
 * in a text block and keep their clean look.
 */
.fe-doc-p a, .fe-doc-lead a, .fe-doc-see-also a { text-decoration: underline; text-underline-offset: 2px; }
`;
