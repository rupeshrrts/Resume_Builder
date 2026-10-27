import { describe, expect, it } from "vitest";
import JSZip from "jszip";
import React from "react";
import { Document, Page, Text, View, renderToBuffer } from "@react-pdf/renderer";
import { extractFile, UploadError } from "@/parse/extract";
import { buildDocument } from "@resume/shared/render/model";
import { renderDocx } from "@/render/docx";
import { renderPdf } from "@/render/pdf";
import { sampleResume, sampleSettings } from "./fixtures/sample";

async function rejects(buf: Uint8Array, code: string) {
  await expect(extractFile(buf)).rejects.toSatisfy((e: unknown) => e instanceof UploadError && e.code === code);
}

describe("upload validation", () => {
  it("rejects empty, unknown, legacy .doc and oversized files", async () => {
    await rejects(new Uint8Array(), "empty");
    await rejects(new TextEncoder().encode("hello, I am a text file"), "unsupported");
    await rejects(new Uint8Array([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1, 0, 0]), "doc");
    const big = new Uint8Array(6 * 1024 * 1024);
    big.set(new TextEncoder().encode("%PDF-1.7"));
    await rejects(big, "too_large");
  });
  it("handles a truncated PDF gracefully", async () => {
    const { buffer } = await renderPdf(buildDocument(sampleResume(), sampleSettings()));
    await expect(extractFile(new Uint8Array(buffer.subarray(0, 400)))).rejects.toBeInstanceOf(UploadError);
  });
  it("rejects a zip that isn't a Word document", async () => {
    const zip = new JSZip();
    zip.file("hello.txt", "hi");
    await rejects(await zip.generateAsync({ type: "uint8array" }), "malformed");
  });
  it("rejects a corrupt zip", async () => {
    await rejects(new Uint8Array([0x50, 0x4b, 0x03, 0x04, 1, 2, 3, 4, 5, 6]), "malformed");
  });
});

describe("layout detection", () => {
  it("finds tables, text boxes, columns, images and header text in a DOCX", async () => {
    const buf = await renderDocx(buildDocument(sampleResume(), sampleSettings()));
    const zip = await JSZip.loadAsync(buf);
    let xml = await zip.file("word/document.xml")!.async("string");
    const table = `<w:tbl><w:tr><w:tc><w:p><w:r><w:t>Cell text</w:t></w:r></w:p></w:tc></w:tr></w:tbl>`;
    const box = `<w:p><w:r><w:pict><v:shape><v:textbox><w:txbxContent><w:p><w:r><w:t>Hidden in a text box</w:t></w:r></w:p></w:txbxContent></v:textbox></v:shape></w:pict></w:r></w:p>`;
    xml = xml.replace("<w:body>", `<w:body>${table}${box}`).replace(/<w:sectPr([^>]*)>/, `<w:sectPr$1><w:cols w:num="2"/>`);
    zip.file("word/document.xml", xml);
    zip.file("word/header1.xml", `<w:hdr xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:p><w:r><w:t>priya@example.com | +91 98765 43210</w:t></w:r></w:p></w:hdr>`);
    const ex = await extractFile(await zip.generateAsync({ type: "uint8array" }));
    expect(ex.layout.tables).toBe(1);
    expect(ex.layout.textBoxes).toBe(1);
    expect(ex.layout.columns).toBe(2);
    expect(ex.layout.images).toBeGreaterThanOrEqual(1);
    expect(ex.layout.headerFooterText).toBe(true);
    expect(ex.text).toContain("Hidden in a text box");
  });

  it("detects a two-column PDF and reads each column in order", async () => {
    const left = Array.from({ length: 14 }, (_, i) => `Left column line ${i + 1}`);
    const right = Array.from({ length: 14 }, (_, i) => `Right column line ${i + 1}`);
    const el = React.createElement(
      Document,
      null,
      React.createElement(
        Page,
        { size: "A4", style: { padding: 40, flexDirection: "row", fontSize: 10 } },
        React.createElement(View, { style: { width: "35%" } }, ...left.map((t) => React.createElement(Text, { key: t }, t))),
        React.createElement(View, { style: { width: "55%", marginLeft: "10%" } }, ...right.map((t) => React.createElement(Text, { key: t }, t))),
      ),
    );
    const buf = await renderToBuffer(el);
    const ex = await extractFile(new Uint8Array(buf));
    expect(ex.layout.columns).toBe(2);
    expect(ex.lines.indexOf("Left column line 14")).toBeLessThan(ex.lines.indexOf("Right column line 1"));
  });

  it("flags an image-only PDF", async () => {
    const el = React.createElement(Document, null, React.createElement(Page, { size: "A4" }, React.createElement(View, { style: { width: 100, height: 100, backgroundColor: "#000" } })));
    const ex = await extractFile(new Uint8Array(await renderToBuffer(el)));
    expect(ex.layout.imageOnly).toBe(true);
  });
});
