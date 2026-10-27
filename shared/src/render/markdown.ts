import type { DocModel } from "./model";
import { boldSpans } from "./rich";

/** Escapes characters that would otherwise turn resume text into Markdown formatting. */
const esc = (s: string) => s.replace(/([\\`*_[\]<>#|])/g, "\\$1").replace(/^(\d+)\. /, "$1\\. ").replace(/^([-+]) /, "\\$1 ");

/** Escapes the text but keeps the user's bold (**…**) as Markdown bold. */
const rich = (s: string) => boldSpans(s).map((p) => (p.bold ? `**${esc(p.text)}**` : esc(p.text))).join("");

/** Markdown rendering for READMEs, personal sites and Markdown-based editors. */
export function renderMarkdown(doc: DocModel): string {
  const out: string[] = [];
  if (doc.name) out.push(`# ${esc(doc.name)}`, "");
  if (doc.headline) out.push(`**${esc(doc.headline)}**`, "");
  if (doc.contact.length) out.push(doc.contact.map((c) => (c.href ? `[${esc(c.text)}](${c.href.replace(/\)/g, "%29")})` : esc(c.text))).join(" · "), "");
  for (const s of doc.sections) {
    out.push(`## ${esc(s.title)}`, "");
    for (const b of s.blocks) {
      if (b.type === "paragraph") out.push(rich(b.text), "");
      else if (b.type === "list") out.push(...b.items.map((i) => `- ${rich(i)}`), "");
      else if (b.type === "skills") out.push(...b.rows.map((r) => (r.label ? `- **${esc(r.label)}:** ${esc(r.items)}` : `- ${esc(r.items)}`)), "");
      else {
        const title = b.title && `**${esc(b.title)}**${b.titleSuffix ? ` — ${esc(b.titleSuffix)}` : ""}`;
        const head = [title, b.subtitle && esc(b.subtitle)].filter(Boolean).join(", ");
        if (head || b.dates) out.push(`### ${head}${b.dates ? `${head ? " · " : ""}${esc(b.dates)}` : ""}`);
        if (b.link) out.push(`[${esc(b.link.text)}](${b.link.href.replace(/\)/g, "%29")})`);
        if (b.meta) out.push(`*${esc(b.meta)}*`);
        out.push("");
        if (b.bullets.length) out.push(...b.bullets.map((x) => `- ${rich(x)}`), "");
      }
    }
  }
  return out.join("\n").replace(/\n{3,}/g, "\n\n").trim() + "\n";
}
