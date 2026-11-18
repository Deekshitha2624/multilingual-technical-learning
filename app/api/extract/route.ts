import { NextResponse } from 'next/server';
import pdfParse from 'pdf-parse';
import mammoth from 'mammoth';
import * as XLSX from 'xlsx';
import JSZip from 'jszip';

export const runtime = 'nodejs';
export const maxDuration = 30;

const MAX_FILE_SIZE = 10 * 1024 * 1024;
const MAX_TEXT_LENGTH = 1_000_000;
const allowedExtensions = new Set(['pdf', 'docx', 'pptx', 'xlsx', 'csv', 'txt', 'md']);

function extensionOf(name: string) {
  return name.split('.').pop()?.toLowerCase() || '';
}

function decodeXml(value: string) {
  return value.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'");
}

async function extractPptx(buffer: Buffer) {
  const zip = await JSZip.loadAsync(buffer);
  const slideFiles = Object.keys(zip.files)
    .filter((name) => /^ppt\/slides\/slide\d+\.xml$/.test(name))
    .sort((a, b) => Number(a.match(/slide(\d+)/)?.[1]) - Number(b.match(/slide(\d+)/)?.[1]));
  const slides: string[] = [];
  for (const fileName of slideFiles) {
    const xml = await zip.files[fileName].async('text');
    const paragraphs = Array.from(xml.matchAll(/<a:p[\s>][\s\S]*?<\/a:p>/g))
      .map((paragraph) => Array.from(paragraph[0].matchAll(/<a:t>([\s\S]*?)<\/a:t>/g)).map((match) => decodeXml(match[1])).join(''))
      .filter((line) => line.trim());
    if (paragraphs.length) slides.push(paragraphs.join('\n'));
  }
  return slides.map((slide, index) => `Slide ${index + 1}\n${slide}`).join('\n\n');
}

async function extractXlsx(buffer: Buffer) {
  const workbook = XLSX.read(buffer, { type: 'buffer', cellFormula: true });
  return workbook.SheetNames.map((name) => {
    const sheet = workbook.Sheets[name];
    const text = XLSX.utils.sheet_to_csv(sheet, { blankrows: false });
    return text.trim() ? `Sheet: ${name}\n${text}` : '';
  }).filter(Boolean).join('\n\n');
}

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const file = formData.get('file');
    if (!(file instanceof File)) return NextResponse.json({ error: 'Choose a file to upload.' }, { status: 400 });
    if (file.size === 0) return NextResponse.json({ error: 'The selected file is empty.' }, { status: 400 });
    if (file.size > MAX_FILE_SIZE) return NextResponse.json({ error: 'Files must be 10 MB or smaller.' }, { status: 413 });

    const extension = extensionOf(file.name);
    if (!allowedExtensions.has(extension)) return NextResponse.json({ error: 'Unsupported file type. Use PDF, DOCX, PPTX, XLSX, CSV, TXT, or MD.' }, { status: 415 });

    const buffer = Buffer.from(await file.arrayBuffer());
    let text: string;
    switch (extension) {
      case 'pdf': text = (await pdfParse(buffer)).text; break;
      case 'docx': text = (await mammoth.extractRawText({ buffer })).value; break;
      case 'pptx': text = await extractPptx(buffer); break;
      case 'xlsx': text = await extractXlsx(buffer); break;
      default: text = buffer.toString('utf8');
    }

    text = text.replace(/\u0000/g, '').trim();
    if (!text) return NextResponse.json({ error: extension === 'pdf' ? 'No selectable text was found in this PDF. Scanned PDFs need OCR; paste the lesson text for now.' : 'No readable text was found in this file.' }, { status: 400 });
    if (text.length > MAX_TEXT_LENGTH) return NextResponse.json({ error: `This file contains more than ${MAX_TEXT_LENGTH.toLocaleString()} characters. Split it into smaller files and upload one at a time.` }, { status: 413 });
    return NextResponse.json({ text, fileName: file.name });
  } catch {
    return NextResponse.json({ error: 'Could not read this file. Check that it is a valid, unencrypted supported document.' }, { status: 400 });
  }
}
