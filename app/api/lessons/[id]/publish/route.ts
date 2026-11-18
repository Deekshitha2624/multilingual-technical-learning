import { NextResponse } from 'next/server';
import { LANGUAGES } from '../../../../lib/protect';
import { getLesson, updateLesson } from '../../../../lib/store';
import { isTeacher } from '../../../../lib/teacher';

type Context = { params: { id: string } };

export async function POST(request: Request, { params }: Context) {
  if (!isTeacher(request)) return NextResponse.json({ error: 'A valid x-teacher-token is required.' }, { status: 401 });
  const lesson = await getLesson(params.id);
  if (!lesson) return NextResponse.json({ error: 'Lesson not found.' }, { status: 404 });
  const unapproved = LANGUAGES.filter((language) => !lesson.approvals[language]?.approved);
  if (unapproved.length) return NextResponse.json({ error: `Approve every language before publishing: ${unapproved.join(', ')}.` }, { status: 409 });

  const updated = await updateLesson(params.id, (record) => {
    record.published = {
      publishedAt: new Date().toISOString(),
      drafts: { ...record.drafts },
      glossary: [...record.glossary],
    };
    return record.published;
  });
  if (!updated) return NextResponse.json({ error: 'Lesson not found.' }, { status: 404 });
  return NextResponse.json({ id: updated.record.id, published: updated.result });
}
