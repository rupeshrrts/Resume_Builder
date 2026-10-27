import { Document, Link, Page, StyleSheet, Text, View, renderToBuffer } from "@react-pdf/renderer";
import { AlignmentType, Document as DocxDocument, Packer, Paragraph, ShadingType, TextRun } from "docx";
import type { ResumeData, ResumeSettings } from "@resume/shared/schema/resume";
import { TEMPLATES } from "@resume/shared/render/templates";
import { displayUrl, hrefFor } from "@resume/shared/render/model";
import { makeFontSafe, planDocxFonts, registerPdfFonts, withPdfFonts } from "./fonts";

/**
 * Cover letters rendered with the same letterhead (name, contact, fonts, colour) as the
 * resume's template, so the two documents look like a matched set.
 */

interface LetterDoc {
  resume: ResumeData;
  settings: ResumeSettings;
  body: string;
}

function contactItems(r: ResumeData) {
  const items: { text: string; href: string | null }[] = [];
  if (r.contact.email) items.push({ text: r.contact.email, href: `mailto:${r.contact.email}` });
  if (r.contact.phone) items.push({ text: r.contact.phone, href: null });
  if (r.contact.location) items.push({ text: r.contact.location, href: null });
  for (const l of r.contact.links) if (l.url.trim()) items.push({ text: displayUrl(l.url), href: hrefFor(l.url) });
  return items;
}

const today = (market: ResumeSettings["market"]) =>
  new Date().toLocaleDateString(market === "US" ? "en-US" : "en-GB", { day: "numeric", month: "long", year: "numeric" });

export async function renderLetterPdf(l: LetterDoc): Promise<{ buffer: Buffer; replaced: string[] }> {
  registerPdfFonts();
  const s = l.settings;
  const t = TEMPLATES[s.template];
  const body = s.fontFamily;
  const head = s.headingFont ?? s.fontFamily;
  const replaced = new Set<string>();
  const fix = (x: string) => {
    const r = makeFontSafe(x, [...new Set([body, head])]);
    r.replaced.forEach((c) => replaced.add(c));
    return r.text;
  };
  const face = (id: typeof body, bold = false) =>
    id === "Helvetica" ? { fontFamily: bold ? "Helvetica-Bold" : "Helvetica" } : id === "Times-Roman" ? { fontFamily: bold ? "Times-Bold" : "Times-Roman" } : { fontFamily: id, fontWeight: bold ? 700 : 400 };
  const accent = t.useAccent && s.accentColor ? s.accentColor : t.header === "band" ? "#1f2937" : "#000000";
  const band = t.header === "band";
  const align = t.header === "center" ? "center" : "left";
  const st = StyleSheet.create({
    page: { padding: s.margin, paddingTop: band ? 0 : s.margin, ...face(body), fontSize: s.fontSize + 0.5, lineHeight: 1.45, color: "#111827", fontFeatureSettings: { liga: false, clig: false } },
    band: { backgroundColor: accent, marginHorizontal: -s.margin, paddingHorizontal: s.margin, paddingTop: s.margin * 0.8, paddingBottom: 14, marginBottom: 18 },
    name: { ...face(head, true), fontSize: t.nameSize * 0.9, color: band ? "#ffffff" : accent, textAlign: align, letterSpacing: t.tracking },
    contact: { flexDirection: "row", flexWrap: "wrap", justifyContent: align === "center" ? "center" : "flex-start", marginTop: 4 },
    item: { fontSize: s.fontSize - 0.5, color: band ? "#f3f4f6" : "#374151" },
    sep: { fontSize: s.fontSize - 0.5, color: band ? "#c7d2fe" : "#9ca3af", marginHorizontal: 5 },
    rule: { borderBottomWidth: 0.75, borderBottomColor: accent, marginTop: 10, marginBottom: 18 },
    date: { marginBottom: 14, color: "#374151" },
    para: { marginBottom: 9 },
  });
  const r = l.resume;
  const items = contactItems(r);
  const header = (
    <>
      <Text style={st.name}>{fix(t.nameCase === "upper" ? r.contact.fullName.toUpperCase() : r.contact.fullName)}</Text>
      <View style={st.contact}>
        {items.flatMap((c, i) => {
          const node = c.href ? (
            <Link key={`c${i}`} src={c.href} style={[st.item, { textDecoration: "none" }]}>
              {fix(c.text)}
            </Link>
          ) : (
            <Text key={`c${i}`} style={st.item}>{fix(c.text)}</Text>
          );
          return i ? [<Text key={`s${i}`} style={st.sep}>·</Text>, node] : [node];
        })}
      </View>
    </>
  );
  const paragraphs = l.body.replace(/\r/g, "").split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
  const page = (
    <Document title={`${r.contact.fullName} - Cover letter`} author={r.contact.fullName || undefined} creator="Resume Builder" producer="Resume Builder">
      <Page size={s.pageSize} style={st.page}>
        {band ? <View style={st.band}>{header}</View> : <View>{header}<View style={st.rule} /></View>}
        <Text style={st.date}>{today(s.market)}</Text>
        {paragraphs.map((p, i) => (
          <Text key={i} style={st.para}>{fix(p)}</Text>
        ))}
      </Page>
    </Document>
  );
  const buffer = await withPdfFonts(() => renderToBuffer(page));
  return { buffer, replaced: [...replaced] };
}

export async function renderLetterDocx(l: LetterDoc): Promise<Buffer> {
  const s = l.settings;
  const t = TEMPLATES[s.template];
  const fonts = planDocxFonts(s.fontFamily, s.headingFont ?? s.fontFamily);
  const accent = (t.useAccent && s.accentColor ? s.accentColor : t.header === "band" ? "#1f2937" : "#000000").replace("#", "");
  const band = t.header === "band";
  const align = t.header === "center" ? AlignmentType.CENTER : AlignmentType.LEFT;
  const r = l.resume;
  const shade = band ? { shading: { type: ShadingType.CLEAR, color: "auto", fill: accent } } : {};
  const children: Paragraph[] = [
    new Paragraph({ alignment: align, ...shade, children: [new TextRun({ text: t.nameCase === "upper" ? r.contact.fullName.toUpperCase() : r.contact.fullName, bold: true, font: fonts.heading, size: Math.round(t.nameSize * 1.8), color: band ? "FFFFFF" : accent })] }),
    new Paragraph({
      alignment: align,
      ...shade,
      border: band ? undefined : { bottom: { style: "single", size: 6, color: accent, space: 6 } },
      spacing: { after: 360 },
      children: [new TextRun({ text: contactItems(r).map((c) => c.text).join("  ·  "), size: Math.round((s.fontSize - 0.5) * 2), color: band ? "F3F4F6" : "374151" })],
    }),
    new Paragraph({ spacing: { after: 240 }, children: [new TextRun({ text: today(s.market), color: "374151" })] }),
    ...l.body
      .replace(/\r/g, "")
      .split(/\n{2,}/)
      .map((p) => p.trim())
      .filter(Boolean)
      .map((p) => new Paragraph({ spacing: { after: 180, line: 300 }, children: p.split("\n").flatMap((line, i) => (i ? [new TextRun({ text: line, break: 1 })] : [new TextRun({ text: line })])) })),
  ];
  const doc = new DocxDocument({
    creator: "Resume Builder",
    title: `${r.contact.fullName} - Cover letter`,
    fonts: fonts.embedded.map((f) => ({ name: f.name, data: f.data, bold: f.bold })),
    styles: { default: { document: { run: { font: fonts.body, size: Math.round((s.fontSize + 0.5) * 2), color: "111827" } } } },
    sections: [{ properties: { page: { margin: { top: band ? 360 : s.margin * 20, bottom: s.margin * 20, left: s.margin * 20, right: s.margin * 20 } } }, children }],
  });
  return Packer.toBuffer(doc);
}
