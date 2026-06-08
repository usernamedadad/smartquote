import { readFileSync, existsSync, readdirSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { ROOT_DIR } from "./database.mjs";
import {
  quoteBodyMarkup, normalizeGalleryLayout, normalizeQuoteItems, escapeHtml
} from "../../web/src/quote-template.js";

const WEB_CSS_DIR = path.join(ROOT_DIR, "apps", "web", "src", "css");

function quoteExportCss() {
  const layoutCss = readFileSync(path.join(WEB_CSS_DIR, "quote-sheet-layout.css"), "utf8");
  const contentCss = readFileSync(path.join(WEB_CSS_DIR, "quote-sheet-content.css"), "utf8");

  return `
:root {
  --orange: #df5a29;
  --navy: #313541;
}

* {
  box-sizing: border-box;
}

html,
body {
  margin: 0;
  width: 1024px;
  min-height: 100%;
  background: #ffffff;
}

body {
  color: #0e0f12;
  font-family: Arial, Helvetica, sans-serif;
  -webkit-font-smoothing: antialiased;
  text-rendering: geometricPrecision;
}

.sheet.quote-sheet {
  margin: 0;
  min-height: 0;
  height: auto;
  overflow: visible;
  box-shadow: none;
}

${layoutCss}
${contentCss}

@page {
  margin: 0;
}

@media print {
  html,
  body {
    width: 1024px;
    height: auto;
  }

  .sheet.quote-sheet {
    margin: 0;
    height: auto;
    overflow: visible;
  }
}
`;
}

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
  const css = quoteExportCss();

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
${rtlCss}
  </style>
</head>
<body>
  <main class="sheet quote-sheet"${dir} aria-label="Quotation sheet">${body}</main>
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
    await page.emulateMedia({ media: "screen" });
    await page.setContent(html, { waitUntil: "networkidle" });
    await waitForAssets(page);
    const contentHeight = await measureContentHeight(page);
    const targetHeight = Math.max(1536, contentHeight);
    return await page.pdf({
      width: "1024px",
      height: `${targetHeight}px`,
      printBackground: true,
      margin: { top: 0, right: 0, bottom: 0, left: 0 },
      scale: 1
    });
  } finally {
    await browser.close();
  }
}

async function waitForAssets(page) {
  await page.evaluate(async () => {
    await document.fonts?.ready;
    await Promise.all([...document.images].map((image) => {
      if (image.complete) return Promise.resolve();
      return new Promise((resolve) => {
        image.addEventListener("load", resolve, { once: true });
        image.addEventListener("error", resolve, { once: true });
      });
    }));
  });
}

async function measureContentHeight(page) {
  return await page.evaluate(() => {
    const sheet = document.querySelector(".quote-sheet");
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
