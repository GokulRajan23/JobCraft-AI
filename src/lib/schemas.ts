import { z } from "zod";

export const scoreCategorySchema = z.object({
  score: z.number().min(0).max(100),
  weight: z.number().min(0).max(100),
});

export const scoreBreakdownSchema = z.object({
  required_skills: scoreCategorySchema,
  preferred_skills: scoreCategorySchema,
  domain_alignment: scoreCategorySchema,
  seniority_level_match: scoreCategorySchema,
  keyword_density: scoreCategorySchema,
});

export const deepSeekAnalysisSchema = z.object({
  company_name: z.string(),
  job_title: z.string(),
  ats_keywords: z.array(z.string()),
  recruiter_intent: z.string(),
  missing_skills: z.array(z.string()),
  job_type: z.string(),
  repeated_terms: z.array(z.string()),
  responsibilities: z.array(z.string()),
  match_score: z.number().min(0).max(100),
  score_breakdown: scoreBreakdownSchema,
});

export type DeepSeekAnalysis = z.infer<typeof deepSeekAnalysisSchema>;

const strictJobBulletGroupSchema = z.object({
  job_1: z.array(z.string()),
  job_2: z.array(z.string()),
  job_3: z.array(z.string()),
});

const strictHackathonBulletGroupSchema = z.object({
  hackathon_1: z.array(z.string()),
  hackathon_2: z.array(z.string()),
  hackathon_3: z.array(z.string()),
});

const projectTitleEntrySchema = z.object({
  title: z.string(),
  badge: z.string(),
});

const projectTitlesSchema = z.object({
  hackathon_1: projectTitleEntrySchema,
  hackathon_2: projectTitleEntrySchema,
  hackathon_3: projectTitleEntrySchema,
});

const strictLeadershipBulletGroupSchema = z.object({
  leadership_1: z.array(z.string()),
  leadership_2: z.array(z.string()),
});

const resumeSkillCategorySchema = z.object({
  category: z.string(),
  items: z.array(z.string()),
});

export const resumeSchema = z.object({
  tagline: z.string(),
  experience_bullets: strictJobBulletGroupSchema,
  projects_bullets: strictHackathonBulletGroupSchema,
  leadership_bullets: strictLeadershipBulletGroupSchema,
  skills: z.array(resumeSkillCategorySchema),
  certifications: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      issuer: z.string(),
      url: z.string().optional(),
    }),
  ),
  project_titles: projectTitlesSchema.optional(),
});

export type ResumeJSON = z.infer<typeof resumeSchema>;

export const coverLetterSchema = z.object({
  COMPANY_NAME: z.string(),
  DEPARTMENT: z.string(),
  COMPANY_LOCATION: z.string(),
  POSITION: z.string(),
  OPENING_PARAGRAPH: z.string(),
  EXPERIENCE_PARAGRAPH: z.string(),
  LEADERSHIP_PARAGRAPH: z.string(),
  CLOSING_PARAGRAPH: z.string(),
  SKILL_LABEL_1: z.string(),
  SKILL_DESCRIPTION_1: z.string(),
  SKILL_LABEL_2: z.string(),
  SKILL_DESCRIPTION_2: z.string(),
  SKILL_LABEL_3: z.string(),
  SKILL_DESCRIPTION_3: z.string(),
  SKILL_LABEL_4: z.string(),
  SKILL_DESCRIPTION_4: z.string(),
  SKILL_LABEL_5: z.string(),
  SKILL_DESCRIPTION_5: z.string(),
});

export type CoverLetterJSON = z.infer<typeof coverLetterSchema>;

export const stage2OutputSchema = z.object({
  resume: resumeSchema,
  cover_letter: coverLetterSchema,
  clarification_needed: z.string().nullable(),
});

export type Stage2Output = z.infer<typeof stage2OutputSchema>;

// Used for validating user input to the analyze route.
export const analyzeRequestSchema = z.object({
  jd: z.string().min(1),
  skills: z.array(z.string()).min(1),
});

export type AnalyzeRequest = z.infer<typeof analyzeRequestSchema>;

// Used for validating user input to the generate route.
export const generateRequestSchema = z.object({
  analysis: deepSeekAnalysisSchema,
  masterData: z.unknown(),
  clarification: z.string().optional(),
});

export type GenerateRequest = z.infer<typeof generateRequestSchema>;

