import { randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { DraftCheck } from './fidelity';
import type { Drafts, Language } from './protect';
import type { GlossaryEntry } from './glossary';

export type Approval = { approved: true; teacher: string; approvedAt: string } | null;
export type Correction = { language: Language; text: string; teacher: string; note: string; createdAt: string; check: DraftCheck };
export type LessonRecord = {
  id: string;
  createdAt: string;
  updatedAt: string;
  source: string;
  terms: string[];
  model: string;
  generated: Drafts;
  drafts: Drafts;
  warnings: string[];
  glossary: GlossaryEntry[];
  sections: number;
  approvals: Record<Language, Approval>;
  corrections: Correction[];
  published: { publishedAt: string; drafts: Drafts; glossary: GlossaryEntry[] } | null;
};

const dbPath = () => path.resolve(process.env.LESSON_DB_PATH || './data/lessons.json');
let writeQueue: Promise<void> = Promise.resolve();

async function readAll(): Promise<LessonRecord[]> {
  try {
    const value = await readFile(dbPath(), 'utf8');
    const parsed: unknown = JSON.parse(value);
    if (!Array.isArray(parsed)) throw new Error('Lesson store has an invalid format.');
    return parsed as LessonRecord[];
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw error;
  }
}

async function writeAll(records: LessonRecord[]) {
  const file = dbPath();
  await mkdir(path.dirname(file), { recursive: true });
  const temp = `${file}.${process.pid}.${randomUUID()}.tmp`;
  await writeFile(temp, JSON.stringify(records, null, 2), 'utf8');
  const { rename } = await import('node:fs/promises');
  await rename(temp, file);
}

async function mutate<T>(operation: (records: LessonRecord[]) => T | Promise<T>): Promise<T> {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const result = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
  writeQueue = writeQueue.then(async () => {
    try {
      const records = await readAll();
      const value = await operation(records);
      await writeAll(records);
      resolve(value);
    } catch (error) {
      reject(error);
    }
  });
  return result;
}

export async function createLesson(input: Pick<LessonRecord, 'source' | 'terms' | 'model' | 'generated' | 'warnings' | 'glossary'> & { sections: number }): Promise<LessonRecord> {
  return mutate((records) => {
    const now = new Date().toISOString();
    const record: LessonRecord = {
      ...input,
      id: randomUUID(),
      createdAt: now,
      updatedAt: now,
      drafts: { ...input.generated },
      sections: input.sections,
      approvals: { English: null, Marathi: null, Hindi: null },
      corrections: [],
      published: null,
    };
    records.push(record);
    return record;
  });
}

export async function getLesson(id: string): Promise<LessonRecord | null> {
  return (await readAll()).find((record) => record.id === id) || null;
}

export async function updateLesson<T>(id: string, update: (record: LessonRecord) => T): Promise<{ record: LessonRecord; result: T } | null> {
  return mutate((records) => {
    const record = records.find((item) => item.id === id);
    if (!record) return null;
    const result = update(record);
    record.updatedAt = new Date().toISOString();
    return { record, result };
  });
}

export type { Language, Drafts };
