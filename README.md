# Lesson Studio

An MVP for turning teacher-approved technical lessons into editable English, Marathi, and Hindi drafts. It includes a review-first interface, optional protected terminology, automatic formula/quantity token preservation, file text extraction, and text export.

## Run locally

Requirements: Node.js 18.17+.

```bash
npm install
cp .env.example .env.local
```

Add your Gemini API key to `.env.local`, then start the app:

```bash
npm run dev
```

Open http://localhost:3000. You can paste a lesson or upload one supported document: PDF, DOCX, PPTX, XLSX, CSV, TXT, or MD. The app extracts text in the server and places it in the editor so the teacher can review it and confirm approval before generation. The Gemini API key is used only on the server and must never be added to client-side code or committed.

## Troubleshooting translation

- If the page says the Gemini API key is missing, put `GEMINI_API_KEY=...` in `.env.local` for local development, then stop and restart `npm run dev`. On a hosted deployment, add `GEMINI_API_KEY` in the host's server-side environment-variable settings and redeploy.
- `GEMINI_MODEL` defaults to `gemini-2.5-flash`; make sure the model is available to your API key. You can set `GEMINI_MODEL` in the same environment.
- The page now shows the error returned by the backend instead of hiding it. For provider/network errors, check the terminal running Next.js or your host's function logs. Never share or commit your API key.

## Features in this MVP

- Generate draft versions in English, Marathi, and Hindi from one source lesson using the Gemini API.
- Upload PDF, DOCX, PPTX, XLSX, CSV, TXT, or MD files (up to 10 MB); extracted text is editable before use.
- Require the user to confirm teacher approval before generation.
- Preserve LaTeX/math delimiters, common quantities/units, and explicitly protected English terms using tokens, then validate token restoration.
- Edit drafts in the browser, mark a language as approved for the current session, and export all versions as a text file.
- No database or permanent lesson storage; file text is extracted on the server and sent to Gemini only when generation is requested.

## Important limitations

AI output is a draft and still requires teacher review, especially for technical accuracy and Marathi/Hindi terminology. Formula/quantity detection uses heuristics and should be tested against your curriculum before classroom use. Approval is session-only and is not an authenticated or auditable workflow. Scanned/image-only PDFs are not OCR'd and need selectable text; file uploads currently support one file at a time.

## Configuration

- `GEMINI_API_KEY`: required for generation. Create/manage a key through Google AI Studio.
- `GEMINI_MODEL`: optional; defaults to `gemini-2.5-flash`. Change it to a model available to your Gemini API key if needed.
