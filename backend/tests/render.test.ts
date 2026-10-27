import { describe, expect, it } from "vitest";
import { buildDocument } from "@resume/shared/render/model";
import { renderPdf } from "@/render/pdf";
import { renderDocx } from "@/render/docx";
import { renderText } from "@resume/shared/render/text";
import { validateDocx, validatePdf } from "@/render/validate";
import { extractFile } from "@/parse/extract";
import { structureResume } from "@/parse/structure";
import { TEMPLATES, templateDefaults } from "@resume/shared/render/templates";
import { sampleResume, sampleSettings } from "./fixtures/sample";
import type { TemplateId } from "@resume/shared/schema/resume";

describe("export pipeline", () => {
  for (const template of Object.keys(TEMPLATES) as TemplateId[]) {
    it(`PDF (${template}) re-extracts with all content, links and no blank pages`, async () => {
      const doc = buildDocument(sampleResume(), sampleSettings({ template, accentColor: "#1f4e79" }));
      const { buffer, replaced } = await renderPdf(doc);
      expect(buffer.subarray(0, 5).toString()).toBe("%PDF-");
      const v = await validatePdf(buffer, doc, replaced);
      for (const c of v.checks) if (c.name !== "Last page") expect(c.ok, `${c.name}: ${c.detail}`).toBe(true);
      expect(v.pages).toBe(1);
      expect(v.coverage).toBe(100);
    });
  }

  it("DOCX re-extracts with all content, real headings, links, no tables", async () => {
    const doc = buildDocument(sampleResume(), sampleSettings({ template: "modern" }));
    const buf = await renderDocx(doc);
    const v = await validateDocx(buf, doc);
    for (const c of v.checks) expect(c.ok, `${c.name}: ${c.detail}`).toBe(true);
  });

  it("prints the chosen summary heading", async () => {
    const doc = buildDocument(sampleResume(), sampleSettings({ ...templateDefaults("professional"), summaryTitle: "Professional Summary" }));
    expect(doc.sections[0].title).toBe("PROFESSIONAL SUMMARY");
    const { buffer, replaced } = await renderPdf(doc);
    const v = await validatePdf(buffer, doc, replaced);
    expect(v.extractedText).toContain("PROFESSIONAL SUMMARY");
    expect(v.missing).toEqual([]);
    expect(buildDocument(sampleResume(), sampleSettings()).sections[0].title).toBe("SUMMARY");
  });

  it("one export never corrupts the text of the next", async () => {
    // A Professional résumé (bold 11.25pt skill labels) used to leave a later Minimal one
    // drawing "B.Tech" as ".Tech", because font objects were shared between documents.
    await renderPdf(buildDocument(sampleResume(), sampleSettings(templateDefaults("professional"))));
    const doc = buildDocument(sampleResume(), sampleSettings(templateDefaults("minimal")));
    const { buffer, replaced } = await renderPdf(doc);
    const v = await validatePdf(buffer, doc, replaced);
    expect(v.missing).toEqual([]);
    expect(v.extractedText).toContain("B.Tech in Computer Science");
  });

  it("renders concurrent exports correctly", async () => {
    const docs = (["professional", "minimal", "compact", "modern"] as const).map((t) => buildDocument(sampleResume(), sampleSettings(templateDefaults(t))));
    const results = await Promise.all(docs.map((d) => renderPdf(d)));
    for (const [i, r] of results.entries()) expect((await validatePdf(r.buffer, docs[i], r.replaced)).missing).toEqual([]);
  });

  it("'Fit on one page' tightens a résumé that just spills over; 'Continue' moves the rest to page 2", async () => {
    const pages = async (r: ReturnType<typeof sampleResume>, pageFit: "continue" | "fit") => {
      const doc = buildDocument(r, sampleSettings({ ...templateDefaults("professional"), pageFit }));
      const { buffer, replaced } = await renderPdf(doc);
      const v = await validatePdf(buffer, doc, replaced);
      expect(v.missing).toEqual([]);
      return v.pages ?? 0;
    };
    // Add bullets until the résumé just runs onto a second page.
    const r = sampleResume();
    for (let i = 0; (await pages(r, "continue")) < 2 && i < 30; i++)
      r.experience[0].bullets.push({ id: `extra${i}`, text: "Reviewed pull requests and wrote design notes for the payments team.", origin: "user" });
    expect(await pages(r, "continue")).toBe(2);
    expect(await pages(r, "fit")).toBe(1);
    // Far too long to fit: keeps the normal layout rather than a cramped two pages.
    for (let i = 0; i < 4; i++) r.experience.push({ ...structuredClone(r.experience[1]), id: `long${i}` });
    const long = buildDocument(r, sampleSettings({ ...templateDefaults("professional"), pageFit: "fit" }));
    const normal = buildDocument(r, sampleSettings(templateDefaults("professional")));
    expect((await renderPdf(long)).buffer.length).toBe((await renderPdf(normal)).buffer.length);
  });

  it("starts a section or an entry on a new page when the user asks", async () => {
    const pagesOf = async (r: ReturnType<typeof sampleResume>, extra: Parameters<typeof sampleSettings>[0] = {}) => {
      const doc = buildDocument(r, sampleSettings({ ...templateDefaults("professional"), ...extra }));
      const { buffer, replaced } = await renderPdf(doc);
      const v = await validatePdf(buffer, doc, replaced);
      expect(v.missing).toEqual([]);
      const docx = await validateDocx(await renderDocx(doc), doc);
      expect(docx.missing).toEqual([]);
      return v.pages;
    };
    expect(await pagesOf(sampleResume())).toBe(1);
    expect(await pagesOf(sampleResume(), { pageBreaks: ["projects"] })).toBe(2);
    const r = sampleResume();
    r.experience[1].pageBreakBefore = true;
    expect(await pagesOf(r)).toBe(2);
    // "Fit on one page" leaves a user's own page break alone.
    expect(await pagesOf(r, { pageFit: "fit" })).toBe(2);
    const docx = await renderDocx(buildDocument(r, sampleSettings(templateDefaults("professional"))));
    const JSZip = (await import("jszip")).default;
    const xml = await (await JSZip.loadAsync(docx)).file("word/document.xml")!.async("string");
    expect(xml).toContain("<w:pageBreakBefore/>");
  });

  it("plain text contains every section in order", () => {
    const txt = renderText(buildDocument(sampleResume(), sampleSettings()));
    const order = ["SUMMARY", "EXPERIENCE", "PROJECTS", "SKILLS", "EDUCATION", "CERTIFICATIONS", "LANGUAGES"].map((h) => txt.indexOf(`\n${h}\n`));
    expect(order.every((i) => i > 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    expect(txt).toContain("Software Engineer II, Finlytics Technologies Pvt Ltd, Pune | Apr 2022 – Present");
  });

  it("reports characters the PDF font cannot show instead of silently dropping them", async () => {
    const r = sampleResume();
    r.summary.text = "Managed a ₹2 crore budget → delivered on time.";
    const doc = buildDocument(r, sampleSettings());
    const { buffer, replaced } = await renderPdf(doc);
    expect(replaced).toEqual(expect.arrayContaining(["₹", "→"]));
    const v = await validatePdf(buffer, doc, replaced);
    expect(v.checks.find((c) => c.name === "Characters")!.ok).toBe(false);
    expect(v.missing).toEqual([]);
    expect(v.extractedText).toContain("Rs.2 crore");
  });

  it("long resumes break across pages without blank pages", async () => {
    const r = sampleResume();
    for (let i = 0; i < 6; i++) r.experience.push({ ...structuredClone(r.experience[1]), id: `extra${i}`, company: `Company ${i}` });
    const doc = buildDocument(r, sampleSettings());
    const { buffer, replaced } = await renderPdf(doc);
    const v = await validatePdf(buffer, doc, replaced);
    expect(v.pages).toBeGreaterThan(1);
    expect(v.checks.find((c) => c.name === "No blank pages")!.ok).toBe(true);
    expect(v.missing).toEqual([]);
  });
});

describe("premium templates with embedded fonts", () => {
  for (const template of Object.keys(TEMPLATES) as TemplateId[]) {
    it(`${template}: embedded-font PDF and DOCX re-extract completely`, async () => {
      const doc = buildDocument(sampleResume(), sampleSettings(templateDefaults(template)));
      const { buffer, replaced } = await renderPdf(doc);
      const v = await validatePdf(buffer, doc, replaced);
      for (const c of v.checks) if (c.name !== "Last page") expect(c.ok, `${c.name}: ${c.detail}`).toBe(true);
      const docx = await renderDocx(doc);
      const w = await validateDocx(docx, doc);
      for (const c of w.checks) expect(c.ok, `${c.name}: ${c.detail}`).toBe(true);
    });
  }

  it("keeps ₹ and accented names with fonts that support them", async () => {
    const r = sampleResume();
    r.contact.fullName = "Ānanya Rāo";
    r.summary.text = "Managed a ₹2 crore budget → delivered on time.";
    const doc = buildDocument(r, sampleSettings(templateDefaults("modern")));
    const { buffer, replaced } = await renderPdf(doc);
    expect(replaced).toEqual([]);
    const v = await validatePdf(buffer, doc, replaced);
    expect(v.extractedText).toContain("₹2 crore");
    expect(v.missing).toEqual([]);
  });

  it("embeds small fonts in DOCX and substitutes large ones", async () => {
    const JSZip = (await import("jszip")).default;
    const inter = await renderDocx(buildDocument(sampleResume(), sampleSettings(templateDefaults("modern"))));
    const z1 = await JSZip.loadAsync(inter);
    expect(Object.keys(z1.files).some((n) => n.startsWith("word/fonts/"))).toBe(true);
    const merri = buildDocument(sampleResume(), sampleSettings({ ...templateDefaults("modern"), fontFamily: "Merriweather" }));
    const w = await validateDocx(await renderDocx(merri), merri);
    expect(w.checks.find((c) => c.name === "Fonts")!.detail).toMatch(/Georgia/);
  });

  it("never hyphenates words (keywords must survive extraction)", async () => {
    const r = sampleResume();
    r.summary.text = "Internationalization containerization microservices observability ".repeat(12);
    const doc = buildDocument(r, sampleSettings(templateDefaults("executive")));
    const { buffer, replaced } = await renderPdf(doc);
    const v = await validatePdf(buffer, doc, replaced);
    expect(v.extractedText).not.toMatch(/Internationaliza-|containeriza-/);
    expect(v.missing).toEqual([]);
  });
});

describe("round trip: export, re-import, structure", () => {
  it("our PDF parses back into the same sections and key facts", async () => {
    const doc = buildDocument(sampleResume(), sampleSettings());
    const { buffer } = await renderPdf(doc);
    const ex = await extractFile(new Uint8Array(buffer));
    expect(ex.layout.columns).toBe(1);
    expect(ex.layout.imageOnly).toBe(false);
    const s = structureResume(ex.lines, ex.links);
    expect(s.data.contact.fullName).toBe("Priya Sharma");
    expect(s.data.contact.email).toBe("priya.sharma@example.com");
    expect(s.data.contact.phone.replace(/\D/g, "")).toContain("9876543210");
    expect(s.data.contact.links.map((l) => l.url).join(" ")).toMatch(/linkedin\.com\/in\/priya-sharma-dev/);
    expect(s.data.experience).toHaveLength(2);
    expect(s.data.experience[0]).toMatchObject({ title: "Software Engineer II", company: "Finlytics Technologies Pvt Ltd", startDate: "2022-04", current: true });
    expect(s.data.experience[0].bullets).toHaveLength(3);
    expect(s.data.experience[1]).toMatchObject({ startDate: "2020-07", endDate: "2022-03" });
    expect(s.data.education[0].institution).toBe("College of Engineering Pune");
    expect(s.data.education[0].degree).toMatch(/B\.Tech/);
    expect(s.data.skills.flatMap((g) => g.items)).toEqual(expect.arrayContaining(["Java", "Kubernetes", "PostgreSQL"]));
    expect(s.data.projects[0].name).toBe("Expense Splitter");
    expect(s.data.certifications[0].name).toMatch(/AWS Certified Developer/);
  });

  it("our DOCX parses back too", async () => {
    const doc = buildDocument(sampleResume(), sampleSettings({ template: "modern" }));
    const buf = await renderDocx(doc);
    const ex = await extractFile(new Uint8Array(buf));
    expect(ex.format).toBe("docx");
    expect(ex.layout.tables).toBe(0);
    const s = structureResume(ex.lines, ex.links);
    expect(s.data.experience).toHaveLength(2);
    expect(s.data.experience[0].title).toBe("Software Engineer II");
    expect(s.data.contact.links.length).toBeGreaterThanOrEqual(2);
  });
});
