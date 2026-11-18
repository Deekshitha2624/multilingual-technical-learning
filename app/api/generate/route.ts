import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

function protect(text: string, terms: string[]) {
  const protectedItems: string[] = [];
  let result = text;
  const patterns = [
    /\\\[[\s\S]*?\\\]/g,
    /\\\([\s\S]*?\\\)/g,
    /\$\$[\s\S]*?\$\$/g,
    /\$[^$\n]+\$/g,
    /\b(?:[A-Za-z][A-Za-z0-9_]*\s*=\s*)?[-+]?\d+(?:\.\d+)?\s*(?:×|\*|\/|\+|−|=|±|%|°\s*[CF]|(?:km|cm|mm|m|kg|g|mg|s|sec|min|h|hr|L|mL|mol|N|J|W|Pa|Hz|V|A|Ω|K)\b)[^\n,;.!?]*/gi,
    /\b\d+(?:\.\d+)?(?:\s*[-–]\s*\d+(?:\.\d+)?)?\s*(?:km|cm|mm|m|kg|g|mg|s|sec|min|h|hr|L|mL|mol|N|J|W|Pa|Hz|V|A|Ω|K|°\s*[CF]|%)\b/gi,
  ];
  const stash = (value: string) => {
    const token = `LESSON_KEEP_${protectedItems.length}_TOKEN`;
    protectedItems.push(value);
    return token;
  };

  // Protect explicitly selected key terms first, longest-first.
  for (const term of [...new Set(terms)].sort((a, b) => b.length - a.length)) {
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
    const occurrences = restored.split(token).length - 1;
    if (occurrences !== 1) return null;
    restored = restored.replace(token, items[i]);
  }
  return restored;
}

function parseDrafts(content: string): Record<string, unknown> {
  const normalized = content.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  try {
    return JSON.parse(normalized);
  } catch {
    const start = normalized.indexOf('{');
    const end = normalized.lastIndexOf('}');
    if (start >= 0 && end > start) return JSON.parse(normalized.slice(start, end + 1));
    throw new Error('Gemini did not return valid JSON. Try again, or shorten the lesson.');
  }
}

export async function POST(request: Request) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: 'Gemini API key is missing on the server. Add GEMINI_API_KEY to .env.local (or your hosting provider’s environment variables), then restart/redeploy.' }, { status: 503 });
  }

  let body: { lesson?: unknown; terms?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body. Please refresh the page and try again.' }, { status: 400 });
  }

  const lesson = typeof body.lesson === 'string' ? body.lesson.trim() : '';
  const terms = Array.isArray(body.terms) ? body.terms.filter((x: unknown): x is string => typeof x === 'string').slice(0, 100) : [];
  if (!lesson || lesson.length > 30000) return NextResponse.json({ error: 'Provide a lesson between 1 and 30,000 characters.' }, { status: 400 });
  if (terms.some((term) => term.length > 100)) return NextResponse.json({ error: 'Each protected term must be 100 characters or fewer.' }, { status: 400 });

  const { text: protectedLesson, protectedItems } = protect(lesson, terms);
  const system = `You are an educational writing assistant. Create accurate, age-appropriate technical learning material from the supplied teacher-approved source. Return ONLY a valid JSON object with exactly three string keys: English, Marathi, Hindi. Keep the same facts, order, and learning objectives. Do not invent facts or omit important information. Preserve every token matching LESSON_KEEP_n_TOKEN exactly once in each language, including its spelling and capitalization; these tokens represent formulas, quantities, units, or teacher-specified English terms. English should be clear and accessible, Marathi should be natural Marathi in Devanagari, and Hindi should be natural Hindi in Devanagari. Format with readable paragraphs and bullets when useful.`;
  const model = process.env.GEMINI_MODEL || 'gemini-2.5-flash';

  try {
    const completion = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
      method: 'POST',
      headers: { 'x-goog-api-key': apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: system }] },
        contents: [{ role: 'user', parts: [{ text: `Create English, Marathi, and Hindi versions of this source. Return JSON only.\n\n${protectedLesson}` }] }],
        generationConfig: { temperature: 0.2, responseMimeType: 'application/json', maxOutputTokens: 8192 },
      }),
    });

    const result = await completion.json();
    if (!completion.ok) {
      const providerMessage = result?.error?.message;
      console.error('Gemini API request failed:', completion.status, providerMessage || result);
      return NextResponse.json({ error: providerMessage || `Gemini API request failed (HTTP ${completion.status}). Check that the API key is valid and the selected model is available.` }, { status: 502 });
    }

    const candidate = result?.candidates?.[0];
    const content = candidate?.content?.parts?.map((part: { text?: string }) => part.text || '').join('');
    if (!content) {
      const reason = candidate?.finishReason;
      console.error('Gemini returned no text:', reason || result?.promptFeedback);
      return NextResponse.json({ error: reason === 'SAFETY' ? 'Gemini blocked this lesson. Review the content and try again.' : 'Gemini returned no text. Try again or shorten the lesson.' }, { status: 502 });
    }

    let parsed: Record<string, unknown>;
    try {
      parsed = parseDrafts(content);
    } catch (error) {
      console.error('Could not parse Gemini response:', error);
      return NextResponse.json({ error: error instanceof Error ? error.message : 'Gemini returned an unreadable response. Please try again.' }, { status: 502 });
    }

    const drafts: Record<string, string> = {};
    for (const language of ['English', 'Marathi', 'Hindi']) {
      if (typeof parsed[language] !== 'string') {
        return NextResponse.json({ error: `Gemini’s response did not include a valid ${language} version. Try again or shorten the lesson.` }, { status: 502 });
      }
      const restored = restore(parsed[language], protectedItems);
      if (restored === null) {
        return NextResponse.json({ error: `Gemini changed or omitted a protected formula, quantity, or term in the ${language} version. Please try again.` }, { status: 502 });
      }
      drafts[language] = restored;
    }
    return NextResponse.json({ drafts });
  } catch (error) {
    console.error('Lesson generation failed:', error);
    return NextResponse.json({ error: 'Could not reach Gemini. Check your internet connection, API availability, and server logs, then try again.' }, { status: 502 });
  }
}
