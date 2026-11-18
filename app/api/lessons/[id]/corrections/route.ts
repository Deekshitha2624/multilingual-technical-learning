import { NextResponse } from 'next/server';
import { LANGUAGES } from '../../../../lib/protect';
import { checkDraft } from '../../../../lib/fidelity';
import { getLesson, updateLesson, type Language } from '../../../../lib/store';
import { isTeacher } from '../../../../lib/teacher';

type Context = { params: { id: string } };

export async function POST(request: Request, { params }: Context) {
  if (!isTeacher(request)) return NextResponse.json({ error: 'A valid x-teacher-token is required.' }, { status: 401 });
  let body: Record<string, unknown>;
  try {
    const value: unknown = await request.json();
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error();
    body = value as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
  }

  const language = body.language;
  const text = typeof body.text === 'string' ? body.text.trim() : '';
  const teacher = typeof body.teacher === 'string' ? body.teacher.trim().slice(0, 120) : '';
  const note = typeof body.note === 'string' ? body.note.trim().slice(0, 1000) : '';
  if (!LANGUAGES.includes(language as Language) || !text || !teacher) {
    return NextResponse.json({ error: 'Provide a supported language, non-empty text, and teacher name.' }, { status: 400 });
  }

  const updated = await updateLesson(params.id, (record) => {
    const selected = language as Language;
    const check = checkDraft(record.source, text, selected);
    record.drafts[selected] = text;
    record.approvals[selected] = body.approve === true ? { approved: true, teacher, approvedAt: new Date().toISOString() } : null;
    record.corrections.push({ language: selected, text, teacher, note, createdAt: new Date().toISOString(), check });
    return check;
  });
  if (!updated) return NextResponse.json({ error: 'Lesson not found.' }, { status: 404 });
  return NextResponse.json({ lesson: updated.record, check: updated.result });
}
