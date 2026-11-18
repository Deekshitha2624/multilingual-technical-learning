// Independent check that numbers, units and formulas in a draft match the source.
const DEVANAGARI_DIGITS = '०१२३४५६७८९';
const FORMULA_RE = /\$\$[\s\S]*?\$\$|\\\[[\s\S]*?\\\]|\\\([\s\S]*?\\\)|\$[^$\n]+\$/g;

export function normalizeDigits(text: string) {
  return text.replace(/[०-९]/g, (d) => String(DEVANAGARI_DIGITS.indexOf(d)));
}

function countBy(values: string[]) {
  const map = new Map<string, number>();
  for (const value of values) map.set(value, (map.get(value) || 0) + 1);
  return map;
}

function difference(a: string[], b: string[]) {
  const remaining = countBy(b);
  const missing: string[] = [];
  for (const value of a) {
    const count = remaining.get(value) || 0;
    if (count > 0) remaining.set(value, count - 1);
    else missing.push(value);
  }
  return missing;
}

export function extractFacts(text: string) {
  const normalized = normalizeDigits(text);
  return {
    numbers: normalized.match(/\d+(?:[.,]\d+)*/g) ?? [],
    formulas: text.match(FORMULA_RE) ?? [],
  };
}

export type DraftCheck = {
  language: string;
  numbersMissing: string[];
  numbersAdded: string[];
  formulasMissing: string[];
  ok: boolean;
};

export function checkDraft(source: string, draft: string, language: string): DraftCheck {
  const sourceFacts = extractFacts(source);
  const draftFacts = extractFacts(draft);
  const numbersMissing = difference(sourceFacts.numbers, draftFacts.numbers);
  const numbersAdded = difference(draftFacts.numbers, sourceFacts.numbers);
  const formulasMissing = difference(sourceFacts.formulas, draftFacts.formulas);
  return {
    language,
    numbersMissing,
    numbersAdded,
    formulasMissing,
    ok: numbersMissing.length === 0 && formulasMissing.length === 0,
  };
}

export function describeChecks(checks: DraftCheck[]): string[] {
  const warnings: string[] = [];
  for (const check of checks) {
    if (check.numbersMissing.length) warnings.push(`${check.language}: number(s) not found in draft: ${check.numbersMissing.join(', ')}`);
    if (check.formulasMissing.length) warnings.push(`${check.language}: formula(s) not found in draft: ${check.formulasMissing.join(' | ')}`);
    if (check.numbersAdded.length) warnings.push(`${check.language}: number(s) in draft that are not in source: ${check.numbersAdded.join(', ')}`);
  }
  return warnings;
}
