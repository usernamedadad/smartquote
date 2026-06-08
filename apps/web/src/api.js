/**
 * API 层：fetch 封装 + 纯 API 调用
 */
import { state, normalizeQuoteLayout } from "./state.js";
import { formatSaveClock, normalizeGalleryLayout } from "./utils.js";

export async function api(path, options = {}) {
  const headers = options.headers || {};
  let body = options.body;

  if (body && !(body instanceof FormData) && typeof body !== "string") {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify(body);
  }

  const response = await fetch(path, {
    credentials: "include",
    ...options,
    headers,
    body
  });

  if (!response.ok) {
    if (response.status === 401 && !options.allow401) {
      state.user = null;
      _renderLoginPage();
    }
    let message = response.statusText;
    try {
      message = (await response.json()).error || message;
    } catch {}
    throw new Error(message);
  }

  return response.json();
}

export async function loadWorkspace() {
  const [products, projects, images] = await Promise.all([
    api("/api/products"),
    api("/api/projects"),
    api("/api/images")
  ]);

  state.products = products.products;
  state.projects = projects.projects;
  state.images = images.images;
}

export async function saveProject() {
  if (!state.activeProject || state.saving) return;
  state.saving = true;
  const status = document.querySelector("#save-state");
  if (status) status.textContent = "保存中";

  try {
    normalizeGalleryLayout(state.activeProject.data, state.images);
    const { project } = await api(`/api/projects/${state.activeProject.id}`, {
      method: "PUT",
      body: { data: state.activeProject.data }
    });
    state.activeProject = project;
    normalizeQuoteLayout(state.activeProject.data);
    state.dirty = false;
    if (status) status.textContent = saveStateText();
    _showToast?.("保存成功");
  } catch (err) {
    _showToast?.("保存失败，请重试", { tone: "error" });
    throw err;
  } finally {
    state.saving = false;
  }
}

export function saveStateText() {
  if (state.dirty) return "未保存";
  const time = formatSaveClock(state.activeProject?.updatedAt);
  return time ? `已保存 ${time}` : "已保存";
}

export async function exportPdf() {
  if (state.dirty) await saveProject();
  const response = await fetch(`/api/projects/${state.activeProject.id}/pdf`, {
    credentials: "include"
  });

  if (!response.ok) {
    await _showAppModal({
      title: "PDF 导出失败",
      message: "请确认 Playwright 可用后重试。",
      tone: "danger",
      actions: [{ label: "我知道了", value: "ok", variant: "primary" }]
    });
    return;
  }

  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${downloadFileName(state.activeProject.projectName || state.activeProject.data.quoteMeta.quoteNo || "quotation")}.pdf`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export async function createProject(projectName = "", { open = true } = {}) {
  const { project } = await api("/api/projects", {
    method: "POST",
    body: { projectName }
  });
  await loadWorkspace();
  if (open) await _openProject(project.id);
  else _renderProjectsPage();
}

export async function duplicateProject(id) {
  const { project } = await api(`/api/projects/${id}/duplicate`, { method: "POST" });
  await loadWorkspace();
  await _openProject(project.id);
}

export async function deleteProject(id) {
  await api(`/api/projects/${id}`, { method: "DELETE" });
  await loadWorkspace();
  _renderProjectsPage();
}

/**
 * openProject / uploadImage / deleteImage 涉及视图切换，
 * 由 main.js 注入实现以避免循环依赖
 */
let _openProject, _renderLoginPage, _renderProjectsPage, _showAppModal, _showToast;

export function registerApiCallbacks({ openProject, renderLoginPage, renderProjectsPage, showAppModal, showToast }) {
  _openProject = openProject;
  _renderLoginPage = renderLoginPage;
  _renderProjectsPage = renderProjectsPage;
  _showAppModal = showAppModal;
  _showToast = showToast;
}

function downloadFileName(value) {
  return String(value || "quotation")
    .trim()
    .replace(/[\\/:*?"<>|]/g, "_")
    .replace(/\s+/g, " ")
    .slice(0, 120) || "quotation";
}

/* ---- 用户管理 API ---- */

export async function listUsers() {
  const { users } = await api("/api/users");
  return users;
}

export async function createUserAccount({ username, password, displayName, role,
  company, contactName, whatsapp, emailContact, website, phone }) {
  const { user } = await api("/api/users", {
    method: "POST",
    body: { username, password, displayName, role,
      company, contactName, whatsapp, emailContact, website, phone }
  });
  return user;
}

export async function updateUserAccount(id, { displayName, role,
  company, contactName, whatsapp, emailContact, website, phone }) {
  const { user } = await api(`/api/users/${id}`, {
    method: "PUT",
    body: { displayName, role,
      company, contactName, whatsapp, emailContact, website, phone }
  });
  return user;
}

export async function deleteUserAccount(id) {
  await api(`/api/users/${id}`, { method: "DELETE" });
}

export async function resetUserPassword(id, password) {
  await api(`/api/users/${id}`, {
    method: "POST",
    body: { password }
  });
}
