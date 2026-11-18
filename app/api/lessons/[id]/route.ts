import { NextResponse } from 'next/server';
import { getLesson } from '../../../../lib/store';
import { requireTeacher } from '../../../../lib/auth';

export const runtime = 'nodejs';

export async function GET(request: Request, { params }: { params: { id: string } }) {
  const lesson = await getLesson(params.id);
  if (!lesson) return NextResponse.json({ error: 'Lesson not found.' }, { status: 404 });
  const denied = requireTeacher(request);
  if (!denied) return NextResponse.json({ lesson });
  if (denied.status === 503) return denied;
  return NextResponse.json({ id: lesson.id, publishedVersion: lesson.publishedVersion, published: lesson.published });
}
