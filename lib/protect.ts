// Protects formulas, numbers with units, units and teacher-selected terms before translation.
export const LANGUAGES = ['English', 'Marathi', 'Hindi'] as const;
export type Language = (typeof LANGUAGES)[number];
export type Drafts = Record<Language, string>;

const SINGLE_UNITS = [
  'cm²', 'cm³', 'm²', 'm³', 'km²', 'mm²', 'kΩ', 'MHz', 'kHz', 'kJ', 'kW', 'mV', 'mA', 'kPa',
  'kg', 'km', 'cm', 'mm', 'mg', 'ml', 'Hz', 'Pa', 'atm', 'mol', 'ms', 'min', '°C', '°F', 'Ω',
  'K', 'm', 'g', 'L', 'l', 's', 'h', 'N', 'J', 'W', 'V', 'A', '%',
].sort((a, b) => b.length - a.length);

const escapeRe = (value: string) => value.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');
const COMPOUND_UNIT = String.raw`(?:km|m|cm|mm|s|kg|g|h|min|L)\/(?:s|h|min|kg|m|mol|L|g)²?`;
const SINGLE_UNIT = `(?:${SINGLE_UNITS.map(escapeRe).join('|')})`;
const UNIT = `(?:${COMPOUND_UNIT}|${SINGLE_UNIT})`;
const NUMBER = String.raw`(?<![\p{L}\d_])\d+(?:[.,]\d+)*`;
const FORMULA_PATTERNS = [
  String.raw`\$\$[\s\S]*?\$\$`,
  String.raw`\\\[[\s\S]*?\\\]`,
  String.raw`\\\([\s\S]*?\\\)`,
  String.raw`\$[^$\n]+\$`,
];

export function buildProtectRegex(terms: string[]) {
  const cleanTerms = Array.from(new Set(terms.map((term) => term.trim()).filter(Boolean))).sort((a, b) => b.length - a.length);
  const parts: string[] = [...FORMULA_PATTERNS];
  if (cleanTerms.length) parts.push(String.raw`(?<![\p{L}\d])(?:${cleanTerms.map(escapeRe).join('|')})(?![\p{L}\d])`);
  parts.push(String.raw`${NUMBER}(?:\s?${UNIT}(?![\p{L}\d]))?`);
  parts.push(String.raw`(?<![\p{L}\d])(?:cm|mm|km|m)[²³]`);
  parts.push(String.raw`(?<![\p{L}\d])${COMPOUND_UNIT}(?![\p{L}\d])`);
  return new RegExp(parts.map((part) => `(?:${part})`).join('|'), 'giu');
}

export function protect(text: string, terms: string[]) {
  const items: string[] = [];
  const protectedText = text.replace(buildProtectRegex(terms), (match) => {
    const token = `LESSON_KEEP_${items.length}_TOKEN`;
    items.push(match);
    return token;
  });
  return { text: protectedText, items };
}

export function restore(text: string, items: string[]): string | null {
  let out = text;
  for (let i = 0; i < items.length; i++) {
    const token = `LESSON_KEEP_${i}_TOKEN`;
    if (out.split(token).length - 1 !== 1) return null;
    out = out.replace(token, () => items[i]);
  }
  if (/LESSON_KEEP_\d+_TOKEN/.test(out)) return null;
  return out;
}
