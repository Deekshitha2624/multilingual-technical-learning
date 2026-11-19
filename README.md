# Lesson Studio

## Setup

```bash
npm install
cp .env.example .env.local
npm run dev
```

Add `GEMINI_API_KEY` to `.env.local`. Set `GEMINI_MODEL=gemini-2.5-flash` unless you have another model. Set `TEACHER_TOKEN` to a long random value for corrections and publishing.

## Large document generation

- The generation API is asynchronous. `POST /api/generate` creates a persistent job and returns immediately with `id` and `lessonId`.
- Poll `GET /api/generate/status/{id}` for separate English, Marathi and Hindi chunk progress.
- Call `POST /api/generate/process/{id}` repeatedly to process one pending chunk or retry a glossary task. The UI does this automatically. This keeps browser and gateway requests short and avoids 504 responses.
- Long lessons are split by paragraphs and sentences into 3,500-character sections. Processing is saved after every chunk; completed chunks are never regenerated.
- POST `{ "retry": true }` to retry all failed chunks and glossary work. POST `{ "retry": true, "language": "Hindi", "chunk": 3 }` retries one chunk.
- Use `GENERATION_JOBS_PATH` to override the job JSON file location. It defaults to `./data/generation-jobs.json`.

Generation jobs and lessons use local JSON files. This is reliable for local development and a persistent single server. It is not durable across ephemeral serverless disks; use a database for horizontally scaled or serverless production deployments.

## Supported uploads

PDF, DOCX, PPTX, XLSX, CSV, TXT and MD up to 10 MB. Extracted text supports up to 1,000,000 characters.
