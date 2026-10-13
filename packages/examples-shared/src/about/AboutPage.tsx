/**
 * `<AboutPage />` — the shared "How the engine works" page, reused by both React apps.
 *
 * @remarks
 * Reads as a single query's biography: a hero thesis, four alternating illustration + prose + code
 * bands escalating in cleverness, a "Beyond filtering" second act of four more bands built on the same
 * structures, the live benchmark widget as the full-width payoff ("now stack all
 * of it"), and a CTA band deep-linking the expression-mode and config-driven demos. A sticky mini
 * table of contents tracks the section in view. All motion respects `prefers-reduced-motion` (the
 * illustrations degrade to static frames); the page itself is plain layout over the brand tokens,
 * matching the LandingPage's self-contained `<style>` approach.
 *
 * Browser-only (it renders the browser-only illustrations + engine-backed widget), and lives in the
 * browser-only examples-shared package. Each app wraps it behind a `/about` route.
 *
 * ### 🔴 Why demo links are a PROP and not content
 *
 * `ABOUT_SECTIONS` ships from the React-free `./about-core` subpath and **all six verticals render
 * it** — the two React apps through this component, and SvelteKit, Vue, Angular and vanilla through
 * their own views. So a `/lab` cross-link added to that array would appear on six apps, and `/lab`
 * exists on exactly one: five of them would render a confident link straight into their own 404.
 *
 * {@link AboutPageProps.demoLinks} inverts that. The route that HAS a demo supplies the link; every
 * other vertical passes nothing and renders no link, so a demo link is always opt-in per app rather
 * than live in all six the moment one array is edited.
 *
 * @packageDocumentation
 */

import { Mark } from '@filter-enginez/brand';
import { Fragment, useEffect, useState } from 'react';
import { Link } from 'react-router';

import { ABOUT_SECTIONS } from './aboutContent.js';
import { ABOUT_FIGURES } from './aboutFigures.js';
import { BenchmarkWidget } from './benchmark/index.js';

/** All scroll-spy targets, in document order (the eight bands + the payoff). */
const SECTION_IDS: readonly string[] = [...ABOUT_SECTIONS.map((section) => section.id), 'benchmark'];

/** Track which section is most in view, for the sticky TOC highlight. */
function useActiveSection(ids: readonly string[]): string {
	const [activeId, setActiveId] = useState<string>(ids[0] ?? '');

	useEffect(() => {
		if (typeof IntersectionObserver === 'undefined') {
			return undefined;
		}
		const ratios = new Map<string, number>();
		const observer = new IntersectionObserver(
			(entries) => {
				for (const entry of entries) {
					ratios.set(entry.target.id, entry.isIntersecting ? entry.intersectionRatio : 0);
				}
				let best = '';
				let bestRatio = 0;

				for (const [id, ratio] of ratios) {
					if (ratio > bestRatio) {
						bestRatio = ratio;
						best = id;
					}
				}
				if (best !== '') {
					setActiveId(best);
				}
			},
			{ rootMargin: '-8% 0px -45% 0px', threshold: [0.2, 0.5, 0.8]},
		);

		for (const id of ids) {
			const element = document.getElementById(id);

			if (element !== null) {
				observer.observe(element);
			}
		}

		return () => {
			observer.disconnect();
		};
	}, [ids]);

	return activeId;
}

/** A route in the host app that demonstrates a section's capability for real. */
export interface AboutDemoLink {
	/** The link text, e.g. `See it running in the lab`. */
	readonly label: string;
	/** The host app's route, e.g. `/lab`. */
	readonly to: string;
}

/** Props for {@link AboutPage}. */
export interface AboutPageProps {
	/**
	 * Per-section links to a live demonstration, keyed by `AboutSection['id']`.
	 *
	 * @remarks
	 * Optional, and omitted by every app that has no such route — see the module docblock. A key
	 * naming a section that does not exist renders nothing rather than throwing; the page is not the
	 * right place to fail over a mistyped id, and `aboutDemoLinks.test.tsx` pins that instead.
	 */
	readonly demoLinks?: Readonly<Record<string, AboutDemoLink>>;
}

/**
 * The About-the-engine page.
 */
export const AboutPage = ({ demoLinks }: AboutPageProps = {}): React.ReactElement => {
	const activeId = useActiveSection(SECTION_IDS);

	return (
		<div className="fe-about">
			<header className="fe-about__topbar">
				<Link to="/" className="fe-about__brand" aria-label="Filter EngineZ — back to the dataset hub">
					<span className="fe-about__brand-mark" aria-hidden="true">
						<Mark size={28} />
					</span>
					<span className="fe-about__brand-word">Filter EngineZ</span>
				</Link>
				<Link to="/" className="fe-about__back">
					← datasets
				</Link>
			</header>

			<section className="fe-about__hero">
				<p className="fe-about__eyebrow">the engine</p>
				<h1 className="fe-about__hero-title">How the engine works</h1>
				<p className="fe-about__hero-lead">
					Most filter engines answer your question by checking every record. Filter EngineZ answers it by
					doing as little as possible — stacking four classic data-structure tricks so the same results
					come back in a fraction of the work.
				</p>
			</section>

			<nav className="fe-about__toc" aria-label="On this page">
				{ABOUT_SECTIONS.map((section) => (
					<a
						key={section.id}
						href={`#${section.id}`}
						className={`fe-about__toc-link${activeId === section.id ? ' is-active' : ''}`}
					>
						<span className="fe-about__toc-dot" aria-hidden="true" />
						{section.tocLabel}
					</a>
				))}
				<a href="#benchmark" className={`fe-about__toc-link${activeId === 'benchmark' ? ' is-active' : ''}`}>
					<span className="fe-about__toc-dot" aria-hidden="true" />
					<span>Try it live</span>
				</a>
			</nav>

			<main className="fe-about__bands">
				{ABOUT_SECTIONS.map((section, index) => {
					const isBeyondStart = section.group === 'beyond' && ABOUT_SECTIONS[index - 1]?.group !== 'beyond';

					return (
						<Fragment key={section.id}>
							{isBeyondStart ? (
								<div className="fe-about__act">
									<p className="fe-about__eyebrow">act two</p>
									<h2 className="fe-about__act-title">Beyond filtering</h2>
									<p className="fe-about__act-lead">
										The same bitmaps, signatures, and counts power more than intersection — suggestions,
										similarity, probabilistic membership, and text search.
									</p>
								</div>
							) : null}
							<section
								id={section.id}
								className={`fe-about__band${index % 2 === 1 ? ' is-reversed' : ''}`}
							>
								<div className="fe-about__figure">
									{(() => {
										const Figure = ABOUT_FIGURES[section.id];

										return Figure === undefined ? null : <Figure />;
									})()}
								</div>
								<div className="fe-about__copy">
									<p className="fe-about__eyebrow">{section.eyebrow}</p>
									<h2 className="fe-about__band-title">{section.title}</h2>
									<p className="fe-about__body">{section.body}</p>
									<pre className="fe-about__code">
										<code>{section.code}</code>
									</pre>
									{(() => {
										const demo = demoLinks?.[section.id];

										return demo === undefined ? null : (
											<Link className="fe-about__demo-link" to={demo.to}>
												{demo.label} →
											</Link>
										);
									})()}
								</div>
							</section>
						</Fragment>
					);
				})}

				<section id="benchmark" className="fe-about__payoff">
					<p className="fe-about__eyebrow">now stack all of it</p>
					<h2 className="fe-about__band-title">Try the optimizations live</h2>
					<p className="fe-about__body fe-about__payoff-lead">
						This runs the real predictive-disable workload — simulating every option across a facet — on
						10,000 wines, in your browser, right now. Flip the layers off and watch the same answer take
						longer to compute.
					</p>
					<BenchmarkWidget />
				</section>

				<section className="fe-about__cta">
					<h2 className="fe-about__band-title">See it holding real weight</h2>
					<div className="fe-about__cta-grid">
						<Link to="/wine" className="fe-about__cta-card">
							<span className="fe-about__cta-eyebrow">expression mode</span>
							<span className="fe-about__cta-title">Boolean composition</span>
							<span className="fe-about__cta-body">
								and(or(…), not(…)) composed live in the wine dataset&apos;s smart-filter presets.
							</span>
							<span className="fe-about__cta-go">Open the wine demo →</span>
						</Link>
						<Link to="/books-config" className="fe-about__cta-card">
							<span className="fe-about__cta-eyebrow">config-driven</span>
							<span className="fe-about__cta-title">The UI is the data</span>
							<span className="fe-about__cta-body">
								The entire books filter panel generated from a declarative JSON config via loadConfig.
							</span>
							<span className="fe-about__cta-go">Open the config demo →</span>
						</Link>
					</div>
				</section>
			</main>
		</div>
	);
};
