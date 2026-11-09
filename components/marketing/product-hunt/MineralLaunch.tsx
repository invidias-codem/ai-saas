'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

const steps = ['Describe', 'Plan', 'Inspect'] as const;
type Step = (typeof steps)[number];
const builder = '/en/code/builder';

function LatticeMark() {
  return <span className="lm-mark" aria-hidden="true">
    <svg viewBox="0 0 32 32" focusable="false"><path d="M16 3.5 29 27.5H3L16 3.5Z" fill="currentColor" /></svg>
  </span>;
}

function ExamplePreview({ step, setStep }: {
  step: Step; setStep: (next: Step) => void;
}) {
  return <div className="lm-preview">
    <div className="lm-preview-bar">
      <span className="lm-preview-title"><span className="lm-indicator" />Lattice / Code Builder</span>
      <span className="lm-preview-note">ILLUSTRATIVE WALKTHROUGH</span>
    </div>
    <div className="lm-preview-grid">
      <div className="lm-preview-tabs" role="group" aria-label="Explore example build stages">
        <p>BUILD STAGES</p>
        {steps.map((name, i) => <button key={name} type="button"
          aria-pressed={name === step} onClick={() => setStep(name)}
          className={name === step ? 'lm-tab lm-tab-active' : 'lm-tab'}>
          <small>0{i+1}</small>{name}
        </button>)}
      </div>
      <div className="lm-preview-body" aria-live="polite" aria-atomic="true">
        {step === 'Describe' && <>
          <span className="lm-preview-eyebrow">THE BRIEF</span>
          <h3>Give the idea a direction.</h3>
          <p>Start with the job to be done, not the technical implementation.</p>
          <div className="lm-example-box">
            <small>EXAMPLE PROMPT</small>
            <p>Build a client intake dashboard with a mobile-friendly form and status tracking.</p>
          </div>
          <button type="button" className="lm-example-next" onClick={() => setStep('Plan')}>See the plan <span aria-hidden="true">→</span></button>
        </>}
        {step === 'Plan' && <>
          <span className="lm-preview-eyebrow">PROJECT STRUCTURE</span>
          <h3>From words to a plan.</h3>
          <p>Review the generated pages and components before you build.</p>
          <div className="lm-plan-list">
            {['Intake form and validation','Client overview','Status dashboard','Mobile layout'].map((item,i) =>
              <div key={item}><span>0{i+1}</span>{item}<b aria-hidden="true">✓</b></div>)}
          </div>
          <button type="button" className="lm-example-next" onClick={() => setStep('Inspect')}>See sample UI <span aria-hidden="true">→</span></button>
        </>}
        {step === 'Inspect' && <>
          <span className="lm-preview-eyebrow">REVIEWABLE RESULT</span>
          <h3>See what you're creating.</h3>
          <p>Inspect the output and keep shaping the next iteration.</p>
          <div className="lm-mini-app">
            <div>Intake desk <span>EXAMPLE UI</span></div>
            <section><article><small>NEW REQUESTS</small><strong>03</strong></article>
              <article><small>LATEST REQUEST</small><strong>Website consultation</strong></article></section>
          </div>
          <Link className="lm-example-next" href={builder}>Open Code Builder <span aria-hidden="true">↗</span></Link>
        </>}
      </div>
    </div>
  </div>;
}

export function MineralLaunch() {
  const [theme, setTheme] = useState<'light'|'dark'>('light');
  const [step, setStep] = useState<Step>('Describe');
  useEffect(() => {
    try {
      const saved = localStorage.getItem('lattice-launch-theme');
      if (saved === 'light' || saved === 'dark') setTheme(saved);
      else if (window.matchMedia('(prefers-color-scheme: dark)').matches) setTheme('dark');
    } catch { /* localStorage is optional */ }
  }, []);
  const toggleTheme = () => {
    const next = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    try { localStorage.setItem('lattice-launch-theme', next); } catch { /* optional */ }
  };
  return <div className="lm-page" data-theme={theme}>
    <a href="#main" className="lm-skip">Skip to content</a>
    <header className="lm-nav-wrap"><nav className="lm-container lm-nav" aria-label="Launch navigation">
      <Link href="/" className="lm-logo"><LatticeMark /><span>lattice<span className="lm-dot">.</span>os</span></Link>
      <div className="lm-links"><a href="#workflow">Workflow</a><a href="#why">Why Lattice</a><a href="#availability">Availability</a></div>
      <div className="lm-actions">
        <button className="lm-theme" onClick={toggleTheme} type="button"
          aria-pressed={theme==='dark'}
          aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}>
          <span aria-hidden="true">{theme === 'dark' ? '☼' : '☾'}</span><span className="lm-theme-label">{theme === 'dark' ? 'Light' : 'Dark'}</span>
        </button>
        <Link className="lm-nav-cta" href={builder}><span className="lm-full-label">Open Code Builder</span><span className="lm-short-label">Builder</span><span aria-hidden="true">↗</span></Link>
      </div>
    </nav></header>
    <main id="main">
      <section className="lm-container lm-hero" aria-labelledby="hero-title">
        <div className="lm-hero-copy">
          <span className="lm-eyebrow">AI WORKSPACE FOR BUILDERS / PRODUCT PREVIEW</span>
          <h1 id="hero-title">Make something <em>real</em> from a single idea.</h1>
          <p>Tell Lattice what you want to make. Plan, generate, and inspect a software project with an AI workspace built for longer work.</p>
          <div className="lm-hero-actions">
            <Link className="lm-button lm-button-primary" href={builder}>Try Code Builder <span aria-hidden="true">↗</span></Link>
            <a className="lm-button lm-button-secondary" href="#workflow">Explore the workflow <span aria-hidden="true">↓</span></a>
          </div>
          <p className="lm-availability-mini">✓ Code Builder &nbsp; ✓ AI workspaces &nbsp; · Protected publishing still in testing</p>
        </div>
        <div className="lm-visual" aria-label="Illustrative software design and lattice structure">
          <svg className="lm-network" viewBox="0 0 450 420" aria-hidden="true">
            <g fill="none" stroke="currentColor" strokeWidth="1.4" opacity=".55">
              <path d="M44 142 148 76 262 130 367 65 410 206 301 318 163 280 44 142"/>
              <path d="M148 76 163 280 262 130 301 318 410 206 262 130" />
              <path d="M94 368 163 280 301 318 365 370" />
            </g>
            {[[44,142],[148,76],[262,130],[367,65],[410,206],[301,318],[163,280],[94,368],[365,370]].map(([x,y],i)=>
              <circle key={i} cx={x} cy={y} r={i%3===0?5:3} fill={i%3===0?'var(--lm-copper)':'var(--lm-forest)'} />)}
          </svg>
          <div className="lm-hero-product">
            <div><span className="lm-indicator"/> Code Builder <small>EXAMPLE OUTPUT</small></div>
            <p>Build a client intake dashboard with a mobile-friendly form and status tracking.</p>
            <section><strong>Project plan</strong>
              {['Intake form','Client overview','Status dashboard'].map((item,i)=>
                <span key={item}><b>0{i+1}</b>{item}<b aria-hidden="true">✓</b></span>)}
            </section>
          </div>
          <span className="lm-visual-caption">Illustrative product concept, not a live build</span>
        </div>
      </section>

      <section id="workflow" className="lm-workflow-section">
        <div className="lm-container">
          <div className="lm-intro">
            <span className="lm-eyebrow">FROM IDEA TO INTERFACE</span>
            <h2>Explore the workflow before you sign in.</h2>
            <p>This interactive example demonstrates the stages. Try Code Builder for an actual generation.</p>
          </div>
          <ExamplePreview step={step} setStep={setStep} />
        </div>
      </section>
      <section id="why" className="lm-container lm-features">
        <span className="lm-eyebrow">BUILD ON YOUR TERMS</span>
        <h2>Not just the first prompt. The next step, too.</h2>
        <div className="lm-features-grid">
          {[
            ['01','CREATE','Start with an idea','Describe a project and inspect generated files.'],
            ['02','CONTINUE','Keep the context','Work through longer tasks in conversational workspaces.'],
            ['03','CONTROL','Stay in charge','Review source and guide the result. Publishing and expanded GitHub scopes are still being qualified.']
          ].map(([n,k,title,desc])=><article key={n}><div>{k}<span>{n}</span></div><h3>{title}</h3><p>{desc}</p></article>)}
        </div>
      </section>
      <section id="availability" className="lm-availability">
        <div className="lm-container lm-availability-inner">
          <div><span className="lm-eyebrow">EARLY ACCESS</span><h2>Try what works. Help shape what comes next.</h2>
            <p>Code Builder and conversational workspaces are available to try. Private publishing and deeper repository control are still in qualification.</p>
            <Link className="lm-button lm-button-cream" href={builder}>Open Code Builder <span aria-hidden="true">↗</span></Link>
          </div>
          <div className="lm-availability-card">
            <div><strong>✓ Available to try</strong><p>Code Builder and conversational workspaces.</p></div>
            <div><strong>◌ In qualification</strong><p>Private preview links, app publishing, GitHub scope upgrades.</p></div>
            <div><strong>◇ Creator ownership</strong><p>Reviewable source and portability guide the roadmap.</p></div>
          </div>
        </div>
      </section>
    </main>
    <footer className="lm-footer"><div className="lm-container">
      <span>Lattice OS · Built for people who make things.</span>
      <nav aria-label="Footer"><Link href="/en/privacy">Privacy</Link><Link href="/en/support">Support</Link><Link href="/en/docs">Documentation</Link></nav>
    </div></footer>
  </div>;
}
