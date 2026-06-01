import type { CoverLetterJSON, ResumeJSON } from "./schemas";

const replacementsLatex: Array<[RegExp, string]> = [
  // Use `\charNN` to avoid relying on additional LaTeX packages.
  [/\\/g, String.raw`\char92`],
  [/[&]/g, String.raw`\&`],
  [/[%]/g, String.raw`\%`],
  [/\$/g, String.raw`\$`],
  [/#/g, String.raw`\#`],
  [/[_]/g, String.raw`\_`],
  [/[{]/g, String.raw`\{`],
  [/}/g, String.raw`\}`],
  [/[~]/g, String.raw`\char126`],
  [/\^/g, String.raw`\char94`],
];

export function escapeLatex(input: string): string {
  // Strip typographic dashes — they look AI-generated and break professional tone.
  let out = input.replace(/[–—]/g, "-");
  // Keep newlines predictable when Claude outputs multi-line paragraphs.
  out = out.replace(/\r?\n/g, String.raw`\\`);
  for (const [re, replacement] of replacementsLatex) out = out.replace(re, replacement);
  return out;
}

// URLs go into \href{} where only % is a comment char — don't escape & _ etc.
function escapeLatexUrl(url: string): string {
  return url.replace(/%/g, "\\%");
}

function bulletsToResumeItems(bullets: string[]): string {
  return bullets.map((b) => `\\resumeItem{${escapeLatex(b)}}`).join("\n");
}

function renderHackathonHeading(entry: { title: string; badge: string }): string {
  const t = escapeLatex(entry.title);
  if (entry.badge) {
    return `\\item \\textbf{${t}} \\hfill \\textit{\\textbf{${escapeLatex(entry.badge)}}}`;
  }
  return `\\item \\textbf{${t}}`;
}


export function renderResumeTex(template: string, resume: ResumeJSON): string {
  let out = template;

  // Tagline: Claude uses ' | ' as separator; render as LaTeX math mid-separator.
  const taglineParts = resume.tagline.split(" | ").map((p) => escapeLatex(p.trim()));
  out = out.replace("%%TAGLINE%%", taglineParts.join(" $\\mid$ "));

  out = out.replace(
    "%%BULLETS:job_1%%",
    bulletsToResumeItems(resume.experience_bullets.job_1),
  );
  out = out.replace(
    "%%BULLETS:job_2%%",
    bulletsToResumeItems(resume.experience_bullets.job_2),
  );
  out = out.replace(
    "%%BULLETS:job_3%%",
    bulletsToResumeItems(resume.experience_bullets.job_3),
  );

  const fallback = { title: "", badge: "" };
  out = out.replace(
    "%%HEADING:hackathon_1%%",
    renderHackathonHeading(resume.project_titles?.hackathon_1 ?? fallback),
  );
  out = out.replace(
    "%%HEADING:hackathon_2%%",
    renderHackathonHeading(resume.project_titles?.hackathon_2 ?? fallback),
  );
  out = out.replace(
    "%%HEADING:hackathon_3%%",
    renderHackathonHeading(resume.project_titles?.hackathon_3 ?? fallback),
  );

  out = out.replace(
    "%%BULLETS:hackathon_1%%",
    bulletsToResumeItems(resume.projects_bullets.hackathon_1),
  );
  out = out.replace(
    "%%BULLETS:hackathon_2%%",
    bulletsToResumeItems(resume.projects_bullets.hackathon_2),
  );
  out = out.replace(
    "%%BULLETS:hackathon_3%%",
    bulletsToResumeItems(resume.projects_bullets.hackathon_3),
  );

  out = out.replace(
    "%%BULLETS:leadership_1%%",
    bulletsToResumeItems(resume.leadership_bullets.leadership_1),
  );
  out = out.replace(
    "%%BULLETS:leadership_2%%",
    bulletsToResumeItems(resume.leadership_bullets.leadership_2),
  );

  // Skills: categorized bold-label format, e.g.:
  // \textbf{Datenanalyse \& Reporting:} Excel, Power BI, ...
  const skillsLatex = resume.skills
    .map((cat) => {
      const catEscaped = escapeLatex(cat.category);
      const itemsEscaped = cat.items.map(escapeLatex).join(", ");
      return `\\textbf{${catEscaped}:} ${itemsEscaped}`;
    })
    .join(String.raw`\\[5pt]` + "\n");
  out = out.replace("%%SKILLS%%", skillsLatex);

  // Certifications: clickable \href links when a URL is present.
  const certLines = resume.certifications.map((c) => {
    const text = escapeLatex(c.name);
    if (c.url) {
      return `\\href{${escapeLatexUrl(c.url)}}{${text}}`;
    }
    return text;
  });
  out = out.replace("%%CERTIFICATIONS%%", certLines.join(" \\\\\n"));

  return out;
}

export function renderCoverLetterTex(
  template: string,
  cover: CoverLetterJSON,
): string {
  let out = template;

  const tokenMap: Record<keyof CoverLetterJSON, string> = {
    COMPANY_NAME: "%%COMPANY_NAME%%",
    DEPARTMENT: "%%DEPARTMENT%%",
    COMPANY_LOCATION: "%%COMPANY_LOCATION%%",
    POSITION: "%%POSITION%%",
    OPENING_PARAGRAPH: "%%OPENING_PARAGRAPH%%",
    EXPERIENCE_PARAGRAPH: "%%EXPERIENCE_PARAGRAPH%%",
    LEADERSHIP_PARAGRAPH: "%%LEADERSHIP_PARAGRAPH%%",
    CLOSING_PARAGRAPH: "%%CLOSING_PARAGRAPH%%",
    SKILL_LABEL_1: "%%SKILL_LABEL_1%%",
    SKILL_DESCRIPTION_1: "%%SKILL_DESCRIPTION_1%%",
    SKILL_LABEL_2: "%%SKILL_LABEL_2%%",
    SKILL_DESCRIPTION_2: "%%SKILL_DESCRIPTION_2%%",
    SKILL_LABEL_3: "%%SKILL_LABEL_3%%",
    SKILL_DESCRIPTION_3: "%%SKILL_DESCRIPTION_3%%",
    SKILL_LABEL_4: "%%SKILL_LABEL_4%%",
    SKILL_DESCRIPTION_4: "%%SKILL_DESCRIPTION_4%%",
    SKILL_LABEL_5: "%%SKILL_LABEL_5%%",
    SKILL_DESCRIPTION_5: "%%SKILL_DESCRIPTION_5%%",
  };

  for (const [key, token] of Object.entries(tokenMap) as Array<
    [keyof CoverLetterJSON, string]
  >) {
    out = out.replace(token, escapeLatex(String(cover[key])));
  }

  return out;
}
