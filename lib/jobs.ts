import { randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile, rename } from 'node:fs/promises';
import path from 'node:path';
import type { Drafts, Language } from './protect';
import type { GlossaryEntry } from './glossary';

export type ChunkJobLanguage = {
  status: 'pending' | 'processing' | 'completed' | 'failed';
  text: string;
  error: string | null;
  attempts: number;
};

export type ChunkJob = {
  index: number;
  source: string;
  English: ChunkJobLanguage;
  Marathi: ChunkJobLanguage;
  Hindi: ChunkJobLanguage;
};

export type GenerationJob = {
  id: string;
  lessonId: string;
  source: string;
  terms: string[];
  model: string;
  status: 'queued' | 'running' | 'completed' | 'failed';
  createdAt: string;
  updatedAt: string;
  chunks: ChunkJob[];
  glossaryStatus: 'pending' | 'processing' | 'completed' | 'failed';
  glossary: GlossaryEntry[];
  glossaryError: string | null;
  error: string | null;
};

const jobsFile = () => path.resolve(process.env.GENERATION_JOBS_PATH || './data/generation-jobs.json');
let queue: Promise<void> = Promise.resolve();

async function readJobs(): Promise<GenerationJob[]> {
  try {
    const parsed = JSON.parse(await readFile(jobsFile(), 'utf8'));
    return Array.isArray(parsed) ? parsed as GenerationJob[] : [];
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw error;
  }
}

async function writeJobs(jobs: GenerationJob[]) {
  const file = jobsFile();
  await mkdir(path.dirname(file), { recursive: true });
  const temp = `${file}.${process.pid}.${randomUUID()}.tmp`;
  await writeFile(temp, JSON.stringify(jobs, null, 2), 'utf8');
  await rename(temp, file);
}

async function mutate<T>(operation: (jobs: GenerationJob[]) => T | Promise<T>): Promise<T> {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const result = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
  queue = queue.then(async () => {
    try {
      const jobs = await readJobs();
      const value = await operation(jobs);
      await writeJobs(jobs);
      resolve(value);
    } catch (error) {
      reject(error);
    }
  });
  return result;
}

export async function createGenerationJob(input: Omit<GenerationJob, 'id' | 'createdAt' | 'updatedAt' | 'status' | 'error' | 'glossaryStatus' | 'glossary' | 'glossaryError'>): Promise<GenerationJob> {
  return mutate((jobs) => {
    const now = new Date().toISOString();
    const job: GenerationJob = {
      ...input,
      id: randomUUID(),
      status: 'running',
      createdAt: now,
      updatedAt: now,
      glossaryStatus: 'pending',
      glossary: [],
      glossaryError: null,
      error: null,
    };
    jobs.push(job);
    return job;
  });
}

export async function getGenerationJob(id: string): Promise<GenerationJob | null> {
  return (await readJobs()).find((job) => job.id === id) || null;
}

export async function updateGenerationJob(id: string, update: (job: GenerationJob) => void): Promise<GenerationJob | null> {
  return mutate((jobs) => {
    const job = jobs.find((item) => item.id === id);
    if (!job) return null;
    update(job);
    job.updatedAt = new Date().toISOString();
    return job;
  });
}

export function emptyJobLanguage(): ChunkJobLanguage {
  return { status: 'pending', text: '', error: null, attempts: 0 };
}

export function jobProgress(job: GenerationJob) {
  const counts = (language: Language) => {
    let completed = 0;
    let failed = 0;
    let pending = 0;
    let processing = 0;
    for (const chunk of job.chunks) {
      const state = chunk[language].status;
      if (state === 'completed') completed++;
      else if (state === 'failed') failed++;
      else if (state === 'processing') processing++;
      else pending++;
    }
    return { completed, failed, pending, processing, total: job.chunks.length };
  };
  return {
    English: counts('English'),
    Marathi: counts('Marathi'),
    Hindi: counts('Hindi'),
  };
}

export function completedDrafts(job: GenerationJob): Drafts {
  const drafts = {} as Drafts;
  for (const language of ['English', 'Marathi', 'Hindi'] as Language[]) {
    drafts[language] = job.chunks.map((chunk) => chunk[language].text).filter(Boolean).join('\n\n');
  }
  return drafts;
}
