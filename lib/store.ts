import { promises as fs } from 'fs';
import path from 'path';
import { Drafts, Language } from './protect';
import type { GlossaryEntry } from './glossary';

export type Correction = {
  id: string;
  language: Language;
  previous: string;
  text: string;
  teacher: string;
  note: string;
  createdAt: string;
};

export type PublishedVersion = {
  version: number;
  publishedAt: string;
  drafts: Drafts;
  glossary: GlossaryEntry[];
};

export type Lesson = {
  id: string;
  createdAt: string;
  updatedAt: string;
  source: string;
  terms: string[];
  model: string;
  generated: Drafts;
  current: Drafts;
  approved: Record<Language, boolean>;
  warnings: string[];
  glossary: GlossaryEntry[];
  corrections: Correction[];
  published: PublishedVersion | null;
  publishedVersion: number;
};

const FILE = process.env.LESSON_DB_PATH || path.join(process.cwd(), 'data', 'lessons.json');
let queue: Promise<unknown> = Promise.resolve();

function withLock<T>(task: () => Promise<T>): Promise<T> {
  const run = queue.then(task, task);
  queue = run.catch(() => undefined);
  return run;
}

async function readAll(): Promise<Record<string, Lesson>> {
  try {
    return JSON.parse(await fs.readFile(FILE, 'utf8')) as Record<string, Lesson>;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return {};
    throw error;
  }
}

async function writeAll(db: Record<string, Lesson>) {
  await fs.mkdir(path.dirname(FILE), { recursive: true });
  const tmp = `${FILE}.${process.pid}.${Date.now()}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(db, null, 2), 'utf8');
  await fs.rename(tmp, FILE);
}

export function createLesson(lesson: Omit<Lesson, 'id' | 'createdAt' | 'updatedAt' | 'corrections' | 'published' | 'publishedVersion' | 'approved' | 'current'>): Promise<Lesson> {
  return withLock(async () => {
    const db = await readAll();
    const now = new Date().toISOString();
    const record: Lesson = {
      ...lesson,
      id: `les_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
      createdAt: now,
      updatedAt: now,
      current: { ...lesson.generated },
      approved: { English: false, Marathi: false, Hindi: false },
      corrections: [],
      published: null,
      publishedVersion: 0,
    };
    db[record.id] = record;
    await writeAll(db);
    return record;
  });
}

export function getLesson(id: string): Promise<Lesson | null> {
  return withLock(async () => (await readAll())[id] ?? null);
}

export function updateLesson(id: string, change: (lesson: Lesson) => string | void): Promise<{ lesson?: Lesson; error?: string; notFound?: boolean }> {
  return withLock(async () => {
    const db = await readAll();
    const lesson = db[id];
    if (!lesson) return { notFound: true };
    const error = change(lesson);
    if (error) return { error };
    lesson.updatedAt = new Date().toISOString();
    db[id] = lesson;
    await writeAll(db);
    return { lesson };
  });
}
