import JSZip from "jszip";
import { ResumeData, emptyResume, newId } from "@resume/shared/schema/resume";
import { parseLooseDate } from "@resume/shared/analysis/dates";
import { findSkill, findSkills } from "@resume/shared/analysis/skills";
import { UploadError } from "./extract";

/**
 * Import from LinkedIn's "Download your data" export (Settings → Data privacy → Get a copy
 * of your data). The ZIP holds one CSV per profile section. Only resume-relevant files are
 * read; birth date, address and other personal fields are skipped on purpose.
 */

const MAX_CSV_BYTES = 2 * 1024 * 1024;

const FILES = {
  profile: "profile.csv",
  positions: "positions.csv",
  education: "education.csv",
  skills: "skills.csv",
  certifications: "certifications.csv",
  projects: "projects.csv",
  emails: "email addresses.csv",
  phones: "phonenumbers.csv",
  languages: "languages.csv",
  honors: "honors.csv",
} as const;

type Row = Record<string, string>;

/** RFC 4180 CSV (quoted fields, doubled quotes, newlines inside quotes). */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  const s = text.replace(/^﻿/, "");
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (quoted) {
      if (c === '"') {
        if (s[i + 1] === '"') {
          field += '"';
          i++;
        } else quoted = false;
      } else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && s[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else field += c;
  }
  if (field || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((x) => x.trim()));
}

/** Rows as objects keyed by header. Some exports start with "Notes:" lines before the header. */
function records(text: string, expect: string): Row[] {
  const rows = parseCsv(text);
  const h = rows.findIndex((r) => r.some((x) => x.trim().toLowerCase() === expect.toLowerCase()));
  if (h < 0) return [];
  const header = rows[h].map((x) => x.trim());
  return rows.slice(h + 1).map((r) => Object.fromEntries(header.map((k, i) => [k, (r[i] ?? "").trim()])));
}

export function isLinkedInExport(zip: JSZip): boolean {
  const names = Object.keys(zip.files).map((n) => n.split("/").pop()!.toLowerCase());
  return names.includes(FILES.profile) || names.includes(FILES.positions);
}

const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s);
const date = (s: string) => parseLooseDate(s.replace(/^\d{1,2}\s+(?=[A-Za-z])/, "")); // "15 Jan 2020" -> "Jan 2020"

/** LinkedIn descriptions are free text; split into bullet-sized lines. */
function toBullets(desc: string, max: number) {
  return desc
    .split(/\r?\n|(?:^|\s)[•▪●◦]\s+/)
    .map((l) => l.replace(/^\s*[-*–•]\s*/, "").trim())
    .filter((l) => l.length > 2)
    .slice(0, max)
    .map((t) => ({ id: newId("b"), text: clip(t, 600), origin: "imported" as const }));
}

export interface LinkedInImport {
  data: ResumeData;
  text: string;
  warnings: string[];
  skipped: { title: string; lines: string[] }[];
  found: string[];
}

export async function parseLinkedInExport(zip: JSZip): Promise<LinkedInImport> {
  const byName = new Map<string, JSZip.JSZipObject>();
  zip.forEach((path, f) => {
    if (!f.dir) byName.set(path.split("/").pop()!.toLowerCase(), f);
  });
  const read = async (name: string) => {
    const f = byName.get(name);
    if (!f) return null;
    const size = (f as unknown as { _data?: { uncompressedSize?: number } })._data?.uncompressedSize ?? 0;
    if (size > MAX_CSV_BYTES) throw new UploadError(`${name} in the export is unusually large and was rejected.`, "too_large");
    const text = await f.async("string");
    if (text.length > MAX_CSV_BYTES) throw new UploadError(`${name} in the export is unusually large and was rejected.`, "too_large");
    return text;
  };

  const d = emptyResume();
  const warnings: string[] = [];
  const skippedPersonal: string[] = [];
  const found: string[] = [];
  const textParts: string[] = [];

  const profile = await read(FILES.profile);
  if (profile) {
    const p = records(profile, "First Name")[0];
    if (p) {
      found.push("Profile");
      d.contact.fullName = clip([p["First Name"], p["Last Name"]].filter(Boolean).join(" "), 120);
      d.contact.headline = clip(p["Headline"] ?? "", 160);
      d.contact.location = clip(p["Geo Location"] ?? "", 120);
      if (p["Summary"]) d.summary = { text: clip(p["Summary"], 1500), origin: "imported" };
      // Websites look like "[PORTFOLIO:https://x.dev,COMPANY:https://y.com]".
      for (const m of (p["Websites"] ?? "").matchAll(/(?:([A-Z_]+):)?(https?:\/\/[^,\]\s]+)/g))
        if (d.contact.links.length < 6) d.contact.links.push({ id: newId("l"), label: m[1] ? m[1][0] + m[1].slice(1).toLowerCase() : "Website", url: clip(m[2], 300) });
      for (const [k, label] of [["Birth Date", "Birth date"], ["Address", "Address"], ["Zip Code", "Zip code"], ["Maiden Name", "Maiden name"], ["Instant Messengers", "Instant messengers"]] as const)
        if (p[k]) skippedPersonal.push(label);
      textParts.push(`Profile: ${d.contact.fullName} | ${d.contact.headline} | ${d.contact.location}`, d.summary.text);
    }
  }

  const emails = await read(FILES.emails);
  if (emails) {
    const rs = records(emails, "Email Address");
    const primary = rs.find((r) => /yes/i.test(r["Primary"] ?? "")) ?? rs[0];
    if (primary) d.contact.email = clip(primary["Email Address"], 200);
  }
  const phones = await read(FILES.phones);
  if (phones) {
    const rs = records(phones, "Number");
    const ph = rs.find((r) => /mobile/i.test(r["Type"] ?? "")) ?? rs[0];
    if (ph) d.contact.phone = clip(ph["Number"], 40);
  }

  const positions = await read(FILES.positions);
  if (positions) {
    const rs = records(positions, "Company Name");
    if (rs.length) found.push(`${rs.length} position${rs.length > 1 ? "s" : ""}`);
    if (rs.length > 30) warnings.push("Only the 30 most recent positions were imported.");
    d.experience = rs.slice(0, 30).map((r) => {
      const end = r["Finished On"] ?? "";
      textParts.push(`Role: ${r["Title"]} | ${r["Company Name"]} | ${r["Started On"]} - ${end || "Present"}`, r["Description"] ?? "");
      return {
        id: newId("exp"),
        title: clip(r["Title"] ?? "", 120),
        company: clip(r["Company Name"] ?? "", 120),
        location: clip(r["Location"] ?? "", 120),
        employmentType: "",
        startDate: date(r["Started On"] ?? ""),
        endDate: end ? date(end) : "",
        current: !end,
        bullets: toBullets(r["Description"] ?? "", 20),
      };
    });
    if (d.experience.some((e) => e.bullets.length === 0))
      warnings.push("Some positions have no description on LinkedIn. Add 2–4 bullets with what you did and the result.");
  }

  const education = await read(FILES.education);
  if (education) {
    const rs = records(education, "School Name");
    if (rs.length) found.push(`${rs.length} education entr${rs.length > 1 ? "ies" : "y"}`);
    d.education = rs.slice(0, 15).map((r) => {
      textParts.push(`Education: ${r["Degree Name"]} | ${r["School Name"]} | ${r["Start Date"]} - ${r["End Date"]}`);
      return {
        id: newId("edu"),
        degree: clip(r["Degree Name"] ?? "", 160),
        field: "",
        institution: clip(r["School Name"] ?? "", 160),
        location: "",
        startDate: date(r["Start Date"] ?? ""),
        endDate: date(r["End Date"] ?? ""),
        grade: "",
        bullets: toBullets([r["Notes"], r["Activities"]].filter(Boolean).join("\n"), 10),
      };
    });
  }

  const skills = await read(FILES.skills);
  if (skills) {
    const names = [...new Set(records(skills, "Name").map((r) => r["Name"]).filter(Boolean))];
    if (names.length) found.push(`${names.length} skill${names.length > 1 ? "s" : ""}`);
    // Group by the skills taxonomy where we recognise the skill; the rest go under "Other".
    const groups = new Map<string, string[]>();
    for (const n of names) {
      const cat = findSkill(n)?.category ?? "Other";
      const g = groups.get(cat) ?? [];
      if (g.length < 60) g.push(clip(n, 80));
      groups.set(cat, g);
    }
    const ordered = [...groups.entries()].sort((a, b) => (a[0] === "Other" ? 1 : b[0] === "Other" ? -1 : b[1].length - a[1].length));
    d.skills = ordered.slice(0, 15).map(([category, items]) => ({ id: newId("sk"), category: ordered.length === 1 ? "" : category, items }));
    textParts.push(`Skills: ${names.join(", ")}`);
  }

  const certs = await read(FILES.certifications);
  if (certs) {
    const rs = records(certs, "Name");
    if (rs.length) found.push(`${rs.length} certification${rs.length > 1 ? "s" : ""}`);
    d.certifications = rs.slice(0, 30).map((r) => ({
      id: newId("cert"),
      name: clip(r["Name"] ?? "", 200),
      issuer: clip(r["Authority"] ?? "", 120),
      date: date(r["Started On"] ?? ""),
      url: clip(r["Url"] ?? "", 300),
    }));
    if (rs.some((r) => r["License Number"])) skippedPersonal.push("Certification licence numbers");
  }

  const projects = await read(FILES.projects);
  if (projects) {
    const rs = records(projects, "Title");
    if (rs.length) found.push(`${rs.length} project${rs.length > 1 ? "s" : ""}`);
    d.projects = rs.slice(0, 25).map((r) => {
      const text = r["Description"] ?? "";
      const tech = [...new Set(findSkills(text).map((h) => h.skill.name))].slice(0, 30);
      return {
        id: newId("prj"),
        name: clip(r["Title"] ?? "", 160),
        role: "",
        url: clip(r["Url"] ?? "", 300),
        technologies: tech,
        startDate: date(r["Started On"] ?? ""),
        endDate: date(r["Finished On"] ?? ""),
        bullets: toBullets(text, 12),
      };
    });
  }

  const additional: ResumeData["additional"] = [];
  const languages = await read(FILES.languages);
  if (languages) {
    const rs = records(languages, "Name");
    if (rs.length)
      additional.push({
        id: newId("add"),
        title: "Languages",
        bullets: [{ id: newId("b"), text: clip(rs.map((r) => (r["Proficiency"] ? `${r["Name"]} (${r["Proficiency"].replace(/ proficiency$/i, "").toLowerCase()})` : r["Name"])).join(", "), 600), origin: "imported" }],
      });
  }
  const honors = await read(FILES.honors);
  if (honors) {
    const rs = records(honors, "Title");
    if (rs.length)
      additional.push({
        id: newId("add"),
        title: "Awards",
        bullets: rs.slice(0, 20).map((r) => ({ id: newId("b"), text: clip([r["Title"], r["Description"]].filter(Boolean).join(": "), 600), origin: "imported" as const })),
      });
  }
  d.additional = additional;

  if (!found.length) throw new UploadError("This ZIP doesn't look like a LinkedIn data export (no Profile.csv or Positions.csv).", "unsupported");
  if (!d.experience.length && !positions) warnings.push("The export has no Positions.csv. Request the full archive, or add your experience after importing.");
  if (!d.contact.email) warnings.push("No email address was found. Add one before you export your resume.");
  if (skippedPersonal.length) warnings.push(`Not imported (personal details): ${skippedPersonal.join(", ")}.`);
  warnings.push("LinkedIn descriptions are often written for a profile, not a resume. Review each bullet, lead with an action verb, and keep only what's relevant.");

  return {
    data: ResumeData.parse(d),
    text: textParts.filter(Boolean).join("\n"),
    warnings,
    skipped: skippedPersonal.length ? [{ title: "Personal details", lines: skippedPersonal }] : [],
    found,
  };
}
