/**
 * 编辑器外壳：三栏布局、侧栏、模块切换、预览控制
 */
import { state, modules, app } from "../state.js";
import { escapeHtml, formatTime } from "../utils.js";
import { moduleIconSvg, hamburgerIconSvg, chevronRightSvg, fitViewIconSvg, minusIconSvg, plusIconSvg, fullscreenIconSvg, undoIconSvg, redoIconSvg } from "../icons.js";
import { topbarMarkup, bindTopbar } from "../topbar.js";

import { renderQuotePreview, setPreviewZoom, fitPreviewToPanel } from "./preview.js";
import { renderModuleEditor } from "./editor-modules.js";
import { quoteBodyMarkup, normalizeQuoteLayout, normalizeQuoteItems, normalizeGalleryLayout } from "../quote-template.js";
import { undoLastChange, restoreOriginalProjectData } from "../history.js";
import { api } from "../api.js";

let _openProject, _loadWorkspace;

export function registerEditorCallbacks({ openProject, loadWorkspace }) {
  _openProject = openProject;
  _loadWorkspace = loadWorkspace;
}

export function renderEditorPage() {
  state.view = "editor";
  const data = state.activeProject.data;
  const savedScroll = document.querySelector(".preview-scroll")?.scrollTop || 0;

  app.innerHTML = `
    <main class="app-shell editor-app">
      ${topbarMarkup("editor")}
      <section class="editor-layout ${state.sidebarCollapsed ? "sidebar-collapsed" : ""} ${state.sidebarMotion ? "sidebar-motion" : ""}">
        <aside class="module-sidebar">
          <button class="sidebar-toggle" type="button" data-toggle-sidebar aria-label="${state.sidebarCollapsed ? "展开侧边栏" : "收起侧边栏"}" aria-expanded="${!state.sidebarCollapsed}">
            ${hamburgerIconSvg()}
          </button>
          <div class="sidebar-title">
            <strong>模块选择</strong>
          </div>
          <nav class="module-list">
            ${modules.map(moduleButtonMarkup).join("")}
          </nav>
        </aside>

        <section class="module-editor">
          <div class="editor-card">
            <div class="active-module-title">
              <span>${moduleIconSvg(currentModule().icon)}</span>
              <h2>${escapeHtml(currentModule().label)}</h2>
              <i>⌃</i>
            </div>
            <div id="module-editor-body"></div>
          </div>
        </section>

        <aside class="preview-panel">
          <div class="preview-toolbar" aria-label="预览缩放工具">
            <div class="toolbar-left">
              <div class="topbar-history-group" aria-label="编辑历史">
                <button class="topbar-history-tool" type="button" title="撤销上一步编辑" data-undo-change>${undoIconSvg()}<span>撤销</span></button>
                <i aria-hidden="true"></i>
                <button class="topbar-history-tool is-muted" type="button" title="恢复到打开报价单时的初始模板" data-reset-template>${redoIconSvg()}<span>重做</span></button>
              </div>
            </div>
            <div class="toolbar-center">
              <button class="preview-tool" type="button" title="适配视图" data-preview-fit>${fitViewIconSvg()}</button>
              <div class="preview-zoom-group">
                <button class="preview-tool" type="button" title="缩小" data-preview-zoom-out>${minusIconSvg()}</button>
                <strong data-preview-zoom-label>${Math.round(state.zoom * 100)}%</strong>
                <button class="preview-tool" type="button" title="放大" data-preview-zoom-in>${plusIconSvg()}</button>
              </div>
              <button class="preview-tool" type="button" title="全屏预览" data-preview-fullscreen>${fullscreenIconSvg()}</button>
            </div>
            <div class="toolbar-right">
              <button class="preview-switch-btn" type="button" title="切换项目" data-switch-project>
                <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 4h12v14H4z" fill="none" stroke="currentColor" stroke-width="1.8" rx="2"/><path d="M8 6h12v14H8z" fill="none" stroke="currentColor" stroke-width="1.8" rx="2"/><path d="M12 6v14M8 13h12" stroke="currentColor" stroke-width="1.2" opacity="0.4"/></svg>
              </button>
            </div>
          </div>
          <div class="preview-scroll">
            <div class="preview-stage">
              <div id="quote-preview"></div>
            </div>
          </div>
        </aside>
      </section>
    </main>
  `;

  bindTopbar();
  bindSidebarToggle();
  bindModuleNavigation();
  bindPreviewControls();
  renderModuleEditor();
  renderQuotePreview();

  const scrollPanel = document.querySelector(".preview-scroll");
  if (scrollPanel && savedScroll) scrollPanel.scrollTop = savedScroll;
}

/* ---- 内部函数 ---- */

function moduleButtonMarkup(module) {
  return `
    <button class="module-button ${state.activeModule === module.id ? "active" : ""}" data-module="${module.id}">
      <span>${moduleIconSvg(module.icon)}</span>
      ${escapeHtml(module.label)}
      <i>${chevronRightSvg()}</i>
    </button>
  `;
}

function currentModule() {
  return modules.find((module) => module.id === state.activeModule) || modules[0];
}

function bindSidebarToggle() {
  const button = document.querySelector("[data-toggle-sidebar]");
  if (!button) return;
  button.addEventListener("click", () => {
    state.sidebarCollapsed = !state.sidebarCollapsed;
    state.sidebarMotion = true;
    renderEditorPage();
    window.setTimeout(() => {
      state.sidebarMotion = false;
      document.querySelector(".editor-layout")?.classList.remove("sidebar-motion");
    }, 430);
  });
}

function bindModuleNavigation() {
  document.querySelectorAll("[data-module]").forEach((button) => {
    button.addEventListener("click", () => {
      state.activeModule = button.dataset.module;
      renderEditorPage();
    });
  });
}

function bindPreviewControls() {
  document.querySelector("[data-preview-fit]")?.addEventListener("click", fitPreviewToPanel);
  document.querySelector("[data-preview-zoom-out]")?.addEventListener("click", () => setPreviewZoom(state.zoom - 0.05));
  document.querySelector("[data-preview-zoom-in]")?.addEventListener("click", () => setPreviewZoom(state.zoom + 0.05));
  document.querySelector("[data-preview-fullscreen]")?.addEventListener("click", () => {
    const panel = document.querySelector(".preview-panel");
    if (!panel) return;
    if (document.fullscreenElement) document.exitFullscreen();
    else panel.requestFullscreen?.();
  });

  const undo = document.querySelector("[data-undo-change]");
  if (undo) {
    undo.addEventListener("click", () => {
      if (!undoLastChange()) return;
      renderEditorPage();
    });
  }
  const reset = document.querySelector("[data-reset-template]");
  if (reset) {
    reset.addEventListener("click", () => {
      if (!restoreOriginalProjectData()) return;
      renderEditorPage();
    });
  }
  document.querySelector("[data-switch-project]")?.addEventListener("click", openProjectSwitchPanel);
}

/* ---- 切换项目面板 ---- */

async function openProjectSwitchPanel() {
  await _loadWorkspace();
  let overlay = document.querySelector("[data-project-switch-overlay]");
  if (overlay) {
    const grid = overlay.querySelector(".project-switch-grid");
    if (grid) grid.innerHTML = '<div class="project-switch-empty">暂无项目</div>';
    const scroll = overlay.querySelector(".project-switch-scroll");
    const header = overlay.querySelector(".project-switch-header");
    if (scroll && header) {
      scroll.style.height = (window.innerHeight - header.offsetHeight) + "px";
    }
    overlay.classList.add("is-open");
    requestAnimationFrame(() => scaleSwitchPreviews(overlay));
    bindSwitchPanel(overlay);
    return;
  }

  const cards = state.projects.map(switchCardMarkup).join("");
  const panelHtml = cards || '<div class="project-switch-empty">暂无项目</div>';

  overlay = document.createElement("div");
  overlay.className = "project-switch-overlay";
  overlay.dataset.projectSwitchOverlay = "";
  overlay.innerHTML = `
    <aside class="project-switch-panel">
      <header class="project-switch-header">
        <h3>切换项目</h3>
        <button class="project-switch-close" type="button" data-close-project-switch>×</button>
      </header>
      <div class="project-switch-scroll">
        <div class="project-switch-grid">${panelHtml}</div>
      </div>
    </aside>
  `;
  document.body.appendChild(overlay);
  requestAnimationFrame(() => {
    const scroll = overlay.querySelector(".project-switch-scroll");
    const header = overlay.querySelector(".project-switch-header");
    if (scroll && header) {
      scroll.style.height = (window.innerHeight - header.offsetHeight) + "px";
    }
    overlay.classList.add("is-open");
    scaleSwitchPreviews(overlay);
  });
  bindSwitchPanel(overlay);
}

function scaleSwitchPreviews(overlay) {
  overlay.querySelectorAll(".switch-card-preview").forEach((el) => {
    const cardWidth = el.offsetWidth;
    if (!cardWidth) return;
    const scale = cardWidth / 1024;
    const content = el.querySelector(".mini-quote-content");
    if (content) content.style.transform = `scale(${scale})`;
  });
}

function bindSwitchPanel(overlay) {
  overlay.querySelector("[data-close-project-switch]")?.addEventListener("click", closeSwitchPanel);
  overlay.addEventListener("click", (e) => { if (e.target === overlay) closeSwitchPanel(); });
  overlay.querySelectorAll("[data-switch-to-project]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      closeSwitchPanel();
      await _openProject(Number(btn.dataset.switchToProject));
    });
  });
}

function closeSwitchPanel() {
  const overlay = document.querySelector("[data-project-switch-overlay]");
  if (!overlay) return;
  overlay.classList.remove("is-open");
  overlay.addEventListener("transitionend", () => overlay.remove(), { once: true });
}

function switchCardMarkup(project) {
  const data = project.data || {};
  const translation = data.translation;
  const renderData = translation?.data || data;
  const isCurrent = state.activeProject && Number(state.activeProject.id) === Number(project.id);
  let preview = "";
  try {
    normalizeQuoteLayout(renderData);
    normalizeQuoteItems(renderData);
    normalizeGalleryLayout(renderData, state.images);
    const selectedImages = (renderData.selectedImageIds || [])
      .map((id) => state.images.find((img) => Number(img.id) === Number(id)))
      .filter(Boolean);
    const body = quoteBodyMarkup(renderData, selectedImages, "", {
      imageSrc: (img) => img.url,
      logoSrc: "/assets/logo.png",
      draggable: false,
      assetImages: state.images,
      labels: translation?.labels,
    });
    const dir = translation?.rtl ? ' dir="rtl"' : "";
    preview = `<div class="switch-card-preview"><div class="mini-quote-content"><main class="sheet quote-sheet"${dir}>${body}</main></div></div>`;
  } catch {
    preview = '<div class="switch-card-preview switch-card-fallback"><img src="/assets/logo.png" alt=""></div>';
  }

  const currentTag = isCurrent ? '<span class="switch-card-current">当前项目</span>' : '';
  return `
    <button class="switch-card${isCurrent ? " is-current" : ""}" data-switch-to-project="${project.id}">
      ${preview}
      ${currentTag}
      <div class="switch-card-overlay-label">${isCurrent ? "" : "使用"}</div>
      <div class="switch-card-info">
        <strong>${escapeHtml(project.projectName)}</strong>
        <span>${escapeHtml(project.quoteNo || "")}</span>
        <em>${formatTime(project.createdAt)}</em>
      </div>
    </button>
  `;
}
