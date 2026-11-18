'use client';

import { ChangeEvent, useEffect, useRef, useState } from 'react';
import type { Drafts, Language } from '../lib/protect';
import type { GlossaryEntry } from '../lib/glossary';

type Approved = Record<Language, boolean>;
type PublishedData = { version: number; publishedAt: string; drafts: Drafts; glossary: GlossaryEntry[] } | null;
const languages: Language[] = ['English', 'Marathi', 'Hindi'];
const supportedFiles = '.pdf,.docx,.pptx,.xlsx,.csv,.txt,.md';
const speechLang: Record<Language, string> = { English: 'en-IN', Marathi: 'mr-IN', Hindi: 'hi-IN' };
const emptyApproved: Approved = { English: false, Marathi: false, Hindi: false };

async function readJson(response: Response) {
  return response.json().catch(() => ({}));
}

export default function Home() {
  const [lesson, setLesson] = useState('');
  const [terms, setTerms] = useState('');
  const [approved, setApproved] = useState(false);
  const [drafts, setDrafts] = useState<Drafts | null>(null);
  const [selected, setSelected] = useState<Language>('English');
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [lessonId, setLessonId] = useState('');
  const [glossary, setGlossary] = useState<GlossaryEntry[]>([]);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [lessonApproved, setLessonApproved] = useState<Approved>(emptyApproved);
  const [dirty, setDirty] = useState<Partial<Record<Language, boolean>>>({});
  const [saving, setSaving] = useState(false);
  const [publishedVersion, setPublishedVersion] = useState(0);
  const [teacherToken, setTeacherToken] = useState('');
  const [teacherName, setTeacherName] = useState('');
  const [speaking, setSpeaking] = useState(false);
  const [studentId, setStudentId] = useState('');
  const [student, setStudent] = useState<PublishedData | undefined>(undefined);
  const [studentLanguage, setStudentLanguage] = useState<Language>('English');
  const [studentLoading, setStudentLoading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const draftRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => () => { if ('speechSynthesis' in window) window.speechSynthesis.cancel(); }, []);

  async function loadFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setUploading(true); setError(''); setNotice('');
    try {
      const formData = new FormData();
      formData.append('file', file);
      const response = await fetch('/api/extract', { method: 'POST', body: formData });
      const data = await readJson(response);
      if (!response.ok) throw new Error(data.error || 'Could not read this file.');
      setLesson(data.text);
      setApproved(false);
      setNotice(`${data.fileName} loaded. Review the extracted text and confirm approval before generating.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong while reading the file.');
    } finally {
      setUploading(false);
      event.target.value = '';
    }
  }

  async function generate() {
    setBusy(true); setError(''); setNotice(''); setDrafts(null);
    try {
      const response = await fetch('/api/generate', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lesson, terms: terms.split(',').map((term) => term.trim()).filter(Boolean) }),
      });
      const data = await readJson(response);
      if (!response.ok) throw new Error(data?.error || `Generation failed (HTTP ${response.status}). Check the server configuration and try again.`);
      if (!data?.drafts?.English || !data?.drafts?.Marathi || !data?.drafts?.Hindi) throw new Error('The server response did not contain all three language drafts. Please try again.');
      setDrafts(data.drafts);
      setLessonId(data.id || '');
      setStudentId(data.id || '');
      setGlossary(Array.isArray(data.glossary) ? data.glossary : []);
      setWarnings(Array.isArray(data.warnings) ? data.warnings : []);
      setLessonApproved(emptyApproved);
      setDirty({});
      setPublishedVersion(0);
      setStudent(undefined);
      setSelected('English');
      setNotice(data.warnings?.length ? 'Drafts created with checks to review (see the list under the drafts).' : 'Drafts created. Review and edit each language, then approve it before publishing.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not contact the generation service. Check your connection and try again.');
    } finally { setBusy(false); }
  }

  function updateDraft(value: string) {
    if (drafts) setDrafts({ ...drafts, [selected]: value });
    setDirty({ ...dirty, [selected]: true });
    setLessonApproved({ ...lessonApproved, [selected]: false });
    setNotice('');
  }

  function teacherHeaders() {
    return { 'Content-Type': 'application/json', 'x-teacher-token': teacherToken };
  }

  async function saveLanguage(approve: boolean) {
    if (!drafts) return;
    if (!lessonId) { setError('Generate the lesson before saving corrections.'); return; }
    if (!teacherToken) { setError('Enter the teacher token to approve or save corrections.'); return; }
    setSaving(true); setError('');
    try {
      const response = await fetch(`/api/lessons/${lessonId}/corrections`, {
        method: 'POST', headers: teacherHeaders(),
        body: JSON.stringify({ language: selected, text: drafts[selected], teacher: teacherName || 'Teacher', approve }),
      });
      const data = await readJson(response);
      if (!response.ok) throw new Error(data.error || 'Could not save the correction.');
      setLessonApproved({ English: !!data.lesson.approvals.English, Marathi: !!data.lesson.approvals.Marathi, Hindi: !!data.lesson.approvals.Hindi });
      setWarnings(data.lesson.warnings || []);
      setDirty({ ...dirty, [selected]: false });
      setNotice(approve ? `${selected} approved${data.check?.ok === false ? ' (with check warnings below)' : ''}.` : `${selected} correction saved to the working copy. It is not visible to students until you publish.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save the correction.');
    } finally { setSaving(false); }
  }

  async function publish() {
    if (!lessonId) { setError('Generate the lesson before publishing.'); return; }
    if (!teacherToken) { setError('Enter the teacher token to publish.'); return; }
    setSaving(true); setError('');
    try {
      const response = await fetch(`/api/lessons/${lessonId}/publish`, { method: 'POST', headers: teacherHeaders() });
      const data = await readJson(response);
      if (!response.ok) throw new Error(data.error || 'Could not publish the lesson.');
      setPublishedVersion(data.published.version);
      setNotice(`Published version ${data.published.version}. Students now see the approved text in the student view.`);
      setStudentId(lessonId);
      setStudent(data.published);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not publish the lesson.');
    } finally { setSaving(false); }
  }

  async function openStudentView(id: string) {
    const cleaned = id.trim();
    if (!cleaned) { setError('Enter a lesson ID.'); return; }
    setStudentLoading(true); setError('');
    try {
      const response = await fetch(`/api/lessons/${encodeURIComponent(cleaned)}`);
      const data = await readJson(response);
      if (!response.ok) throw new Error(data.error || 'Could not load the lesson.');
      setStudent(data.published ?? null);
      setStudentLanguage('English');
      if (!data.published) setNotice('This lesson has not been published yet.');
    } catch (e) {
      setStudent(null);
      setError(e instanceof Error ? e.message : 'Could not load the lesson.');
    } finally { setStudentLoading(false); }
  }

  function listen(text: string, language: Language, passage: string) {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) { setError('Audio playback is not supported in this browser.'); return; }
    const synth = window.speechSynthesis;
    synth.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    const wanted = speechLang[language];
    const voices = synth.getVoices();
    const voice = voices.find((v) => v.lang.replace('_', '-').toLowerCase() === wanted.toLowerCase()) || voices.find((v) => v.lang.toLowerCase().startsWith(wanted.split('-')[0].toLowerCase()));
    utterance.lang = wanted;
    if (voice) utterance.voice = voice;
    else setNotice(`No ${language} voice is installed on this device. Install one in your system's speech settings to hear ${language} audio.`);
    utterance.onend = () => setSpeaking(false);
    utterance.onerror = () => { setSpeaking(false); setError(`Audio playback failed for ${passage}.`); };
    setSpeaking(true);
    synth.speak(utterance);
  }

  function selectedPassage(full: string) {
    const element = draftRef.current;
    if (element && element.selectionEnd > element.selectionStart) return { text: full.slice(element.selectionStart, element.selectionEnd), label: 'the selected passage' };
    return { text: full, label: 'the full draft' };
  }

  function listenToDraft() {
    if (!drafts) return;
    const passage = selectedPassage(drafts[selected]);
    listen(passage.text, selected, passage.label);
  }

  function listenToStudent() {
    if (student) listen(student.drafts[studentLanguage], studentLanguage, 'the published lesson');
  }

  function jumpToTerm(entry: GlossaryEntry) {
    if (!drafts) return;
    const word = selected === 'English' ? entry.term : entry[selected];
    const index = drafts[selected].toLowerCase().indexOf(word.toLowerCase());
    if (index < 0) { setNotice(`"${word}" does not appear in the ${selected} draft.`); return; }
    const element = draftRef.current;
    if (element) { element.focus(); element.setSelectionRange(index, index + word.length); }
  }

  function download() {
    if (!drafts) return;
    const text = languages.map((language) => `===== ${language} =====\n${drafts[language]}`).join('\n\n');
    const url = URL.createObjectURL(new Blob([text], { type: 'text/plain;charset=utf-8' }));
    const link = document.createElement('a'); link.href = url; link.download = 'lesson-materials.txt'; link.click();
    URL.revokeObjectURL(url);
  }

  const allApproved = languages.every((language) => lessonApproved[language]);
  const studentDrafts = student?.drafts;

  return (
    <main className="shell">
      <header className="topbar"><a className="brand" href="#"><span className="brand-mark">L</span><span>lesson<span className="brand-light">studio</span></span></a><span className="top-tag">TEACHER WORKSPACE</span></header>
      <section className="hero"><div className="eyebrow"><span className="spark">✦</span> MULTILINGUAL LEARNING, MADE CLEAR</div><h1>One lesson.<br /><span>Three ways to learn.</span></h1><p className="intro">Create teacher-reviewed technical learning materials in English, Marathi and Hindi.</p><div className="language-pills"><span>EN&nbsp; English</span><i>→</i><span>मर&nbsp; मराठी</span><i>→</i><span>हि&nbsp; हिन्दी</span></div></section>
      <section className="workspace">
        <div className="panel source-panel">
          <div className="panel-heading"><div><div className="step">STEP 01</div><h2>Your approved lesson</h2></div><span className="status"><span className="dot" /> SOURCE</span></div>
          <p className="helper">Paste a lesson or upload a supported document. Only use content approved by your teacher.</p>
          <textarea className="source-input" value={lesson} onChange={(event) => { setLesson(event.target.value); setApproved(false); }} placeholder={'Paste your technical lesson here…\n\nExample: The area of a circle is A = πr². If r = 7 cm, then A = 49π cm².'} aria-label="Approved lesson content" />
          <div className="source-footer"><button className="text-button" onClick={() => fileRef.current?.click()} disabled={uploading}><span>↑</span> {uploading ? 'Reading file…' : 'Upload a file'}</button><input ref={fileRef} hidden type="file" accept={supportedFiles} onChange={loadFile} /><span>{lesson.length.toLocaleString()} characters · Max file size 10 MB</span></div>
          <p className="file-help">PDF · DOCX · PPTX · XLSX · CSV · TXT · MD</p>
          <label className="approval-check"><input type="checkbox" checked={approved} onChange={(event) => setApproved(event.target.checked)} /><span className="fake-check" /><span>I confirm this lesson has been reviewed and approved by a teacher.</span></label>
          <div className="terms-block"><label htmlFor="terms">KEEP THESE ENGLISH TERMS AS WRITTEN <span>OPTIONAL</span></label><input id="terms" value={terms} onChange={(event) => setTerms(event.target.value)} placeholder="e.g. photosynthesis, voltage, Newton’s law" /><small>Separate terms with commas. Formulas, numbers and units are protected automatically.</small></div>
          <button className="generate-button" disabled={!lesson.trim() || !approved || busy || uploading} onClick={generate}>{busy ? <><span className="spinner" /> Creating drafts…</> : <>Generate learning materials <span>↗</span></>}</button>
          <p className="privacy-note"><span>◇</span> Your lesson is sent to the configured AI provider to create drafts. Long lessons take longer.</p>
        </div>
        <div className="panel output-panel">
          <div className="panel-heading"><div><div className="step">STEP 02</div><h2>Review the drafts</h2></div><span className={`status ${drafts ? 'status-ready' : ''}`}><span className="dot" /> {drafts ? 'DRAFT READY' : 'WAITING'}</span></div>
          {drafts ? <>
            <div className="tabs" role="tablist">{languages.map((language) => <button key={language} className={selected === language ? 'tab active' : 'tab'} onClick={() => setSelected(language)} role="tab" aria-selected={selected === language}>{language}<span className="tab-check">{lessonApproved[language] ? '✓ ' : ''}{language === 'English' ? 'EN' : language === 'Marathi' ? 'मर' : 'हि'}</span></button>)}</div>
            <div className="review-hint"><span>✦</span> AI-generated draft · Please review for accuracy{dirty[selected] ? ' · unsaved changes' : ''}</div>
            <textarea ref={draftRef} className="draft-input" value={drafts[selected]} onChange={(event) => updateDraft(event.target.value)} aria-label={`${selected} draft`} />
            <div className="audio-row"><button className="audio-button" onClick={listenToDraft} disabled={speaking}>▶ &nbsp;Listen to {selected}</button><button className="audio-button" onClick={() => { window.speechSynthesis?.cancel(); setSpeaking(false); }} disabled={!speaking}>■ &nbsp;Stop</button><span className="audio-hint">Select text in the draft to listen to just that passage.</span></div>
            <div className="draft-actions"><button className="approve-button" onClick={() => saveLanguage(true)} disabled={saving || !lessonId}>✓ &nbsp; Approve {selected}</button><button className="save-button" onClick={() => saveLanguage(false)} disabled={saving || !lessonId || !dirty[selected]}>Save correction</button><button className="download-button" onClick={download}>↓ &nbsp; Export all</button></div>
            <div className="teacher-bar"><div className="teacher-fields"><input type="password" value={teacherToken} onChange={(event) => setTeacherToken(event.target.value)} placeholder="Teacher token" aria-label="Teacher token" /><input value={teacherName} onChange={(event) => setTeacherName(event.target.value)} placeholder="Your name" aria-label="Teacher name" /></div><div className="approval-status">{languages.map((language) => <span key={language} className={lessonApproved[language] ? 'chip chip-ok' : 'chip'}>{language}{lessonApproved[language] ? ' ✓' : ''}</span>)}</div><button className="publish-button" onClick={publish} disabled={saving || !allApproved || !lessonId}>{publishedVersion ? `Publish update (now v${publishedVersion})` : 'Publish to students'}</button>{!allApproved && <p className="teacher-note">Approve all three languages before publishing.</p>}</div>
            {warnings.length > 0 && <div className="warn-list"><strong>Check before publishing</strong><ul>{warnings.map((warning, index) => <li key={`${warning}-${index}`}>{warning}</li>)}</ul></div>}
            <div className="glossary"><div className="glossary-head"><strong>Glossary</strong><span>{glossary.length} term{glossary.length === 1 ? '' : 's'} · click a term to find it in the draft</span></div>{glossary.length ? <table><thead><tr><th>English</th><th>मराठी</th><th>हिन्दी</th></tr></thead><tbody>{glossary.map((entry) => <tr key={entry.term} onClick={() => jumpToTerm(entry)}><td>{entry.term}</td><td>{entry.Marathi}</td><td>{entry.Hindi}</td></tr>)}</tbody></table> : <p className="glossary-empty">No glossary was created for this lesson.</p>}</div>
          </> : <div className="empty-state"><div className="empty-illustration"><span className="paper paper-back" /><span className="paper paper-front"><i /><i /><i /></span><span className="globe">文</span></div><h3>Your drafts will appear here</h3><p>Confirm the source lesson is teacher-approved, then generate editable versions in all three languages.</p><div className="preserve-list"><span>✓ Formulas</span><span>✓ Quantities</span><span>✓ Key terms</span></div></div>}
        </div>
      </section>
      <section className="student-section"><div className="panel"><div className="panel-heading"><div><div className="step">STUDENT VIEW</div><h2>Published lesson</h2></div>{student && <span className="status status-ready"><span className="dot" /> VERSION {student.version}</span>}</div><p className="helper">Students see only the version the teacher has published. Corrections appear here after publishing.</p><div className="student-lookup"><input value={studentId} onChange={(event) => setStudentId(event.target.value)} placeholder="Lesson ID" aria-label="Lesson ID" /><button className="approve-button" onClick={() => openStudentView(studentId)} disabled={studentLoading}>{studentLoading ? 'Opening…' : 'Open lesson'}</button></div>{studentDrafts ? <><div className="tabs" role="tablist">{languages.map((language) => <button key={language} className={studentLanguage === language ? 'tab active' : 'tab'} onClick={() => setStudentLanguage(language)} role="tab" aria-selected={studentLanguage === language}>{language}</button>)}</div><div className="read-view">{studentDrafts[studentLanguage]}</div><div className="audio-row"><button className="audio-button" onClick={listenToStudent} disabled={speaking}>▶ &nbsp;Listen to {studentLanguage}</button><span className="audio-hint">Published {new Date(student.publishedAt).toLocaleString()}</span></div>{student.glossary?.length > 0 && <div className="glossary"><div className="glossary-head"><strong>Glossary</strong><span>{student.glossary.length} terms</span></div><table><thead><tr><th>English</th><th>मराठी</th><th>हिन्दी</th></tr></thead><tbody>{student.glossary.map((entry) => <tr key={entry.term}><td>{entry.term}</td><td>{entry.Marathi}</td><td>{entry.Hindi}</td></tr>)}</tbody></table></div>}</> : <p className="glossary-empty">{student === null ? 'This lesson has not been published yet.' : 'Enter a lesson ID to open a published lesson.'}</p>}</div></section>
      <footer className="footer"><span>LESSON STUDIO <b>·</b> BUILT FOR CLEARER LEARNING</span><span>Teacher review is required before sharing.</span></footer>
      {(error || notice) && <div className={error ? 'toast toast-error' : 'toast'} role="status">{error || notice}<button onClick={() => { setError(''); setNotice(''); }} aria-label="Dismiss">×</button></div>}
    </main>
  );
}
