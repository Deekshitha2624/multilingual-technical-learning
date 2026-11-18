import { NextResponse } from 'next/server';
import { LANGUAGES, type Language } from '../../../../../lib/protect';
import { checkDraft, describeChecks } from '../../../../../lib/fidelity';
import { updateLesson } from '../../../../../lib/store';
import { requireTeacher } from '../../../../../lib/auth';

export const runtime = 'nodejs';
const MAX_CORRECTION = 60_000;

export async function POST(request: Request, { params }: { params: { id: string } }) {
  const denied = requireTeacher(request);
  if (denied) return denied;

  let body: { language?: unknown; text?: unknown; teacher?: unknown; note?: unknown; approve?: unknown };
  try { body = await request.json(); } catch { return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 }); }

  const language = body.language as Language;
  if (!LANGUAGES.includes(language)) return NextResponse.json({ error: 'language must be English, Marathi or Hindi.' }, { status: 400 });
  const text = typeof body.text === 'string' ? body.text.trim() : '';
  if (!text) return NextResponse.json({ error: 'The corrected text cannot be empty.' }, { status: 400 });
  if (text.length > MAX_CORRECTION) return NextResponse.json({ error: `Corrections are limited to ${MAX_CORRECTION.toLocaleString()} characters.` }, { status: 413 });
  const teacher = typeof body.teacher === 'string' && body.teacher.trim() ? body.teacher.trim().slice(0, 120) : 'Teacher';
  const note = typeof body.note === 'string' ? body.note.trim().slice(0, 500) : '';
  const approve = body.approve === true;

  const result = await updateLesson(params.id, (lesson) => {
    const previous = lesson.current[language];
    lesson.current[language] = text;
    lesson.approved[language] = approve;
    lesson.corrections.push({
      id: `cor_${lesson.corrections.length + 1}`,
      language,
      previous,
      text,
      teacher,
      note,
      createdAt: new Date().toISOString(),
    });
    const check = checkDraft(lesson.source, text, language);
    lesson.warnings = [...lesson.warnings.filter((warning) => !warning.startsWith(`${language}:`)), ...describeChecks([check])];
  });

  if (result.notFound) return NextResponse.json({ error: 'Lesson not found.' }, { status: 404 });
  if (result.error) return NextResponse.json({ error: result.error }, { status: 400 });
  const check = checkDraft(result.lesson!.source, text, language);
  return NextResponse.json({ lesson: result.lesson, check });
}
