/**
 * 项目列表页
 */
import { state, app } from "../state.js";
import { api, loadWorkspace, createProject, deleteProject } from "../api.js";
import { escapeHtml, formatTime } from "../utils.js";
import { showContentModal, showAppModal } from "../ui.js";
import { moduleIconSvg, plusIconSvg, chevronRightSvg } from "../icons.js";
import { quoteBodyMarkup, normalizeQuoteLayout, normalizeQuoteItems, normalizeGalleryLayout } from "../quote-template.js";
import { profileDashboardMarkup, bindProfileBindings } from "./profile.js";

let _openProject, _uploadImage, _uploadImageFromFile, _deleteImage, _renderUsersPage;

export function registerProjectsCallbacks({ openProject, uploadImage, uploadImageFromFile, deleteImage, renderUsersPage }) {
  _openProject = openProject;
  _uploadImage = uploadImage;
  _uploadImageFromFile = uploadImageFromFile;
  _deleteImage = deleteImage;
  _renderUsersPage = renderUsersPage;
}

export function renderProjectsPage() {
  state.view = "projects";
  state.activeProject = null;
  state.dirty = false;
  if (!state.projectHomeSection) state.projectHomeSection = "projects";
  if (!state.projectFilter) state.projectFilter = "all";
  if (!state.projectViewMode) state.projectViewMode = "card";

  const section = state.projectHomeSection;
  const mainContent = section === "projects" ? projectsDashboardMarkup()
    : section === "gallery" ? galleryDashboardMarkup()
    : section === "profile" ? profileDashboardMarkup()
    : "";

  app.innerHTML = `
    <main class="project-dashboard">
      <aside class="home-sidebar">
        <div class="home-brand"><img src="/assets/logo.png" alt="ZK"><strong>报价单管理系统</strong></div>
        <nav class="home-nav">
          ${homeNavButton("projects", "报价项目", "parameters")}
          ${homeNavButton("gallery", "图片库", "image")}
          ${state.user?.role === "admin" ? homeNavButton("users", "系统设置", "footer") : homeNavButton("profile", "个人中心", "customer")}
        </nav>
        <div class="home-sidebar-bottom">
          <button class="home-logout-link" type="button" data-home-logout>退出登录</button>
        </div>
      </aside>

      <section class="home-main">
        ${mainContent}
      </section>

      <aside class="home-info">
        ${recentProjectsMarkup()}
        ${quickEntryMarkup()}
        ${systemInfoMarkup()}
      </aside>
    </main>
  `;

  document.querySelectorAll("[data-create-project]").forEach((button) => {
    button.addEventListener("click", openCreateProjectModal);
  });
  document.querySelector("[data-home-logout]")?.addEventListener("click", async () => {
    await api("/api/logout", { method: "POST" });
    state.user = null;
    location.reload();
  });
  document.querySelector("[data-manage-users]")?.addEventListener("click", () => _renderUsersPage());
  document.querySelector("[data-show-all-projects]")?.addEventListener("click", () => {
    state.projectHomeSection = "projects";
    renderProjectsPage();
  });
  document.querySelectorAll("[data-home-section]").forEach((button) => {
    button.addEventListener("click", () => {
      const section = button.dataset.homeSection;
      if (section === "users") {
        _renderUsersPage();
        return;
      }
      state.projectHomeSection = section;
      renderProjectsPage();
    });
  });
  document.querySelectorAll("[data-open-project]").forEach((button) => {
    button.addEventListener("click", () => _openProject(button.dataset.openProject));
  });
  document.querySelectorAll("[data-delete-project]").forEach((button) => {
    button.addEventListener("click", () => deleteProject(button.dataset.deleteProject));
  });
  document.querySelectorAll("[data-rename-project]").forEach((button) => {
    button.addEventListener("click", () => openRenameProjectModal(button.dataset.renameProject));
  });
  document.querySelectorAll("[data-delete-image]").forEach((button) => {
    button.addEventListener("click", () => _deleteImage(button.dataset.deleteImage));
  });
  document.querySelector("#gallery-upload")?.addEventListener("change", _uploadImage);
  const dropZone = document.querySelector(".upload-drop");
  if (dropZone) {
    dropZone.addEventListener("dragover", (e) => {
      e.preventDefault();
      dropZone.classList.add("drop-hover");
    });
    dropZone.addEventListener("dragleave", () => dropZone.classList.remove("drop-hover"));
    dropZone.addEventListener("drop", (e) => {
      e.preventDefault();
      dropZone.classList.remove("drop-hover");
      const file = e.dataTransfer?.files?.[0];
      if (file && file.type.startsWith("image/")) _uploadImageFromFile(file);
    });
  }
  bindCardMenus();
  bindFilterDropdown();
  bindViewModeToggle();
  bindProjectSearch();
  bindManageMode();
  bindProfileBindings();
}

function homeNavButton(id, label, icon) {
  return `
    <button class="${state.projectHomeSection === id ? "active" : ""}" type="button" data-home-section="${id}">
      <span>${moduleIconSvg(icon)}</span>${escapeHtml(label)}
    </button>
  `;
}

function getFilteredProjects() {
  let projects = state.projects;
  const filter = state.projectFilter || "all";
  if (filter !== "all") {
    const now = new Date();
    projects = projects.filter((p) => {
      const d = new Date(p.updatedAt || p.createdAt);
      if (filter === "week") return (now - d) < 7 * 86400000;
      if (filter === "month") return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
      if (filter === "quarter") return (now - d) < 90 * 86400000;
      return true;
    });
  }
  return projects;
}

const FILTER_OPTIONS = [
  { value: "all", label: "全部" },
  { value: "week", label: "本周" },
  { value: "month", label: "本月" },
  { value: "quarter", label: "近三个月" },
];

function projectsDashboardMarkup() {
  const filtered = getFilteredProjects();
  const isCard = state.projectViewMode !== "list";
  const currentFilter = FILTER_OPTIONS.find((o) => o.value === (state.projectFilter || "all"));
  const manageMode = !!state.projectManageMode;
  const selectedCount = (state.selectedProjectIds || []).length;
  return `
    <div class="home-hero">
      <div class="home-hero-user">
        <div class="home-hero-avatar">${(state.user?.display_name || state.user?.username || "?")[0].toUpperCase()}</div>
        <div>
          <h1>${escapeHtml(state.user?.display_name || state.user?.username || "")}</h1>
          <span class="profile-role-badge ${state.user?.role || "sales"}">${state.user?.role === "admin" ? "管理员" : "销售"}</span>
        </div>
      </div>
    </div>
    <div class="home-tools">
      <label class="home-search">
        ${moduleIconSvg("remark")}
        <input id="project-search" placeholder="搜索客户名称、报价单编号或产品类型...">
      </label>
      <div class="filter-dropdown">
        <button class="ghost-button" data-toggle-filter>${escapeHtml(currentFilter?.label || "筛选")} ▾</button>
        <div class="filter-menu" data-filter-menu>
          ${FILTER_OPTIONS.map((o) =>
            `<button class="${state.projectFilter === o.value ? "active" : ""}" data-set-filter="${o.value}">${escapeHtml(o.label)}</button>`
          ).join("")}
        </div>
      </div>
      <button class="icon-button ${isCard ? "active" : ""}" title="卡片视图" data-view-mode="card">${moduleIconSvg("parameters")}</button>
      <button class="icon-button ${!isCard ? "active" : ""}" title="列表视图" data-view-mode="list">${moduleIconSvg("footer")}</button>
      ${manageMode
        ? `<button class="ghost-button" data-exit-manage>取消</button>`
        : `<button class="ghost-button" data-enter-manage>管理</button>`}
    </div>
    ${manageMode && selectedCount > 0 ? `
      <div class="batch-action-bar">
        <span>已选择 ${selectedCount} 个项目</span>
        <button class="ghost-button batch-delete-btn" data-batch-delete>删除所选</button>
      </div>
    ` : ""}
    <div class="quote-list-heading">
      <h2>${state.projectFilter === "all" ? "全部" : currentFilter?.label || ""}报价单（${filtered.length}）</h2>
    </div>
    ${isCard ? `
      <div class="project-card-grid">
        <button class="project-card project-card-new" data-create-project>
          <div class="project-card-new-inner">
            <div class="project-card-new-icon">+</div>
            <span>新建报价单</span>
          </div>
        </button>
        ${filtered.map(p => projectRowMarkup(p, manageMode)).join("")}
      </div>
    ` : `
      <div class="project-list-table">
        ${filtered.length ? `
          <div class="project-list-header">
            <span>编号</span><span>项目名称</span><span>更新时间</span><span>操作</span>
          </div>
          ${filtered.map(projectListRowMarkup).join("")}
        ` : emptyMarkup("没有匹配的报价项目")}
      </div>
    `}
  `;
}

function projectListRowMarkup(project) {
  return `
    <div class="project-list-row">
      <span class="list-row-no">${escapeHtml(project.data?.quoteMeta?.quoteNo || "-")}</span>
      <button class="list-row-name" data-open-project="${project.id}">${escapeHtml(project.projectName)}</button>
      <span class="list-row-time">${formatTime(project.updatedAt || project.createdAt)}</span>
      <div class="list-row-actions">
        <button data-rename-project="${project.id}">重命名</button>
        <button data-delete-project="${project.id}">删除</button>
      </div>
    </div>
  `;
}

function galleryDashboardMarkup() {
  return `
    <div class="home-hero">
      <div>
        <h1>${state.user?.role === "admin" ? "全部图库" : "我的图库"}</h1>
        <p>管理报价单中可插入的产品图片</p>
      </div>
    </div>
    <label class="upload-drop gallery-upload-wide">
      <input id="gallery-upload" type="file" accept="image/*">
      <span class="upload-icon">+</span>
      <strong>添加产品图</strong>
    </label>
    <div class="asset-grid gallery-page-grid">
      ${state.images.length ? state.images.map(imageAssetMarkup).join("") : emptyMarkup("还没有图片")}
    </div>
  `;
}

function miniQuotePreviewMarkup(project) {
  const data = project.data || {};
  const translation = data.translation;
  const renderData = translation?.data || data;
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
      labels: translation?.labels,
    });
    const dir = translation?.rtl ? ' dir="rtl"' : "";
    return `
      <button class="card-preview" data-open-project="${project.id}">
        <div class="mini-quote-content"><main class="sheet quote-sheet"${dir}>${body}</main></div>
      </button>
    `;
  } catch {
    return `
      <button class="card-preview card-preview-fallback" data-open-project="${project.id}">
        <img src="/assets/logo.png" alt="">
      </button>
    `;
  }
}

export function projectRowMarkup(project, manageMode = false) {
  const selected = (state.selectedProjectIds || []).includes(project.id);
  return `
    <article class="project-card${manageMode ? " manage-mode" : ""}${selected ? " selected" : ""}" ${manageMode ? `data-toggle-select="${project.id}"` : ""}>
      ${manageMode ? `<span class="card-check-mark">${selected ? "✓" : ""}</span>` : ""}
      ${miniQuotePreviewMarkup(project)}
      <div class="card-body">
        <button class="card-title" data-open-project="${manageMode ? "" : project.id}">${escapeHtml(project.projectName)}</button>
        <span class="card-time">${formatTime(project.createdAt)}</span>
      </div>
      ${!manageMode ? `<div class="card-menu">
        <button class="card-menu-trigger" type="button" data-toggle-card-menu="${project.id}">⋮</button>
        <div class="card-menu-panel" data-card-menu-panel="${project.id}">
          <button data-rename-project="${project.id}">重命名</button>
          <button data-delete-project="${project.id}">删除</button>
        </div>
      </div>` : ""}
    </article>
  `;
}

function recentProjectsMarkup() {
  return `
    <section class="info-card">
      <div class="info-card-title"><h3>最近编辑</h3><button class="recent-show-all" type="button" data-show-all-projects>查看更多 ${chevronRightSvg()}</button></div>
      <div class="recent-list">
        ${state.projects.map((project) => `
          <button type="button" data-open-project="${project.id}">
            <span>QT</span>
            <strong>${escapeHtml(project.projectName)}</strong>
            <em>${formatTime(project.updatedAt)} 编辑</em>
          </button>
        `).join("") || emptyMarkup("暂无最近编辑")}
      </div>
    </section>
  `;
}

function quickEntryMarkup() {
  return `
    <section class="info-card">
      <div class="info-card-title"><h3>快捷入口</h3></div>
      <button class="quick-entry" type="button" data-home-section="gallery">${moduleIconSvg("image")}<span><strong>图片库管理</strong><em>管理和上传产品图片</em></span>${chevronRightSvg()}</button>
      ${state.user?.role === "admin" ? `<button class="quick-entry" type="button" data-manage-users>${moduleIconSvg("footer")}<span><strong>用户管理</strong><em>管理销售账号</em></span>${chevronRightSvg()}</button>` : ""}
      <button class="quick-entry" type="button" data-create-project>${moduleIconSvg("price")}<span><strong>新建报价</strong><em>创建新的报价单</em></span>${chevronRightSvg()}</button>
    </section>
  `;
}

function systemInfoMarkup() {
  const month = new Date().getMonth();
  const monthProjects = state.projects.filter((project) => new Date(project.createdAt).getMonth() === month).length;
  return `
    <section class="info-card">
      <div class="info-card-title"><h3>系统信息</h3></div>
      <dl class="system-stats">
        <div><dt>报价单总数</dt><dd>${state.projects.length}</dd></div>
        <div><dt>本月创建</dt><dd>${monthProjects}</dd></div>
        <div><dt>图库图片</dt><dd>${state.images.length}</dd></div>
      </dl>
    </section>
  `;
}

function openCreateProjectModal(event) {
  event.preventDefault();
  showProjectNameModal({
    title: "新建报价项目",
    initialValue: "",
    primaryLabel: "创建项目",
    skipLabel: "跳过"
  }).then((name) => {
    if (name === null) return;
    createProject(name, { open: false });
  });
}

async function openRenameProjectModal(id) {
  const project = state.projects.find((item) => Number(item.id) === Number(id));
  const name = await showProjectNameModal({
    title: "修改项目名称",
    initialValue: project?.projectName || "",
    primaryLabel: "保存名称",
    skipLabel: "清空名称"
  });
  if (name === null) return;

  await api(`/api/projects/${id}`, {
    method: "PUT",
    body: { projectName: name }
  });
  await loadWorkspace();
  renderProjectsPage();
}

function showProjectNameModal({ title, initialValue, primaryLabel, skipLabel }) {
  return showContentModal({
    title,
    className: "project-name-modal",
    body: `
      <form class="project-name-form">
        <label class="field">
          <span>项目名称</span>
          <input name="projectName" value="${escapeHtml(initialValue)}" placeholder="例如：斯里兰卡5T桥机报价">
        </label>
        <div class="project-name-actions">
          <button class="ghost-button" type="button" data-project-skip>${escapeHtml(skipLabel)}</button>
          <button class="primary-button" type="submit">${escapeHtml(primaryLabel)}</button>
        </div>
      </form>
    `,
    onMount(root, close) {
      const form = root.querySelector(".project-name-form");
      const input = root.querySelector("[name='projectName']");
      form.addEventListener("submit", (event) => {
        event.preventDefault();
        close(input.value.trim());
      });
      root.querySelector("[data-project-skip]").addEventListener("click", () => close(""));
      input.focus();
    }
  }).then((value) => value === "cancel" ? null : value);
}

export function imageAssetMarkup(image) {
  const locked = image.filename === "image4.png";
  return `
    <figure class="asset-card">
      <img src="${image.url}" alt="${escapeHtml(image.originalName)}">
      <figcaption>
        <span>${escapeHtml(image.originalName)}</span>
        <button class="icon-button danger" ${locked ? "disabled" : ""} title="删除" data-delete-image="${image.id}">×</button>
      </figcaption>
    </figure>
  `;
}

export function emptyMarkup(text) {
  return `<div class="empty-state">${escapeHtml(text)}</div>`;
}

function bindCardMenus() {
  document.querySelectorAll("[data-toggle-card-menu]").forEach((trigger) => {
    trigger.addEventListener("click", (event) => {
      event.stopPropagation();
      const id = trigger.dataset.toggleCardMenu;
      const panel = document.querySelector(`[data-card-menu-panel="${id}"]`);
      if (!panel) return;
      document.querySelectorAll(".card-menu-panel.open").forEach((p) => {
        if (p !== panel) p.classList.remove("open");
      });
      panel.classList.toggle("open");
    });
  });
  const closeAll = () => document.querySelectorAll(".card-menu-panel.open").forEach((p) => p.classList.remove("open"));
  document.addEventListener("click", closeAll, { once: true });
}

function bindFilterDropdown() {
  const toggle = document.querySelector("[data-toggle-filter]");
  const menu = document.querySelector("[data-filter-menu]");
  if (!toggle || !menu) return;
  toggle.addEventListener("click", (e) => {
    e.stopPropagation();
    menu.classList.toggle("open");
  });
  menu.querySelectorAll("[data-set-filter]").forEach((btn) => {
    btn.addEventListener("click", () => {
      state.projectFilter = btn.dataset.setFilter;
      renderProjectsPage();
    });
  });
  document.addEventListener("click", () => menu.classList.remove("open"), { once: true });
}

function bindViewModeToggle() {
  document.querySelectorAll("[data-view-mode]").forEach((btn) => {
    btn.addEventListener("click", () => {
      state.projectViewMode = btn.dataset.viewMode;
      renderProjectsPage();
    });
  });
}

function bindProjectSearch() {
  const input = document.querySelector("#project-search");
  if (!input) return;
  input.addEventListener("input", () => {
    const query = input.value.trim().toLowerCase();
    const rows = document.querySelectorAll("[data-open-project]");
    rows.forEach((el) => {
      const card = el.closest(".project-card, .project-list-row");
      if (!card) return;
      if (!query) { card.style.display = ""; return; }
      const text = card.textContent.toLowerCase();
      card.style.display = text.includes(query) ? "" : "none";
    });
  });
}

function bindManageMode() {
  const enterBtn = document.querySelector("[data-enter-manage]");
  const exitBtn = document.querySelector("[data-exit-manage]");
  enterBtn?.addEventListener("click", () => {
    state.projectManageMode = true;
    state.selectedProjectIds = [];
    renderProjectsPage();
  });
  exitBtn?.addEventListener("click", () => {
    state.projectManageMode = false;
    state.selectedProjectIds = [];
    renderProjectsPage();
  });
  document.querySelectorAll("[data-toggle-select]").forEach((card) => {
    card.addEventListener("click", (e) => {
      if (e.target.closest("[data-open-project]")) return;
      const id = Number(card.dataset.toggleSelect);
      if (!state.selectedProjectIds) state.selectedProjectIds = [];
      const idx = state.selectedProjectIds.indexOf(id);
      if (idx === -1) {
        state.selectedProjectIds.push(id);
      } else {
        state.selectedProjectIds.splice(idx, 1);
      }
      renderProjectsPage();
    });
  });
  const batchBtn = document.querySelector("[data-batch-delete]");
  batchBtn?.addEventListener("click", async () => {
    const ids = state.selectedProjectIds || [];
    if (!ids.length) return;
    const action = await showAppModal({
      title: "批量删除",
      message: `确定要删除选中的 ${ids.length} 个项目吗？此操作不可撤销。`,
      tone: "warning",
      actions: [{ label: "取消", value: "cancel" }, { label: "删除", value: "delete" }]
    });
    if (action !== "delete") return;
    for (const id of ids) {
      await deleteProject(id);
    }
    state.projectManageMode = false;
    state.selectedProjectIds = [];
    await loadWorkspace();
    renderProjectsPage();
  });
}
