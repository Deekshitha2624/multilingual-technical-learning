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
    const token = `⟦KEEP_${protectedItems.length}⟧`;
    protectedItems.push(value);
    return token;
  };
  // Preserve explicit terms first; longest-first prevents a shorter term from partially masking a longer one.
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
    const token = `⟦KEEP_${i}⟧`;
    if (!restored.includes(token)) return null;
    restored = restored.split(token).join(items[i]);
  }
  return restored;
}

export async function POST(request: Request) {
  if (!process.env.OPENAI_API_KEY) {
    return NextResponse.json({ error: 'AI generation is not configured yet. Add OPENAI_API_KEY to your environment (see .env.example). Your lesson is safe; no request was sent.' }, { status: 503 });
  }
  try {
    const body = await request.json();
    const lesson = typeof body.lesson === 'string' ? body.lesson.trim() : '';
    const terms = Array.isArray(body.terms) ? body.terms.filter((x: unknown) => typeof x === 'string').slice(0, 100) : [];
    if (!lesson || lesson.length > 30000) return NextResponse.json({ error: 'Provide a lesson between 1 and 30,000 characters.' }, { status: 400 });
    if (terms.some((term: string) => term.length > 100)) return NextResponse.json({ error: 'Each protected term must be 100 characters or fewer.' }, { status: 400 });

    const { text: protectedLesson, protectedItems } = protect(lesson, terms);
    const system = `You are an educational writing assistant. Create accurate, age-appropriate technical learning material from the supplied teacher-approved source. Return ONLY valid JSON with exactly these string keys: English, Marathi, Hindi. Keep the same facts, order, and learning objectives. Do not invent facts or omit important information. Preserve all ⟦KEEP_n⟧ tokens exactly, each once, in the appropriate position; these represent formulas, quantities, units, or teacher-specified English terms. English should be clear and accessible, Marathi should be in natural Devanagari Marathi, and Hindi should be in natural Devanagari Hindi. Keep technical English terms when already specified. Format with readable paragraphs and bullets when useful.`;
    const completion = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST', headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: process.env.OPENAI_MODEL || 'gpt-4o-mini', temperature: 0.2, response_format: { type: 'json_object' }, messages: [{ role: 'system', content: system }, { role: 'user', content: `Create the three versions from this source. Return JSON only.\n\n${protectedLesson}` }] }),
    });
    const result = await completion.json();
    if (!completion.ok) return NextResponse.json({ error: result.error?.message || 'The AI provider could not generate drafts.' }, { status: completion.status >= 400 && completion.status < 500 ? 502 : 503 });
    const content = result.choices?.[0]?.message?.content;
    if (!content) return NextResponse.json({ error: 'The AI provider returned an empty response. Please try again.' }, { status: 502 });
    const parsed = JSON.parse(content);
    const drafts: Record<string, string> = {};
    for (const language of ['English', 'Marathi', 'Hindi']) {
      if (typeof parsed[language] !== 'string') return NextResponse.json({ error: `The generated response is missing ${language}. Please try again.` }, { status: 502 });
      const restored = restore(parsed[language], protectedItems);
      if (restored === null) return NextResponse.json({ error: `A formula, quantity, or protected term was altered in the ${language} draft. Please regenerate or check the source.` }, { status: 502 });
      drafts[language] = restored;
    }
    return NextResponse.json({ drafts });
  } catch {
    return NextResponse.json({ error: 'Could not process this request. Check the lesson input and try again.' }, { status: 400 });
  }
}
