/**
 * `<LandingPage />` — the app hub at `/`. A dark, brand-forward hero + a grid of dataset cards, each
 * linking to its route.
 *
 * @remarks
 * Reads the dataset list from the `datasets` registry, so new datasets appear here automatically.
 * Styling is self-contained (a scoped `<style>` block + brand tokens) — this is the one marketing-ish
 * surface in the app, so it leans into the design system's neon-noir aesthetic rather than the
 * `ui-styles` component kit.
 *
 * @packageDocumentation
 */

import { Mark } from '@filter-enginez/brand';
import { Link } from 'react-router';

import { type DatasetEntry, datasets } from '../datasets.js';

/** Scoped landing styles — keyframes + hover states inline styles can't express. */
const LANDING_CSS = `
.fe-landing {
	position: relative;
	min-height: 100vh;
	overflow: hidden;
	display: flex;
	flex-direction: column;
	align-items: center;
	padding: 64px 20px 96px;
	background: var(--gray-0);
}
/* Ambient cyan glow + drifting grid behind the content — pure CSS, low-cost. */
.fe-landing::before {
	content: '';
	position: absolute;
	inset: 0;
	background:
		radial-gradient(60% 45% at 50% 0%, rgba(34, 211, 238, 0.10), transparent 70%),
		radial-gradient(40% 30% at 85% 20%, rgba(249, 115, 22, 0.05), transparent 70%);
	pointer-events: none;
}
.fe-landing::after {
	content: '';
	position: absolute;
	inset: -50%;
	background-image:
		linear-gradient(rgba(34, 211, 238, 0.04) 1px, transparent 1px),
		linear-gradient(90deg, rgba(34, 211, 238, 0.04) 1px, transparent 1px);
	background-size: 44px 44px;
	mask-image: radial-gradient(60% 50% at 50% 30%, #000 0%, transparent 75%);
	animation: fe-landing-drift 40s linear infinite;
	pointer-events: none;
}
@keyframes fe-landing-drift {
	from { transform: translate(0, 0); }
	to { transform: translate(44px, 44px); }
}
.fe-landing__inner {
	position: relative;
	width: 100%;
	max-width: 960px;
	display: flex;
	flex-direction: column;
	align-items: center;
}
.fe-landing__hero {
	display: flex;
	flex-direction: column;
	align-items: center;
	text-align: center;
	gap: 18px;
	margin-bottom: 56px;
}
.fe-landing__wordmark-wrap {
	display: inline-block;
	max-width: 300px;
	text-align: center;
}
.fe-landing__wordmark {
	font-family: var(--font-display);
	font-size: 26px;
	font-weight: 700;
	letter-spacing: 0.14em;
	text-transform: uppercase;
	line-height: 1.15;
	color: var(--gray-11);
}
.fe-landing__tagline {
	max-width: 40ch;
	font-family: var(--font-sans);
	font-size: 15px;
	line-height: 1.6;
	color: var(--gray-9);
}
.fe-landing__prompt {
	font-family: var(--font-mono);
	font-size: 11px;
	letter-spacing: 0.22em;
	text-transform: uppercase;
	color: var(--gray-8);
}
.fe-landing__grid {
	display: grid;
	grid-template-columns: 1fr;
	gap: 16px;
	width: 100%;
}
@media (min-width: 720px) {
	.fe-landing__grid {
		grid-template-columns: 1fr 1fr;
	}
}
.fe-landing__card {
	position: relative;
	display: flex;
	flex-direction: column;
	gap: 10px;
	padding: 22px 22px 20px;
	border: 1px solid var(--gray-3);
	border-radius: var(--radius-lg);
	background: linear-gradient(180deg, var(--gray-1), var(--gray-0));
	text-decoration: none;
	overflow: hidden;
	transition:
		border-color 200ms ease,
		transform 200ms ease,
		box-shadow 200ms ease;
}
/* Top accent hairline — muted gray by default, cyan on live cards. */
.fe-landing__card::before {
	content: '';
	position: absolute;
	top: 0;
	left: 0;
	right: 0;
	height: 2px;
	background: var(--gray-4);
	transition: background 200ms ease;
}
.fe-landing__card--live::before {
	background: linear-gradient(90deg, var(--accent), transparent 80%);
}
.fe-landing__card--live:hover {
	border-color: var(--accent);
	transform: translateY(-3px);
	box-shadow:
		0 10px 30px -12px rgba(0, 0, 0, 0.6),
		0 0 22px -6px rgba(34, 211, 238, 0.35);
}
.fe-landing__card-top {
	display: flex;
	align-items: center;
	justify-content: space-between;
	gap: 12px;
}
.fe-landing__card-title {
	font-family: var(--font-display);
	font-size: 17px;
	font-weight: 600;
	letter-spacing: 0.06em;
	text-transform: uppercase;
	color: var(--gray-11);
}
.fe-landing__badge {
	flex-shrink: 0;
	padding: 3px 9px;
	border-radius: 9999px;
	font-family: var(--font-mono);
	font-size: 10px;
	letter-spacing: 0.08em;
	text-transform: uppercase;
}
.fe-landing__badge--live {
	color: var(--accent);
	background: rgba(34, 211, 238, 0.10);
	border: 1px solid rgba(34, 211, 238, 0.30);
}
.fe-landing__card-blurb {
	font-family: var(--font-sans);
	font-size: 13px;
	line-height: 1.55;
	color: var(--gray-9);
}
.fe-landing__card-cta {
	margin-top: 4px;
	font-family: var(--font-mono);
	font-size: 11px;
	letter-spacing: 0.10em;
	text-transform: uppercase;
	color: var(--accent);
}
.fe-landing__about {
	margin-top: 6px;
	padding: 14px 30px;
	font-family: var(--font-mono);
	font-size: 15px;
	letter-spacing: 0.06em;
	color: var(--accent);
	background: rgba(34, 211, 238, 0.06);
	border: 1px solid var(--accent-dim);
	border-radius: var(--radius-md);
	transition: border-color 200ms ease, box-shadow 200ms ease, background 200ms ease, transform 200ms ease;
}
.fe-landing__about:hover {
	color: var(--accent-glow);
	border-color: var(--accent);
	background: rgba(34, 211, 238, 0.11);
	box-shadow: 0 0 26px -6px rgba(34, 211, 238, 0.5);
	transform: translateY(-1px);
}
/* The cross-app comparison CTA — a secondary CYAN pill. Cyan because the page is about DATA and
   IDENTITY (which filter state, which stack), never about the engine computing; the phosphor
   counterpart below is the server demo, which IS about where compute happens. Sized between the
   primary "How the engine works" button and the quiet docs text link, because it sits second in
   importance: what the engine does, then that it does it everywhere. */
.fe-landing__compare {
	margin-top: 14px;
	padding: 10px 22px;
	font-family: var(--font-mono);
	font-size: 13px;
	letter-spacing: 0.05em;
	color: var(--accent);
	background: rgba(34, 211, 238, 0.06);
	border: 1px solid var(--accent-dim);
	border-radius: var(--radius-md);
	transition: border-color 200ms ease, box-shadow 200ms ease, background 200ms ease, transform 200ms ease;
}
.fe-landing__compare:hover {
	color: var(--accent-glow);
	border-color: var(--accent);
	background: rgba(34, 211, 238, 0.11);
	box-shadow: 0 0 24px -6px rgba(34, 211, 238, 0.5);
	transform: translateY(-1px);
}
.fe-landing__docs {
	margin-top: 14px;
	font-family: var(--font-mono);
	font-size: 12px;
	letter-spacing: 0.04em;
	color: var(--gray-8);
	transition: color 200ms ease;
}
.fe-landing__docs:hover {
	color: var(--accent);
}
/* The server-backed demo CTA — phosphor-tinted because it's about WHERE the engine fires (the
   compute), the dual-accent counterpart to cyan's "what/data". A secondary pill: more prominent than
   the docs text link, quieter than the primary "How the engine works" button. */
.fe-landing__server {
	margin-top: 14px;
	padding: 10px 22px;
	font-family: var(--font-mono);
	font-size: 13px;
	letter-spacing: 0.05em;
	color: var(--engine);
	background: rgba(249, 115, 22, 0.06);
	border: 1px solid rgba(249, 115, 22, 0.4);
	border-radius: var(--radius-md);
	transition: border-color 200ms ease, box-shadow 200ms ease, background 200ms ease, transform 200ms ease;
}
.fe-landing__server:hover {
	color: var(--engine);
	border-color: var(--engine);
	background: rgba(249, 115, 22, 0.12);
	box-shadow: 0 0 24px -6px rgba(249, 115, 22, 0.5);
	transform: translateY(-1px);
}
.fe-landing__foot {
	margin-top: 56px;
	font-family: var(--font-mono);
	font-size: 11px;
	letter-spacing: 0.10em;
	color: var(--gray-7);
	text-align: center;
}
@media (prefers-reduced-motion: reduce) {
	.fe-landing__about:hover { transform: none; }
	.fe-landing__compare:hover { transform: none; }
	.fe-landing__server:hover { transform: none; }
}
@media (prefers-reduced-motion: reduce) {
	.fe-landing::after {
		animation: none;
	}
	.fe-landing__card--live:hover {
		transform: none;
	}
}
`;

/**
 * The landing hub.
 */
export const LandingPage = (): React.ReactElement => {
	return (
		<div className="fe-landing">
			<style>{LANDING_CSS}</style>
			<div className="fe-landing__inner">
				<header className="fe-landing__hero">
					<Mark size={72} animated />
					{/* Plain wordmark text — the brand `<Mark>` above already carries the logomark Z, so we
					    don't use `<Wordmark>` here (its lockup would render a second, stray Z). */}
					<span className="fe-landing__wordmark-wrap">
						<span className="fe-landing__wordmark">Filter EngineZ</span>
					</span>
					<p className="fe-landing__tagline">
						A generic, isomorphic, framework-agnostic TypeScript filter engine — arbitrarily complex
						filters over arbitrarily shaped data, computed client-side. This is the React Redux Toolkit vertical.
					</p>
					<Link to="/about" className="fe-landing__about">
						How the engine works →
					</Link>
					<Link to="/compare" className="fe-landing__compare">
						See one filter state in all six stacks →
					</Link>
					<Link to="/books-server" className="fe-landing__server">
						Try the server-backed books demo →
					</Link>
					<Link to="/docs" className="fe-landing__docs">
						Read the documentation →
					</Link>
					<p className="fe-landing__prompt">Select a dataset to explore</p>
				</header>

				<div className="fe-landing__grid">
					{datasets.map((dataset) => (
						<DatasetCard key={dataset.id} dataset={dataset} />
					))}
				</div>

				<p className="fe-landing__foot">
					Same engine, three datasets · filtering happens in your browser
				</p>
			</div>
		</div>
	);
};

/**
 * One dataset tile, linking to the dataset's route.
 *
 * @internal
 */
const DatasetCard = ({ dataset }: { readonly dataset: DatasetEntry }): React.ReactElement => (
	<Link to={`/${dataset.id}`} className="fe-landing__card fe-landing__card--live" aria-label={`Explore ${dataset.label}`}>
		<div className="fe-landing__card-top">
			<span className="fe-landing__card-title">{dataset.label}</span>
			<span className="fe-landing__badge fe-landing__badge--live">Live</span>
		</div>
		<p className="fe-landing__card-blurb">{dataset.tagline}</p>
		<span className="fe-landing__card-cta">Explore {dataset.recordNoun} →</span>
	</Link>
);
