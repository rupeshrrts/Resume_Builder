import { findPhoneNumbersInText } from "libphonenumber-js/min";
import {
  ResumeData,
  emptyResume,
  newId,
  type Bullet,
  type Education,
  type Experience,
  type Project,
} from "@resume/shared/schema/resume";
import { parseDateRange, parseLooseDate, PRESENT_RE } from "@resume/shared/analysis/dates";
import { findSkills } from "@resume/shared/analysis/skills";
import { normalizeSpace } from "@resume/shared/analysis/text";

/**
 * Rule-based conversion of extracted resume text into structured sections.
 * Everything produced is marked origin "imported" and nothing is invented: fields
 * that can't be found are left empty and reported so the user can fill them in.
 */

export interface StructureResult {
  data: ResumeData;
  warnings: string[];
  /** Content deliberately not imported (e.g. personal details, declarations). */
  skipped: { title: string; lines: string[] }[];
  /** Lines that couldn't be placed in any section. */
  unplaced: string[];
}

type SectionKind = "summary" | "experience" | "education" | "skills" | "projects" | "certifications" | "additional" | "personal" | "contact";

const HEADINGS: { re: RegExp; kind: SectionKind }[] = [
  { re: /^(professional |career |executive )?(summary|profile|overview)$|^about( me)?$|^(career )?objective$|^professional profile$/, kind: "summary" },
  { re: /^(professional |work |relevant |employment |career )?(experience|history|background)$|^employment( history)?$|^work history$|^internships?( experience)?$|^experience (summary|details)$/, kind: "experience" },
  { re: /^(education|academic(s| background| qualifications?| details| record)?|educational (background|qualifications?)|qualifications?|scholastic record)$/, kind: "education" },
  { re: /^((technical|key|core|professional|it|relevant|software) )?(skills|competencies|expertise|proficiencies)( (&|and) (tools|technologies|abilities))?$|^technologies$|^tech(nical)? stack$|^tools( (&|and) technologies)?$|^skill set$|^areas of expertise$/, kind: "skills" },
  { re: /^((academic|personal|key|major|selected|notable) )?projects?( (undertaken|experience|work))?$/, kind: "projects" },
  { re: /^(certifications?|certificates?|licen[cs]es?( (&|and) certifications?)?|certifications? (&|and) (training|courses))$/, kind: "certifications" },
  { re: /^(personal (details|information|profile|data)|declaration|references( available on request)?|hobbies( (&|and) interests)?|strengths)$/, kind: "personal" },
  { re: /^(contact( (details|information))?)$/, kind: "contact" },
  {
    re: /^(awards?( (&|and) (honou?rs|achievements|recognition))?|honou?rs|achievements?|accomplishments|publications?|languages( known)?|volunteer(ing| experience| work)?|interests|activities|extra[- ]?curricular( activities)?|leadership( experience)?|positions? of responsibility|patents?|training(s)?( (&|and) workshops)?|workshops|courses|coursework|relevant coursework|conferences|memberships|affiliations|open source( contributions)?)$/,
    kind: "additional",
  },
];

function headingKind(line: string): { kind: SectionKind; title: string } | null {
  const t = normalizeSpace(line.replace(/[:|•▪\-–—_*#=]+$/, "").replace(/^[\s•▪\-–—_*#=]+/, ""));
  if (!t || t.length > 50 || /\d{4}/.test(t)) return null;
  const k = t.toLowerCase();
  for (const h of HEADINGS) if (h.re.test(k)) return { kind: h.kind, title: titleCase(t) };
  return null;
}

function titleCase(s: string) {
  if (s !== s.toUpperCase()) return s;
  return s.toLowerCase().replace(/\b([a-z])/g, (m) => m.toUpperCase()).replace(/\b(And|Of|In|On|For)\b/g, (m) => m.toLowerCase());
}

const BULLET_RE = /^\s*([•●▪◦‣■□➢➤►▶✓✔\-*–·o]|\d{1,2}[.)])\s+/;
const EMAIL_RE = /[\w.+-]+@[\w-]+(\.[\w-]+)+/;
const URL_RE = /\b((https?:\/\/)?(www\.)?(linkedin\.com\/in\/[\w-]+|github\.com\/[\w-]+(?:\/[\w.-]*[\w-])*|gitlab\.com\/[\w-]+(?:\/[\w.-]*[\w-])*|[\w-]+\.(dev|io|me|com|in|net|org)(\/[\w./-]*)?))\b/i;
const DATE_TOKEN = String.raw`(?:(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\.?,?\s*'?\d{2,4}|\d{1,2}[/-]\d{4}|\d{4}(?:-\d{2})?)`;
const RANGE_RE = new RegExp(String.raw`(${DATE_TOKEN})\s*(?:–|—|-|to|till|until)\s*(${DATE_TOKEN}|present|current|now|till date|to date|ongoing)`, "i");
const SINGLE_DATE_RE = new RegExp(String.raw`\b(${DATE_TOKEN})\b`, "i");

const TITLE_WORDS = /\b(engineer|developer|programmer|manager|analyst|intern|trainee|lead|consultant|designer|architect|specialist|executive|officer|associate|director|head|teacher|lecturer|professor|faculty|administrator|coordinator|assistant|scientist|technician|supervisor|accountant|advisor|representative|founder|co-founder|owner|president|vp|vice president|cto|ceo|cfo|tester|qa|sde|devops|sre|researcher|fellow|apprentice|clerk|operator|nurse|doctor|pharmacist|counsel|recruiter|partner|principal|staff)\b/i;
const COMPANY_WORDS = /\b(pvt|private|ltd|limited|inc|llc|llp|corp|corporation|company|co\.|technologies|technology|solutions|systems|services|labs|software|consulting|consultancy|industries|enterprises|group|bank|university|college|institute|hospital|school|foundation|agency|studio|networks|infotech|infosys|tcs|wipro|accenture|cognizant|capgemini|deloitte|google|microsoft|amazon)\b/i;
const STRONG_COMPANY = /\b(pvt|private limited|ltd|limited|inc|llc|llp|corp|corporation|gmbh|plc)\b\.?/i;
const INSTITUTION_WORDS = /\b(university|college|institute|school|iit|nit|iiit|bits|academy|vidyalaya|vidyapeeth|polytechnic|mahavidyalaya|faculty of|campus)\b/i;
const DEGREE_WORDS = /\b(b\.?\s?tech|m\.?\s?tech|b\.?\s?e\.?|m\.?\s?e\.?|b\.?\s?sc|m\.?\s?sc|bca|mca|mba|pgdm|b\.?\s?com|m\.?\s?com|bba|b\.?\s?a\.?|m\.?\s?a\.?|ph\.?\s?d|bachelor|master|diploma|doctorate|associate|class (x|xii|10|12)|(10|12)th|ssc|hsc|cbse|icse|higher secondary|secondary school|matriculation|intermediate|iti|b\.?\s?ed|m\.?\s?ed|llb|mbbs|ca\b|cs\b|cma)\b/i;
const GRADE_RE = /\b(cgpa|gpa|cpi|sgpa|percentage|grade|marks|score)\s*[:\-]?\s*([\d.]+\s*(\/\s*[\d.]+)?\s*%?)|\b(\d{2}(\.\d+)?\s*%)|\b(\d\.\d{1,2})\s*\/\s*(10|4)(\.0)?\b/i;

function stripBullet(l: string) {
  return l.replace(BULLET_RE, "").trim();
}

function mkBullet(text: string): Bullet {
  return { id: newId("b"), text: normalizeSpace(text).slice(0, 600), origin: "imported" };
}

function splitFragments(s: string): string[] {
  return s
    .split(/\s{3,}|\s*[|•·▪]\s*|\t|\s+[–—]\s+|\s+-\s+|,\s+(?=[A-Z])/)
    .map((x) => x.trim().replace(/^[,;:]+|[,;:]+$/g, "").trim())
    .filter(Boolean);
}

function takeDates(s: string): { rest: string; start: string; end: string; current: boolean } | null {
  const m = s.match(RANGE_RE);
  if (m) {
    const r = parseDateRange(`${m[1]} - ${m[2]}`);
    if (r) return { rest: normalizeSpace(s.replace(m[0], " ")), start: r.start, end: r.end, current: PRESENT_RE.test(m[2].trim()) || r.current };
  }
  const single = s.match(SINGLE_DATE_RE);
  if (single) {
    const d = parseLooseDate(single[1]);
    if (d) return { rest: normalizeSpace(s.replace(single[0], " ")), start: "", end: d, current: false };
  }
  return null;
}

function looksLikeLocation(s: string) {
  return /^[A-Z][a-zA-Z .]+,\s*[A-Z][a-zA-Z .]+$/.test(s) || /^(remote|hybrid|on-?site)$/i.test(s) || KNOWN_CITIES.test(s);
}
const KNOWN_CITIES = /^(bengaluru|bangalore|mumbai|pune|hyderabad|chennai|delhi|new delhi|ncr|gurugram|gurgaon|noida|kolkata|ahmedabad|jaipur|kochi|chandigarh|indore|nagpur|lucknow|bhubaneswar|coimbatore|thane|navi mumbai|london|new york|san francisco|seattle|singapore|dubai|berlin|toronto|sydney|remote)(,.*)?$/i;

// ---------------- section parsers ----------------

function parseContact(lines: string[], links: string[], out: ResumeData, warnings: string[]) {
  const text = lines.join("\n");
  out.contact.email = text.match(EMAIL_RE)?.[0] ?? "";
  try {
    const phones = findPhoneNumbersInText(text, "IN");
    // Keep the number exactly as the candidate wrote it.
    if (phones[0]) out.contact.phone = normalizeSpace(text.slice(phones[0].startsAt, phones[0].endsAt));
  } catch {
    /* ignore */
  }
  if (!out.contact.phone) {
    const m = text.match(/(\+?\d[\d\s().-]{8,}\d)/);
    if (m) out.contact.phone = normalizeSpace(m[1]);
  }
  const urls = new Set<string>();
  for (const l of links) if (!/^mailto:/i.test(l)) urls.add(l.replace(/\/$/, ""));
  for (const l of lines) for (const m of l.replace(new RegExp(EMAIL_RE, "g"), " ").matchAll(new RegExp(URL_RE, "gi"))) urls.add(m[0].replace(/\/$/, ""));
  for (const u of [...urls].slice(0, 5)) {
    const label = /linkedin/i.test(u) ? "LinkedIn" : /github/i.test(u) ? "GitHub" : /gitlab/i.test(u) ? "GitLab" : "Portfolio";
    if (out.contact.links.some((x) => x.url.replace(/^https?:\/\/(www\.)?/, "") === u.replace(/^https?:\/\/(www\.)?/, ""))) continue;
    out.contact.links.push({ id: newId("l"), label, url: u });
  }
  // Name: first short line of letters that isn't contact info or a heading.
  for (const l of lines.slice(0, 6)) {
    const t = normalizeSpace(l);
    if (!t || EMAIL_RE.test(t) || /\d{5,}/.test(t) || URL_RE.test(t) || headingKind(t)) continue;
    const nameish = t.replace(/[|,].*$/, "").trim();
    if (/^[A-Za-z.' -]{3,40}$/.test(nameish) && nameish.split(/\s+/).length <= 5) {
      out.contact.fullName = titleCase(nameish);
      break;
    }
  }
  if (!out.contact.fullName) warnings.push("Couldn't find your name at the top. Add it in Contact.");
  // Headline: a short descriptive line right after the name.
  const nameIdx = lines.findIndex((l) => out.contact.fullName && normalizeSpace(l).toLowerCase().startsWith(out.contact.fullName.toLowerCase()));
  const next = nameIdx >= 0 ? normalizeSpace(lines[nameIdx + 1] ?? "") : "";
  if (next && next.length < 90 && !EMAIL_RE.test(next) && !/\d{5,}/.test(next) && !URL_RE.test(next) && !headingKind(next) && /[a-z]/.test(next)) {
    out.contact.headline = next.split(/\s*[|•]\s*/)[0];
  }
  // Location: a fragment of the contact lines that looks like a place.
  for (const l of lines.slice(0, 8)) {
    // Contact lines separate fields with pipes/bullets; commas belong inside a location.
    for (const f of l.split(/\s*[|•·▪]\s*|\s{3,}|\t/).map((x) => x.trim()).filter(Boolean)) {
      if (EMAIL_RE.test(f) || URL_RE.test(f) || /\d{6,}/.test(f.replace(/\s/g, ""))) continue;
      const clean = f.replace(/^(location|address)\s*[:\-]\s*/i, "");
      if (looksLikeLocation(clean)) {
        out.contact.location = clean;
        return;
      }
    }
  }
}

/** Splits a section body into entries: a header block followed by bullet lines. */
function entries(lines: string[]): { header: string[]; body: string[] }[] {
  const out: { header: string[]; body: string[] }[] = [];
  let cur: { header: string[]; body: string[] } | null = null;
  let lastWasBulletMarker = false;
  for (const raw of lines) {
    const isMarker = BULLET_RE.test(raw);
    const t = normalizeSpace(raw);
    const looksHeader = !isMarker && (RANGE_RE.test(t) || (t.length < 90 && (TITLE_WORDS.test(t) || COMPANY_WORDS.test(t) || INSTITUTION_WORDS.test(t) || DEGREE_WORDS.test(t)) && !/[.;]$/.test(t) && t.split(/\s+/).length <= 14));
    if (looksHeader) {
      if (!cur || cur.body.length > 0) {
        cur = { header: [], body: [] };
        out.push(cur);
      }
      cur.header.push(t);
      lastWasBulletMarker = false;
      continue;
    }
    if (!cur) {
      cur = { header: [], body: [] };
      out.push(cur);
    }
    const text = stripBullet(raw);
    // Wrapped continuation of the previous bullet (common in PDFs).
    const prev = cur.body[cur.body.length - 1];
    if (!isMarker && prev !== undefined && (lastWasBulletMarker || /^[a-z(]/.test(text)) && !/[.!?]$/.test(prev)) {
      cur.body[cur.body.length - 1] = `${prev} ${text}`;
      continue;
    }
    if (!isMarker && cur.body.length === 0 && cur.header.length > 0 && text.length < 60 && !/[.]$/.test(text) && cur.header.length < 3) {
      cur.header.push(text);
      continue;
    }
    cur.body.push(text);
    lastWasBulletMarker = isMarker;
  }
  return out.filter((e) => e.header.length || e.body.length);
}

function parseExperience(lines: string[], warnings: string[], internSection: boolean): Experience[] {
  return entries(lines).map((e) => {
    const header = e.header.join("   ");
    const d = takeDates(header);
    const frags = splitFragments(d ? d.rest : header).filter((f) => !/^(present|current)$/i.test(f));
    let title = "";
    let company = "";
    let location = "";
    for (const f of frags) {
      if (!location && looksLikeLocation(f) && (title || company)) location = f;
      else if (!title && TITLE_WORDS.test(f) && !STRONG_COMPANY.test(f)) title = f;
      else if (!company && (COMPANY_WORDS.test(f) || title)) company = f;
      else if (!title) title = f;
      else if (!company) company = f;
    }
    // "Title at Company"
    const at = title.match(/^(.+?)\s+(?:at|@)\s+(.+)$/i);
    if (at && !company) {
      title = at[1];
      company = at[2];
    }
    const item: Experience = {
      id: newId("exp"),
      title,
      company,
      location,
      employmentType: internSection || /\bintern(ship)?\b/i.test(title) ? "Internship" : "",
      startDate: d?.start ?? "",
      endDate: d?.current ? "" : (d?.end ?? ""),
      current: d?.current ?? false,
      bullets: e.body.map(mkBullet),
    };
    if (!item.startDate) warnings.push(`No dates found for “${title || company || "an experience entry"}”.`);
    return item;
  });
}

function parseEducation(lines: string[]): Education[] {
  const blocks: string[][] = [];
  let cur: string[] = [];
  for (const raw of lines) {
    const t = stripBullet(raw);
    const startsEntry = DEGREE_WORDS.test(t) || INSTITUTION_WORDS.test(t);
    const curHasDegree = cur.some((x) => DEGREE_WORDS.test(x));
    const curHasInst = cur.some((x) => INSTITUTION_WORDS.test(x));
    if (cur.length && startsEntry && ((DEGREE_WORDS.test(t) && curHasDegree) || (INSTITUTION_WORDS.test(t) && !DEGREE_WORDS.test(t) && curHasInst))) {
      blocks.push(cur);
      cur = [];
    }
    cur.push(t);
  }
  if (cur.length) blocks.push(cur);
  return blocks.map((b) => {
    const joined = b.join("   ");
    const d = takeDates(joined);
    const grade = joined.match(GRADE_RE)?.[0]?.trim() ?? "";
    let degree = "";
    let institution = "";
    let field = "";
    let location = "";
    const details: string[] = [];
    for (const line of b) {
      for (const f of splitFragments(takeDates(line)?.rest ?? line)) {
        if (grade && f.includes(grade)) continue;
        if (!degree && DEGREE_WORDS.test(f)) {
          const m = f.match(/^(.*?)\s+(?:in|of)\s+(.+)$/i);
          if (m && m[2].length < 60) {
            degree = m[1];
            field = m[2];
          } else degree = f;
        } else if (!institution && INSTITUTION_WORDS.test(f)) institution = f;
        else if (!location && looksLikeLocation(f)) location = f;
        else if (f.length > 3 && !GRADE_RE.test(f)) details.push(f);
      }
    }
    if (!institution && details.length && degree) institution = details.shift()!;
    return {
      id: newId("edu"),
      degree,
      field,
      institution,
      location,
      startDate: d?.start ?? "",
      endDate: d?.current ? "" : (d?.end ?? ""),
      grade: grade.replace(/^(cgpa|gpa|cpi|percentage|grade|marks|score)\s*[:\-]?\s*/i, (m) => m.trim().replace(/[:\-]$/, "").toUpperCase() + ": "),
      bullets: details.filter((x) => x.split(/\s+/).length > 3).map(mkBullet),
    };
  });
}

function parseSkills(lines: string[]) {
  const groups: { id: string; category: string; items: string[] }[] = [];
  const loose: string[] = [];
  for (const raw of lines) {
    const t = stripBullet(raw);
    const m = t.match(/^([A-Za-z &/+().-]{2,40}?)\s*[:\-–]\s+(.+)$/);
    const items = (m ? m[2] : t)
      .split(/\s*[,;|•·▪]\s*|\s{3,}/)
      .map((s) => s.trim().replace(/\.$/, ""))
      .filter((s) => s && s.length <= 60);
    if (m && items.length) groups.push({ id: newId("sk"), category: titleCase(m[1].trim()), items });
    else loose.push(...items);
  }
  if (loose.length) groups.push({ id: newId("sk"), category: groups.length ? "Other" : "", items: loose });
  return groups.map((g) => ({ ...g, items: [...new Set(g.items)].slice(0, 60) }));
}

function parseProjects(lines: string[]): Project[] {
  const blocks = entries(lines);
  // Project headers rarely contain title words; treat any short non-bullet line followed by bullets as a header.
  const regrouped: { header: string[]; body: string[] }[] = [];
  for (const b of blocks) {
    if (b.header.length === 0 && regrouped.length === 0 && b.body.length) {
      let cur: { header: string[]; body: string[] } | null = null;
      for (const line of b.body) {
        const isHeader = line.length < 80 && !/[.:]$/.test(line) && !line.includes(":") && line.split(/\s+/).length <= 10;
        if (isHeader && (!cur || cur.body.length)) {
          cur = { header: [line], body: [] };
          regrouped.push(cur);
        } else if (cur) cur.body.push(line);
        else regrouped.push((cur = { header: [], body: [line] }));
      }
    } else regrouped.push(b);
  }
  return regrouped.map((b) => {
    const header = b.header.join("   ");
    const d = takeDates(header);
    const rest = d ? d.rest : header;
    const url = rest.match(URL_RE)?.[0] ?? "";
    let tech: string[] = [];
    const paren = rest.match(/\(([^)]+)\)/);
    const techLine = b.body.find((l) => /^(tech(nologies|nology| stack)?|tools|built with|stack)\s*[:\-]/i.test(l));
    if (techLine) tech = techLine.replace(/^[^:\-]+[:\-]\s*/, "").split(/\s*[,|/]\s*/).filter(Boolean);
    else if (paren && findSkills(paren[1]).length) tech = paren[1].split(/\s*[,|/]\s*/).filter(Boolean);
    const frags = splitFragments(rest.replace(url, "").replace(paren && tech.length ? paren[0] : "", ""));
    return {
      id: newId("prj"),
      name: frags[0] ?? "",
      role: frags.slice(1).find((f) => TITLE_WORDS.test(f)) ?? "",
      url,
      technologies: tech.map((t) => t.trim()).slice(0, 30),
      startDate: d?.start ?? "",
      endDate: d?.current ? "" : (d?.end ?? ""),
      bullets: b.body.filter((l) => l !== techLine).map(mkBullet),
    };
  });
}

function parseCertifications(lines: string[]) {
  return lines
    .map(stripBullet)
    .filter(Boolean)
    .map((l) => {
      const d = takeDates(l);
      const frags = splitFragments(d ? d.rest : l);
      return { id: newId("cert"), name: frags[0] ?? l, issuer: frags[1] ?? "", date: d?.end || d?.start || "", url: l.match(URL_RE)?.[0] ?? "" };
    });
}

// ---------------- main ----------------

export function structureResume(lines: string[], links: string[] = []): StructureResult {
  const out = emptyResume();
  const warnings: string[] = [];
  const skipped: StructureResult["skipped"] = [];
  const unplaced: string[] = [];
  const clean = lines.map((l) => l.replace(/ /g, " ").replace(/\s+$/, "")).filter((l) => l.trim());

  // Split into sections at recognised headings.
  const sections: { kind: SectionKind; title: string; lines: string[] }[] = [{ kind: "contact", title: "", lines: [] }];
  for (const l of clean) {
    const h = headingKind(l);
    if (h) sections.push({ ...h, lines: [] });
    else sections[sections.length - 1].lines.push(l);
  }
  const head = sections[0].lines;
  parseContact([...head.slice(0, 10), ...sections.filter((s) => s.kind === "contact").flatMap((s) => s.lines)], links, out, warnings);
  // Header lines beyond the contact block with no heading are usually a summary.
  const contactish = (l: string) =>
    EMAIL_RE.test(l) || URL_RE.test(l) || /\+?\d[\d\s().-]{8,}/.test(l) || normalizeSpace(l).toLowerCase() === out.contact.fullName.toLowerCase() || normalizeSpace(l) === out.contact.headline || splitFragments(l).some((f) => f === out.contact.location);
  const leftover = head.filter((l) => !contactish(l));
  if (leftover.join(" ").split(/\s+/).length > 15) {
    out.summary = { text: normalizeSpace(leftover.join(" ")).slice(0, 1500), origin: "imported" };
  }

  for (const s of sections.slice(1)) {
    switch (s.kind) {
      case "summary": {
        const t = normalizeSpace(s.lines.map(stripBullet).join(" "));
        out.summary = { text: (out.summary.text && out.summary.text !== t ? `${out.summary.text} ${t}` : t).slice(0, 1500), origin: "imported" };
        break;
      }
      case "experience":
        out.experience.push(...parseExperience(s.lines, warnings, /intern/i.test(s.title)));
        break;
      case "education":
        out.education.push(...parseEducation(s.lines));
        break;
      case "skills":
        out.skills.push(...parseSkills(s.lines));
        break;
      case "projects":
        out.projects.push(...parseProjects(s.lines));
        break;
      case "certifications":
        out.certifications.push(...parseCertifications(s.lines));
        break;
      case "additional":
        out.additional.push({ id: newId("add"), title: s.title, bullets: s.lines.map(stripBullet).filter(Boolean).map(mkBullet) });
        break;
      case "personal":
        skipped.push({ title: s.title, lines: s.lines });
        break;
      case "contact":
        break;
    }
  }
  if (sections.length === 1) {
    warnings.push("No standard section headings were found, so the text couldn't be split into sections. It has been placed in the summary for you to move.");
    unplaced.push(...head.filter((l) => !contactish(l)));
    out.summary = { text: "", origin: "imported" };
  }
  if (!out.experience.length && !out.projects.length) warnings.push("No experience or projects section was recognised.");
  if (!out.education.length) warnings.push("No education section was recognised.");
  if (!out.skills.length) warnings.push("No skills section was recognised.");
  if (skipped.length) warnings.push(`Not imported (personal details are usually left off): ${skipped.map((s) => s.title).join(", ")}.`);
  return { data: ResumeData.parse(out), warnings, skipped, unplaced };
}
