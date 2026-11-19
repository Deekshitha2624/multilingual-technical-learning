import { NextResponse } from 'next/server';
import { getGenerationJob, jobProgress, completedDrafts } from '../../../lib/jobs';

export const runtime = 'nodejs';

export async function GET(_request: Request, { params }: { params: { id: string } }) {
  const job = await getGenerationJob(params.id);
  if (!job) return NextResponse.json({ error: 'Generation job not found.' }, { status: 404 });
  const completed = job.status === 'completed';
  return NextResponse.json({
    id: job.id,
    lessonId: job.lessonId,
    status: job.status,
    error: job.error,
    progress: jobProgress(job),
    glossaryStatus: job.glossaryStatus,
    glossaryError: job.glossaryError,
    glossary: job.glossary,
    drafts: completed ? completedDrafts(job) : null,
    chunks: job.chunks.map((chunk) => ({
      index: chunk.index,
      English: { status: chunk.English.status, error: chunk.English.error, attempts: chunk.English.attempts },
      Marathi: { status: chunk.Marathi.status, error: chunk.Marathi.error, attempts: chunk.Marathi.attempts },
      Hindi: { status: chunk.Hindi.status, error: chunk.Hindi.error, attempts: chunk.Hindi.attempts },
    })),
  });
}
