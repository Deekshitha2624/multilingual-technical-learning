# Lesson Studio

## Setup

```bash
npm install
cp .env.example .env.local
npm run dev
```

Add `GEMINI_API_KEY` to `.env.local`. Set `GEMINI_MODEL=gemini-2.5-flash` unless you have another model. Set `TEACHER_TOKEN` to a long random value for corrections and publishing.

## Large document generation

- `POST /api/generate` immediately creates a persistent lesson and chunk job, then returns a job ID.
- The UI polls `GET /api/generate/status/{id}` and calls `POST /api/generate/process/{id}` in short steps. A browser or gateway request does not wait for all chunks.
- Long lessons are split by paragraphs and sentences into 3,500-character sections and saved after every completed chunk.
- English, Marathi and Hindi have separate progress counts. Completed chunks are not regenerated.
- Transient Gemini failures are retried internally. `POST /api/generate/process/{id}` with `{ "retry": true }` retries every failed chunk; language plus chunk fields retry one chunk.
- Gemini chunk calls have a 25-second client timeout. Route processing is kept short and resumable instead of relying on a 50-second or 300-second route timeout.
- Set `GENERATION_JOBS_PATH` to override the job JSON location. It defaults to `./data/generation-jobs.json`.

Jobs and lessons use local JSON files. This is suitable for local development and persistent single-server deployments. Serverless or horizontally scaled production should use a shared database.

## Supported uploads

PDF, DOCX, PPTX, XLSX, CSV, TXT and MD up to 10 MB. Extracted text supports up to 1,000,000 characters.
