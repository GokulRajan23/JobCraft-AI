import { generateRequestSchema } from "@/lib/schemas";
import { claudeGenerateStage2 } from "@/lib/claude";

export const runtime = "nodejs";

type MasterProject = {
  id: string;
  title_de?: string;
  title_en?: string;
  badge_de?: string;
  badge_en?: string;
};

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const parsed = generateRequestSchema.parse(body);

    const out = await claudeGenerateStage2({
      analysis: parsed.analysis,
      masterData: parsed.masterData,
      clarification: parsed.clarification,
    });

    // Inject project titles from master data — deterministic, language-aware.
    const md = parsed.masterData as {
      _meta?: { language_default?: string };
      projects?: MasterProject[];
    };
    const de = (md._meta?.language_default ?? "de") === "de";
    const titleEntry = (id: string) => {
      const p = md.projects?.find((x) => x.id === id);
      return {
        title: (de ? p?.title_de : p?.title_en) ?? "",
        badge: (de ? p?.badge_de : p?.badge_en) ?? "",
      };
    };
    out.resume.project_titles = {
      hackathon_1: titleEntry("hackathon_1"),
      hackathon_2: titleEntry("hackathon_2"),
      hackathon_3: titleEntry("hackathon_3"),
    };

    // Inject the exact job title extracted by DeepSeek — never let Claude translate or rephrase it.
    // Fall back to whatever Claude produced only if DeepSeek didn't extract a title.
    out.cover_letter.POSITION = (parsed.analysis.job_title || out.cover_letter.POSITION)
      .replace(/\s*\([mwfd]\/[mwfd](?:\/\w+)?\)\s*/gi, " ")
      .trim();

    return Response.json(out);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return Response.json({ error: message }, { status: 400 });
  }
}

