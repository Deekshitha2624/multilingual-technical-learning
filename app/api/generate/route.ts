import { NextResponse } from 'next/server';
import { LANGUAGES, type Drafts } from '../../../lib/protect';
import { splitIntoChunks } from '../../../lib/chunk';
import { createLesson } from '../../../lib/store';
import { createGenerationJob, emptyJobLanguage } from '../../../lib/jobs';

export const runtime = 'nodejs';
export const maxDuration = 30;

const MAX_LESSON_LENGTH = 1_000_000;
const CHUNK_SIZE = 3500;
const MAX_TERMS = 100;

export async function POST(request: Request) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return NextResponse.json({ error: 'Gemini API key is missing. Add GEMINI_API_KEY to .env.local and restart/redeploy.' }, { status: 503 });

  let body: { lesson?: unknown; terms?: unknown };
  try { body = await request.json(); } catch { return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 }); }
  const lesson = typeof body.lesson === 'string' ? body.lesson.trim() : '';
  const terms = Array.isArray(body.terms) ? body.terms.filter((term): term is string => typeof term === 'string').map((term) => term.trim()).filter(Boolean).slice(0, MAX_TERMS) : [];
  if (!lesson) return NextResponse.json({ error: 'Provide a lesson with some text.' }, { status: 400 });
  if (lesson.length > MAX_LESSON_LENGTH) return NextResponse.json({ error: `The lesson is ${lesson.length.toLocaleString()} characters. The limit is ${MAX_LESSON_LENGTH.toLocaleString()} characters.` }, { status: 413 });

  const model = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
  const chunks = splitIntoChunks(lesson, CHUNK_SIZE);
  const placeholders = {} as Drafts;
  for (const language of LANGUAGES) placeholders[language] = '';

  const lessonRecord = await createLesson({ source: lesson, terms, model, generated: placeholders, warnings: [], glossary: [], sections: chunks.length });
  const job = await createGenerationJob({ lessonId: lessonRecord.id, source: lesson, terms, model, chunks: chunks.map((source, index) => ({ index, source, English: emptyJobLanguage(), Marathi: emptyJobLanguage(), Hindi: emptyJobLanguage() })) });

  return NextResponse.json({ id: job.id, lessonId: lessonRecord.id, sections: chunks.length, status: job.status });
}
