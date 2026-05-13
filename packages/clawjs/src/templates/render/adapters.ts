import fs from "fs";
import path from "path";
import { pathToFileURL } from "url";

import type { TemplateAspect, TemplateManifest, TemplateOutputFormat } from "../schema.ts";
import type { StyleManifest } from "../../styles/schema.ts";
import { renderTemplateHtml, resolveAspectDimensions } from "./html.ts";

export interface RenderRequest {
  template: TemplateManifest;
  style: StyleManifest;
  data: Record<string, unknown>;
  variantId?: string;
  outPath: string;
  format: TemplateOutputFormat;
}

export interface RenderResult {
  format: TemplateOutputFormat;
  outPath: string;
  width: number;
  height: number;
  renderer: "html-direct" | "playwright" | "pptx-openxml" | "svg-wrap" | "node-fallback";
}

export async function renderTemplate(request: RenderRequest): Promise<RenderResult> {
  switch (request.format) {
    case "html":
      return renderHtmlOutput(request);
    case "pdf":
      return renderPdfOutput(request);
    case "png":
      return renderPngOutput(request);
    case "svg":
      return renderSvgOutput(request);
    case "pptx":
      return renderPptxOutput(request);
    default:
      throw new Error(`Unsupported render format: ${request.format}`);
  }
}

function renderHtmlOutput(req: RenderRequest): RenderResult {
  const result = renderTemplateHtml({ template: req.template, style: req.style, data: req.data, variantId: req.variantId });
  fs.mkdirSync(path.dirname(req.outPath), { recursive: true });
  fs.writeFileSync(req.outPath, result.html, "utf8");
  return { format: "html", outPath: req.outPath, width: result.width, height: result.height, renderer: "html-direct" };
}

async function renderPdfOutput(req: RenderRequest): Promise<RenderResult> {
  const { html, width, height } = renderTemplateHtml({ template: req.template, style: req.style, data: req.data, variantId: req.variantId });
  const tmpHtml = `${req.outPath}.tmp.html`;
  fs.mkdirSync(path.dirname(req.outPath), { recursive: true });
  fs.writeFileSync(tmpHtml, html, "utf8");
  try {
    if (process.env.CLAW_TEMPLATE_DISABLE_BROWSER === "1") {
      throw new Error("Template browser renderer disabled.");
    }
    const playwright = await import("playwright");
    const browser = await playwright.chromium.launch({ headless: true, chromiumSandbox: false, args: ["--no-sandbox", "--disable-dev-shm-usage"] });
    try {
      const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 });
      await page.goto(pathToFileURL(tmpHtml).href, { waitUntil: "networkidle" });
      await page.pdf({
        path: req.outPath,
        width: `${width}px`,
        height: `${height}px`,
        printBackground: true,
        margin: { top: "0px", right: "0px", bottom: "0px", left: "0px" },
      });
    } finally {
      await browser.close();
    }
    return { format: "pdf", outPath: req.outPath, width, height, renderer: "playwright" };
  } catch (err) {
    fs.writeFileSync(req.outPath, buildFallbackPdf(req.template, req.style, req.data));
    return { format: "pdf", outPath: req.outPath, width, height, renderer: "node-fallback" };
  } finally {
    if (fs.existsSync(tmpHtml)) fs.unlinkSync(tmpHtml);
  }
}

async function renderPngOutput(req: RenderRequest): Promise<RenderResult> {
  const { html, width, height } = renderTemplateHtml({ template: req.template, style: req.style, data: req.data, variantId: req.variantId });
  const tmpHtml = `${req.outPath}.tmp.html`;
  fs.mkdirSync(path.dirname(req.outPath), { recursive: true });
  fs.writeFileSync(tmpHtml, html, "utf8");
  try {
    const playwright = await import("playwright");
    const browser = await playwright.chromium.launch({ headless: true, chromiumSandbox: false, args: ["--no-sandbox", "--disable-dev-shm-usage"] });
    try {
      const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 2 });
      await page.goto(pathToFileURL(tmpHtml).href, { waitUntil: "networkidle" });
      await page.locator(".frame").screenshot({ path: req.outPath });
    } finally {
      await browser.close();
    }
    return { format: "png", outPath: req.outPath, width, height, renderer: "playwright" };
  } finally {
    if (fs.existsSync(tmpHtml)) fs.unlinkSync(tmpHtml);
  }
}

function renderSvgOutput(req: RenderRequest): RenderResult {
  const { html, width, height } = renderTemplateHtml({ template: req.template, style: req.style, data: req.data, variantId: req.variantId });
  const bodyMatch = html.match(/<body>([\s\S]*?)<\/body>/);
  const styleMatch = html.match(/<style>([\s\S]*?)<\/style>/);
  const body = bodyMatch ? bodyMatch[1] : "";
  const css = styleMatch ? styleMatch[1] : "";
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <foreignObject x="0" y="0" width="${width}" height="${height}">
    <div xmlns="http://www.w3.org/1999/xhtml">
      <style>${css}</style>
      ${body}
    </div>
  </foreignObject>
</svg>`;
  fs.mkdirSync(path.dirname(req.outPath), { recursive: true });
  fs.writeFileSync(req.outPath, svg, "utf8");
  return { format: "svg", outPath: req.outPath, width, height, renderer: "svg-wrap" };
}

function renderPptxOutput(req: RenderRequest): RenderResult {
  const { width, height } = resolveAspectDimensions(req.template.aspect);
  const pptx = buildOnePagePptx(req.template, req.style, req.data, req.variantId);
  fs.mkdirSync(path.dirname(req.outPath), { recursive: true });
  fs.writeFileSync(req.outPath, pptx);
  return { format: "pptx", outPath: req.outPath, width, height, renderer: "pptx-openxml" };
}

// --- PPTX (minimal Office Open XML, one slide per template instance) ---

const EMU_PER_PX = 9525;

function buildOnePagePptx(template: TemplateManifest, style: StyleManifest, data: Record<string, unknown>, _variantId?: string): Buffer {
  const dims = resolveAspectDimensions(template.aspect);
  const widthEmu = dims.width * EMU_PER_PX;
  const heightEmu = dims.height * EMU_PER_PX;
  const titleSlot = template.slots.find((s) => s.kind === "heading");
  const titleText = titleSlot ? String(data[titleSlot.id] ?? template.name) : template.name;
  const bodyTexts = template.slots
    .filter((s) => s.kind !== "heading")
    .map((s) => {
      const value = data[s.id];
      if (Array.isArray(value)) return value.map((v) => `• ${String(v)}`).join("\n");
      if (value == null || value === "") return `[${s.label}]`;
      return String(value);
    })
    .join("\n\n");
  const slideXml = renderSlideXml(titleText, bodyTexts, style);
  const files: { name: string; content: string | Buffer }[] = [
    { name: "[Content_Types].xml", content: CONTENT_TYPES_XML },
    { name: "_rels/.rels", content: ROOT_RELS_XML },
    { name: "ppt/presentation.xml", content: presentationXml(widthEmu, heightEmu) },
    { name: "ppt/_rels/presentation.xml.rels", content: PRESENTATION_RELS_XML },
    { name: "ppt/slides/slide1.xml", content: slideXml },
    { name: "ppt/slides/_rels/slide1.xml.rels", content: SLIDE_RELS_XML },
    { name: "ppt/slideLayouts/slideLayout1.xml", content: SLIDE_LAYOUT_XML },
    { name: "ppt/slideLayouts/_rels/slideLayout1.xml.rels", content: SLIDE_LAYOUT_RELS_XML },
    { name: "ppt/slideMasters/slideMaster1.xml", content: SLIDE_MASTER_XML },
    { name: "ppt/slideMasters/_rels/slideMaster1.xml.rels", content: SLIDE_MASTER_RELS_XML },
    { name: "ppt/theme/theme1.xml", content: THEME_XML },
  ];
  return zipStored(files);
}

function renderSlideXml(title: string, body: string, style: StyleManifest): string {
  const accent = (style.tokens.color.accent ?? "#000000").replace("#", "");
  const fg = (style.tokens.color.fg ?? "#111111").replace("#", "");
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
  <p:cSld>
    <p:spTree>
      <p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr>
      <p:grpSpPr/>
      <p:sp>
        <p:nvSpPr><p:cNvPr id="2" name="Title"/><p:cNvSpPr txBox="1"/><p:nvPr/></p:nvSpPr>
        <p:spPr><a:xfrm><a:off x="457200" y="457200"/><a:ext cx="10058400" cy="1257300"/></a:xfrm><a:prstGeom prst="rect"/></p:spPr>
        <p:txBody><a:bodyPr/><a:lstStyle/><a:p><a:r><a:rPr lang="en-US" sz="4400" b="0"><a:solidFill><a:srgbClr val="${accent}"/></a:solidFill></a:rPr><a:t>${escapeXml(title)}</a:t></a:r></a:p></p:txBody>
      </p:sp>
      <p:sp>
        <p:nvSpPr><p:cNvPr id="3" name="Body"/><p:cNvSpPr txBox="1"/><p:nvPr/></p:nvSpPr>
        <p:spPr><a:xfrm><a:off x="457200" y="1828800"/><a:ext cx="10058400" cy="4572000"/></a:xfrm><a:prstGeom prst="rect"/></p:spPr>
        <p:txBody><a:bodyPr/><a:lstStyle/>${bodyParagraphs(body, fg)}</p:txBody>
      </p:sp>
    </p:spTree>
  </p:cSld>
</p:sld>`;
}

function bodyParagraphs(body: string, color: string): string {
  return body
    .split(/\n+/)
    .map((line) => `<a:p><a:r><a:rPr lang="en-US" sz="2000"><a:solidFill><a:srgbClr val="${color}"/></a:solidFill></a:rPr><a:t>${escapeXml(line)}</a:t></a:r></a:p>`)
    .join("");
}

function presentationXml(widthEmu: number, heightEmu: number): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:presentation xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
  <p:sldMasterIdLst><p:sldMasterId id="2147483648" r:id="rId1"/></p:sldMasterIdLst>
  <p:sldIdLst><p:sldId id="256" r:id="rId2"/></p:sldIdLst>
  <p:sldSz cx="${widthEmu}" cy="${heightEmu}"/>
  <p:notesSz cx="6858000" cy="9144000"/>
</p:presentation>`;
}

const CONTENT_TYPES_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/>
  <Override PartName="/ppt/slides/slide1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>
  <Override PartName="/ppt/slideLayouts/slideLayout1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideLayout+xml"/>
  <Override PartName="/ppt/slideMasters/slideMaster1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideMaster+xml"/>
  <Override PartName="/ppt/theme/theme1.xml" ContentType="application/vnd.openxmlformats-officedocument.theme+xml"/>
</Types>`;

const ROOT_RELS_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="ppt/presentation.xml"/>
</Relationships>`;

const PRESENTATION_RELS_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster" Target="slideMasters/slideMaster1.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide1.xml"/>
  <Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/theme" Target="theme/theme1.xml"/>
</Relationships>`;

const SLIDE_RELS_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout" Target="../slideLayouts/slideLayout1.xml"/>
</Relationships>`;

const SLIDE_LAYOUT_RELS_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster" Target="../slideMasters/slideMaster1.xml"/>
</Relationships>`;

const SLIDE_MASTER_RELS_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout" Target="../slideLayouts/slideLayout1.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/theme" Target="../theme/theme1.xml"/>
</Relationships>`;

const SLIDE_LAYOUT_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sldLayout xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" type="blank"><p:cSld name="Blank"><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr/></p:spTree></p:cSld></p:sldLayout>`;

const SLIDE_MASTER_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sldMaster xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"><p:cSld><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr/></p:spTree></p:cSld><p:sldLayoutIdLst><p:sldLayoutId id="2147483649" r:id="rId1"/></p:sldLayoutIdLst></p:sldMaster>`;

const THEME_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<a:theme xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" name="Office"><a:themeElements><a:clrScheme name="Office"><a:dk1><a:srgbClr val="000000"/></a:dk1><a:lt1><a:srgbClr val="FFFFFF"/></a:lt1><a:dk2><a:srgbClr val="44546A"/></a:dk2><a:lt2><a:srgbClr val="E7E6E6"/></a:lt2><a:accent1><a:srgbClr val="4472C4"/></a:accent1><a:accent2><a:srgbClr val="ED7D31"/></a:accent2><a:accent3><a:srgbClr val="A5A5A5"/></a:accent3><a:accent4><a:srgbClr val="FFC000"/></a:accent4><a:accent5><a:srgbClr val="5B9BD5"/></a:accent5><a:accent6><a:srgbClr val="70AD47"/></a:accent6><a:hlink><a:srgbClr val="0563C1"/></a:hlink><a:folHlink><a:srgbClr val="954F72"/></a:folHlink></a:clrScheme><a:fontScheme name="Office"><a:majorFont><a:latin typeface="Calibri Light"/><a:ea typeface=""/><a:cs typeface=""/></a:majorFont><a:minorFont><a:latin typeface="Calibri"/><a:ea typeface=""/><a:cs typeface=""/></a:minorFont></a:fontScheme><a:fmtScheme name="Office"><a:fillStyleLst><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:fillStyleLst><a:lnStyleLst><a:ln/><a:ln/><a:ln/></a:lnStyleLst><a:effectStyleLst><a:effectStyle><a:effectLst/></a:effectStyle><a:effectStyle><a:effectLst/></a:effectStyle><a:effectStyle><a:effectLst/></a:effectStyle></a:effectStyleLst><a:bgFillStyleLst><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:bgFillStyleLst></a:fmtScheme></a:themeElements></a:theme>`;

function escapeXml(s: string): string {
  return s.replace(/[<>&'"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", "'": "&apos;", '"': "&quot;" }[c] ?? c));
}

// --- Fallback PDF (minimal valid PDF when Playwright unavailable) ---

function buildFallbackPdf(template: TemplateManifest, style: StyleManifest, data: Record<string, unknown>): Buffer {
  const title = (template.slots.find((s) => s.kind === "heading") && String(data[template.slots.find((s) => s.kind === "heading")!.id] ?? template.name)) || template.name;
  const body = template.slots
    .filter((s) => s.kind !== "heading")
    .slice(0, 8)
    .map((s) => {
      const v = data[s.id];
      if (Array.isArray(v)) return v.slice(0, 4).map((x) => `- ${x}`).join("\n");
      return v == null || v === "" ? `[${s.label}]` : String(v);
    })
    .join("\n\n");
  const accent = style.tokens.color.accent.replace("#", "");
  const r = parseInt(accent.slice(0, 2), 16) / 255;
  const g = parseInt(accent.slice(2, 4), 16) / 255;
  const b = parseInt(accent.slice(4, 6), 16) / 255;
  const contentLines = [
    "BT",
    `/F1 28 Tf`,
    `${r.toFixed(2)} ${g.toFixed(2)} ${b.toFixed(2)} rg`,
    "72 720 Td",
    `(${pdfText(title)}) Tj`,
    "0 -40 Td",
    `0 0 0 rg`,
    `/F1 14 Tf`,
    ...body.split("\n").map((line) => `(${pdfText(line)}) Tj T*`),
    "ET",
  ];
  const stream = contentLines.join("\n");
  const objs: string[] = [];
  objs.push("<< /Type /Catalog /Pages 2 0 R >>");
  objs.push("<< /Type /Pages /Kids [3 0 R] /Count 1 >>");
  objs.push("<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>");
  objs.push(`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`);
  objs.push("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>");
  let pdf = "%PDF-1.4\n";
  const offsets: number[] = [];
  for (let i = 0; i < objs.length; i++) {
    offsets.push(Buffer.byteLength(pdf));
    pdf += `${i + 1} 0 obj\n${objs[i]}\nendobj\n`;
  }
  const xrefStart = Buffer.byteLength(pdf);
  pdf += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets) pdf += `${String(offset).padStart(10, "0")} 00000 n \n`;
  pdf += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF`;
  return Buffer.from(pdf, "latin1");
}

function pdfText(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

// --- Minimal ZIP (STORED, no deflate) ---

function zipStored(files: { name: string; content: string | Buffer }[]): Buffer {
  const parts: Buffer[] = [];
  const central: Buffer[] = [];
  let offset = 0;
  for (const file of files) {
    const data = typeof file.content === "string" ? Buffer.from(file.content, "utf8") : file.content;
    const nameBuf = Buffer.from(file.name, "utf8");
    const crc = crc32(data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0, 6);
    local.writeUInt16LE(0, 8);
    local.writeUInt16LE(0, 10);
    local.writeUInt16LE(0, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(nameBuf.length, 26);
    local.writeUInt16LE(0, 28);
    const entry = Buffer.concat([local, nameBuf, data]);
    parts.push(entry);
    const cd = Buffer.alloc(46);
    cd.writeUInt32LE(0x02014b50, 0);
    cd.writeUInt16LE(20, 4);
    cd.writeUInt16LE(20, 6);
    cd.writeUInt16LE(0, 8);
    cd.writeUInt16LE(0, 10);
    cd.writeUInt16LE(0, 12);
    cd.writeUInt16LE(0, 14);
    cd.writeUInt32LE(crc, 16);
    cd.writeUInt32LE(data.length, 20);
    cd.writeUInt32LE(data.length, 24);
    cd.writeUInt16LE(nameBuf.length, 28);
    cd.writeUInt16LE(0, 30);
    cd.writeUInt16LE(0, 32);
    cd.writeUInt16LE(0, 34);
    cd.writeUInt16LE(0, 36);
    cd.writeUInt32LE(0, 38);
    cd.writeUInt32LE(offset, 42);
    central.push(Buffer.concat([cd, nameBuf]));
    offset += entry.length;
  }
  const centralBuf = Buffer.concat(central);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(0, 4);
  eocd.writeUInt16LE(0, 6);
  eocd.writeUInt16LE(files.length, 8);
  eocd.writeUInt16LE(files.length, 10);
  eocd.writeUInt32LE(centralBuf.length, 12);
  eocd.writeUInt32LE(offset, 16);
  eocd.writeUInt16LE(0, 20);
  return Buffer.concat([...parts, centralBuf, eocd]);
}

const CRC_TABLE = (() => {
  const t: number[] = [];
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
    t.push(c >>> 0);
  }
  return t;
})();

function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
