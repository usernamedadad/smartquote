import { DatabaseSync } from "node:sqlite";
import { randomBytes, createHash } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, unlinkSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { initUserStore } from "./user-store.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const ROOT_DIR = path.resolve(__dirname, "../../..");
export const DATA_DIR = path.join(ROOT_DIR, "data");
export const TEMPLATE_DIR = path.join(ROOT_DIR, "templates");
export const STORAGE_DIR = path.join(ROOT_DIR, "storage");
export const UPLOAD_DIR = path.join(ROOT_DIR, "uploads", "images");

mkdirSync(STORAGE_DIR, { recursive: true });
mkdirSync(UPLOAD_DIR, { recursive: true });

const db = new DatabaseSync(path.join(STORAGE_DIR, "app.sqlite"));
const DB_PATH = path.join(STORAGE_DIR, "app.sqlite");
const BACKUP_DIR = path.join(STORAGE_DIR, "backups");
const MAX_BACKUPS = 7;

/** 事务包装：执行 fn，成功 COMMIT，失败 ROLLBACK */
function withTransaction(fn) {
  db.exec("BEGIN");
  try {
    const result = fn();
    db.exec("COMMIT");
    return result;
  } catch (err) {
    db.exec("ROLLBACK");
    throw err;
  }
}

function now() {
  return new Date().toISOString();
}

function sha(value) {
  return createHash("sha256").update(value).digest("hex");
}

export function hashPassword(password, salt) {
  return sha(`${salt}:${password}`);
}

function json(value) {
  return JSON.stringify(value ?? {});
}

function parseJson(value, fallback = {}) {
  try {
    return value ? JSON.parse(value) : fallback;
  } catch {
    return fallback;
  }
}

export function initDatabase() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      salt TEXT NOT NULL,
      display_name TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'sales',
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS sessions (
      token TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS projects (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      quote_no TEXT NOT NULL,
      title TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'draft',
      data_json TEXT NOT NULL,
      created_by INTEGER NOT NULL,
      updated_by INTEGER NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (created_by) REFERENCES users(id),
      FOREIGN KEY (updated_by) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS images (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      filename TEXT NOT NULL,
      original_name TEXT NOT NULL,
      storage_path TEXT NOT NULL,
      url TEXT NOT NULL,
      category TEXT NOT NULL DEFAULT 'product',
      mime_type TEXT NOT NULL DEFAULT 'image/png',
      created_by INTEGER,
      created_at TEXT NOT NULL,
      FOREIGN KEY (created_by) REFERENCES users(id)
    );
  `);

  // 启用 WAL 模式提升并发读写性能
  db.exec("PRAGMA journal_mode=WAL");

  migrateUserContactFields();
  seedAdminUser();
  seedDefaultImage();
  migrateProjectNames();
  createIsolationIndexes();

  initUserStore(db, hashPassword, withTransaction);

  // 启动时备份一次
  backupDatabase();
  cleanExpiredSessions();
}

function migrateUserContactFields() {
  const columns = [
    "company TEXT NOT NULL DEFAULT ''",
    "contact_name TEXT NOT NULL DEFAULT ''",
    "whatsapp TEXT NOT NULL DEFAULT ''",
    "email_contact TEXT NOT NULL DEFAULT ''",
    "website TEXT NOT NULL DEFAULT ''",
    "phone TEXT NOT NULL DEFAULT ''"
  ];
  for (const col of columns) {
    const colName = col.split(" ")[0];
    try {
      db.exec(`ALTER TABLE users ADD COLUMN ${col}`);
    } catch {
      // 列已存在，跳过
    }
  }
}

function createIsolationIndexes() {
  db.exec("CREATE INDEX IF NOT EXISTS idx_projects_created_by ON projects(created_by)");
  db.exec("CREATE INDEX IF NOT EXISTS idx_images_created_by ON images(created_by)");
}

function seedAdminUser() {
  const found = db.prepare("SELECT id FROM users WHERE username = ?").get("admin");
  if (found) {
    // 为已有 admin 账号补充联系方式（仅在字段为空时）
    if (!found.company && !found.contact_name) {
      db.prepare(`
        UPDATE users SET company = ?, contact_name = ?, whatsapp = ?, email_contact = ?, website = ?, phone = ?
        WHERE id = ?
      `).run(
        "Henan Zoke Crane Co., Ltd.", "Krystal", "+86 16609015589",
        "krystal@zkhoist.com", "www.zkhoist.com", "+86 16609015589",
        found.id
      );
    }
    return;
  }

  const salt = randomBytes(12).toString("hex");
  db.prepare(`
    INSERT INTO users (username, password_hash, salt, display_name, role, created_at,
      company, contact_name, whatsapp, email_contact, website, phone)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    "admin", hashPassword("admin123", salt), salt, "销售管理员", "admin", now(),
    "Henan Zoke Crane Co., Ltd.", "Krystal", "+86 16609015589",
    "krystal@zkhoist.com", "www.zkhoist.com", "+86 16609015589"
  );
}

function seedDefaultImage() {
  const found = db.prepare("SELECT id FROM images WHERE filename = ?").get("image4.png");
  const imagePath = path.join(TEMPLATE_DIR, "image4.png");
  if (found || !existsSync(imagePath)) return;

  db.prepare(`
    INSERT INTO images (filename, original_name, storage_path, url, category, mime_type, created_by, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    "image4.png",
    "image4.png",
    path.join("templates", "image4.png"),
    "/assets/image4.png",
    "product",
    "image/png",
    null,
    now()
  );
}

export function findUserByUsername(username) {
  return db.prepare("SELECT * FROM users WHERE username = ?").get(username);
}

export function findUserBySession(token) {
  if (!token) return null;
  return db.prepare(`
    SELECT users.id, users.username, users.display_name, users.role,
      users.company, users.contact_name, users.whatsapp,
      users.email_contact, users.website, users.phone
    FROM sessions
    JOIN users ON users.id = sessions.user_id
    WHERE sessions.token = ?
  `).get(token);
}

export function createSession(userId) {
  const token = randomBytes(32).toString("hex");
  db.prepare("INSERT INTO sessions (token, user_id, created_at) VALUES (?, ?, ?)").run(token, userId, now());
  return token;
}

export function deleteSession(token) {
  db.prepare("DELETE FROM sessions WHERE token = ?").run(token);
}

export function listImages(userId = null, isAdmin = false) {
  const sql = isAdmin
    ? "SELECT * FROM images ORDER BY created_at DESC, id DESC"
    : "SELECT * FROM images WHERE created_by IS NULL OR created_by = ? ORDER BY created_at DESC, id DESC";
  const rows = isAdmin ? db.prepare(sql).all() : db.prepare(sql).all(userId);
  return rows.map(normalizeImage);
}

export function getImagesByIds(ids) {
  if (!ids?.length) return [];
  const placeholders = ids.map(() => "?").join(",");
  const rows = db.prepare(`SELECT * FROM images WHERE id IN (${placeholders})`).all(...ids);
  const byId = new Map(rows.map((row) => [row.id, normalizeImage(row)]));
  return ids.map((id) => byId.get(Number(id))).filter(Boolean);
}

export function addImage({ filename, originalName, storagePath, url, mimeType, createdBy }) {
  const result = db.prepare(`
    INSERT INTO images (filename, original_name, storage_path, url, category, mime_type, created_by, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(filename, originalName, storagePath, url, "product", mimeType, createdBy, now());
  return getImage(result.lastInsertRowid, createdBy);
}

export function getImage(id, userId = null, isAdmin = false) {
  const row = isAdmin
    ? db.prepare("SELECT * FROM images WHERE id = ?").get(id)
    : db.prepare("SELECT * FROM images WHERE id = ? AND (created_by IS NULL OR created_by = ?)").get(id, userId);
  return row ? normalizeImage(row) : null;
}

export function deleteImage(id, userId = null, isAdmin = false) {
  if (isAdmin) {
    return db.prepare("DELETE FROM images WHERE id = ? AND filename != 'image4.png'").run(id);
  }
  return db.prepare(
    "DELETE FROM images WHERE id = ? AND created_by = ? AND filename != 'image4.png'"
  ).run(id, userId);
}

function normalizeImage(row) {
  return {
    id: row.id,
    filename: row.filename,
    originalName: row.original_name,
    storagePath: row.storage_path,
    url: row.url,
    category: row.category,
    mimeType: row.mime_type,
    createdBy: row.created_by,
    createdAt: row.created_at
  };
}

export function listProjects(userId = null, isAdmin = false) {
  const sql = isAdmin
    ? `SELECT projects.*, users.display_name AS created_by_name
       FROM projects LEFT JOIN users ON users.id = projects.created_by
       ORDER BY updated_at DESC, id DESC`
    : `SELECT projects.*, users.display_name AS created_by_name
       FROM projects LEFT JOIN users ON users.id = projects.created_by
       WHERE projects.created_by = ?
       ORDER BY updated_at DESC, id DESC`;
  const rows = isAdmin ? db.prepare(sql).all() : db.prepare(sql).all(userId);
  return rows.map(normalizeProjectListRow);
}

export function getProject(id, userId = null, isAdmin = false) {
  const row = isAdmin
    ? db.prepare("SELECT * FROM projects WHERE id = ?").get(id)
    : db.prepare("SELECT * FROM projects WHERE id = ? AND created_by = ?").get(id, userId);
  return row ? normalizeProject(row) : null;
}

export function createProject(data, userId, projectName = "") {
  return withTransaction(() => {
    const current = now();
    const title = normalizeProjectTitle(projectName, current);
    const result = db.prepare(`
      INSERT INTO projects (quote_no, title, status, data_json, created_by, updated_by, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      data.quoteMeta.quoteNo,
      title,
      "draft",
      json(withoutProjectName(data)),
      userId,
      userId,
      current,
      current
    );
    return getProject(result.lastInsertRowid, userId);
  });
}

export function updateProject(id, data, userId, isAdmin = false) {
  return withTransaction(() => {
    const current = now();
    const existing = getProject(id, userId, isAdmin);
    if (!existing) return null;
    db.prepare(`
      UPDATE projects
      SET quote_no = ?, title = ?, data_json = ?, updated_by = ?, updated_at = ?
      WHERE id = ?
    `).run(
      data.quoteMeta.quoteNo,
      existing.projectName,
      json(withoutProjectName(data)),
      userId,
      current,
      id
    );
    return getProject(id, userId, isAdmin);
  });
}

export function removeProject(id, userId = null, isAdmin = false) {
  if (isAdmin) {
    return db.prepare("DELETE FROM projects WHERE id = ?").run(id);
  }
  return db.prepare("DELETE FROM projects WHERE id = ? AND created_by = ?").run(id, userId);
}

function normalizeProjectListRow(row) {
  const data = parseJson(row.data_json);
  const firstItem = Array.isArray(data.quoteItems) ? data.quoteItems[0] : null;
  return {
    id: row.id,
    quoteNo: row.quote_no,
    title: row.title,
    status: row.status,
    projectName: row.title || fallbackProjectName(row.created_at, row.id),
    productName: firstItem?.product?.enName || data.product?.enName || "",
    customerName: data.to?.company || data.to?.name || "",
    createdByName: row.created_by_name || "",
    data,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function normalizeProject(row) {
  const data = withoutProjectName(parseJson(row.data_json));
  return {
    id: row.id,
    quoteNo: row.quote_no,
    title: row.title,
    status: row.status,
    projectName: row.title || fallbackProjectName(row.created_at, row.id),
    data,
    createdBy: row.created_by,
    updatedBy: row.updated_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

export function renameProject(id, projectName, userId, isAdmin = false) {
  return withTransaction(() => {
    const existing = getProject(id, userId, isAdmin);
    if (!existing) return null;
    const current = now();
    db.prepare(`
      UPDATE projects
      SET title = ?, updated_by = ?, updated_at = ?
      WHERE id = ?
    `).run(normalizeProjectTitle(projectName, current), userId, current, id);
    return getProject(id, userId, isAdmin);
  });
}

export function nextQuoteNo() {
  return "ZH061226K1V1";
}

export function defaultImageId() {
  return db.prepare("SELECT id FROM images WHERE filename = ?").get("image4.png")?.id ?? null;
}

function migrateProjectNames() {
  withTransaction(() => {
    const rows = db.prepare("SELECT id, quote_no, title, data_json, created_at FROM projects").all();
    const update = db.prepare("UPDATE projects SET title = ?, data_json = ? WHERE id = ?");

    for (const row of rows) {
      const data = parseJson(row.data_json);
      const embeddedName = String(data.projectName || "").trim();
      const quoteTitle = String(data.quoteMeta?.title || "").trim();
      const title = String(row.title || "").trim();
      const titleLooksBound = !title || title === row.quote_no || title === quoteTitle;
      const nextTitle = embeddedName || (titleLooksBound ? fallbackProjectName(row.created_at, row.id) : title);
      const nextData = withoutProjectName(data);

      if (nextTitle !== title || JSON.stringify(nextData) !== row.data_json) {
        update.run(nextTitle, json(nextData), row.id);
      }
    }
  });
}

function normalizeProjectTitle(value, timestamp = now()) {
  const title = String(value || "").trim();
  return title || fallbackProjectName(timestamp);
}

function fallbackProjectName(timestamp = now(), id = "") {
  const date = new Date(timestamp);
  const stamp = Number.isNaN(date.getTime())
    ? new Date().toISOString().slice(0, 10).replaceAll("-", "")
    : date.toISOString().slice(0, 10).replaceAll("-", "");
  const suffix = id ? String(id).padStart(3, "0") : randomBytes(2).toString("hex").toUpperCase();
  return `新建项目 ${stamp}-${suffix}`;
}

function withoutProjectName(data) {
  const clone = structuredClone(data || {});
  delete clone.projectName;
  return clone;
}

/* ---- 数据库备份 ---- */

export function backupDatabase() {
  try {
    mkdirSync(BACKUP_DIR, { recursive: true });
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 23);
    const backupPath = path.join(BACKUP_DIR, `app-${timestamp}.sqlite`);
    // VACUUM INTO 要求目标文件不存在，同秒重启会撞名，先清除
    if (existsSync(backupPath)) unlinkSync(backupPath);
    db.prepare(`VACUUM INTO ?`).run(backupPath);
    pruneOldBackups();
    console.log(`数据库备份: ${backupPath}`);
  } catch (err) {
    console.error("数据库备份失败:", err.message);
  }
}

function pruneOldBackups() {
  try {
    const files = readdirSync(BACKUP_DIR)
      .filter((f) => f.startsWith("app-") && f.endsWith(".sqlite"))
      .sort()
      .reverse(); // 最新的在前
    // 删除超出保留数量的旧备份
    for (let i = MAX_BACKUPS; i < files.length; i++) {
      unlinkSync(path.join(BACKUP_DIR, files[i]));
    }
  } catch {
    // 备份清理失败不影响正常运行
  }
}

export function cleanExpiredSessions() {
  try {
    const result = db.prepare("DELETE FROM sessions WHERE created_at < datetime('now', '-30 days')").run();
    if (result.changes) console.log(`清理 ${result.changes} 条过期 session`);
  } catch (err) {
    console.error("Session 清理失败:", err.message);
  }
}
