# Lesson Studio

## Setup

```bash
npm install
cp .env.example .env.local
npm run dev
```

Add `GEMINI_API_KEY` to `.env.local`. On a hosted deployment, add it to the server environment and redeploy. Set `GEMINI_MODEL=gemini-2.5-flash` unless you have another available model.

## Supported uploads

PDF, DOCX, PPTX, XLSX, CSV, TXT, and MD files up to 10 MB. Scanned PDFs require OCR.
