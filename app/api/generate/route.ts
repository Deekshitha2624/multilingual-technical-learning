import { NextResponse } from 'next/server';
import { LANGUAGES, type Drafts } from '../../../lib/protect';
import { checkDraft, describeChecks } from '../../../lib/fidelity';
import { GenerationError, translateChunk } from '../../../lib/gemini';
import { mapLimit, splitIntoChunks } from '../../../lib/chunk';
import { createLesson } from '../../../lib/store';
import { buildGlossary, type GlossaryEntry } from '../../../lib/glossary';

export const runtime = 'nodejs';
export const maxDuration = 300;

const MAX_LESSON_LENGTH = 1_000_000;
const CHUNK_SIZE = 3500;
const CONCURRENCY = 4;
const MAX_TERMS = 100;

export async function POST(request: Request) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return NextResponse.json({ error: 'Gemini API key is missing. Add GEMINI_API_KEY to .env.local and restart/redeploy.' }, { status: 503 });

  let body: { lesson?: unknown; terms?: unknown };
  try { body = await request.json(); } catch { return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 }); }

  const lesson = typeof body.lesson === 'string' ? body.lesson.trim() : '';
  const terms = Array.isArray(body.terms) ? body.terms.filter((term): term is string => typeof term === 'string').map((term) => term.trim()).filter(Boolean).slice(0, MAX_TERMS) : [];
  if (!lesson) return NextResponse.json({ error: 'Provide a lesson with some text.' }, { status: 400 });
  if (lesson.length > MAX_LESSON_LENGTH) return NextResponse.json({ error: `The lesson is ${lesson.length.toLocaleString()} characters. The limit is ${MAX_LESSON_LENGTH.toLocaleString()}; split the lesson into smaller parts.` }, { status: 413 });

  const model = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
  const chunks = splitIntoChunks(lesson, CHUNK_SIZE);
  let results: Drafts[];
  let glossary: GlossaryEntry[] = [];
  const glossaryWarnings: string[] = [];
  try {
    const [translated, built] = await Promise.all([
      mapLimit(chunks, CONCURRENCY, (chunk) => translateChunk(chunk, terms, apiKey, model)),
      buildGlossary(lesson, terms, apiKey, model).catch((error) => {
        glossaryWarnings.push(`Glossary could not be created: ${error instanceof Error ? error.message : 'unknown error'}`);
        return [] as GlossaryEntry[];
      }),
    ]);
    results = translated;
    glossary = built;
  } catch (error) {
    const failure = error instanceof GenerationError ? error : null;
    const where = chunks.length > 1 ? ' (one section of the lesson failed; the others were not saved)' : '';
    if (!failure) console.error('Generation failed:', error);
    return NextResponse.json({ error: `${failure?.message || 'Could not generate drafts.'}${where}` }, { status: failure?.status || 502 });
  }

  const drafts = {} as Drafts;
  for (const language of LANGUAGES) drafts[language] = results.map((result) => result[language]).join('\n\n');
  const checks = LANGUAGES.map((language) => checkDraft(lesson, drafts[language], language));
  const warnings = [...describeChecks(checks), ...glossaryWarnings];
  const record = await createLesson({ source: lesson, terms, model, generated: drafts, warnings, glossary, sections: chunks.length });
  return NextResponse.json({ id: record.id, drafts, checks, warnings, glossary, sections: chunks.length });
}
