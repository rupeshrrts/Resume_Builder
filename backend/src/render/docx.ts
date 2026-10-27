import {
  AlignmentType,
  BorderStyle,
  Document,
  ExternalHyperlink,
  HeadingLevel,
  LevelFormat,
  Packer,
  Paragraph,
  ShadingType,
  TabStopType,
  TextRun,
} from "docx";
import type { DocModel } from "@resume/shared/render/model";
import { boldSpans } from "@resume/shared/render/rich";
import { typeScale } from "@resume/shared/render/templates";
import { planDocxFonts } from "./fonts";
import { bodyFont, fitDocument, headingFont } from "./pdf";

/**
 * Editable DOCX built from real Word structures: Heading 1 for section titles, a bullet
 * numbering list, a right tab stop for dates, and live hyperlinks. No tables or text boxes.
 * Template styling (colour band, centred or barred headings) uses paragraph shading and borders.
 */

const PAGE = { A4: { w: 11906, h: 16838 }, LETTER: { w: 12240, h: 15840 } };

export async function renderDocx(model: DocModel): Promise<Buffer> {
  // "Fit on one page" uses the same tightened settings the PDF settled on.
  const doc = await fitDocument(model);
  const s = doc.settings;
  const t = doc.template;
  const fonts = planDocxFonts(bodyFont(doc), headingFont(doc));
  const half = (pt: number) => Math.round(pt * 2);
  const tw = (pt: number) => Math.round(pt * 20);
  const accent = (t.useAccent && s.accentColor ? s.accentColor : t.header === "band" ? "#1f2937" : "#000000").replace("#", "");
  const headingColor = t.headingColor === "muted" ? "6B7280" : t.headingColor === "accent" ? accent : "111827";
  const muted = "4B5563";
  const page = PAGE[s.pageSize];
  const contentWidth = page.w - tw(s.margin) * 2;
  const line = Math.round(240 * s.lineHeight);
  const d = t.density;
  const ts = typeScale(t, s.fontSize);
  const band = t.header === "band";
  const align = t.header === "center" ? AlignmentType.CENTER : AlignmentType.LEFT;
  const onBand = (extra: object = {}) => (band ? { shading: { type: ShadingType.CLEAR, color: "auto", fill: accent }, ...extra } : extra);
  const headerColor = band ? "FFFFFF" : undefined;
  const stacked = t.entryLayout === "stacked";
  const pipe = t.contactStyle === "pipe";

  const children: Paragraph[] = [];
  if (doc.name)
    children.push(
      new Paragraph({
        style: "ResumeName",
        alignment: align,
        ...onBand({ spacing: { before: band ? tw(6) : 0 } }),
        children: [new TextRun({ text: t.nameCase === "upper" ? doc.name.toUpperCase() : doc.name, color: headerColor })],
      }),
    );
  if (doc.headline)
    children.push(
      new Paragraph({
        alignment: align,
        ...onBand({ spacing: { after: tw(2) } }),
        children: [
          new TextRun({
            text: doc.headline,
            bold: t.headlineBold,
            size: half(ts.headline),
            color: band ? "E5E7EB" : t.headlineBold ? "111827" : muted,
          }),
        ],
      }),
    );
  if (doc.contact.length) {
    const runs: (TextRun | ExternalHyperlink)[] = [];
    doc.contact.forEach((c, i) => {
      if (i) runs.push(new TextRun({ text: pipe ? " | " : "  ·  ", color: headerColor }));
      runs.push(
        c.href
          ? new ExternalHyperlink({ link: c.href, children: [new TextRun({ text: c.text, style: band ? undefined : "Hyperlink", color: headerColor })] })
          : new TextRun({ text: c.text, color: headerColor }),
      );
    });
    children.push(new Paragraph({ alignment: align, ...onBand({ spacing: { after: tw(band ? 10 : 4) } }), children: runs }));
  }

  /** Runs for text with the user's **bold** spans. */
  const rich = (text: string) => boldSpans(text).map((p) => new TextRun({ text: p.text, bold: p.bold || undefined }));
  const bullet = (text: string) =>
    new Paragraph({ numbering: { reference: stacked ? "resume-bullets-indented" : "resume-bullets", level: 0 }, keepLines: true, spacing: { before: tw(t.bulletGap * d), line }, children: rich(text) });

  for (const sec of doc.sections) {
    children.push(
      new Paragraph({
        heading: HeadingLevel.HEADING_1,
        keepNext: true,
        pageBreakBefore: sec.pageBreak,
        alignment: t.heading === "centered" ? AlignmentType.CENTER : AlignmentType.LEFT,
        children: [new TextRun({ text: sec.title })],
      }),
    );
    for (const b of sec.blocks) {
      if (b.type === "paragraph") children.push(new Paragraph({ spacing: { line }, children: rich(b.text) }));
      else if (b.type === "skills")
        for (const r of b.rows)
          children.push(
            new Paragraph({
              spacing: { before: tw(1.8 * d), line },
              children: [...(r.label ? [new TextRun({ text: `${r.label}: `, bold: true })] : []), new TextRun({ text: r.items })],
            }),
          );
      else if (b.type === "list") b.items.forEach((i) => children.push(bullet(i)));
      else {
        const titleSize = half(sec.key === "projects" || sec.key === "education" ? ts.projectTitle : ts.entryTitle);
        const head: (TextRun | ExternalHyperlink)[] = [
          b.titleHref
            ? new ExternalHyperlink({ link: b.titleHref, children: [new TextRun({ text: b.title, bold: true, style: "Hyperlink", size: titleSize })] })
            : new TextRun({ text: b.title, bold: true, size: titleSize }),
        ];
        if (b.titleSuffix) head.push(new TextRun({ text: ` — ${b.titleSuffix}`, size: titleSize }));
        if (b.subtitle && !stacked) head.push(new TextRun({ text: `, ${b.subtitle}`, color: t.mutedSubtitles ? muted : undefined }));
        if (b.dates) head.push(new TextRun({ text: `\t${b.dates}`, italics: t.datesItalic, size: half(ts.dates), color: t.mutedSubtitles ? muted : undefined }));
        const detail = stacked && !!b.subtitle;
        const hasMore = b.bullets.length > 0 || !!b.link || !!b.meta || detail;
        children.push(
          new Paragraph({
            keepNext: hasMore,
            keepLines: true,
            pageBreakBefore: b.pageBreak,
            spacing: { before: tw(5 * d), line },
            tabStops: [{ type: TabStopType.RIGHT, position: contentWidth }],
            children: head,
          }),
        );
        if (detail) children.push(new Paragraph({ keepNext: b.bullets.length > 0 || !!b.meta, spacing: { line }, children: [new TextRun({ text: b.subtitle })] }));
        if (b.link)
          children.push(
            new Paragraph({ keepNext: true, children: [new ExternalHyperlink({ link: b.link.href, children: [new TextRun({ text: b.link.text, style: "Hyperlink", size: half(ts.small) })] })] }),
          );
        if (b.meta) children.push(new Paragraph({ keepNext: b.bullets.length > 0, children: [new TextRun({ text: b.meta, italics: true, color: stacked ? "374151" : muted, size: half(ts.small) })] }));
        b.bullets.forEach((x) => children.push(bullet(x)));
      }
    }
  }

  const headingBorder =
    t.heading === "rule" || t.heading === "centered"
      ? { bottom: { style: BorderStyle.SINGLE, size: 6, color: t.headingColor === "muted" ? "D1D5DB" : accent, space: 1 } }
      : t.heading === "bar"
        ? { left: { style: BorderStyle.SINGLE, size: 24, color: accent, space: 6 } }
        : undefined;

  const document = new Document({
    creator: "Resume Builder",
    title: doc.name ? `${doc.name} - Resume` : "Resume",
    fonts: fonts.embedded.map((f) => ({ name: f.name, data: f.data, bold: f.bold })),
    styles: {
      default: { document: { run: { font: fonts.body, size: half(ts.body), color: "111827" }, paragraph: { spacing: { line } } } },
      paragraphStyles: [
        {
          id: "ResumeName",
          name: "Resume Name",
          basedOn: "Normal",
          run: { font: fonts.heading, size: half(ts.name), bold: true, color: band ? "FFFFFF" : t.nameColor === "ink" ? "111827" : accent, characterSpacing: Math.round(t.tracking * 20) },
          paragraph: { spacing: { after: tw(2) } },
        },
        {
          id: "Heading1",
          name: "Heading 1",
          basedOn: "Normal",
          next: "Normal",
          quickFormat: true,
          run: {
            font: fonts.heading,
            size: half(ts.heading),
            bold: true,
            color: headingColor,
            characterSpacing: s.headingCase === "upper" ? Math.round(Math.min(t.tracking, 0.8) * 20) : 0,
          },
          paragraph: { spacing: { before: tw(s.sectionSpacing * d - t.headingGapTrim), after: tw(4 * d) }, keepNext: true, border: headingBorder },
        },
      ],
      characterStyles: [{ id: "Hyperlink", name: "Hyperlink", basedOn: "DefaultParagraphFont", run: { color: pipe ? "0563C1" : "1F3B63", underline: {} } }],
    },
    numbering: {
      config: [
        {
          reference: "resume-bullets",
          levels: [{ level: 0, format: LevelFormat.BULLET, text: "•", alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 300, hanging: 220 } } } }],
        },
        {
          reference: "resume-bullets-indented",
          levels: [{ level: 0, format: LevelFormat.BULLET, text: "•", alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 460, hanging: 220 } } } }],
        },
      ],
    },
    sections: [
      {
        properties: {
          page: { size: { width: page.w, height: page.h }, margin: { top: band ? tw(18) : tw(s.margin * 0.85), bottom: tw(s.margin * 0.85), left: tw(s.margin), right: tw(s.margin) } },
        },
        children,
      },
    ],
  });
  return Packer.toBuffer(document);
}
