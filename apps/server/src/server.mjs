import http from "node:http";
import { readFile, writeFile, unlink } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { randomBytes } from "node:crypto";
import { fileURLToPath } from "node:url";
import {
  ROOT_DIR,
  DATA_DIR,
  TEMPLATE_DIR,
  UPLOAD_DIR,
  initDatabase,
  findUserByUsername,
  findUserBySession,
  createSession,
  deleteSession,
  hashPassword,
  listProjects,
  getProject,
  createProject,
  updateProject,
  renameProject,
  removeProject,
  listImages,
  addImage,
  getImage,
  getImagesByIds,
  deleteImage,
  nextQuoteNo,
  defaultImageId,
  backupDatabase,
  cleanExpiredSessions
} from "./database.mjs";
import { exportPdf, renderQuoteHtml } from "./renderQuote.mjs";
import { readJson, sendJson, sendHtml, parseCookies, setCookie, clearCookie, contentType } from "./http-helpers.mjs";
import { handleUserApi, changeOwnPassword, updateUser } from "./user-store.mjs";
import { serveStatic, pdfContentDisposition } from "./static-server.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WEB_DIR = path.resolve(__dirname, "../../web");
const PORT = Number(process.env.PORT || 5173);
const SESSION_COOKIE = "smartquote_session";

initDatabase();

process.on("uncaughtException", (error) => {
  console.error("Uncaught exception:", error);
  process.exit(1);
});

process.on("unhandledRejection", (error) => {
  console.error("Unhandled rejection:", error);
  process.exitCode = 1;
});

process.on("exit", (code) => {
  if (code) console.error(`SmartQuote server exited with code ${code}`);
});

const server = http.createServer(async (req, res) => {
  // 安全响应头
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");

  try {
    const url = new URL(req.url, `http://${req.headers.host}`);

    if (url.pathname.startsWith("/api/")) {
      await handleApi(req, res, url);
      return;
    }

    await serveStaticFallback(req, res, url);
  } catch (error) {
    console.error(error);
    sendJson(res, 500, { error: error.message || "Internal server error" });
  }
});

server.listen(PORT, () => {
  console.log(`SmartQuote editor is running at http://localhost:${PORT}`);
  // 每 6 小时自动备份
  setInterval(backupDatabase, 6 * 60 * 60 * 1000);
  // 每 24 小时清理过期 session
  setInterval(cleanExpiredSessions, 24 * 60 * 60 * 1000);
});

async function handleApi(req, res, url) {
  if (req.method === "POST" && url.pathname === "/api/login") {
    const body = await readJson(req);
    const user = findUserByUsername(body.username);

    if (!user) {
      sendJson(res, 401, { error: "用户名不存在" });
      return;
    }
    if (user.password_hash !== hashPassword(body.password || "", user.salt)) {
      sendJson(res, 401, { error: "密码错误" });
      return;
    }

    const token = createSession(user.id);
    setCookie(res, SESSION_COOKIE, token);
    sendJson(res, 200, {
      user: {
        id: user.id,
        username: user.username,
        displayName: user.display_name,
        role: user.role,
        company: user.company || "",
        contactName: user.contact_name || "",
        whatsapp: user.whatsapp || "",
        emailContact: user.email_contact || "",
        website: user.website || "",
        phone: user.phone || ""
      }
    });
    return;
  }

  const user = getRequestUser(req);

  if (req.method === "GET" && url.pathname === "/api/me") {
    sendJson(res, 200, { user });
    return;
  }

  if (!user) {
    sendJson(res, 401, { error: "请先登录" });
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/change-password") {
    const body = await readJson(req);
    const result = changeOwnPassword(user.id, body.oldPassword, body.newPassword);
    if (!result.ok) {
      sendJson(res, 400, { error: result.error });
      return;
    }
    sendJson(res, 200, { ok: true });
    return;
  }

  if (req.method === "PUT" && url.pathname === "/api/me/profile") {
    const body = await readJson(req);
    const updated = updateUser(user.id, {
      displayName: body.displayName || user.display_name,
      role: user.role,
      company: body.company,
      contactName: body.contactName,
      whatsapp: body.whatsapp,
      emailContact: body.emailContact,
      website: body.website,
      phone: body.phone
    });
    if (!updated) {
      sendJson(res, 404, { error: "用户不存在" });
      return;
    }
    sendJson(res, 200, { user: updated });
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/translate") {
    const body = await readJson(req);
    const { texts, targetLang } = body;
    if (!Array.isArray(texts) || !targetLang) {
      sendJson(res, 400, { error: "参数不正确" });
      return;
    }
    const translations = await batchTranslate(texts, targetLang);
    sendJson(res, 200, { translations });
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/logout") {
    const token = parseCookies(req.headers.cookie)[SESSION_COOKIE];
    if (token) deleteSession(token);
    clearCookie(res, SESSION_COOKIE);
    sendJson(res, 200, { ok: true });
    return;
  }

  /* ---- 用户管理（仅 admin）---- */
  if (url.pathname.startsWith("/api/users")) {
    const handled = await handleUserApi(req, res, url, user);
    if (handled) return;
    if (user.role !== "admin") {
      sendJson(res, 403, { error: "没有管理员权限" });
      return;
    }
  }

  if (req.method === "GET" && url.pathname === "/api/products") {
    sendJson(res, 200, { products: await readProducts() });
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/images") {
    sendJson(res, 200, { images: listImages(user.id, user.role === "admin") });
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/images") {
    const body = await readJson(req, 16 * 1024 * 1024);
    const image = await saveUploadedImage(body, user.id);
    sendJson(res, 201, { image });
    return;
  }

  const imageDeleteMatch = url.pathname.match(/^\/api\/images\/(\d+)$/);
  if (req.method === "DELETE" && imageDeleteMatch) {
    const image = getImage(Number(imageDeleteMatch[1]), user.id, user.role === "admin");
    if (!image) {
      sendJson(res, 404, { error: "图片不存在或无权操作" });
      return;
    }

    deleteImage(image.id, user.id, user.role === "admin");
    if (image.storagePath.startsWith(path.join("uploads", "images"))) {
      await unlink(path.join(ROOT_DIR, image.storagePath)).catch(() => {});
    }
    sendJson(res, 200, { ok: true });
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/projects") {
    sendJson(res, 200, { projects: listProjects(user.id, user.role === "admin") });
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/projects") {
    const products = await readProducts();
    const body = await readJson(req).catch(() => ({}));
    const data = createDefaultProjectData(products[0], user);
    const project = createProject(data, user.id, body.projectName);
    sendJson(res, 201, { project });
    return;
  }

  const projectMatch = url.pathname.match(/^\/api\/projects\/(\d+)(?:\/([a-z-]+))?$/);
  if (projectMatch) {
    const projectId = Number(projectMatch[1]);
    const action = projectMatch[2];

    if (req.method === "GET" && !action) {
      const project = getProject(projectId, user.id, user.role === "admin");
      if (!project) {
        sendJson(res, 404, { error: "项目不存在" });
        return;
      }
      sendJson(res, 200, { project });
      return;
    }

    if (req.method === "PUT" && !action) {
      const body = await readJson(req);
      const isAdmin = user.role === "admin";
      const project = body.data
        ? updateProject(projectId, body.data, user.id, isAdmin)
        : renameProject(projectId, body.projectName, user.id, isAdmin);
      if (!project) {
        sendJson(res, 404, { error: "项目不存在或无权操作" });
        return;
      }
      sendJson(res, 200, { project });
      return;
    }

    if (req.method === "DELETE" && !action) {
      const result = removeProject(projectId, user.id, user.role === "admin");
      if (!result.changes) {
        sendJson(res, 404, { error: "项目不存在或无权操作" });
        return;
      }
      sendJson(res, 200, { ok: true });
      return;
    }

    if (req.method === "POST" && action === "duplicate") {
      const project = getProject(projectId, user.id, user.role === "admin");
      if (!project) {
        sendJson(res, 404, { error: "项目不存在" });
        return;
      }
      const data = structuredClone(project.data);
      data.quoteMeta.quoteNo = nextQuoteNo();
      data.quoteMeta.title = `${data.quoteMeta.title || "QUOTATION"} Copy`;
      const duplicated = createProject(data, user.id);
      sendJson(res, 201, { project: duplicated });
      return;
    }

    if (req.method === "GET" && action === "pdf") {
      const project = getProject(projectId, user.id, user.role === "admin");
      if (!project) {
        sendJson(res, 404, { error: "项目不存在" });
        return;
      }
      const images = getImagesByIds(quoteRenderImageIds(project.data));
      const pdf = await exportPdf(project, images);
      res.writeHead(200, {
        "Content-Type": "application/pdf",
        "Content-Disposition": pdfContentDisposition(project),
        "Content-Length": pdf.length
      });
      res.end(pdf);
      return;
    }

    if (req.method === "GET" && action === "html") {
      const project = getProject(projectId, user.id, user.role === "admin");
      if (!project) {
        sendJson(res, 404, { error: "项目不存在" });
        return;
      }
      const images = getImagesByIds(quoteRenderImageIds(project.data));
      sendHtml(res, renderQuoteHtml(project, images));
      return;
    }
  }

  sendJson(res, 404, { error: "接口不存在" });
}

function getRequestUser(req) {
  const token = parseCookies(req.headers.cookie)[SESSION_COOKIE];
  return findUserBySession(token);
}

async function readProducts() {
  const raw = await readFile(path.join(DATA_DIR, "products.json"), "utf8");
  const products = JSON.parse(raw);
  return products.map((product, index) => ({
    id: product.product_id || `product_${index + 1}`,
    cnName: product.cn_name || product.name || `产品 ${index + 1}`,
    enName: product.en_name || product.name || "",
    parameters: product.parameters || {},
    thumbnailUrl: `/src/product-previews/${product.product_id || `product_${index + 1}`}.svg`
  }));
}

const CRANE_PACKAGE = "All crane bodies are packed in waterproof cloth.\nAccessories and electrical components are packed in strong plywood crate.";
const HOIST_PACKAGE = "Packed in strong plywood crate.";

function getPackageText(productId) {
  const hoistIds = ["product_1", "product_2", "product_3", "product_4"];
  return hoistIds.includes(productId) ? HOIST_PACKAGE : CRANE_PACKAGE;
}

function quoteRenderImageIds(data = {}) {
  const ids = new Set((data.selectedImageIds || []).map((id) => Number(id)).filter(Number.isFinite));
  for (const item of data.quoteItems || []) {
    const id = Number(item?.imageId);
    if (Number.isFinite(id)) ids.add(id);
  }
  return [...ids];
}

function createDefaultProjectData(product, user) {
  const quoteNo = nextQuoteNo();
  const defaultImage = defaultImageId();
  const quoteDate = new Date().toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric"
  });

  const defaultCompany = "Henan Zoke Crane Co., Ltd.";
  const packageText = getPackageText(product?.id);

  return {
    quoteMeta: {
      quoteNo,
      date: quoteDate,
      validity: "10 days",
      title: "QUOTATION"
    },
    from: {
      company: user?.company || defaultCompany,
      name: user?.contact_name || "Krystal",
      whatsapp: user?.whatsapp || "+86 16609015589",
      email: user?.email_contact || "krystal@zkhoist.com"
    },
    to: {
      company: "",
      name: "",
      whatsapp: "",
      email: ""
    },
    product: {
      id: product?.id || "",
      cnName: product?.cnName || "",
      enName: product?.enName || ""
    },
    productParameters: structuredClone(product?.parameters || {}),
    quoteItems: [
      {
        id: "item_default",
        type: "product",
        groupId: "",
        product: {
          id: product?.id || "",
          cnName: product?.cnName || "",
          enName: product?.enName || ""
        },
        parameters: structuredClone(product?.parameters || {}),
        pricing: {
          quantity: "1 set",
          unitPrice: "$2,478/set",
          totalAmount: "$2,478"
        },
        collapsed: false
      }
    ],
    pricing: {
      quantity: "1 set",
      unitPrice: "$2,478/set",
      totalAmount: "$2,478",
      subtotal: "$2,478",
      freight: "",
      enabledItems: ["total"]
    },
    terms: {
      shipment: "EXW Changyuan, Xinxiang City, Henan Province, China.",
      payment: "T/T: 40% deposit on order, balance before shipment.",
      leadTime: "25 workdays after receipt of deposit.",
      package: packageText,
      items: [
        { title: "SHIPMENT TERM", content: "EXW Changyuan, Xinxiang City, Henan Province, China." },
        { title: "PAYMENT TERM", content: "T/T: 40% deposit on order, balance before shipment." },
        { title: "LEAD TIME", content: "25 workdays after receipt of deposit." },
        { title: "PACKAGE", content: packageText }
      ]
    },
    footer: {
      company: user?.company || defaultCompany,
      website: user?.website || "www.zkhoist.com",
      email: user?.email_contact || "krystal@zkhoist.com",
      phone: user?.phone || "+86 16609015589"
    },
    selectedImageIds: defaultImage ? [defaultImage] : []
  };
}

async function saveUploadedImage(body, userId) {
  const match = String(body.dataUrl || "").match(/^data:([^;]+);base64,(.+)$/);
  if (!match) throw new Error("图片数据格式不正确");

  const mimeType = match[1];
  const base64 = match[2];
  const originalName = sanitizeFilename(body.filename || "upload.png");
  const ext = extensionFor(mimeType, originalName);
  const filename = `${Date.now()}-${randomBytes(5).toString("hex")}${ext}`;
  const storagePath = path.join("uploads", "images", filename);

  await writeFile(path.join(ROOT_DIR, storagePath), Buffer.from(base64, "base64"));
  return addImage({
    filename,
    originalName,
    storagePath,
    url: `/uploads/images/${filename}`,
    mimeType,
    createdBy: userId
  });
}

function extensionFor(mimeType, filename) {
  const existing = path.extname(filename);
  if (existing) return existing.toLowerCase();
  if (mimeType === "image/jpeg") return ".jpg";
  if (mimeType === "image/webp") return ".webp";
  return ".png";
}

function sanitizeFilename(filename) {
  return path.basename(filename).replace(/[^\w.\-\u4e00-\u9fa5]/g, "_");
}

async function batchTranslate(texts, targetLang) {
  const results = [];
  const concurrency = 5;
  for (let i = 0; i < texts.length; i += concurrency) {
    const batch = texts.slice(i, i + concurrency);
    const batchResults = await Promise.all(
      batch.map(text => googleTranslate(text, targetLang))
    );
    results.push(...batchResults);
  }
  return results;
}

async function googleTranslate(text, targetLang) {
  if (!text || !text.trim()) return text || "";
  try {
    const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=${encodeURIComponent(targetLang)}&dt=t&q=${encodeURIComponent(text)}`;
    const response = await fetch(url, { signal: AbortSignal.timeout(5000) });
    if (!response.ok) return text;
    const data = await response.json();
    return data[0]?.map(item => item[0] || "").join("") || text;
  } catch {
    return text;
  }
}

async function serveStaticFallback(req, res, url) {
  await serveStatic(req, res, url, WEB_DIR, TEMPLATE_DIR, ROOT_DIR);
}
