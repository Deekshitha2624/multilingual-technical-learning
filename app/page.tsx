'use client';

import { ChangeEvent, useRef, useState } from 'react';

type Language = 'English' | 'Marathi' | 'Hindi';
type Drafts = Record<Language, string>;
const languages: Language[] = ['English', 'Marathi', 'Hindi'];

export default function Home() {
  const [lesson, setLesson] = useState('');
  const [terms, setTerms] = useState('');
  const [approved, setApproved] = useState(false);
  const [drafts, setDrafts] = useState<Drafts | null>(null);
  const [selected, setSelected] = useState<Language>('English');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  async function loadFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!/\.(txt|md)$/i.test(file.name)) {
      setError('For this MVP, upload a .txt or .md lesson file.');
      event.target.value = '';
      return;
    }
    setLesson(await file.text());
    setError('');
    setNotice(`${file.name} loaded. Review it and confirm approval before generating.`);
    setApproved(false);
  }

  async function generate() {
    setBusy(true); setError(''); setNotice(''); setDrafts(null);
    try {
      const response = await fetch('/api/generate', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lesson, terms: terms.split(',').map((term) => term.trim()).filter(Boolean) }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Could not generate lesson drafts.');
      setDrafts(data.drafts);
      setSelected('English');
      setNotice('Drafts created. Review and edit each language before marking them approved.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong.');
    } finally { setBusy(false); }
  }

  function updateDraft(value: string) {
    if (drafts) setDrafts({ ...drafts, [selected]: value });
    setNotice('');
  }

  function download() {
    if (!drafts) return;
    const text = languages.map((language) => `===== ${language} =====\n${drafts[language]}`).join('\n\n');
    const url = URL.createObjectURL(new Blob([text], { type: 'text/plain;charset=utf-8' }));
    const link = document.createElement('a'); link.href = url; link.download = 'lesson-materials.txt'; link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <main className="shell">
      <header className="topbar"><a className="brand" href="#"><span className="brand-mark">L</span><span>lesson<span className="brand-light">studio</span></span></a><span className="top-tag">TEACHER WORKSPACE</span></header>
      <section className="hero"><div className="eyebrow"><span className="spark">✦</span> MULTILINGUAL LEARNING, MADE CLEAR</div><h1>One lesson.<br /><span>Three ways to learn.</span></h1><p className="intro">Create clear technical learning materials in English, Marathi, and Hindi—while keeping the science, numbers, and terminology intact.</p>
        <div className="language-pills"><span>EN&nbsp; English</span><i>→</i><span>मर&nbsp; मराठी</span><i>→</i><span>हि&nbsp; हिन्दी</span></div>
      </section>
      <section className="workspace">
        <div className="panel source-panel">
          <div className="panel-heading"><div><div className="step">STEP 01</div><h2>Your approved lesson</h2></div><span className="status"><span className="dot" /> SOURCE</span></div>
          <p className="helper">Paste a lesson or upload a text/Markdown file. Only use content approved by your teacher.</p>
          <textarea className="source-input" value={lesson} onChange={(e) => { setLesson(e.target.value); setApproved(false); }} placeholder={'Paste your technical lesson here…\n\nExample: The area of a circle is A = πr². If r = 7 cm, then A = 49π cm².'} aria-label="Approved lesson content" />
          <div className="source-footer"><button className="text-button" onClick={() => fileRef.current?.click()}><span>↑</span> Upload .txt / .md</button><input ref={fileRef} hidden type="file" accept=".txt,.md,text/plain,text/markdown" onChange={loadFile} /><span>{lesson.length} characters</span></div>
          <label className="approval-check"><input type="checkbox" checked={approved} onChange={(e) => setApproved(e.target.checked)} /><span className="fake-check" /><span>I confirm this lesson has been reviewed and approved by a teacher.</span></label>
          <div className="terms-block"><label htmlFor="terms">KEEP THESE ENGLISH TERMS AS WRITTEN <span>OPTIONAL</span></label><input id="terms" value={terms} onChange={(e) => setTerms(e.target.value)} placeholder="e.g. photosynthesis, voltage, Newton’s law" /><small>Separate terms with commas. Formulas and quantities are protected automatically.</small></div>
          <button className="generate-button" disabled={!lesson.trim() || !approved || busy} onClick={generate}>{busy ? <><span className="spinner" /> Creating drafts…</> : <>Generate learning materials <span>↗</span></>}</button>
          <p className="privacy-note"><span>◇</span> Your lesson is sent to the configured AI provider to create drafts.</p>
        </div>
        <div className="panel output-panel">
          <div className="panel-heading"><div><div className="step">STEP 02</div><h2>Review the drafts</h2></div><span className={`status ${drafts ? 'status-ready' : ''}`}><span className="dot" /> {drafts ? 'DRAFT READY' : 'WAITING'}</span></div>
          {drafts ? <>
            <div className="tabs" role="tablist">{languages.map((language) => <button key={language} className={selected === language ? 'tab active' : 'tab'} onClick={() => setSelected(language)} role="tab" aria-selected={selected === language}>{language}<span className="tab-check">{language === 'English' ? 'EN' : language === 'Marathi' ? 'मर' : 'हि'}</span></button>)}</div>
            <div className="review-hint"><span>✦</span> AI-generated draft · Please review for accuracy</div>
            <textarea className="draft-input" value={drafts[selected]} onChange={(e) => updateDraft(e.target.value)} aria-label={`${selected} draft`} />
            <div className="draft-actions"><button className="approve-button" onClick={() => setNotice(`${selected} version marked as teacher-approved for this session.`)}>✓ &nbsp; Approve {selected}</button><button className="download-button" onClick={download}>↓ &nbsp; Export all</button></div>
          </> : <div className="empty-state"><div className="empty-illustration"><span className="paper paper-back" /><span className="paper paper-front"><i /><i /><i /></span><span className="globe">文</span></div><h3>Your drafts will appear here</h3><p>Confirm the source lesson is teacher-approved, then generate editable versions in all three languages.</p><div className="preserve-list"><span>✓ Formulas</span><span>✓ Quantities</span><span>✓ Key terms</span></div></div>}
        </div>
      </section>
      <footer className="footer"><span>LESSON STUDIO <b>·</b> BUILT FOR CLEARER LEARNING</span><span>Teacher review is required before sharing.</span></footer>
      {(error || notice) && <div className={error ? 'toast toast-error' : 'toast'} role="status">{error || notice}<button onClick={() => { setError(''); setNotice(''); }} aria-label="Dismiss">×</button></div>}
    </main>
  );
}
