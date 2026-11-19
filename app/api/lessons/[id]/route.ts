import { NextResponse } from 'next/server';
import { getLesson } from '../../../../lib/store';
import { isTeacher } from '../../../../lib/teacher';

export const runtime = 'nodejs';

export async function GET(request: Request, { params }: { params: { id: string } }) {
  const lesson = await getLesson(params.id);
  if (!lesson) return NextResponse.json({ error: 'Lesson not found.' }, { status: 404 });
  if (request.headers.has('x-teacher-token')) {
    if (!isTeacher(request)) return NextResponse.json({ error: 'Invalid x-teacher-token.' }, { status: 401 });
    return NextResponse.json({ lesson });
  }
  if (!lesson.published) return NextResponse.json({ error: 'This lesson has not been published.' }, { status: 404 });
  return NextResponse.json({ id: lesson.id, published: lesson.published, publishedVersion: lesson.publishedVersion, publishedAt: lesson.published.publishedAt, drafts: lesson.published.drafts, glossary: lesson.published.glossary });
}
