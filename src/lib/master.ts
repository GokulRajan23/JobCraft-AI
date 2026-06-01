import masterJson from "../../data/master.json";

type MasterFile = {
  _meta?: { language_default?: string };
  skills_master_list?: Array<{ id: string; de: string; en: string }>;
};

export type MasterJSON = typeof masterJson;

const masterFile = masterJson as unknown as MasterFile;

export function getDefaultLanguage(): "de" | "en" {
  const lang = masterFile._meta?.language_default;
  return lang === "en" ? "en" : "de";
}

export function getMasterSkills(
  language: "de" | "en" = getDefaultLanguage(),
): string[] {
  const list = masterFile.skills_master_list ?? [];
  return list.map((s) => (language === "en" ? s.en : s.de)).filter(Boolean);
}

export function getMasterData(): MasterJSON {
  return masterJson as MasterJSON;
}

