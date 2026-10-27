import { fullTitle, type DocModel } from "./model";
import { stripBold } from "./rich";

/** Plain-text rendering: what an ATS that strips all formatting would roughly see. */
export function renderText(doc: DocModel): string {
  const out: string[] = [];
  if (doc.name) out.push(doc.name);
  if (doc.headline) out.push(doc.headline);
  if (doc.contact.length) out.push(doc.contact.map((c) => c.text).join(" | "));
  for (const s of doc.sections) {
    out.push("", s.title);
    for (const b of s.blocks) {
      if (b.type === "paragraph") out.push(stripBold(b.text));
      else if (b.type === "list") for (const i of b.items) out.push(`- ${stripBold(i)}`);
      else if (b.type === "skills") for (const r of b.rows) out.push(r.label ? `${r.label}: ${r.items}` : r.items);
      else {
        out.push([fullTitle(b), b.subtitle].filter(Boolean).join(", ") + (b.dates ? ` | ${b.dates}` : ""));
        if (b.link) out.push(b.link.text);
        if (b.meta) out.push(b.meta);
        for (const x of b.bullets) out.push(`- ${stripBold(x)}`);
        out.push("");
      }
    }
    while (out[out.length - 1] === "") out.pop();
  }
  return out.join("\n").replace(/\n{3,}/g, "\n\n").trim() + "\n";
}
