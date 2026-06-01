"use client";

import { useMemo, useState } from "react";
import type { DeepSeekAnalysis, Stage2Output } from "@/lib/schemas";
import { getMasterData, getMasterSkills } from "@/lib/master";

type Phase = "idle" | "analyzing" | "generating" | "waiting" | "compiling" | "ready" | "error";

function scoreCardLabel(n: number) {
  if (n >= 90) return "Excellent match";
  if (n >= 75) return "Strong match";
  if (n >= 60) return "Good match";
  return "Needs tailoring";
}

function buildPdfFilename(position: string, type: "resume" | "cover", lang: "de" | "en"): string {
  const noGender = position.replace(/\s*\([mwfd]\/[mwfd](?:\/\w+)?\)\s*/gi, " ").trim();
  const stripped = noGender
    .replace(/^werkstudent(?:in)?(?:\s+im?\s+|\s+)?/i, "")       // German: Werkstudent / Werkstudent im / Werkstudent in
    .replace(/^praktikant(?:in)?(?:\s+im?\s+|\s+)?/i, "")        // German: Praktikant / Praktikantin im/in
    .replace(/^working\s+student(?:\s+(?:in|as)\s+|\s+)?/i, "")  // English: Working Student / Working Student in/as
    .replace(/^intern(?:ship)?(?:\s+(?:in|as)\s+|\s+)?/i, "")    // English: Intern / Internship / Intern in/as
    .trim();
  const slug = stripped.replace(/\s+/g, "_").replace(/[^\w\-äöüÄÖÜß]/g, "");
  const label = type === "resume"
    ? (lang === "en" ? "Resume" : "Lebenslauf")
    : (lang === "en" ? "Cover_Letter" : "Anschreiben");
  return `Gokul_Rajan_${label}_${slug}.pdf`;
}

function downloadBase64Pdf({ base64, filename }: { base64: string; filename: string }) {
  const href = `data:application/pdf;base64,${base64}`;
  const a = document.createElement("a");
  a.href = href;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

export default function Home() {
  const masterData = useMemo(() => getMasterData(), []);
  const defaultSkills = useMemo(() => getMasterSkills(), []);

  const [jd, setJd] = useState("");
  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState<string | null>(null);

  const [analysis, setAnalysis] = useState<DeepSeekAnalysis | null>(null);
  const [stage2, setStage2] = useState<Stage2Output | null>(null);
  const [pdfs, setPdfs] = useState<{ resume_pdf: string; cover_letter_pdf: string } | null>(null);
  const [clarificationQuestion, setClarificationQuestion] = useState<string | null>(null);
  const [clarificationAnswer, setClarificationAnswer] = useState("");
  const [interruptionsCount, setInterruptionsCount] = useState(0);
  const [clarificationHistory, setClarificationHistory] = useState<Array<{ question: string; answer: string }>>([]);
  const [englishMode, setEnglishMode] = useState(false);

  const canGenerate =
    jd.trim().length > 0 &&
    phase !== "analyzing" &&
    phase !== "generating" &&
    phase !== "compiling" &&
    phase !== "waiting";

  const scoreBreakdownItems = useMemo(() => {
    if (!analysis) return [];
    const b = analysis.score_breakdown;
    return [
      { key: "required_skills", label: "Required skills", ...b.required_skills },
      { key: "preferred_skills", label: "Preferred skills", ...b.preferred_skills },
      { key: "domain_alignment", label: "Domain alignment", ...b.domain_alignment },
      { key: "seniority_level_match", label: "Seniority level", ...b.seniority_level_match },
      { key: "keyword_density", label: "Keyword density", ...b.keyword_density },
    ];
  }, [analysis]);

  async function callAnalyze() {
    setPhase("analyzing");
    setError(null);

    const resp = await fetch("/api/analyze", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jd, skills: defaultSkills }),
    });

    const data = await resp.json();
    if (!resp.ok) throw new Error(data?.error ?? "Failed to analyze job description.");
    const a = data as DeepSeekAnalysis;
    setAnalysis(a);
    return a;
  }

  async function callGenerate({
    clarification,
    analysisOverride,
  }: {
    clarification?: string;
    analysisOverride?: DeepSeekAnalysis;
  }): Promise<{ needsClarification: boolean; out?: Stage2Output }> {
    const analysisToUse = analysisOverride ?? analysis;
    if (!analysisToUse) throw new Error("Missing analysis state.");

    setPhase("generating");
    setError(null);

    const md = masterData as Record<string, unknown>;
    const effectiveMasterData = englishMode
      ? { ...md, _meta: { ...(md._meta as Record<string, unknown>), language_default: "en" } }
      : masterData;

    const resp = await fetch("/api/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        analysis: analysisToUse,
        masterData: effectiveMasterData,
        clarification,
      }),
    });

    const data = await resp.json();
    if (!resp.ok) throw new Error(data?.error ?? "Failed to generate tailored content.");

    const out = data as Stage2Output;
    setStage2(out);

    if (out.clarification_needed) {
      setClarificationQuestion(out.clarification_needed);
      setClarificationAnswer("");
      setInterruptionsCount((c) => c + 1);
      setPhase("waiting");
      return { needsClarification: true };
    }

    setClarificationQuestion(null);
    return { needsClarification: false, out };
  }

  async function callCompile(stage2Override?: Stage2Output) {
    const stage2ToUse = stage2Override ?? stage2;
    if (!stage2ToUse) throw new Error("Missing generated content state.");
    setPhase("compiling");
    setError(null);

    const resp = await fetch("/api/compile", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        resume: stage2ToUse.resume,
        cover_letter: stage2ToUse.cover_letter,
        language: englishMode ? "en" : "de",
      }),
    });

    const data = await resp.json();
    if (!resp.ok) throw new Error(data?.error ?? "Failed to compile PDFs.");

    setPdfs({
      resume_pdf: data.resume_pdf,
      cover_letter_pdf: data.cover_letter_pdf,
    });
    setPhase("ready");
  }

  async function onGenerate() {
    try {
      setPhase("analyzing");
      setError(null);
      setAnalysis(null);
      setStage2(null);
      setPdfs(null);
      setClarificationQuestion(null);
      setClarificationAnswer("");
      setInterruptionsCount(0);
      setClarificationHistory([]);

      const a = await callAnalyze();
      const genRes = await callGenerate({ analysisOverride: a });
      if (genRes.needsClarification) return;

      if (!genRes.out) throw new Error("Missing generated content.");
      await callCompile(genRes.out);
    } catch (err) {
      setPhase("error");
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  async function onSendClarification() {
    try {
      const answer = clarificationAnswer.trim();
      const newHistory = [...clarificationHistory, { question: clarificationQuestion ?? "", answer }];
      setClarificationHistory(newHistory);

      // Pass the full Q&A history so Claude never repeats a question already answered.
      const fullClarification = newHistory
        .map((entry, i) => `Q${i + 1}: ${entry.question}\nA${i + 1}: ${entry.answer}`)
        .join("\n\n");

      const genRes = await callGenerate({
        clarification: fullClarification,
        analysisOverride: analysis ?? undefined,
      });
      if (genRes.needsClarification) return;

      if (!genRes.out) throw new Error("Missing generated content.");
      await callCompile(genRes.out);
    } catch (err) {
      setPhase("error");
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="mx-auto max-w-3xl px-4 py-10">
        <header className="mb-6">
          <h1 className="text-3xl font-semibold">JobCraft AI</h1>
          <p className="mt-2 text-sm opacity-80">
            Paste a job description to generate a tailored resume PDF and a cover letter PDF.
          </p>
        </header>

        <section className="rounded-xl border border-black/10 bg-white/70 p-4 shadow-sm dark:bg-black/30">
          <label className="block text-sm font-medium">Job description</label>
          <textarea
            className="mt-2 min-h-52 w-full resize-y rounded-lg border border-black/10 bg-white p-3 text-sm outline-none focus:border-black/30 dark:border-white/10 dark:bg-black/20"
            placeholder="Paste the job description here..."
            value={jd}
            onChange={(e) => setJd(e.target.value)}
          />

          <div className="mt-4 flex items-center gap-4 flex-wrap">
            <button
              disabled={!canGenerate}
              onClick={onGenerate}
              className="rounded-lg bg-foreground px-4 py-2 text-background disabled:opacity-50"
            >
              Generate →
            </button>
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <div
                onClick={() => setEnglishMode((v) => !v)}
                className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${englishMode ? "bg-foreground" : "bg-black/20 dark:bg-white/20"}`}
              >
                <span
                  className={`inline-block h-3.5 w-3.5 rounded-full bg-white transition-transform ${englishMode ? "translate-x-4" : "translate-x-1"}`}
                />
              </div>
              <span className="text-xs opacity-70">Output in English</span>
            </label>
          </div>
        </section>

        <section className="mt-6">
          <div className="rounded-xl border border-black/10 bg-white/70 p-4 shadow-sm dark:bg-black/30">
            <h2 className="text-sm font-semibold">Progress</h2>
            <div className="mt-3 space-y-2 text-sm">
              <div>{phase === "analyzing" ? "✓" : "•"} Analyzing job description</div>
              <div>
                {phase === "generating" || phase === "waiting" ? "✓" : "•"} Generating tailored content
              </div>
              <div>{phase === "compiling" ? "✓" : "•"} Compiling PDFs</div>
            </div>

            {error ? (
              <div className="mt-4 rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-700 dark:text-red-200">
                {error}
              </div>
            ) : null}

            {analysis ? (
              <div className="mt-5">
                <h3 className="text-sm font-semibold">
                  Match Score: {Math.round(analysis.match_score)}/100
                </h3>
                <p className="mt-1 text-xs opacity-70">{scoreCardLabel(analysis.match_score)}</p>
                <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {scoreBreakdownItems.map((item) => (
                    <div key={item.key} className="rounded-lg border border-black/10 bg-white/60 p-2 text-xs">
                      <div className="font-medium">{item.label}</div>
                      <div className="mt-1 opacity-80">
                        {Math.round(item.score * item.weight / 100)}/{item.weight}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}

            {clarificationQuestion && phase === "waiting" ? (
              <div className="mt-5">
                <h3 className="text-sm font-semibold">Clarification needed</h3>
                <p className="mt-2 whitespace-pre-wrap text-sm">{clarificationQuestion}</p>
                <div className="mt-3">
                  <input
                    className="w-full rounded-lg border border-black/10 bg-white p-2 text-sm outline-none focus:border-black/30 dark:border-white/10 dark:bg-black/20"
                    placeholder="Type the answer..."
                    value={clarificationAnswer}
                    onChange={(e) => setClarificationAnswer(e.target.value)}
                  />
                  <button
                    onClick={onSendClarification}
                    className="mt-3 w-full rounded-lg bg-foreground px-4 py-2 text-background disabled:opacity-50"
                    disabled={clarificationAnswer.trim().length === 0}
                  >
                    Send answer →
                  </button>
                  <div className="mt-2 text-xs opacity-70">
                    Clarification {interruptionsCount + 1}
                  </div>
                </div>
              </div>
            ) : null}

            {phase === "ready" ? (
              <div className="mt-5 rounded-lg border border-black/10 bg-white/60 p-3 text-sm">
                <div className="flex flex-col gap-3 sm:flex-row">
                  <button
                    className="rounded-lg bg-foreground px-4 py-2 text-background disabled:opacity-50"
                    disabled={!pdfs?.resume_pdf}
                    onClick={() => {
                      if (!pdfs?.resume_pdf) return;
                      downloadBase64Pdf({
                        base64: pdfs.resume_pdf,
                        filename: buildPdfFilename(stage2?.cover_letter.POSITION ?? "", "resume", englishMode ? "en" : "de"),
                      });
                    }}
                  >
                    Download Resume
                  </button>
                  <button
                    className="rounded-lg bg-foreground px-4 py-2 text-background disabled:opacity-50"
                    disabled={!pdfs?.cover_letter_pdf}
                    onClick={() => {
                      if (!pdfs?.cover_letter_pdf) return;
                      downloadBase64Pdf({
                        base64: pdfs.cover_letter_pdf,
                        filename: buildPdfFilename(stage2?.cover_letter.POSITION ?? "", "cover", englishMode ? "en" : "de"),
                      });
                    }}
                  >
                    Download Cover Letter
                  </button>
                </div>
              </div>
            ) : null}
          </div>
        </section>
      </div>
    </main>
  );
}
