/**
 * Pure output-formatting helpers for the CLI — no engine, no I/O, so they unit-test cleanly.
 *
 * @packageDocumentation
 */

import { type ApplyConfigResult } from './applyConfig.js';

/** A preview field extracted from a record for display. */
export type PreviewField = readonly [key: string, value: string];

/**
 * Pull the first `max` primitive (string / number / boolean), non-null fields off a record for a
 * compact preview line. Non-object records yield an empty list.
 *
 * @param record - An arbitrary result record.
 * @param max - Max fields to include (defaults to 4).
 */
export function pickPreviewFields(record: unknown, max = 4): PreviewField[] {
	if (typeof record !== 'object' || record === null) {
		return [];
	}
	const fields: PreviewField[] = [];

	for (const [key, value] of Object.entries(record)) {
		if (value === null || value === undefined) {
			continue;
		}
		if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
			fields.push([key, String(value)]);
			if (fields.length >= max) {
				break;
			}
		}
	}

	return fields;
}

/** Format one record as a compact `key=value  key=value` preview line. */
export function formatRecordLine(record: unknown, max = 4): string {
	return pickPreviewFields(record, max)
		.map(([key, value]) => `${key}=${value}`)
		.join('  ');
}

/** One-line summary of an {@link ApplyConfigResult}: dataset, match count, and applied rules. */
export function formatSummary(result: ApplyConfigResult): string {
	const rules = result.appliedRuleIds.length > 0 ? result.appliedRuleIds.join(', ') : '(none)';

	return `${result.datasetLabel} · ${result.matched.toLocaleString()} of ${result.total.toLocaleString()} matched · rules: ${rules}`;
}

/** Format the full CLI report: summary + up to `results.length` preview lines. */
export function formatReport(result: ApplyConfigResult): string {
	const lines = [formatSummary(result), ''];

	if (result.results.length === 0) {
		lines.push('(no matching records)');
	} else {
		result.results.forEach((record, index) => {
			lines.push(`${String(index + 1).padStart(3)}. ${formatRecordLine(record)}`);
		});
		if (result.truncated) {
			lines.push(`… ${(result.matched - result.results.length).toLocaleString()} more`);
		}
	}

	return lines.join('\n');
}
