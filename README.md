# JobCraft AI

A locally-run AI pipeline that takes a job description and generates a fully tailored **resume PDF** and **cover letter PDF** — compiled from LaTeX — in under a minute.

Built as a personal productivity tool to streamline the job application process using a multi-stage AI architecture.

---

## Overview

Paste any job description. JobCraft AI reads it, scores how well your profile matches the role, and produces two print-ready PDFs: a resume with content rewritten specifically for that position, and a cover letter that mirrors the tone and keywords of the JD.

Everything runs locally. No application data is stored or sent anywhere except to the two AI APIs during generation.

---

## Pipeline

```
Job Description (text input)
        │
        ▼
┌─────────────────────────────┐
│  Stage 1 — DeepSeek V3      │
│  ATS Analysis               │
│  • Extracts company & title │
│  • Identifies ATS keywords  │
│  • Scores match (0–100)     │
│  • Flags skill gaps         │
└────────────┬────────────────┘
             │  structured analysis JSON
             ▼
┌─────────────────────────────┐
│  Stage 2 — Claude Sonnet    │
│  Content Generation         │
│  • Rewrites experience      │
│    bullets to match the JD  │
│  • Selects & groups skills  │
│  • Writes cover letter      │
│  • Asks one clarifying      │
│    question if needed       │
└────────────┬────────────────┘
             │  structured content JSON
             ▼
┌─────────────────────────────┐
│  Stage 3 — pdflatex         │
│  PDF Compilation            │
│  • Renders parameterised    │
│    LaTeX templates          │
│  • Compiles resume PDF      │
│  • Compiles cover letter PDF│
│  • Returns base64 to client │
└────────────┬────────────────┘
             │
             ▼
     Download both PDFs
```

---

## Features

**Per-JD tailoring**
Every bullet point, skill category, and cover letter paragraph is rewritten from scratch for each job description. The AI matches the tone, keywords, and emphasis of the JD rather than producing a generic output.

**Grounded in your actual profile**
Claude only outputs skills and experience that exist in your `master.json` profile file. Nothing is invented. The content is your real background, expressed in language aligned to the role.

**Clarification flow**
If the JD requires something that needs confirmation, Claude asks one focused question before proceeding. The answer is factored into the final output.

**Bilingual output**
Switch between German and English with a toggle. The full output — resume bullets, skill labels, cover letter, and PDF filenames — is generated in the selected language.

**Smart PDF naming**
Files are named automatically from the job title, with role-type prefixes (Werkstudent, Praktikant, Working Student, Internship) and gender notation (m/w/d) stripped:
```
Gokul_Rajan_Lebenslauf_Operations_Management.pdf
Gokul_Rajan_Cover_Letter_Operations_Management.pdf
```

**Match scoring**
A breakdown of how well the profile matches the JD across five dimensions: required skills, preferred skills, domain alignment, seniority level, and keyword density.

---

## Project structure

```
jobcraft/
├── data/
│   └── master.json              # Candidate profile — skills, experience,
│                                # certifications, projects, generation rules
├── src/
│   ├── app/
│   │   ├── page.tsx             # UI — JD input, progress, language toggle, downloads
│   │   └── api/
│   │       ├── analyze/         # Stage 1: DeepSeek ATS analysis
│   │       ├── generate/        # Stage 2: Claude content generation
│   │       └── compile/         # Stage 3: pdflatex PDF compilation
│   └── lib/
│       ├── deepseek.ts          # DeepSeek API client with retry & rate-limit logic
│       ├── claude.ts            # Claude API client and all generation rules
│       ├── latex.ts             # LaTeX template rendering and character escaping
│       ├── master.ts            # master.json loader
│       └── schemas.ts           # Zod v4 schemas for all API inputs and outputs
└── templates/
    ├── resume.tex               # German resume template
    ├── resume_en.tex            # English resume template
    ├── coverletter.tex          # German cover letter template
    └── coverletter_en.tex       # English cover letter template
```

---

## master.json — the candidate profile

This file is the single source of truth for everything about the candidate. It contains:

- **Personal info** — name, phone, email, LinkedIn, GitHub, portfolio
- **Education** — degrees, institutions, dates
- **Experience** — job titles, companies, dates, and base content
- **Projects / Hackathons** — titles in German and English, awards
- **Skills master list** — every skill as a bilingual `{ de, en }` pair
- **Certifications master list** — name, issuer, verification URL
- **Generation rules** — what Claude may and may not modify

To adapt this project for a different candidate, only `master.json` and the LaTeX templates need updating.

---

## Local setup

### Prerequisites

| Requirement | Notes |
|---|---|
| Node.js 18+ | `node --version` to verify |
| pdflatex | TeX Live (macOS: MacTeX) or MiKTeX (Windows) |
| DeepSeek API key | [platform.deepseek.com](https://platform.deepseek.com) |
| Anthropic API key | [console.anthropic.com](https://console.anthropic.com) |

Verify pdflatex is available:
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

Create `.env.local` in the project root (excluded from version control):

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
2. Toggle **"Output in English"** if needed
3. Click **Generate →**
4. The progress bar tracks three phases: Analyzing → Generating → Compiling
5. Answer any clarifying question if prompted, then click **Send answer →**
6. Download the resume and cover letter PDFs

---

## Tech stack

| Layer | Technology |
|---|---|
| Framework | Next.js 16 (App Router, Node.js runtime) |
| Stage 1 AI | DeepSeek V3 (`deepseek-chat`) |
| Stage 2 AI | Claude Sonnet 4.6 (`claude-sonnet-4-6`) |
| PDF compilation | pdflatex (server-side child process) |
| Schema validation | Zod v4 |
| Styling | Tailwind CSS v4 |
| Language | TypeScript |

---

## Notes

- **Local only** — pdflatex runs as a subprocess on the host machine. Deployment to serverless platforms (Vercel, etc.) requires a separate PDF compilation service.
- **API costs** — each generation makes one DeepSeek call and one or two Claude Sonnet calls. Both APIs are pay-per-use.
- **Personal tool** — built for a specific candidate profile. Adapting it for a different person requires updating `master.json` and the LaTeX templates.
