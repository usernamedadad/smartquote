/**
 * 用户管理：数据库 CRUD + API 路由处理
 */
import { randomBytes, createHash } from "node:crypto";
import { readJson, sendJson } from "./http-helpers.mjs";

/* ---- 依赖注入 ---- */

let db;
let hashFn = (password, salt) => createHash("sha256").update(`${salt}:${password}`).digest("hex");
let txFn;

/**
 * 由 database.mjs 的 initDatabase() 调用，注入 db 实例和 hashPassword
 */
export function initUserStore(database, passwordHashFn, transactionFn) {
  db = database;
  if (passwordHashFn) hashFn = passwordHashFn;
  if (transactionFn) txFn = transactionFn;
}

/* ---- 数据库 CRUD ---- */

const USER_FIELDS = "id, username, display_name, role, created_at, company, contact_name, whatsapp, email_contact, website, phone";

export function listUsers() {
  return db.prepare(`
    SELECT ${USER_FIELDS}
    FROM users
    ORDER BY role = 'admin' DESC, created_at ASC
  `).all();
}

export function createUser({ username, password, displayName, role = "sales",
  company = "", contactName = "", whatsapp = "", emailContact = "", website = "", phone = "" }) {
  const salt = randomBytes(12).toString("hex");
  const passwordHash = hashFn(password, salt);
  const now = new Date().toISOString();
  const result = db.prepare(`
    INSERT INTO users (username, password_hash, salt, display_name, role, created_at,
      company, contact_name, whatsapp, email_contact, website, phone)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(username, passwordHash, salt, displayName, role, now,
    company, contactName, whatsapp, emailContact, website, phone);
  return db.prepare(`SELECT ${USER_FIELDS} FROM users WHERE id = ?`)
    .get(result.lastInsertRowid);
}

/**
 * 用户修改自己的密码（需验证旧密码）
 */
export function changeOwnPassword(userId, oldPassword, newPassword) {
  const user = db.prepare("SELECT password_hash, salt FROM users WHERE id = ?").get(userId);
  if (!user) return { ok: false, error: "用户不存在" };
  if (hashFn(oldPassword, user.salt) !== user.password_hash) {
    return { ok: false, error: "旧密码不正确" };
  }
  if (!newPassword || newPassword.length < 4) {
    return { ok: false, error: "新密码至少 4 个字符" };
  }
  resetUserPassword(userId, newPassword);
  return { ok: true };
}

export function updateUser(id, { displayName, role,
  company, contactName, whatsapp, emailContact, website, phone }) {
  const current = db.prepare("SELECT role FROM users WHERE id = ?").get(id);
  if (current && current.role === "admin" && role !== "admin") {
    const adminCount = db.prepare("SELECT COUNT(*) AS count FROM users WHERE role = 'admin'").get();
    if (adminCount.count <= 1) return null;
  }
  db.prepare(`
    UPDATE users SET display_name = ?, role = ?,
      company = ?, contact_name = ?, whatsapp = ?, email_contact = ?, website = ?, phone = ?
    WHERE id = ?
  `).run(displayName, role,
    company ?? "", contactName ?? "", whatsapp ?? "", emailContact ?? "", website ?? "", phone ?? "",
    id);
  return db.prepare(`SELECT ${USER_FIELDS} FROM users WHERE id = ?`).get(id);
}

export function resetUserPassword(id, newPassword) {
  const salt = randomBytes(12).toString("hex");
  const passwordHash = hashFn(newPassword, salt);
  db.prepare("UPDATE users SET password_hash = ?, salt = ? WHERE id = ?")
    .run(passwordHash, salt, id);
  return true;
}

export function deleteUser(id) {
  const user = db.prepare("SELECT role FROM users WHERE id = ?").get(id);
  if (!user || user.role === "admin") return false;
  txFn(() => {
    db.prepare("DELETE FROM sessions WHERE user_id = ?").run(id);
    db.prepare("DELETE FROM users WHERE id = ?").run(id);
  });
  return true;
}

/* ---- API 路由处理 ---- */

export async function handleUserApi(req, res, url, user) {
  if (user.role !== "admin") return false;

  if (url.pathname === "/api/users") {
    return await handleUsersCollection(req, res);
  }

  const match = url.pathname.match(/^\/api\/users\/(\d+)$/);
  if (match) {
    return await handleUsersItem(req, res, Number(match[1]));
  }

  return false;
}

async function handleUsersCollection(req, res) {
  if (req.method === "GET") {
    sendJson(res, 200, { users: listUsers() });
    return true;
  }

  if (req.method === "POST") {
    const body = await readJson(req);
    if (!body.username || !body.password || !body.displayName) {
      sendJson(res, 400, { error: "用户名、密码和显示名称不能为空" });
      return true;
    }
    try {
      const newUser = createUser({
        username: body.username,
        password: body.password,
        displayName: body.displayName,
        role: body.role === "admin" ? "admin" : "sales",
        company: body.company || "",
        contactName: body.contactName || "",
        whatsapp: body.whatsapp || "",
        emailContact: body.emailContact || "",
        website: body.website || "",
        phone: body.phone || ""
      });
      sendJson(res, 201, { user: newUser });
    } catch (err) {
      if (err.message?.includes("UNIQUE")) {
        sendJson(res, 409, { error: "用户名已存在" });
      } else {
        throw err;
      }
    }
    return true;
  }

  return false;
}

async function handleUsersItem(req, res, targetId) {
  if (req.method === "PUT") {
    const body = await readJson(req);
    const updated = updateUser(targetId, {
      displayName: body.displayName,
      role: body.role,
      company: body.company,
      contactName: body.contactName,
      whatsapp: body.whatsapp,
      emailContact: body.emailContact,
      website: body.website,
      phone: body.phone
    });
    if (!updated) {
      sendJson(res, 404, { error: "用户不存在" });
      return true;
    }
    sendJson(res, 200, { user: updated });
    return true;
  }

  if (req.method === "DELETE") {
    const ok = deleteUser(targetId);
    if (!ok) {
      sendJson(res, 400, { error: "无法删除此用户（admin 账号不可删除）" });
      return true;
    }
    sendJson(res, 200, { ok: true });
    return true;
  }

  if (req.method === "POST") {
    const body = await readJson(req);
    if (!body.password) {
      sendJson(res, 400, { error: "新密码不能为空" });
      return true;
    }
    resetUserPassword(targetId, body.password);
    sendJson(res, 200, { ok: true });
    return true;
  }

  return false;
}
