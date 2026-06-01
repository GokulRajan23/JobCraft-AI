# JobCraft AI

A locally-run AI pipeline that takes a job description and generates a fully tailored **resume PDF** and **cover letter PDF** — both compiled from LaTeX — in under a minute.

---

## What it does

Paste any job description. JobCraft AI reads it, scores how well your profile matches, asks a clarifying question if something critical is missing, and then produces two print-ready PDFs: a resume with bullets and skills rewritten specifically for that role, and a cover letter that mirrors the tone and language of the JD.

Everything runs on your machine. No data is sent anywhere except to the two AI APIs (DeepSeek and Anthropic) during generation.

---

## How it works — the pipeline

```
Job Description (text input)
        │
        ▼
┌─────────────────────────────┐
│  Stage 1 — DeepSeek V3      │
│  ATS analysis               │
│  • Extracts company name    │
│  • Extracts exact job title │
│  • Identifies ATS keywords  │
│  • Scores match (0–100)     │
│  • Flags missing skills     │
└────────────┬────────────────┘
             │  analysis JSON
             ▼
┌─────────────────────────────┐
│  Stage 2 — Claude Sonnet    │
│  Content generation         │
│  • Rewrites experience      │
│    bullets to match JD      │
│  • Selects & groups skills  │
│  • Writes cover letter      │
│  • May ask one clarifying   │
│    question if a required   │
│    skill is missing         │
└────────────┬────────────────┘
             │  structured JSON
             ▼
┌─────────────────────────────┐
│  Stage 3 — pdflatex         │
│  LaTeX compilation          │
│  • Fills parameterised .tex │
│    templates                │
│  • Compiles resume PDF      │
│  • Compiles cover letter PDF│
│  • Returns base64 PDFs      │
└────────────┬────────────────┘
             │
             ▼
     Download both PDFs
```

---

## Key features

**Tailored, not templated**
Every bullet point, skill category, and cover letter paragraph is rewritten from scratch for each job description. The AI is instructed to match the tone, keywords, and emphasis of the JD.

**Honest skill representation**
Claude only outputs skills that exist in your `master.json` skills list. It never invents experience. Domain-specific substitution rules handle cases where you have transferable but not identical experience:
- _Jira / Confluence_ → ServiceNow, IBM Maximo, SharePoint, Microsoft Teams
- _FEM / SEA / ANSYS_ → CST Studio Suite, MATLAB (framed as transferable simulation experience)

**Clarification flow**
If the JD requires a tool that's genuinely absent from your profile, Claude asks one focused question before continuing. You answer in plain language — it extracts what you know and adapts the output accordingly.

**Language toggle**
Switch between German and English output with a single toggle. Both the resume and cover letter are fully rewritten in the selected language, including section headings, skill labels, and date formats. Filenames adjust accordingly.

**Smart filenames**
Downloaded PDFs are named automatically:
- `Gokul_Rajan_Lebenslauf_Operations_Management.pdf`
- `Gokul_Rajan_Cover_Letter_Operations_Management.pdf`

Role-type prefixes (Werkstudent, Praktikant, Working Student, Internship) and gender notation (m/w/d) are stripped from filenames automatically.

**Match score**
After Stage 1 analysis, the UI shows a match score with a breakdown across five dimensions: required skills, preferred skills, domain alignment, seniority level, and keyword density.

---

## Project structure

```
jobcraft/
├── data/
│   └── master.json              # Single source of truth — your profile,
│                                # skills list, certifications, projects
├── src/
│   ├── app/
│   │   ├── page.tsx             # Main UI — JD input, progress, downloads
│   │   └── api/
│   │       ├── analyze/         # Stage 1: DeepSeek ATS analysis
│   │       ├── generate/        # Stage 2: Claude content generation
│   │       └── compile/         # Stage 3: pdflatex PDF compilation
│   └── lib/
│       ├── deepseek.ts          # DeepSeek API client with retry logic
│       ├── claude.ts            # Claude API client + all generation rules
│       ├── latex.ts             # LaTeX template rendering & escaping
│       ├── master.ts            # master.json loader
│       └── schemas.ts           # Zod schemas for all API I/O
└── templates/
    ├── resume.tex               # German resume template
    ├── resume_en.tex            # English resume template
    ├── coverletter.tex          # German cover letter template
    └── coverletter_en.tex       # English cover letter template
```

---

## master.json — the candidate profile

This file is the single source of truth for everything about the candidate. Claude is strictly forbidden from outputting any skill or certification that does not appear here.

It contains:
- **Personal info** — name, phone, email, LinkedIn, GitHub, portfolio
- **Education** — degrees, institutions, dates
- **Experience** — job titles, companies, dates, and base bullet points
- **Projects / Hackathons** — titles in German and English, badge labels
- **Skills master list** — every skill as a bilingual `{de, en}` pair
- **Certifications master list** — name, issuer, and URL
- **Generation rules** — locked fields, language defaults, what Claude may and may not change

To adapt this project for a different candidate, only `master.json` and the LaTeX templates need to be updated.

---

## Local setup

### Prerequisites

| Requirement | Notes |
|---|---|
| Node.js 18+ | `node --version` |
| pdflatex | Part of TeX Live (macOS: MacTeX), MiKTeX (Windows) |
| DeepSeek API key | [platform.deepseek.com](https://platform.deepseek.com) |
| Anthropic API key | [console.anthropic.com](https://console.anthropic.com) |

Verify pdflatex is on your PATH:
```bash
pdflatex --version
```

### Install

```bash
git clone https://github.com/GokulRajan23/JobCraft-AI.git
cd JobCraft-AI
npm install
```

### Configure

Create `jobcraft/.env.local` (never committed — excluded by `.gitignore`):

```env
DEEPSEEK_API_KEY=your_deepseek_key
DEEPSEEK_BASE_URL=https://api.deepseek.com
DEEPSEEK_MODEL=deepseek-chat

ANTHROPIC_API_KEY=your_anthropic_key
ANTHROPIC_MODEL=claude-sonnet-4-6
```

### Run

```bash
npm run dev
```

Open [http://localhost:9057](http://localhost:9057).

---

## Usage

1. Paste a job description into the text area
2. Toggle **"Output in English"** if you need an English-language resume and cover letter
3. Click **Generate →**
4. Watch the three-phase progress bar (Analyzing → Generating → Compiling)
5. If Claude needs clarification on a missing skill, answer the question and click **Send answer →**
6. Download the resume and cover letter PDFs when ready

---

## Tech stack

| Layer | Technology |
|---|---|
| Framework | Next.js 16 (App Router, Node.js runtime) |
| Stage 1 AI | DeepSeek V3 (`deepseek-chat`) |
| Stage 2 AI | Claude Sonnet 4.6 (`claude-sonnet-4-6`) |
| PDF compilation | pdflatex (runs server-side as a child process) |
| Schema validation | Zod v4 |
| Styling | Tailwind CSS v4 |
| Language | TypeScript |

---

## Important notes

- **Local only** — pdflatex runs as a subprocess on your machine. This cannot be deployed to serverless platforms (Vercel, etc.) without a separate compilation service.
- **API costs** — each generation makes one DeepSeek call and one or two Claude calls. Both are pay-per-use.
- **Not a product** — this is a personal tool built for a specific candidate profile. Adapting it for another person requires updating `master.json` and the LaTeX templates.
