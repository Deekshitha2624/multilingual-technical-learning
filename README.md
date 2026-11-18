# Lesson Studio

An MVP for turning teacher-approved technical lessons into editable English, Marathi, and Hindi drafts. It includes a review-first interface, optional protected terminology, automatic formula/quantity token preservation, and text export.

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

Open http://localhost:3000. You can paste a lesson or upload a `.txt`/`.md` file. Check the teacher approval box to enable generation. The Gemini API key is used only on the server and must never be added to client-side code or committed.

## Features in this MVP

- Generate draft versions in English, Marathi, and Hindi from one source lesson using the Gemini API.
- Require the user to confirm teacher approval before generation.
- Preserve LaTeX/math delimiters, common quantities/units, and explicitly protected English terms using tokens, then validate token restoration.
- Edit drafts in the browser, mark a language as approved for the current session, and export all versions as a text file.
- No database or permanent lesson storage; data stays in browser state and is sent to Gemini only when generation is requested.

## Important limitations

AI output is a draft and still requires teacher review, especially for technical accuracy and Marathi/Hindi terminology. Formula/quantity detection uses heuristics and should be tested against your curriculum before classroom use. Approval is session-only and is not an authenticated or auditable workflow. File upload currently supports text and Markdown, not PDF or Word documents.

## Configuration

- `GEMINI_API_KEY`: required for generation. Create/manage a key through Google AI Studio.
- `GEMINI_MODEL`: optional; defaults to `gemini-2.5-flash`. Change it to a model available to your Gemini API key if needed.
