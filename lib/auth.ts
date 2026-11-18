import { NextResponse } from 'next/server';

export function requireTeacher(request: Request): NextResponse | null {
  const expected = process.env.TEACHER_TOKEN;
  if (!expected) return NextResponse.json({ error: 'Teacher actions are disabled. Set TEACHER_TOKEN in the server environment.' }, { status: 503 });
  if (request.headers.get('x-teacher-token') !== expected) return NextResponse.json({ error: 'Teacher token is missing or wrong.' }, { status: 401 });
  return null;
}
