/**
 * Content-model types for the documentation site — the data shapes that drive every rule and
 * algorithm page. Keeping the docs data-driven (rather than hand-written per page) guarantees a
 * consistent structure across all 15 rules and 8 algorithms, and lets the pages be pure templates.
 *
 * @packageDocumentation
 */

/** A captioned code snippet rendered in a mono block. */
export interface CodeExample {
	/** Optional one-line caption above the block. */
	readonly caption?: string;
	/** The code (real public API — pasteable). */
	readonly code: string;
}

/** One record row in the generic {@link RuleFigure}: a sample field value + whether it passes. */
export interface RuleFigureCell {
	/** The displayed sample value (e.g. `Fantasy`, `$45`, `1998`). */
	readonly label: string;
	/** Whether this record passes the rule. */
	readonly pass: boolean;
}

/** Drives the generic animated rule figure: a predicate label + the sample records it judges. */
export interface RuleFigureSpec {
	/** Up to six sample records. */
	readonly cells: readonly RuleFigureCell[];
	/** The human-readable predicate, e.g. `genre ∈ { Fantasy, Sci-Fi }`. */
	readonly predicate: string;
}

/** Sidebar grouping for the rule catalog. */
export type RuleGroup = 'composite' | 'range' | 'set' | 'spatial' | 'special' | 'text' | 'value';

/** A documented filter rule. */
export interface RuleDoc {
	/** The deeper "how it works / when to reach for it" explanation. */
	readonly advanced: string;
	/** Real-API code example(s). */
	readonly examples: readonly CodeExample[];
	/** Optional sample-data snippet the examples filter against. */
	readonly exampleData?: string;
	/** The ergonomic factory name, e.g. `inSet`. */
	readonly factory: string;
	/** Spec for the animated figure on this page. */
	readonly figure: RuleFigureSpec;
	/** Sidebar group. */
	readonly group: RuleGroup;
	/** Route id + anchor, e.g. `in-set`. */
	readonly id: string;
	/** Class name, e.g. `InSetRule`. */
	readonly name: string;
	/** Related rule ids, rendered as "See also" cross-links (each must be a real {@link RuleDoc} id). */
	readonly seeAlso?: readonly string[];
	/** Whether the rule round-trips through JSON config / URL / worker (Predicate does not). */
	readonly serializable: boolean;
	/** The one-sentence "what it does". */
	readonly simple: string;
	/** A short mono tagline. */
	readonly tagline: string;
}

/** A documented algorithm — reuses one of the `/about` illustrations. */
export interface AlgorithmDoc {
	/** The deeper explanation. */
	readonly advanced: string;
	/** The animated illustration component (from `about/illustrations`). */
	readonly Figure: React.ComponentType;
	/** Route id + anchor, e.g. `roaring-bitmaps`. */
	readonly id: string;
	/** Display name. */
	readonly name: string;
	/** The one-sentence "what it does". */
	readonly simple: string;
	/** Optional headline speedup, e.g. `≈40× at 10k`. */
	readonly speedup?: string;
	/** A short mono tagline. */
	readonly tagline: string;
}
