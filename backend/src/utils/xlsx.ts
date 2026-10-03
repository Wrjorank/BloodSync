import { strFromU8, unzipSync } from 'fflate';
import { badRequest } from './AppError';

// minimal .xlsx reader for our own import templates: one named sheet, text and numbers only.
// written on fflate instead of a full parser so the attack surface stays small:
// only the four xml parts we need are inflated, their declared size is capped (zip bomb),
// and xml is scanned with linear regexes; no entity expansion, no external references.

const MAX_UNZIPPED_BYTES = 20 * 1024 * 1024;
const NEEDED = /^xl\/(workbook\.xml|_rels\/workbook\.xml\.rels|sharedStrings\.xml|worksheets\/sheet\d+\.xml)$/;

const ENTITIES: Record<string, string> = { lt: '<', gt: '>', amp: '&', quot: '"', apos: "'" };
const decode = (s: string) =>
  s.replace(/&(#x[0-9a-f]+|#\d+|lt|gt|amp|quot|apos);/gi, (_, e: string) => {
    if (e[0] !== '#') return ENTITIES[e.toLowerCase()];
    const code = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
    return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : '';
  });

const attr = (tag: string, name: string) => new RegExp(`\\s${name}="([^"]*)"`).exec(tag)?.[1];

// text of every <t> run, skipping phonetic hints (<rPh>) that excel adds for some locales
const textRuns = (xml: string) =>
  [...xml.replace(/<rPh\b[\s\S]*?<\/rPh>/g, '').matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)].map(m => decode(m[1])).join('');

// "AB12" -> 27 (zero based column)
const columnIndex = (ref: string) => {
  let n = 0;
  for (const ch of ref.replace(/\d+$/, '')) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
};

export interface SheetRow {
  // excel row number as shown to the user (1 = first row)
  n: number;
  cells: string[];
}

export function readSheet(buffer: Buffer, sheetName: string, maxRows: number): SheetRow[] {
  if (buffer.length < 4 || buffer.readUInt32LE(0) !== 0x04034b50) throw badRequest('Berkas bukan file Excel (.xlsx)');
  let total = 0;
  let files: Record<string, Uint8Array>;
  try {
    files = unzipSync(new Uint8Array(buffer), {
      filter: f => {
        if (!NEEDED.test(f.name)) return false;
        total += f.originalSize;
        if (total > MAX_UNZIPPED_BYTES) throw new Error('too large');
        return true;
      },
    });
  } catch {
    throw badRequest('File Excel rusak atau terlalu besar. Gunakan template dari BloodSync.');
  }
  const text = (name: string) => (files[name] ? strFromU8(files[name]) : '');

  // workbook.xml names the sheets, its rels file maps each to a worksheet part
  const sheetTag = [...text('xl/workbook.xml').matchAll(/<sheet\b[^>]*\/?>/g)].map(m => m[0]).find(t => decode(attr(t, 'name') || '') === sheetName);
  if (!sheetTag) throw badRequest(`Sheet "${sheetName}" tidak ditemukan. Gunakan template dari BloodSync tanpa mengganti nama sheet.`);
  const relId = attr(sheetTag, 'r:id');
  const relTag = [...text('xl/_rels/workbook.xml.rels').matchAll(/<Relationship\b[^>]*\/?>/g)].map(m => m[0]).find(t => attr(t, 'Id') === relId);
  const target = (attr(relTag || '', 'Target') || '').replace(/^\/?(xl\/)?/, '');
  const sheetXml = text(`xl/${target}`);
  if (!sheetXml) throw badRequest('Isi sheet tidak terbaca. Simpan ulang file sebagai Excel Workbook (.xlsx).');

  const shared = [...text('xl/sharedStrings.xml').matchAll(/<si\b[^>]*>([\s\S]*?)<\/si>/g)].map(m => textRuns(m[1]));

  const rows: SheetRow[] = [];
  for (const rowMatch of sheetXml.matchAll(/<row\b([^>]*)>([\s\S]*?)<\/row>/g)) {
    const n = Number(attr(' ' + rowMatch[1], 'r')) || (rows.at(-1)?.n ?? 0) + 1;
    const row: string[] = [];
    for (const c of rowMatch[2].matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const [, attrs, inner = ''] = c;
      const ref = attr(' ' + attrs, 'r');
      const type = attr(' ' + attrs, 't');
      const raw = /<v>([\s\S]*?)<\/v>/.exec(inner)?.[1];
      let value = '';
      if (type === 's') value = shared[Number(raw)] ?? '';
      else if (type === 'inlineStr') value = textRuns(inner);
      else if (type === 'b') value = raw === '1' ? 'TRUE' : 'FALSE';
      else if (raw !== undefined) value = decode(raw);
      const col = ref ? columnIndex(ref) : row.length;
      if (col < 0 || col > 50) continue;
      row[col] = value.trim();
    }
    if (row.some(v => v)) rows.push({ n, cells: Array.from(row, v => v ?? '') });
    if (rows.length > maxRows + 1) throw badRequest(`Maksimal ${maxRows} baris data per file`);
  }
  return rows;
}
