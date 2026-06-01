import { analyzeRequestSchema } from "@/lib/schemas";
import { deepseekAnalyze } from "@/lib/deepseek";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const parsed = analyzeRequestSchema.parse(body);
    const analysis = await deepseekAnalyze(parsed);
    return Response.json(analysis);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return Response.json({ error: message }, { status: 400 });
  }
}

