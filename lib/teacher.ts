import { timingSafeEqual } from 'node:crypto';

export function isTeacher(request: Request): boolean {
  const expected = process.env.TEACHER_TOKEN;
  const supplied = request.headers.get('x-teacher-token') || '';
  if (!expected || !supplied) return false;
  const expectedBuffer = Buffer.from(expected);
  const suppliedBuffer = Buffer.from(supplied);
  return expectedBuffer.length === suppliedBuffer.length && timingSafeEqual(expectedBuffer, suppliedBuffer);
}
