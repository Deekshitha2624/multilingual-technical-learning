import { GenerationError } from './gemini';

export type GlossaryEntry = { term: string; Marathi: string; Hindi: string };
const GLOSSARY_CHARS = 30_000;
const MAX_ENTRIES = 40;

export async function buildGlossary(source: string, teacherTerms: string[], apiKey: string, model: string): Promise<GlossaryEntry[]> {
  const base = (process.env.GEMINI_API_BASE || 'https://generativelanguage.googleapis.com').replace(/\/$/, '');
  const excerpt = source.slice(0, GLOSSARY_CHARS);
  const instruction = [
    'List key technical terms in this lesson, in English, as a JSON array.',
    'Each item must be {"term":"English term exactly as it appears","Marathi":"Marathi Devanagari equivalent","Hindi":"Hindi Devanagari equivalent"}.',
    `Do not include formulas, numbers or units. Return at most ${MAX_ENTRIES} items.`,
    teacherTerms.length ? `Always include these teacher terms: ${teacherTerms.join(', ')}.` : '',
    'Return JSON only.',
  ].filter(Boolean).join(' ');

  const response = await fetch(`${base}/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
    method: 'POST',
    headers: { 'x-goog-api-key': apiKey, 'Content-Type': 'application/json' },
    signal: AbortSignal.timeout(60_000),
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: `${instruction}\n\nLesson:\n${excerpt}` }] }],
      generationConfig: { temperature: 0.1, responseMimeType: 'application/json', maxOutputTokens: 8192 },
    }),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new GenerationError(result?.error?.message || `Glossary failed with HTTP ${response.status}.`, 502, false);

  const content = result?.candidates?.[0]?.content?.parts?.map((part: { text?: string }) => part.text || '').join('') || '';
  let parsed: unknown;
  try { parsed = JSON.parse(content.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '')); } catch { return []; }
  if (!Array.isArray(parsed)) return [];

  const seen = new Set<string>();
  const entries: GlossaryEntry[] = [];
  for (const item of parsed as Array<Record<string, unknown>>) {
    const term = typeof item?.term === 'string' ? item.term.trim() : '';
    const Marathi = typeof item?.Marathi === 'string' ? item.Marathi.trim() : '';
    const Hindi = typeof item?.Hindi === 'string' ? item.Hindi.trim() : '';
    if (!term || !Marathi || !Hindi || seen.has(term.toLowerCase())) continue;
    seen.add(term.toLowerCase());
    entries.push({ term, Marathi, Hindi });
    if (entries.length >= MAX_ENTRIES) break;
  }
  return entries;
}
