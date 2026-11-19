import { LANGUAGES, Drafts, protect, restore } from './protect';

export class GenerationError extends Error {
  constructor(message: string, public status: number, public retryable: boolean) {
    super(message);
    this.name = 'GenerationError';
  }
}

const SYSTEM = [
  'Create accurate, age-appropriate technical learning material.',
  'Return only valid JSON with exactly one string key: the requested language.',
  'Marathi and Hindi must use Devanagari script for words, but keep ASCII digits 0-9 for every number.',
  'Every LESSON_KEEP_n_TOKEN is protected. Copy each token exactly once, unchanged, in the correct place.',
  'Never translate, rewrite, add or remove a token. Translate only the surrounding prose.',
  'Keep the meaning, units and quantities exactly as in the source.',
].join(' ');

const TRANSIENT_STATUS = new Set([408, 429, 500, 502, 503, 504]);

async function callGemini(protectedChunk: string, language: keyof Drafts, apiKey: string, model: string, context: string): Promise<string> {
  const base = (process.env.GEMINI_API_BASE || 'https://generativelanguage.googleapis.com').replace(/\/$/, '');
  let response: Response;
  try {
    response = await fetch(`${base}/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
      method: 'POST',
      headers: { 'x-goog-api-key': apiKey, 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(45_000),
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: SYSTEM }] },
        contents: [{ role: 'user', parts: [{ text: `Translate this section into ${language}. The preceding section is context only; do not repeat it.\n\nContext:\n${context || '(first section)'}\n\nSection:\n${protectedChunk}\n\nReturn JSON only: {"${language}": "..."}` }] }],
        generationConfig: { temperature: 0.2, responseMimeType: 'application/json', maxOutputTokens: 8192 },
      }),
    });
  } catch {
    throw new GenerationError('Could not reach Gemini. The failed chunk can be retried.', 502, true);
  }
  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    const transient = TRANSIENT_STATUS.has(response.status);
    throw new GenerationError(result?.error?.message || `Gemini failed with HTTP ${response.status}.`, transient ? 503 : 502, transient);
  }
  const content = result?.candidates?.[0]?.content?.parts?.map((part: { text?: string }) => part.text || '').join('') || '';
  if (!content.trim()) throw new GenerationError('Gemini returned no content.', 502, true);
  return content;
}

export async function translateLanguageChunk(chunk: string, language: keyof Drafts, terms: string[], apiKey: string, model: string, context = ''): Promise<string> {
  const { text: protectedChunk, items } = protect(chunk, terms);
  const maxAttempts = 3;
  for (let attempt = 1; ; attempt++) {
    try {
      const cleaned = (await callGemini(protectedChunk, language, apiKey, model, context)).trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
      let parsed: Record<string, unknown>;
      try { parsed = JSON.parse(cleaned); } catch { throw new GenerationError(`Gemini returned invalid JSON for ${language}.`, 502, true); }
      if (typeof parsed[language] !== 'string') throw new GenerationError(`Gemini did not return a valid ${language} draft.`, 502, true);
      const restored = restore(parsed[language] as string, items);
      if (restored === null) throw new GenerationError(`Gemini changed or repeated a protected formula, number, unit or term in ${language}.`, 502, true);
      return restored;
    } catch (error) {
      const failure = error instanceof GenerationError ? error : new GenerationError('Unexpected generation error.', 500, false);
      if (!failure.retryable || attempt >= maxAttempts) throw failure;
      await new Promise((resolve) => setTimeout(resolve, 2000 * attempt));
    }
  }
}
