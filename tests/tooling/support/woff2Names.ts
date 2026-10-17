/**
 * Read the `name` table out of a WOFF2 file, with nothing but Node's own Brotli decoder.
 *
 * @remarks
 * `brandFonts.test.ts` uses it to check what a served font CALLS itself: the SIL Open Font License
 * forbids a modified font (a subset is one) to carry a Reserved Font Name, and the names live inside
 * the compressed font, where no text search reaches.
 *
 * A WOFF2 file (W3C WOFF File Format 2.0) is a 48-byte header, a table directory, then one Brotli
 * stream holding every table, back to back in directory order. Each directory entry is a flags byte (a
 * known-tag index in its low six bits, or 63 and an explicit four-byte tag after it; the transform
 * version in its top two bits), the table's original length, and — only for a transformed table — its
 * transformed length, both as `UIntBase128`. `glyf` and `loca` are transformed at version 0; every
 * other table is transformed at any version BUT 0. The `name` table is never transformed, so its bytes
 * in the stream are the table itself.
 *
 * Font collections (`ttcf`) are not read: the brand fonts are single fonts, and a collection throws
 * rather than being misread.
 *
 * @packageDocumentation
 */

import { brotliDecompressSync } from 'node:zlib';

/** The WOFF2 signature, `wOF2`. */
const WOFF2_SIGNATURE = 0x774f4632;

/** The size of the fixed WOFF2 header, before the table directory. */
const HEADER_BYTES = 48;

/** The flavor of a font collection, `ttcf`, which this reader refuses. */
const COLLECTION_FLAVOR = 0x74746366;

/** The known-tag indexes this reader needs: `name`, and the two tables transformed at version 0. */
const KNOWN_TAG = { glyf: 10, loca: 11, name: 5 } as const;

/** A flags byte's low six bits that mean "an explicit four-byte tag follows". */
const ARBITRARY_TAG = 63;

/** Windows platform ID: its strings are UTF-16BE. Every other platform here is a single-byte encoding. */
const WINDOWS_PLATFORM = 3;

/** One record of a font's `name` table. */
export interface FontNameRecord {
	/** The name ID: 1 family, 4 full name, 6 PostScript name, 0 copyright, … */
	readonly nameID: number;
	/** The platform ID: 3 Windows, 1 Macintosh. */
	readonly platformID: number;
	/** The decoded string. */
	readonly text: string;
}

/**
 * Read one `UIntBase128` value.
 *
 * @param bytes - The file.
 * @param offset - Where the value starts.
 * @returns The value and the offset after it.
 */
function readUIntBase128(bytes: Buffer, offset: number): { readonly next: number; readonly value: number } {
	let value = 0;

	for (let index = 0; index < 5; index++) {
		const byte = bytes.readUInt8(offset + index);

		value = value * 128 + (byte & 0x7f);
		if ((byte & 0x80) === 0) {
			return { next: offset + index + 1, value };
		}
	}

	throw new Error(`a UIntBase128 at byte ${String(offset)} runs past five bytes`);
}

/**
 * The raw bytes of the `name` table inside a WOFF2 file.
 *
 * @param woff2 - The file.
 * @returns The table.
 */
function nameTableBytes(woff2: Buffer): Buffer {
	if (woff2.readUInt32BE(0) !== WOFF2_SIGNATURE) {
		throw new Error('not a WOFF2 file: the signature is not wOF2');
	}
	if (woff2.readUInt32BE(4) === COLLECTION_FLAVOR) {
		throw new Error('a WOFF2 font collection, which this reader does not read');
	}

	const tableCount = woff2.readUInt16BE(12);
	const compressedLength = woff2.readUInt32BE(20);
	let offset = HEADER_BYTES;
	let streamOffset = 0;
	let nameTable: { readonly length: number; readonly start: number } | null = null;

	for (let table = 0; table < tableCount; table++) {
		const flags = woff2.readUInt8(offset);
		const tagIndex = flags & 0x3f;
		const transformVersion = flags >> 6;

		offset += tagIndex === ARBITRARY_TAG ? 5 : 1;

		const original = readUIntBase128(woff2, offset);
		const isGlyphTable = tagIndex === KNOWN_TAG.glyf || tagIndex === KNOWN_TAG.loca;
		const isTransformed = isGlyphTable ? transformVersion === 0 : transformVersion !== 0;
		const stored = isTransformed ? readUIntBase128(woff2, original.next) : { next: original.next, value: original.value };

		if (tagIndex === KNOWN_TAG.name) {
			nameTable = { length: stored.value, start: streamOffset };
		}
		streamOffset += stored.value;
		offset = stored.next;
	}

	if (nameTable === null) {
		throw new Error('the font has no name table');
	}

	const stream = brotliDecompressSync(woff2.subarray(offset, offset + compressedLength));

	return stream.subarray(nameTable.start, nameTable.start + nameTable.length);
}

/**
 * Every record of a WOFF2 font's `name` table, decoded.
 *
 * @param woff2 - The file.
 * @returns The records, in table order.
 */
export function woff2NameRecords(woff2: Buffer): readonly FontNameRecord[] {
	const table = nameTableBytes(woff2);
	const count = table.readUInt16BE(2);
	const stringsStart = table.readUInt16BE(4);

	return Array.from({ length: count }, (_, index) => {
		const record = 6 + 12 * index;
		const platformID = table.readUInt16BE(record);
		const length = table.readUInt16BE(record + 8);
		const start = stringsStart + table.readUInt16BE(record + 10);
		const raw = Buffer.from(table.subarray(start, start + length));

		return {
			nameID: table.readUInt16BE(record + 6),
			platformID,
			text: platformID === WINDOWS_PLATFORM ? raw.swap16().toString('utf16le') : raw.toString('latin1'),
		};
	});
}
