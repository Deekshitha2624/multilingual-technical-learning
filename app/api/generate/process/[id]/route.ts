import { NextResponse } from 'next/server';
import { getGenerationJob, updateGenerationJob, jobProgress, completedDrafts } from '../../../../lib/jobs';
import { translateLanguageChunk } from '../../../../lib/gemini';
import { buildGlossary } from '../../../../lib/glossary';
import { checkDraft, describeChecks } from '../../../../lib/fidelity';
import { updateLesson } from '../../../../lib/store';
import type { Language } from '../../../../lib/protect';

export const runtime = 'nodejs';
export const maxDuration = 30;

export async function POST(request: Request, { params }: { params: { id: string } }) {
  let body: { retry?: boolean; language?: string; chunk?: number } = {};
  try { body = await request.json(); } catch { body = {}; }

  const job = await getGenerationJob(params.id);
  if (!job) return NextResponse.json({ error: 'Generation job not found.' }, { status: 404 });

  if (body.retry) {
    if (body.language && body.chunk !== undefined) {
      const language = body.language as Language;
      const chunk = job.chunks[body.chunk];
      if (chunk && ['English', 'Marathi', 'Hindi'].includes(language)) {
        await updateGenerationJob(job.id, (current) => {
          current.chunks[body.chunk!][language].status = 'pending';
          current.chunks[body.chunk!][language].error = null;
          current.status = 'running';
          current.error = null;
        });
      }
    } else {
      await updateGenerationJob(job.id, (current) => {
        for (const chunk of current.chunks) {
          for (const language of ['English', 'Marathi', 'Hindi'] as Language[]) {
            if (chunk[language].status === 'failed') { chunk[language].status = 'pending'; chunk[language].error = null; }
          }
        }
        if (current.glossaryStatus === 'failed') { current.glossaryStatus = 'pending'; current.glossaryError = null; }
        current.status = 'running';
        current.error = null;
      });
    }
  }

  let current = await getGenerationJob(params.id);
  if (!current) return NextResponse.json({ error: 'Generation job not found.' }, { status: 404 });
  if (current.status === 'completed') return NextResponse.json({ status: 'completed', progress: jobProgress(current) });

  if (current.glossaryStatus === 'pending') {
    await updateGenerationJob(current.id, (jobToUpdate) => { jobToUpdate.glossaryStatus = 'processing'; });
    try {
      const glossary = await buildGlossary(current.source, current.terms, process.env.GEMINI_API_KEY || '', current.model);
      await updateGenerationJob(current.id, (jobToUpdate) => { jobToUpdate.glossary = glossary; jobToUpdate.glossaryStatus = 'completed'; });
    } catch (error) {
      await updateGenerationJob(current.id, (jobToUpdate) => { jobToUpdate.glossaryStatus = 'failed'; jobToUpdate.glossaryError = error instanceof Error ? error.message : 'Glossary generation failed.'; });
    }
  }

  current = await getGenerationJob(params.id);
  if (!current) return NextResponse.json({ error: 'Generation job not found.' }, { status: 404 });

  let processed = false;
  for (const chunk of current.chunks) {
    for (const language of ['English', 'Marathi', 'Hindi'] as Language[]) {
      if (chunk[language].status !== 'pending') continue;
      processed = true;
      await updateGenerationJob(current.id, (jobToUpdate) => { jobToUpdate.chunks[chunk.index][language].status = 'processing'; jobToUpdate.chunks[chunk.index][language].attempts += 1; });
      try {
        const previous = chunk.index > 0 ? current.chunks[chunk.index - 1].source.slice(-500) : '';
        const text = await translateLanguageChunk(chunk.source, language, current.terms, process.env.GEMINI_API_KEY || '', current.model, previous);
        await updateGenerationJob(current.id, (jobToUpdate) => { jobToUpdate.chunks[chunk.index][language].status = 'completed'; jobToUpdate.chunks[chunk.index][language].text = text; jobToUpdate.chunks[chunk.index][language].error = null; });
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Chunk translation failed.';
        await updateGenerationJob(current.id, (jobToUpdate) => { jobToUpdate.chunks[chunk.index][language].status = 'failed'; jobToUpdate.chunks[chunk.index][language].error = message; });
      }
      break;
    }
    if (processed) break;
  }

  const finalJob = await getGenerationJob(params.id);
  if (finalJob) {
    const progress = jobProgress(finalJob);
    const anyFailed = Object.values(progress).some((value) => value.failed > 0) || finalJob.glossaryStatus === 'failed';
    const allChunksComplete = finalJob.chunks.every((chunk) => chunk.English.status === 'completed' && chunk.Marathi.status === 'completed' && chunk.Hindi.status === 'completed');
    if (allChunksComplete) {
      const drafts = completedDrafts(finalJob);
      const checks = (['English', 'Marathi', 'Hindi'] as Language[]).map((language) => checkDraft(finalJob.source, drafts[language], language));
      const warnings = [...describeChecks(checks), ...(finalJob.glossaryStatus === 'failed' ? [`Glossary: ${finalJob.glossaryError || 'Glossary generation failed.'}`] : [])];
      await updateGenerationJob(finalJob.id, (jobToUpdate) => { jobToUpdate.status = 'completed'; jobToUpdate.error = null; });
      await updateLesson(finalJob.lessonId, (lesson) => { lesson.generated = { ...drafts }; lesson.drafts = { ...drafts }; lesson.warnings = warnings; lesson.glossary = [...finalJob.glossary]; });
    } else if (anyFailed) {
      await updateGenerationJob(finalJob.id, (jobToUpdate) => { jobToUpdate.status = 'failed'; jobToUpdate.error = 'One or more chunks failed. Retry only the failed chunks.'; });
    } else {
      await updateGenerationJob(finalJob.id, (jobToUpdate) => { jobToUpdate.status = 'running'; });
    }
  }

  const updated = await getGenerationJob(params.id);
  return NextResponse.json({ status: updated?.status, progress: updated ? jobProgress(updated) : null, processed, glossaryStatus: updated?.glossaryStatus });
}
