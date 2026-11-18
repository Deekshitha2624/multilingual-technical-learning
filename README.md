# Lesson Studio

## Setup

```bash
npm install
cp .env.example .env.local
npm run dev
```

Add `GEMINI_API_KEY` to `.env.local`. Set `TEACHER_TOKEN` to a long, random secret for teacher corrections and publishing. On a hosted deployment, add both secrets to the server environment and redeploy. Set `GEMINI_MODEL=gemini-2.5-flash` unless you have another available model.

## Supported uploads and lesson limits

PDF, DOCX, PPTX, XLSX, CSV, TXT, and MD files up to 10 MB. Scanned PDFs require OCR. Extracted lessons may contain up to 1,000,000 characters.

Long lessons are split into sections of about 3,500 characters and translated four at a time. Formulas, quantities, units and teacher-listed terms are protected in each section and restored after translation. A fidelity check returns warnings for missing or added numbers and missing formulas; warnings do not block drafts.

## Teacher workflow API

Generation saves a lesson and returns its `id`. Students only see a published snapshot.

- `GET /api/lessons/{id}`: public view of the published version. Send `x-teacher-token` to get the full working record.
- `POST /api/lessons/{id}/corrections`: teacher-only. Send `x-teacher-token` and JSON `{ "language": "Marathi", "text": "...", "teacher": "...", "note": "...", "approve": true }`. Saves the correction, runs a fidelity check and optionally approves that language.
- `POST /api/lessons/{id}/publish`: teacher-only. Send `x-teacher-token`. All three languages must be approved; publication snapshots the drafts and glossary.

Storage is a JSON file (`LESSON_DB_PATH`, default `./data/lessons.json`). This is suitable for a persistent single server, but not serverless hosts with ephemeral or shared filesystem storage; use a database for those deployments. Set a strong private teacher token and do not expose it in browser code or public client bundles.

## Using the app

- **Drafts:** generate, then switch between English, Marathi and Hindi. Select text in a draft to listen to just that passage (uses the browser's built-in speech; install a Marathi or Hindi voice on the device for those languages).
- **Glossary:** key terms with Marathi and Hindi equivalents. Click a term to find it in the current draft.
- **Teacher:** enter the teacher token and your name. Edit a draft, save it, approve each language, then publish. Students only see the published version.
- **Student view:** open a lesson by its ID to see the published version in all three languages.

Quality note: translations from the real Gemini model require review by a teacher, especially for technical terminology and Marathi/Hindi accuracy.
