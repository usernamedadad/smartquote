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
import { markDirty, renderQuotePreview, registerPreviewCallbacks } from "./views/preview.js";
import { rerenderSelectedImages, addAccessory, selectProduct, removeQuoteItem, renderModuleEditor } from "./views/editor-modules.js";
import { registerTranslateCallbacks } from "./translate.js";
import { syncSectionFromPreview, refreshFullscreenCard } from "./views/fullscreen-editor.js";

/* ---- 注册回调（解决循环依赖） ---- */

registerApiCallbacks({ openProject, renderLoginPage, renderProjectsPage, showAppModal, showToast });
registerTopbarCallbacks({ renderLoginPage, loadWorkspace, renderProjectsPage, renderEditorPage, exportPdf });
registerLoginCallbacks({ renderProjectsPage });
registerUsersCallbacks({ renderProjectsPage });
registerProjectsCallbacks({ openProject, uploadImage, uploadImageFromFile, deleteImage, renderUsersPage });
registerEditorCallbacks({ openProject, loadWorkspace });
registerEditorModulesCallbacks({ renderEditorPage, uploadImageFromFile, deleteImage, refreshFullscreenCard });

/** 滚动到指定产品/配件卡片，补偿 sticky 产品条高度 */
function scrollToQuoteItem(itemIndex) {
  const card = document.querySelector(`[data-quote-item="${itemIndex}"]`);
  const editor = document.querySelector(".module-editor");
  const sticky = document.querySelector(".product-strip-sticky");
  if (!card || !editor) return;
  const item = state.activeProject?.data?.quoteItems?.[itemIndex];
  if (item?.collapsed) {
    item.collapsed = false;
    card.classList.remove("collapsed");
    const body = card.querySelector(".quote-item-body");
    if (body) body.style.display = "";
  }
  const stickyH = sticky ? sticky.offsetHeight : 0;
  const offset = card.offsetTop - editor.offsetTop - stickyH - 8;
  editor.scrollTo({ top: Math.max(0, offset), behavior: "smooth" });
}

registerPreviewCallbacks({
  rerenderSelectedImages,
  addAccessory,
  selectProduct,
  removeQuoteItem,
  syncSectionFromPreview,
  refreshFullscreenCard,
  refreshModuleEditor: renderModuleEditor,
  refreshEditor: () => {
    /* 全屏中刷新预览区 + 右侧卡片 */
    if (state.previewFullscreen) {
      renderQuotePreview();
      refreshFullscreenCard();
      return;
    }
    renderEditorPage();
  },
  switchToModule: (moduleId, itemIndex) => {
    const sameModule = state.activeModule === moduleId;
    state.activeModule = moduleId;

    /* 同模块：只滚动到目标卡片，不重渲染 */
    if (sameModule) {
      if (itemIndex == null) return;
      scrollToQuoteItem(itemIndex);
      return;
    }

    /* 跨模块：重渲染编辑区 + 滚动 */
    renderEditorPage();
    if (itemIndex != null) {
      requestAnimationFrame(() => scrollToQuoteItem(itemIndex));
    }
  },
});
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
  /* 全屏模式下不重建编辑器（会销毁全屏元素），由调用方自行刷新预览 */
  if (state.previewFullscreen) return;
  if (state.view === "editor") renderEditorPage();
  else renderProjectsPage();
}

async function deleteImage(id) {
  await api(`/api/images/${id}`, { method: "DELETE" });
  await loadWorkspace();
  if (state.activeProject) {
    recordUndoSnapshot();
    state.activeProject.data.selectedImageIds = state.activeProject.data.selectedImageIds.filter((imageId) => Number(imageId) !== Number(id));
    (state.activeProject.data.quoteItems || []).forEach((item) => {
      if (Number(item.imageId) === Number(id)) item.imageId = "";
    });
    normalizeGalleryLayout(state.activeProject.data, state.images);
    markDirty();
    renderEditorPage();
  } else {
    renderProjectsPage();
  }
}
