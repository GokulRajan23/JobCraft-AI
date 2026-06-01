import Anthropic from "@anthropic-ai/sdk";
import {
  stage2OutputSchema,
  coverLetterSchema,
  type DeepSeekAnalysis,
  type Stage2Output,
  type CoverLetterJSON,
} from "./schemas";

function extractFirstJsonObject(text: string): unknown {
  const trimmed = text.trim();
  const match = trimmed.match(/\{[\s\S]*\}/);
  if (!match) throw new Error("No JSON object found in model output.");
  return JSON.parse(match[0]);
}

export async function claudeGenerateStage2({
  analysis,
  masterData,
  clarification,
}: {
  analysis: DeepSeekAnalysis;
  masterData: unknown;
  clarification?: string;
}): Promise<Stage2Output> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("Missing ANTHROPIC_API_KEY.");

  // Force Sonnet 4.6 only (user requested no other Claude models).
  const allowedModel = "claude-sonnet-4-6";
  const modelFromEnv = process.env.ANTHROPIC_MODEL;
  if (modelFromEnv && modelFromEnv !== allowedModel) {
    throw new Error(`Invalid ANTHROPIC_MODEL. Only ${allowedModel} is allowed.`);
  }
  const model = allowedModel;

  const anthropic = new Anthropic({ apiKey });

  const systemPrompt =
    "You generate tailored resume content and cover letter content. Output ONLY valid JSON matching the provided schema. No markdown, no code fences, no extra text.";

  const userPayload = {
    analysis,
    masterData,
    clarification: clarification ?? null,
    output_schema:
      "stage2OutputSchema: { resume: { tagline: string, experience_bullets:{job_1:string[],job_2:string[],job_3:string[]}, projects_bullets:{hackathon_1:string[],hackathon_2:string[],hackathon_3:string[]}, leadership_bullets:{leadership_1:string[],leadership_2:string[]}, skills:[{category:string, items:string[]}], certifications:[{id,name,issuer,url?}] }, cover_letter: {COMPANY_NAME,DEPARTMENT,COMPANY_LOCATION,POSITION,OPENING_PARAGRAPH,EXPERIENCE_PARAGRAPH,LEADERSHIP_PARAGRAPH,CLOSING_PARAGRAPH,SKILL_LABEL_1,SKILL_DESCRIPTION_1,SKILL_LABEL_2,SKILL_DESCRIPTION_2,SKILL_LABEL_3,SKILL_DESCRIPTION_3,SKILL_LABEL_4,SKILL_DESCRIPTION_4,SKILL_LABEL_5,SKILL_DESCRIPTION_5}, clarification_needed:string|null }",
    resume_rules:
      "Locked fields (never invent/modify): name/contact, education section, experience title/company/dates, project/hackathon titles, leadership/activity titles. Only modify: experience bullets, skills, projects/hackathon bullets, leadership bullets, certifications. Tagline: use ' | ' as separators between key items (e.g. 'SAP Analyst | Excel Reporting | Stakeholder Communication'). Skills: group into 4-6 logical categories matching the job domain (e.g. 'Datenanalyse & Reporting', 'Enterprise-Systeme'). Category names should be concise (2-4 words). Items must come ONLY from masterData.skills_master_list using the language specified in masterData._meta.language_default. Cover letter: COMPANY_NAME must be set from analysis.company_name. POSITION will be overridden server-side — set it to analysis.job_title exactly as-is (do not translate, rephrase, or shorten it). Write content that fits on a single page (keep paragraphs concise, max ~60 words each). Rewrite fully per job; match tone inferred from JD. EMPLOYMENT TYPE RULE: Detect whether the JD uses 'Praktikant/Praktikantin' (intern) or 'Werkstudent/Werkstudentin' (working student). Use exactly that term throughout the cover letter wherever the role type is mentioned. Never mix the two terms in the same cover letter. CLARIFICATION ANSWER RULE (apply first when clarification is non-null): Read the user's answer carefully. Extract every skill, tool, or technology the user mentions — including alternatives, equivalents, or related tools they say they know instead of the originally asked-about tool. For each mentioned item, search masterData.skills_master_list for the closest matching entry (e.g. user says 'ServiceNow' → find the ServiceNow skill in the list; user says 'I use SAP instead of Salesforce' → find the SAP skill). Include ALL matched skills prominently in the resume skills section and weave them into the experience/cover letter bullets. Never discard or ignore what the user says. If the user's answer contains useful information about their background, use it to tailor the content even if phrased informally. CLARIFICATION RULE (applies when clarification is null): Before generating, check analysis.missing_skills and analysis.ats_keywords against masterData.skills_master_list. If the JD explicitly requires a specific tool, technology, or skill (e.g. 'Jira', 'Salesforce', 'Figma') that does NOT appear anywhere in masterData.skills_master_list, you MUST set clarification_needed to a single focused question asking whether the user has experience with that tool. Ask about the single most important missing skill only — one question, no numbering (never use '1/2', '2/2', or similar), no multiple questions in one string. Do NOT silently substitute a different skill. If all required skills are covered by masterData, set clarification_needed to null.",
    engineering_simulation_rule:
      "FEM/SEA/SIMULATION RULE: If the JD mentions FEM, FEA, SEA, CAE, simulation modeling, hybrid simulation, ANSYS, NASTRAN, Abaqus, COMSOL, HyperWorks, VA One, AutoSEA, or any engineering simulation tool: do NOT claim direct experience with those tools. Instead use 'CST Studio Suite (engineering simulation)' and 'MATLAB (numerical analysis & modeling)' from the master list as transferable simulation experience. In resume bullets and cover letter, frame them as: 'hands-on experience with engineering simulation and modeling using CST Studio Suite and MATLAB during final-year metamaterial antenna design project — strong foundation for learning FEM/SEA environments quickly.' Never write FEM, ANSYS, NASTRAN, VA One, or AutoSEA as skills the candidate has unless they appear explicitly in the master list.",
    jira_confluence_rule:
      "JIRA/CONFLUENCE RULE: If the JD mentions Jira, Confluence, Atlassian tools, agile project tracking, ticket management, backlog management, issue tracking, workflow coordination, documentation management, or knowledge bases: do NOT claim direct Jira or Confluence experience. Use these substitutes from masterData.skills_master_list — for ticket/workflow/task tracking use ServiceNow and IBM Maximo; for cross-team coordination use SAP and Microsoft Teams; for documentation and knowledge management use SharePoint and structured documentation (work instructions, system guidelines). In resume bullets frame as: 'Managed and tracked tickets and workflows using ServiceNow and IBM Maximo, coordinating resolution across cross-functional teams.' or 'Maintained structured documentation, work instructions, and system guidelines to support transparency, knowledge transfer, and user adoption.' or 'Coordinated tasks and information flows between cross-functional teams using SAP, Microsoft Teams, and structured tracking processes.' Never write Jira, Confluence, or Atlassian as skills the candidate has unless they explicitly appear in the master list.",
    important:
      "Return JSON only. Write in the language specified by masterData._meta.language_default. Skills items must be localized strings from masterData.skills_master_list (de or en field). Certifications: select the most relevant subset from masterData.certifications_master_list; include the url field from each chosen entry. Do NOT output any skill or certification not present in the master lists.",
  };

  const maxRetries = 2;
  let lastError: unknown;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const resp = await anthropic.messages.create({
      model,
      max_tokens: 6000,
      temperature: 0.2,
      system: systemPrompt,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: `JD analysis and master data:\n${JSON.stringify(
                userPayload,
                null,
                2,
              )}`,
            },
          ],
        },
      ],
    });

    const text =
      resp.content?.find((b) => b.type === "text")?.text ??
      (typeof resp.content === "string" ? resp.content : "");

    if (!text) {
      lastError = new Error("Claude response missing text content.");
      continue;
    }

    try {
      const parsed = extractFirstJsonObject(text);
      return stage2OutputSchema.parse(parsed);
    } catch (err) {
      lastError = err;
    }
  }

  throw new Error(
    `Claude stage2 failed to produce valid JSON. Last error: ${String(
      lastError,
    )}`,
  );
}

export async function claudeShortenCoverLetter(
  cover: CoverLetterJSON,
  pages: number,
): Promise<CoverLetterJSON> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("Missing ANTHROPIC_API_KEY.");

  const anthropic = new Anthropic({ apiKey });

  const resp = await anthropic.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 3000,
    temperature: 0.2,
    system:
      "You shorten cover letter content to fit on exactly one printed page. Return ONLY valid JSON matching the exact same structure as the input. No markdown, no code fences.",
    messages: [
      {
        role: "user",
        content: [
          {
            type: "text",
            text: `This cover letter is rendering as ${pages} pages but must fit on ONE page.
Remove repetition and filler phrases. Prioritize key achievements and direct relevance. Keep all 5 skill bullet labels; shorten their descriptions. Keep all paragraph fields present — just make them shorter.
Return the SAME JSON structure with shortened content.

${JSON.stringify(cover, null, 2)}`,
          },
        ],
      },
    ],
  });

  const text = resp.content?.find((b) => b.type === "text")?.text ?? "";
  if (!text) throw new Error("claudeShortenCoverLetter: empty response.");

  const parsed = extractFirstJsonObject(text);
  return coverLetterSchema.parse(parsed);
}
