import { NextResponse } from 'next/server';
import { LANGUAGES } from '../../../../../lib/protect';
import { updateLesson } from '../../../../../lib/store';
import { requireTeacher } from '../../../../../lib/auth';

export const runtime = 'nodejs';

export async function POST(request: Request, { params }: { params: { id: string } }) {
  const denied = requireTeacher(request);
  if (denied) return denied;

  const result = await updateLesson(params.id, (lesson) => {
    const missing = LANGUAGES.filter((language) => !lesson.approved[language]);
    if (missing.length) return `Approve every language before publishing. Not yet approved: ${missing.join(', ')}.`;
    lesson.publishedVersion += 1;
    lesson.published = {
      version: lesson.publishedVersion,
      publishedAt: new Date().toISOString(),
      drafts: { ...lesson.current },
      glossary: lesson.glossary,
    };
  });

  if (result.notFound) return NextResponse.json({ error: 'Lesson not found.' }, { status: 404 });
  if (result.error) return NextResponse.json({ error: result.error }, { status: 409 });
  return NextResponse.json({ published: result.lesson!.published });
}
