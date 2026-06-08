/**
 * SmartQuote SPA 入口 — 编排各模块、注册回调、启动
 */
import { state, normalizeQuoteLayout } from "./state.js";
import { fileToDataUrl, normalizeTerms, normalizeGalleryLayout, normalizeQuoteItems, sanitizeProjectData } from "./utils.js";
import { api, loadWorkspace, createProject, duplicateProject, deleteProject, exportPdf, registerApiCallbacks } from "./api.js";
import { showAppModal, showToast } from "./ui.js";
import { initializeProjectHistory, recordUndoSnapshot } from "./history.js";
import { registerTopbarCallbacks } from "./topbar.js";
import { renderLoginPage, registerLoginCallbacks } from "./views/login.js";
import { renderProjectsPage, registerProjectsCallbacks } from "./views/projects.js";
import { renderEditorPage, registerEditorCallbacks } from "./views/editor.js";
import { registerEditorModulesCallbacks } from "./views/editor-modules.js";
import { renderUsersPage, registerUsersCallbacks } from "./views/users.js";
import { markDirty } from "./views/preview.js";
import { registerTranslateCallbacks } from "./translate.js";

/* ---- 注册回调（解决循环依赖） ---- */

registerApiCallbacks({ openProject, renderLoginPage, renderProjectsPage, showAppModal, showToast });
registerTopbarCallbacks({ renderLoginPage, loadWorkspace, renderProjectsPage, renderEditorPage, exportPdf });
registerLoginCallbacks({ renderProjectsPage });
registerUsersCallbacks({ renderProjectsPage });
registerProjectsCallbacks({ openProject, uploadImage, uploadImageFromFile, deleteImage, renderUsersPage });
registerEditorCallbacks({ uploadImage, deleteImage, openProject, loadWorkspace });
registerEditorModulesCallbacks({ renderEditorPage });
registerTranslateCallbacks({ renderEditorPage });

/* ---- 全局错误捕获 ---- */

window.addEventListener("error", (event) => {
  console.error("全局错误:", event.error || event.message);
  showToast("操作出错，请刷新页面重试", { tone: "error" });
});

window.addEventListener("unhandledrejection", (event) => {
  console.error("未处理的异步错误:", event.reason);
  showToast("操作出错，请刷新页面重试", { tone: "error" });
});

window.addEventListener("beforeunload", (event) => {
  if (state.dirty) {
    event.preventDefault();
  }
});

/* ---- 启动 ---- */

boot();

async function boot() {
  try {
    const { user } = await api("/api/me", { allow401: true });
    state.user = user;
    if (user) {
      await loadWorkspace();
      renderProjectsPage();
    } else {
      renderLoginPage();
    }
  } catch {
    renderLoginPage();
  }
}

/* ---- 混合函数（API + 视图切换） ---- */

async function openProject(id) {
  const { project } = await api(`/api/projects/${id}`);
  state.activeProject = project;
  delete state.activeProject.data.projectName;
  sanitizeProjectData(state.activeProject.data);
  normalizeQuoteLayout(state.activeProject.data);
  normalizeQuoteItems(state.activeProject.data, state.products);
  state.activeProject.data.terms = normalizeTerms(state.activeProject.data.terms);
  normalizeGalleryLayout(state.activeProject.data, state.images);
  initializeProjectHistory(state.activeProject.data);
  state.activeModule = "parameters";
  state.dirty = false;
  renderEditorPage();
}

async function uploadImage(event) {
  const file = event.currentTarget.files?.[0];
  if (!file) return;
  await uploadImageFromFile(file);
}

async function uploadImageFromFile(file) {
  const dataUrl = await fileToDataUrl(file);
  await api("/api/images", {
    method: "POST",
    body: { filename: file.name, dataUrl }
  });
  await loadWorkspace();
  if (state.view === "editor") renderEditorPage();
  else renderProjectsPage();
}

async function deleteImage(id) {
  await api(`/api/images/${id}`, { method: "DELETE" });
  await loadWorkspace();
  if (state.activeProject) {
    recordUndoSnapshot();
    state.activeProject.data.selectedImageIds = state.activeProject.data.selectedImageIds.filter((imageId) => Number(imageId) !== Number(id));
    normalizeGalleryLayout(state.activeProject.data, state.images);
    markDirty();
    renderEditorPage();
  } else {
    renderProjectsPage();
  }
}
