import { readFileSync, existsSync, readdirSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { ROOT_DIR, TEMPLATE_DIR } from "./database.mjs";
import {
  quoteBodyMarkup, normalizeGalleryLayout, normalizeQuoteItems, escapeHtml
} from "../../web/src/quote-template.js";

const galleryGridCss = `
.gallery { display: grid; gap: 8px; width: 100%; height: 480px; }
.gallery figure { margin: 0; overflow: hidden; border-radius: 6px; background: #fff; }
.gallery-1 { grid-template-columns: 1fr; }
.gallery-2 { grid-template-columns: 1fr 1fr; }
.gallery-3 { grid-template-columns: 1fr 1fr; grid-template-rows: 1.6fr 1fr; }
.gallery-3 .gallery-span { grid-column: 1 / -1; }
.gallery-4 { grid-template-columns: 1fr 1fr; grid-template-rows: 1fr 1fr; }
.gallery-5, .gallery-6 { grid-template-columns: 1fr 1fr 1fr; grid-template-rows: 1fr 1fr; }
.gallery img { display: block; width: 100%; height: 100%; object-fit: contain; object-position: center center; }
`;

function dataUriFor(storagePath, mimeType = "image/png") {
  const absolutePath = path.join(ROOT_DIR, storagePath);
  if (!existsSync(absolutePath)) return "";
  return `data:${mimeType};base64,${readFileSync(absolutePath).toString("base64")}`;
}

export function renderQuoteHtml(project, images = []) {
  const data = project.data ?? project;
  const translation = data.translation;
  const renderData = translation?.data || data;

  normalizeQuoteItems(renderData);
  normalizeGalleryLayout(renderData, images);
  const logoSrc = dataUriFor(path.join("templates", "logo.png"), "image/png");
  const css = readFileSync(path.join(TEMPLATE_DIR, "style.css"), "utf8");

  const body = quoteBodyMarkup(renderData, images, "", {
    imageSrc: (image) => dataUriFor(image.storagePath, image.mimeType),
    logoSrc,
    draggable: false,
    heroTitleFallback: "QUOTATION",
    labels: translation?.labels,
  });

  const lang = translation?.lang || "en";
  const dir = translation?.rtl ? ' dir="rtl"' : "";
  const rtlCss = translation?.rtl ? `
[dir="rtl"] .party-grid { direction: rtl; }
[dir="rtl"] .pricing-table { direction: rtl; }
[dir="rtl"] .summary-line { direction: rtl; }
[dir="rtl"] .footer-text { direction: rtl; }
[dir="rtl"] .meta-row { direction: rtl; }
[dir="rtl"] .terms-box { direction: rtl; }
` : "";

  return `<!DOCTYPE html>
<html lang="${lang}"${dir}>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=1024, initial-scale=1">
  <title>${escapeHtml(data.quoteMeta?.quoteNo || "Quotation")}</title>
  <style>
${css}
@page { margin: 0; }
@media print {
  html, body { width: 1024px; height: auto; }
  .sheet { margin: 0; height: auto; }
}
.sheet { min-height: 0; height: auto; padding-bottom: 24px; overflow: visible; }
.footer { position: static !important; left: auto !important; right: auto !important; bottom: auto !important; margin-top: 22px; }
.product-row td { height: 238px; }
.accessory-row td { height: auto; padding: 4px 10px; }
.accessory-row td:nth-child(2) { padding-top: 6px; padding-bottom: 2px; }
.accessory-row h3 { margin-bottom: 0; }
.accessory-detail-row td { height: auto; padding: 1px 0; font-size: 14px; text-align: center; }
.accessory-detail-row td:nth-child(2) { padding: 1px 26px; text-align: left; }
.product-row td:nth-child(5) { padding-left: 20px; text-align: left; }
.accessory-detail-row td:nth-child(5) { padding-left: 20px; text-align: left; }
.summary-line { grid-template-columns: 1fr 147px; min-height: 28px; height: auto; }
.summary-line span { text-align: center; }
.summary-line strong { padding-left: 20px; text-align: left; }
.terms-box { min-height: 210px; height: auto; overflow: visible; }
.meta-row { grid-template-columns: auto 1fr; min-height: 44px; height: auto; }
.pricing-table thead th { min-height: 38px; height: auto; }
.footer-text { gap: 30px; min-height: 45px; height: auto; }
${galleryGridCss}
.party-grid { margin-top: 20px; }
.pricing-section { margin-top: 20px; }
.hero-title + .party-grid,
.hero-title + .pricing-section,
.hero-title + .gallery-section,
.hero-title + .terms-section,
.hero-title + .footer { margin-top: 58px; }
${rtlCss}
  </style>
</head>
<body>
  <main class="sheet"${dir} aria-label="Quotation sheet">${body}</main>
</body>`;
}

export async function exportPdf(project, images) {
  const playwright = await loadPlaywright();
  const chromium = playwright.chromium || playwright.default?.chromium;

  if (!chromium) {
    throw new Error("Playwright Chromium launcher is not available.");
  }

  const html = renderQuoteHtml(project, images);
  const browser = await chromium.launch({ headless: true });

  try {
    const page = await browser.newPage({ viewport: { width: 1024, height: 1536 }, deviceScaleFactor: 1 });
    await page.setContent(html, { waitUntil: "networkidle" });
    const contentHeight = await measureContentHeight(page);
    const targetHeight = 1536;
    const pdfScale = Math.min(1, targetHeight / contentHeight);
    return await page.pdf({
      width: "1024px",
      height: `${targetHeight}px`,
      printBackground: true,
      margin: { top: 0, right: 0, bottom: 0, left: 0 },
      scale: pdfScale
    });
  } finally {
    await browser.close();
  }
}

async function measureContentHeight(page) {
  return await page.evaluate(() => {
    const sheet = document.querySelector(".sheet");
    if (!sheet) return 1536;

    sheet.style.width = "1024px";
    sheet.style.minHeight = "0";
    sheet.style.height = "auto";
    sheet.style.transform = "";

    document.documentElement.style.width = "1024px";
    document.documentElement.style.height = "auto";
    document.body.style.width = "1024px";
    document.body.style.height = "auto";
    document.body.style.margin = "0";

    const rect = sheet.getBoundingClientRect();
    return Math.ceil(Math.max(sheet.scrollHeight, rect.height, 1536));
  });
}

async function loadPlaywright() {
  try {
    return await import("playwright");
  } catch {
    const candidates = [
      process.env.CODEX_NODE_MODULES,
      "C:\\Users\\ASUS\\.cache\\codex-runtimes\\codex-primary-runtime\\dependencies\\node\\node_modules",
      "D:\\ASUS\\.cache\\codex-runtimes\\codex-primary-runtime\\dependencies\\node\\node_modules"
    ].filter(Boolean);

    for (const nodeModules of candidates) {
      for (const indexPath of playwrightIndexCandidates(nodeModules)) {
        if (existsSync(indexPath)) {
          return import(pathToFileURL(indexPath).href);
        }
      }
    }
  }

  throw new Error("Playwright is not available. Install it or inside the bundled Codex runtime.");
}

function playwrightIndexCandidates(nodeModules) {
  const candidates = [];
  const pnpmDir = path.join(nodeModules, ".pnpm");

  if (existsSync(pnpmDir)) {
    for (const entry of readdirSync(pnpmDir, { withFileTypes: true })) {
      if (entry.isDirectory() && entry.name.startsWith("playwright@")) {
        candidates.push(path.join(pnpmDir, entry.name, "node_modules", "playwright", "index.js"));
      }
    }
  }

  candidates.push(path.join(nodeModules, "playwright", "index.js"));
  return candidates;
}
