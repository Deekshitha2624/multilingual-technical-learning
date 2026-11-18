import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const maxDuration = 60;

function protect(text: string, terms: string[]) {
  const protectedItems: string[] = [];
  let result = text;
  const patterns = [
    /\\\[[\s\S]*?\\\]/g,
    /\\\([\s\S]*?\\\)/g,
    /\$\$[\s\S]*?\$\$/g,
    /\$[^$\n]+\$/g,
  ];
  const stash = (value: string) => {
    const token = `LESSON_KEEP_${protectedItems.length}_TOKEN`;
    protectedItems.push(value);
    return token;
  };
  for (const term of Array.from(new Set(terms)).sort((a, b) => b.length - a.length)) {
    if (!term) continue;
    result = result.replace(new RegExp(term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'), (match) => stash(match));
  }
  for (const pattern of patterns) result = result.replace(pattern, (match) => stash(match));
  return { text: result, protectedItems };
}

function restore(text: string, items: string[]) {
  let restored = text;
  for (let i = 0; i < items.length; i++) {
    const token = `LESSON_KEEP_${i}_TOKEN`;
    if (!restored.split(token).length || restored.split(token).length !== 2) return null;
    restored = restored.replace(token, () => items[i]);
  }
  return restored;
}

export async function POST(request: Request) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return NextResponse.json({ error: 'Gemini API key is missing. Add GEMINI_API_KEY to .env.local and restart/redeploy.' }, { status: 503 });

  let body: { lesson?: unknown; terms?: unknown };
  try { body = await request.json(); } catch { return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 }); }

  const lesson = typeof body.lesson === 'string' ? body.lesson.trim() : '';
  const terms = Array.isArray(body.terms) ? body.terms.filter((x): x is string => typeof x === 'string').slice(0, 100) : [];
  if (!lesson || lesson.length > 30000) return NextResponse.json({ error: 'Provide a lesson between 1 and 30,000 characters.' }, { status: 400 });

  const { text: protectedLesson, protectedItems } = protect(lesson, terms);
  const model = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
  const system = 'Create accurate age-appropriate technical learning material. Return only valid JSON with exactly these string keys: English, Marathi, Hindi. Preserve every LESSON_KEEP_n_TOKEN exactly once in each version. Marathi and Hindi must use Devanagari. Preserve formulas and protected terms exactly.';

  try {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
      method: 'POST',
      headers: { 'x-goog-api-key': apiKey, 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(50_000),
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: system }] },
        contents: [{ role: 'user', parts: [{ text: `Create the three versions. Return JSON only:\n\n${protectedLesson}` }] }],
        generationConfig: { temperature: 0.2, responseMimeType: 'application/json', maxOutputTokens: 8192 },
      }),
    });
    const result = await response.json();
    if (!response.ok) return NextResponse.json({ error: result?.error?.message || `Gemini failed with HTTP ${response.status}.` }, { status: 502 });

    let content = result?.candidates?.[0]?.content?.parts?.map((part: { text?: string }) => part.text || '').join('') || '';
    if (!content) return NextResponse.json({ error: 'Gemini returned no content. Check the source and try again.' }, { status: 502 });
    content = content.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');

    let parsed: Record<string, unknown>;
    try { parsed = JSON.parse(content); } catch { return NextResponse.json({ error: 'Gemini returned invalid JSON. Please shorten the lesson and try again.' }, { status: 502 }); }

    const drafts: Record<string, string> = {};
    for (const language of ['English', 'Marathi', 'Hindi']) {
      if (typeof parsed[language] !== 'string') return NextResponse.json({ error: `Gemini did not return a valid ${language} draft.` }, { status: 502 });
      const restored = restore(parsed[language], protectedItems);
      if (restored === null) return NextResponse.json({ error: `Gemini changed or omitted a protected formula, quantity, or term in ${language}. Please try again.` }, { status: 502 });
      drafts[language] = restored;
    }
    return NextResponse.json({ drafts });
  } catch (error) {
    console.error('Gemini generation failed:', error);
    return NextResponse.json({ error: 'Could not reach Gemini. Check your network and server logs.' }, { status: 502 });
  }
}
