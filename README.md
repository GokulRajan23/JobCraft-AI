JobCraft AI (local-only)

Paste a job description and generate:
1. A tailored resume PDF
2. A tailored cover letter PDF

It uses a 2-stage LLM pipeline and compiles LaTeX via `pdflatex` on the server (your machine).

## Local requirements

- Node.js 18+
- `pdflatex` available on your PATH (TeX Live / MacTeX / MiKTeX)
- API keys in `jobcraft/.env.local`:
  - `DEEPSEEK_API_KEY`
  - `ANTHROPIC_API_KEY`

Quick check:

```bash
pdflatex --version
```

## Run

```bash
cd jobcraft
npm run dev
```

Open `http://localhost:5681`.
