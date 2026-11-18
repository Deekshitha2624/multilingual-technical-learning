import { LANGUAGES, Drafts, protect, restore } from './protect';

export class GenerationError extends Error {
  constructor(message: string, public status: number, public retryable: boolean) {
    super(message);
    this.name = 'GenerationError';
  }
}

const SYSTEM = [
  'Create accurate, age-appropriate technical learning material.',
  'Return only valid JSON with exactly these string keys: English, Marathi, Hindi.',
  'Marathi and Hindi must use Devanagari script for words, but keep ASCII digits 0-9 for every number.',
  'Every LESSON_KEEP_n_TOKEN is protected. Copy each token exactly once, unchanged, into each version.',
  'Never translate, rewrite, add or remove a token. Translate only the surrounding prose.',
  'Keep the meaning, units and quantities exactly as in the source.',
].join(' ');

const TRANSIENT_STATUS = new Set([408, 429, 500, 502, 503, 504]);

async function callGemini(protectedChunk: string, apiKey: string, model: string): Promise<string> {
  const base = (process.env.GEMINI_API_BASE || 'https://generativelanguage.googleapis.com').replace(/\/$/, '');
  let response: Response;
  try {
    response = await fetch(`${base}/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
      method: 'POST',
      headers: { 'x-goog-api-key': apiKey, 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(90_000),
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: SYSTEM }] },
        contents: [{ role: 'user', parts: [{ text: `Create the three versions. Return JSON only:\n\n${protectedChunk}` }] }],
        generationConfig: { temperature: 0.2, responseMimeType: 'application/json', maxOutputTokens: 16384 },
      }),
    });
  } catch {
    throw new GenerationError('Could not reach Gemini. Check your network and server logs.', 502, true);
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

function parseDrafts(content: string): Record<string, unknown> {
  const cleaned = content.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  try {
    return JSON.parse(cleaned);
  } catch {
    throw new GenerationError('Gemini returned invalid JSON.', 502, true);
  }
}

export async function translateChunk(chunk: string, terms: string[], apiKey: string, model: string): Promise<Drafts> {
  const { text: protectedChunk, items } = protect(chunk, terms);
  const maxAttempts = 3;
  for (let attempt = 1; ; attempt++) {
    try {
      const parsed = parseDrafts(await callGemini(protectedChunk, apiKey, model));
      const drafts = {} as Drafts;
      for (const language of LANGUAGES) {
        if (typeof parsed[language] !== 'string') throw new GenerationError(`Gemini did not return a valid ${language} draft.`, 502, true);
        const restored = restore(parsed[language] as string, items);
        if (restored === null) throw new GenerationError(`Gemini changed or repeated a protected formula, number, unit or term in ${language}.`, 502, true);
        drafts[language] = restored;
      }
      return drafts;
    } catch (error) {
      const failure = error instanceof GenerationError ? error : new GenerationError('Unexpected generation error.', 500, false);
      if (!failure.retryable || attempt >= maxAttempts) throw failure;
      await new Promise((resolve) => setTimeout(resolve, 1500 * attempt));
    }
  }
}
