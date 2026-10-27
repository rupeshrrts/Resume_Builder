import { describe, expect, it } from "vitest";
import { boldSpans, stripBold, toggleBold } from "@resume/shared/render/rich";
import { buildDocument, oneLine } from "@resume/shared/render/model";
import { templateDefaults } from "@resume/shared/render/templates";
import { renderText } from "@resume/shared/render/text";
import { renderMarkdown } from "@resume/shared/render/markdown";
import { renderPdf } from "@/render/pdf";
import { renderDocx } from "@/render/docx";
import { validateDocx, validatePdf } from "@/render/validate";
import { sampleResume, sampleSettings } from "./fixtures/sample";

describe("bold in bullets", () => {
  it("splits, strips and toggles **bold** text", () => {
    expect(boldSpans("Built a **RAG pipeline** for logs")).toEqual([
      { text: "Built a ", bold: false },
      { text: "RAG pipeline", bold: true },
      { text: " for logs", bold: false },
    ]);
    expect(stripBold("Built a **RAG pipeline** for **logs**")).toBe("Built a RAG pipeline for logs");
    expect(boldSpans("2 ** 3")).toEqual([{ text: "2 ** 3", bold: false }]);

    // Selected words, with trailing space kept outside the markers.
    const t = "Built a RAG pipeline for logs";
    const on = toggleBold(t, 8, 21);
    expect(on.text).toBe("Built a **RAG pipeline** for logs");
    expect(on.text.slice(on.start, on.end)).toBe("RAG pipeline");
    // Same selection again turns it off.
    expect(toggleBold(on.text, on.start, on.end).text).toBe(t);
    // Nothing selected: whole point on, then off.
    const whole = toggleBold(on.text, 0, 0);
    expect(whole.text).toBe("**Built a RAG pipeline for logs**");
    expect(toggleBold(whole.text, 0, 0).text).toBe(t);
  });

  it("joins line breaks pasted from a PDF into one flowing summary and bullets", () => {
    const pasted = "Full Stack Developer with 2+ years of experience building enterprise web applications with REST APIs, Node.js,\nAngular,\nReact, Next.js and SQL, and shipping Generative and Agentic AI features: tool-calling agents, RAG, and MCP tools\nthat\nconnect LLMs to enterprise data. Builds Java / Spring Boot backends for a client-\nreported error.";
    expect(oneLine(pasted)).toBe(
      "Full Stack Developer with 2+ years of experience building enterprise web applications with REST APIs, Node.js, Angular, React, Next.js and SQL, and shipping Generative and Agentic AI features: tool-calling agents, RAG, and MCP tools that connect LLMs to enterprise data. Builds Java / Spring Boot backends for a client-reported error.",
    );
    const r = sampleResume();
    r.summary.text = pasted;
    r.experience[0].bullets[0].text = "Designed and built 12 REST APIs\nin Java and Spring Boot.";
    const doc = buildDocument(r, sampleSettings(templateDefaults("professional")));
    const summary = doc.sections[0].blocks[0];
    expect(summary.type === "paragraph" && summary.text.includes("\n")).toBe(false);
    expect(renderText(doc)).toContain("- Designed and built 12 REST APIs in Java and Spring Boot.");
  });

  it("prints real bold in the PDF and DOCX, plain text everywhere else", async () => {
    const r = sampleResume();
    r.experience[0].bullets[0].text = "Designed and built **12 REST APIs** in Java and Spring Boot serving 40,000 daily users.";
    r.experience[0].bullets[1].text = "**Migrated the payments service from VMs to Kubernetes on AWS.**";
    const doc = buildDocument(r, sampleSettings(templateDefaults("professional")));
    const { buffer, replaced } = await renderPdf(doc);
    const v = await validatePdf(buffer, doc, replaced);
    expect(v.missing).toEqual([]);
    // The extractor adds spaces where the font switches to bold; readers collapse them.
    expect(v.extractedText.replace(/\s+/g, " ")).toContain("Designed and built 12 REST APIs in Java");
    expect(v.extractedText).not.toContain("**");
    const docx = await renderDocx(doc);
    expect((await validateDocx(docx, doc)).missing).toEqual([]);
    const JSZip = (await import("jszip")).default;
    const xml = await (await JSZip.loadAsync(docx)).file("word/document.xml")!.async("string");
    expect(xml).toMatch(/<w:b\/>[\s\S]{0,200}12 REST APIs/);
    expect(renderText(doc)).not.toContain("**");
    expect(renderMarkdown(doc)).toContain("**12 REST APIs**");
  });
});
