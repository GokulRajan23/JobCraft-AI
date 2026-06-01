import { deepSeekAnalysisSchema, type DeepSeekAnalysis } from "./schemas";

function cleanModelOutput(text: string): string {
  return text
    .replace(/<think>[\s\S]*?<\/think>/gi, "")  // strip thinking blocks
    .replace(/```(?:json)?\s*([\s\S]*?)```/gi, "$1")  // unwrap code fences
    .trim();
}

function extractFirstJsonObject(text: string): unknown {
  const cleaned = cleanModelOutput(text);
  const match = cleaned.match(/\{[\s\S]*\}/);
  if (!match) throw new Error("No JSON object found in model output.");
  return JSON.parse(match[0]);
}

export async function deepseekAnalyze({
  jd,
  skills,
}: {
  jd: string;
  skills: string[];
}): Promise<DeepSeekAnalysis> {
  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) throw new Error("Missing DEEPSEEK_API_KEY.");

  const baseUrl = (process.env.DEEPSEEK_BASE_URL ?? "https://api.deepseek.com").replace(/\/$/, "");
  const model = process.env.DEEPSEEK_MODEL ?? "deepseek-v3-flash";
  const url = `${baseUrl}/v1/chat/completions`;

  const systemPrompt =
    "You are an expert recruiter/ATS analyst. Return ONLY valid JSON (no markdown, no code fences) matching the requested schema.";

  const userPrompt = {
    jd,
    skills,
    requested_output:
      "company_name: string (extract the hiring company name from the JD; use empty string if not found); job_title: string (extract the exact full job title/position as it appears in the JD, word-for-word including role type prefix like 'Working Student', 'Werkstudent', 'Intern', etc.; use empty string if not found); ats_keywords: string[]; recruiter_intent: string; missing_skills: string[]; job_type: string; repeated_terms: string[]; responsibilities: string[]; match_score: number 0-100; score_breakdown: {required_skills:{score,weight}, preferred_skills:{score,weight}, domain_alignment:{score,weight}, seniority_level_match:{score,weight}, keyword_density:{score,weight}}",
    scoring_notes:
      "Use weights: required_skills 40, preferred_skills 20, domain_alignment 15, seniority_level_match 15, keyword_density 10. match_score = round(sum of score_i * weight_i / 100).",
  };

  type DeepSeekChatCompletionsResponse = {
    choices?: Array<{
      message?: { content?: string };
    }>;
  };

  // Keep total runtime reasonable so the UI doesn't appear to "hang",
  // but allow enough time for OpenRouter provider rate-limit windows.
  const maxRetries = 12;
  const maxTotalMs = Number(process.env.DEEPSEEK_MAX_TOTAL_MS ?? 240_000);
  const startedAt = Date.now();
  let lastError: unknown;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    if (Date.now() - startedAt > maxTotalMs) break;
    const resp = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        temperature: 0.2,
        max_tokens: 2000,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: JSON.stringify(userPrompt) },
        ],
      }),
    });

    if (!resp.ok) {
      const errText = await resp.text().catch(() => "");
      const isRateLimited = resp.status === 429;

      if (isRateLimited && attempt < maxRetries) {
        const retryAfterHeader = resp.headers.get("retry-after");
        let retryAfterMs: number | undefined;

        if (retryAfterHeader) {
          const secs = Number(retryAfterHeader);
          if (!Number.isNaN(secs)) retryAfterMs = secs * 1000;
          else {
            const until = Date.parse(retryAfterHeader);
            if (!Number.isNaN(until)) retryAfterMs = until - Date.now();
          }
        }

        if (!retryAfterMs || retryAfterMs < 0) {
          // Fallback: exponential backoff capped to avoid multi-minute UI hangs.
          retryAfterMs = 5000 * Math.pow(2, attempt);
        }
        retryAfterMs = Math.min(retryAfterMs, 90_000);

        const jitterMs = Math.floor(Math.random() * 1000);
        const elapsedMs = Date.now() - startedAt;
        const remainingMs = maxTotalMs - elapsedMs;
        const waitMs = Math.min(retryAfterMs! + jitterMs, Math.max(0, remainingMs - 250));
        if (waitMs <= 0) break;
        await new Promise((r) => setTimeout(r, waitMs));
        lastError = new Error(
          `DeepSeek rate limited (429). Retrying after ~${Math.round(
            retryAfterMs,
          )}ms. ${errText}`.trim(),
        );
        continue;
      }

      if (attempt < maxRetries && resp.status >= 500) {
        const backoffMs = Math.min(5000 * Math.pow(2, attempt), 30_000);
        const elapsedMs = Date.now() - startedAt;
        const remainingMs = maxTotalMs - elapsedMs;
        const waitMs = Math.min(backoffMs, Math.max(0, remainingMs - 250));
        if (waitMs <= 0) break;
        await new Promise((r) => setTimeout(r, waitMs));
        lastError = new Error(`DeepSeek server error ${resp.status}. Retrying. ${errText}`.trim());
        continue;
      }

      lastError = new Error(
        `DeepSeek request failed: ${resp.status} ${resp.statusText}. ${errText}`.trim(),
      );
      break;
    }

    let rawContent = "";
    try {
      const data: DeepSeekChatCompletionsResponse = await resp.json();
      const msg = data.choices?.[0]?.message as Record<string, unknown> | undefined;
      rawContent = (msg?.content as string ?? "").slice(0, 400);
      // Strip <think> blocks before checking emptiness — thinking models put
      // their final answer after </think>, so cleaned content may be non-empty
      // even when the raw string looks like it's all reasoning.
      const content =
        cleanModelOutput(msg?.content as string ?? "") ||
        cleanModelOutput(msg?.reasoning as string ?? "");
      if (!content) throw new Error("DeepSeek response missing message content.");

      const parsed = extractFirstJsonObject(content);
      return deepSeekAnalysisSchema.parse(parsed);
    } catch (err) {
      lastError = new Error(`${String(err)} | raw: ${rawContent}`);
      if (attempt < maxRetries) continue;
      break;
    }
  }

  throw new Error(
    `DeepSeek analysis failed after retries. Last error: ${String(lastError)}`,
  );
}

