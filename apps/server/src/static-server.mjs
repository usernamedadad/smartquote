/**
 * 静态文件服务 + 下载工具函数
 */
import { existsSync, createReadStream } from "node:fs";
import path from "node:path";
import { sendHtml, contentType } from "./http-helpers.mjs";
import { parseCookies } from "./http-helpers.mjs";
import { findUserBySession } from "./database.mjs";

const SESSION_COOKIE = "smartquote_session";

export async function serveStatic(req, res, url, WEB_DIR, TEMPLATE_DIR, ROOT_DIR) {
  let filePath;

  if (url.pathname === "/" || url.pathname === "/editor" || url.pathname === "/projects") {
    filePath = path.join(WEB_DIR, "index.html");
  } else if (url.pathname.startsWith("/src/")) {
    filePath = safeJoin(WEB_DIR, url.pathname);
  } else if (url.pathname.startsWith("/assets/")) {
    filePath = safeJoin(TEMPLATE_DIR, url.pathname.replace("/assets/", "/"));
  } else if (url.pathname.startsWith("/uploads/images/")) {
    const token = parseCookies(req.headers.cookie)[SESSION_COOKIE];
    if (!findUserBySession(token)) {
      sendHtml(res, "Forbidden", 403);
      return;
    }
    filePath = safeJoin(path.join(ROOT_DIR, "uploads"), url.pathname.replace("/uploads/", "/"));
  } else {
    filePath = safeJoin(WEB_DIR, url.pathname);
  }

  if (!filePath || !existsSync(filePath)) {
    sendHtml(res, "Not found", 404);
    return;
  }

  res.writeHead(200, { "Content-Type": contentType(filePath) });
  createReadStream(filePath).pipe(res);
}

export function pdfContentDisposition(project) {
  const filename = `${sanitizeDownloadName(project.projectName || project.quoteNo || "quotation")}.pdf`;
  const fallback = `${asciiDownloadFallback(project.quoteNo || "quotation")}.pdf`;
  return `attachment; filename="${fallback}"; filename*=UTF-8''${encodeURIComponent(filename)}`;
}

function safeJoin(base, requestPath) {
  const resolved = path.resolve(base, `.${decodeURIComponent(requestPath)}`);
  if (!resolved.startsWith(path.resolve(base))) return null;
  return resolved;
}

function sanitizeDownloadName(value) {
  return String(value || "quotation")
    .trim()
    .replace(/[\\/:*?"<>|]/g, "_")
    .replace(/\s+/g, " ")
    .slice(0, 120) || "quotation";
}

function asciiDownloadFallback(value) {
  return String(value || "quotation")
    .trim()
    .replace(/[^\w.-]+/g, "_")
    .slice(0, 80) || "quotation";
}
