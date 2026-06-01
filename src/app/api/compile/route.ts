import fs from "fs/promises";
import path from "path";
import os from "os";
import { execFile } from "child_process";
import { promisify } from "util";
import { z } from "zod";
import { coverLetterSchema, resumeSchema } from "@/lib/schemas";
import { renderCoverLetterTex, renderResumeTex } from "@/lib/latex";
import { claudeShortenCoverLetter } from "@/lib/claude";

const execFileAsync = promisify(execFile);

export const runtime = "nodejs";

const compileRequestSchema = z.object({
  resume: resumeSchema,
  cover_letter: coverLetterSchema,
  language: z.enum(["de", "en"]).optional().default("de"),
});

async function runPdflatex({
  cwd,
  texFile,
}: {
  cwd: string;
  texFile: string;
}): Promise<{ stdout: string; stderr: string }> {
  // nonstopmode without -halt-on-error: let pdflatex push through warnings.
  // execFileAsync throws on non-zero exit (which pdflatex does even for warnings),
  // so we catch and surface the logs; the caller checks whether the PDF was produced.
  try {
    const { stdout, stderr } = await execFileAsync(
      "pdflatex",
      ["-interaction=nonstopmode", texFile],
      {
        cwd,
        timeout: 120_000,
        maxBuffer: 10 * 1024 * 1024,
      },
    );
    return { stdout: String(stdout ?? ""), stderr: String(stderr ?? "") };
  } catch (err: unknown) {
    const e = err as { stdout?: string; stderr?: string; message?: string };
    return { stdout: String(e.stdout ?? ""), stderr: String(e.stderr ?? e.message ?? "") };
  }
}

function parsePdfPageCount(log: string): number {
  const match = log.match(/Output written on .+\((\d+) pages?,/);
  return match ? parseInt(match[1], 10) : 1;
}

export async function POST(req: Request) {
  const tmpRoot = os.tmpdir();
  const tmpDir = await fs.mkdtemp(path.join(tmpRoot, "jobcraft-"));

  try {
    const body = await req.json();
    const parsed = compileRequestSchema.parse(body);

    const templatesDir = path.join(process.cwd(), "templates");
    const lang = parsed.language ?? "de";
    const resumeTemplate = await fs.readFile(
      path.join(templatesDir, lang === "en" ? "resume_en.tex" : "resume.tex"),
      "utf8",
    );
    const coverTemplate = await fs.readFile(
      path.join(templatesDir, lang === "en" ? "coverletter_en.tex" : "coverletter.tex"),
      "utf8",
    );
    const glyphtounicodeTemplate = await fs.readFile(
      path.join(templatesDir, "glyphtounicode.tex"),
      "utf8",
    );

    // Create a self-contained compilation directory.
    await fs.writeFile(
      path.join(tmpDir, "resume.tex"),
      renderResumeTex(resumeTemplate, parsed.resume),
      "utf8",
    );
    await fs.writeFile(
      path.join(tmpDir, "coverletter.tex"),
      renderCoverLetterTex(coverTemplate, parsed.cover_letter),
      "utf8",
    );
    await fs.writeFile(
      path.join(tmpDir, "glyphtounicode.tex"),
      glyphtounicodeTemplate,
      "utf8",
    );

    const resumeCompile = await runPdflatex({ cwd: tmpDir, texFile: "resume.tex" });
    let coverCompile = await runPdflatex({ cwd: tmpDir, texFile: "coverletter.tex" });

    // If cover letter spills onto a second page, ask Claude to shorten it and recompile once.
    const coverPages = parsePdfPageCount(coverCompile.stdout);
    if (coverPages > 1) {
      const shortened = await claudeShortenCoverLetter(parsed.cover_letter, coverPages);
      await fs.writeFile(
        path.join(tmpDir, "coverletter.tex"),
        renderCoverLetterTex(coverTemplate, shortened),
        "utf8",
      );
      coverCompile = await runPdflatex({ cwd: tmpDir, texFile: "coverletter.tex" });
    }

    // pdflatex exits non-zero for warnings but still writes the PDF — check the
    // file actually exists before trying to read it so we get a clear error if not.
    const resumePdfPath = path.join(tmpDir, "resume.pdf");
    const coverPdfPath = path.join(tmpDir, "coverletter.pdf");

    const resumeExists = await fs.access(resumePdfPath).then(() => true).catch(() => false);
    const coverExists = await fs.access(coverPdfPath).then(() => true).catch(() => false);

    if (!resumeExists) {
      throw new Error(`Resume PDF not produced. LaTeX log:\n${resumeCompile.stdout.slice(-2000)}`);
    }
    if (!coverExists) {
      throw new Error(`Cover letter PDF not produced. LaTeX log:\n${coverCompile.stdout.slice(-2000)}`);
    }

    const [resumePdf, coverPdf] = await Promise.all([
      fs.readFile(resumePdfPath),
      fs.readFile(coverPdfPath),
    ]);

    return Response.json({
      resume_pdf: Buffer.from(resumePdf).toString("base64"),
      cover_letter_pdf: Buffer.from(coverPdf).toString("base64"),
      compile_logs: {
        resume: { stdout: resumeCompile.stdout, stderr: resumeCompile.stderr },
        cover_letter: {
          stdout: coverCompile.stdout,
          stderr: coverCompile.stderr,
        },
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return Response.json({ error: message }, { status: 400 });
  } finally {
    // Best-effort cleanup of generated files.
    await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  }
}
