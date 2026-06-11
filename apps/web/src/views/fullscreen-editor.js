/**
 * 全屏 Pro 编辑模式：画布 + 命令栏 + 上下文卡片
 */
import { state } from "../state.js";
import { escapeHtml, setByPath, updateQuoteTotals, parseAmountNumber, extractNumeric, GALLERY_PRESETS, normalizeGalleryLayout, normalizeGalleryPreset } from "../utils.js";
import { recordUndoSnapshot, undoLastChange, restoreOriginalProjectData } from "../history.js";
import { renderQuotePreview, markDirty, quietDirty, fitPreviewToPanel, setPreviewZoom } from "./preview.js";
import { api } from "../api.js";
import { showToast } from "../ui.js";
import { selectProduct, recalcFreightFromTotal, removeQuoteItem } from "./editor-modules.js";

/* ---- 常量 ---- */

const SECTION_ICONS = {
  info: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>`,
  parties: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>`,
  products: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg>`,
  pricing: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>`,
  terms: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>`,
  footer: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><line x1="3" y1="15" x2="21" y2="15"/></svg>`,
  images: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>`,
};

const SECTIONS = [
  { id: "info", en: "Info", zh: "信息", previewSection: "basic", icon: "info" },
  { id: "parties", en: "Parties", zh: "双方", previewSection: "parties", icon: "parties" },
  { id: "products", en: "Products", zh: "产品", previewSection: "pricing", icon: "products" },
  { id: "pricing", en: "Pricing", zh: "定价", previewSection: "pricing", icon: "pricing" },
  { id: "terms", en: "Terms", zh: "条款", previewSection: "terms", icon: "terms" },
  { id: "footer", en: "Footer", zh: "页脚", previewSection: "footer", icon: "footer" },
  { id: "images", en: "Images", zh: "图片", previewSection: "gallery", icon: "images" },
];

/* 中英文标签 */
const LABELS = {
  en: {
    save: "Save", export: "Export PDF", close: "Close", editPanel: "Edit Panel",
    quoteNo: "Quote No.", date: "Date", validity: "Validity", title: "Title",
    fromSupplier: "From (Supplier)", toCustomer: "To (Customer)",
    company: "Company", contact: "Contact", whatsapp: "WhatsApp", email: "Email",
    noProducts: "No products yet. Click below to add.",
    addProduct: "+ Add Product", qty: "Qty", price: "Price",
    subtotalFreight: "Subtotal + Freight", subtotal: "Subtotal", freight: "Freight", total: "Total",
    addTerm: "+ Add Term", titlePlaceholder: "Title", contentPlaceholder: "Content...",
    website: "Website", phone: "Phone", addProductTitle: "Add Product",
    langSwitch: "中文", moveUp: "Up", moveDown: "Down", duplicate: "Copy",
    shortcutHint: "1-7 Sections · ↑↓ Products · Ctrl+S Save",
    pureMode: "Clean Preview", exitPure: "Exit Preview",
    imgLibrary: "Library", imgRemove: "Remove",
    imgAddTitle: "Select Image", imgNoImages: "No images yet",
    galleryLayout: "Gallery Layout", galleryTitle: "Gallery", galleryReplace: "Replace", galleryRemove: "Remove",
    galleryEmpty: "No images in gallery. Click images in preview to add.",
  },
  zh: {
    save: "保存", export: "导出 PDF", close: "关闭", editPanel: "编辑面板",
    quoteNo: "报价编号", date: "日期", validity: "有效期", title: "标题",
    fromSupplier: "发件方（供应商）", toCustomer: "收件方（客户）",
    company: "公司", contact: "联系人", whatsapp: "WhatsApp", email: "邮箱",
    noProducts: "暂无产品，点击下方按钮添加",
    addProduct: "+ 添加产品", qty: "数量", price: "单价",
    subtotalFreight: "小计 + 运费", subtotal: "小计", freight: "运费", total: "合计",
    addTerm: "+ 添加条款", titlePlaceholder: "标题", contentPlaceholder: "内容...",
    website: "网站", phone: "电话", addProductTitle: "添加产品",
    langSwitch: "EN", moveUp: "上移", moveDown: "下移", duplicate: "复制",
    shortcutHint: "1-7 切换区块 · ↑↓ 切换产品 · Ctrl+S 保存",
    pureMode: "纯净预览", exitPure: "退出预览",
    imgLibrary: "图库", imgRemove: "移除",
    imgAddTitle: "选择图片", imgNoImages: "暂无图片",
    galleryLayout: "画廊布局", galleryTitle: "画廊", galleryReplace: "替换", galleryRemove: "移除",
    galleryEmpty: "画廊中暂无图片，点击预览区图片添加。",
  },
};

let lang = "en";
let activeSection = "info";
let debounceTimer = null;
let cardOpen = true;
let scrollSpyHandler = null;
let keydownHandler = null;
let scrollSpySuppressed = false;
let previewImageClickHandler = null;

function t(key) { return LABELS[lang][key] || LABELS.en[key] || key; }
function sectionLabel(s) { return s[lang] || s.en; }

/* ============================================================
 *  入口
 * ============================================================ */

export function enterFullscreenPro() {
  const panel = document.querySelector(".preview-panel");
  if (!panel) return;

  /* 命令栏 */
  const bar = document.createElement("div");
  bar.className = "fse-bar";
  bar.innerHTML = buildCommandBar();
  panel.appendChild(bar);

  /* 上下文卡片（暗色） */
  const card = document.createElement("div");
  card.className = "fse-card fse-card-open";
  card.innerHTML = buildCardWrapper(renderSectionContent("info"));
  panel.appendChild(card);

  /* 浮动切换按钮 */
  const toggle = document.createElement("button");
  toggle.className = "fse-toggle";
  toggle.type = "button";
  toggle.title = t("editPanel");
  toggle.innerHTML = pencilIcon();
  toggle.addEventListener("click", () => openCard());
  panel.appendChild(toggle);

  /* 迷你工具条（替换原工具栏） */
  injectMiniToolbar(panel);

  /* 右上角操作栏（语言 + 保存 + 导出） */
  const actions = document.createElement("div");
  actions.className = "fse-actions";
  actions.innerHTML = `
    <button class="fse-actions-btn fse-actions-lang" type="button" data-fse-lang title="切换语言">${t("langSwitch")}</button>
    <button class="fse-actions-btn fse-actions-save" type="button" data-fse-save title="${t("save")}">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>
    </button>
    <button class="fse-actions-btn fse-actions-export" type="button" data-fse-export title="${t("export")}">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
      <span>${t("export")}</span>
    </button>
  `;
  actions.querySelector("[data-fse-lang]")?.addEventListener("click", toggleLang);
  actions.querySelector("[data-fse-save]")?.addEventListener("click", saveProject);
  actions.querySelector("[data-fse-export]")?.addEventListener("click", exportPdf);
  panel.appendChild(actions);

  /* 事件 */
  bindBarEvents(bar);
  bindCardEvents(card);
  installKeyboardShortcuts();
  installScrollSpy();
  installPreviewImageClickHandler();

  panel.requestFullscreen?.();

  /* 全屏切换完成后设置缩放为 80% */
  requestAnimationFrame(() => {
    setPreviewZoom(0.8);
    applyZoom();
  });
}

/* ============================================================
 *  #6 迷你工具栏（全屏时覆盖原工具栏）
 * ============================================================ */

function injectMiniToolbar(panel) {
  const toolbar = panel.querySelector(".preview-toolbar");
  if (!toolbar) return;
  toolbar.classList.add("fse-toolbar-hidden");

  const mini = document.createElement("div");
  mini.className = "fse-mini-toolbar";
  mini.innerHTML = `
    <button type="button" class="fse-mini-btn" data-fse-undo title="撤销">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/></svg>
    </button>
    <button type="button" class="fse-mini-btn" data-fse-redo title="重做">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.13-9.36L23 10"/></svg>
    </button>
    <span class="fse-mini-sep"></span>
    <button type="button" class="fse-mini-btn" data-fse-zoom-out title="-">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="5" y1="12" x2="19" y2="12"/></svg>
    </button>
    <span class="fse-mini-zoom" data-fse-zoom-label>${Math.round(state.zoom * 100)}%</span>
    <button type="button" class="fse-mini-btn" data-fse-zoom-in title="+">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
    </button>
    <span class="fse-mini-sep"></span>
    <button type="button" class="fse-mini-btn" data-fse-fit title="适配">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"/></svg>
    </button>
    <span class="fse-mini-sep fse-mini-sep-wide"></span>
    <button type="button" class="fse-mini-btn" data-fse-pure title="${t("pureMode")}">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
    </button>
  `;
  panel.appendChild(mini);

  /* 事件绑定 */
  mini.querySelector("[data-fse-undo]")?.addEventListener("click", () => {
    if (undoLastChange()) renderQuotePreview();
  });
  mini.querySelector("[data-fse-redo]")?.addEventListener("click", () => {
    if (restoreOriginalProjectData()) renderQuotePreview();
  });
  mini.querySelector("[data-fse-zoom-out]")?.addEventListener("click", () => {
    state.zoom = Math.max(0.1, state.zoom - 0.1);
    applyZoom();
  });
  mini.querySelector("[data-fse-zoom-in]")?.addEventListener("click", () => {
    state.zoom = Math.min(2, state.zoom + 0.1);
    applyZoom();
  });
  mini.querySelector("[data-fse-fit]")?.addEventListener("click", () => fitPreviewToPanel());
  mini.querySelector("[data-fse-pure]")?.addEventListener("click", enterPurePreview);
}

function applyZoom() {
  const stage = document.querySelector(".preview-stage");
  if (stage) stage.style.transform = `scale(${state.zoom})`;
  const label = document.querySelector("[data-fse-zoom-label]");
  if (label) label.textContent = `${Math.round(state.zoom * 100)}%`;
}

/* ============================================================
 *  #1 Scroll Spy
 * ============================================================ */

function installScrollSpy() {
  const scroll = document.querySelector(".preview-scroll");
  if (!scroll) return;

  scrollSpyHandler = () => {
    if (scrollSpySuppressed) return;
    /* images section 无对应的大面积预览区域，scroll spy 不应覆盖其药丸高亮 */
    if (activeSection === "images") return;
    const scrollTop = scroll.scrollTop;
    const viewportH = scroll.clientHeight;
    const preview = document.querySelector("#quote-preview");
    if (!preview) return;

    /* 检查每个 section 的可见比例 */
    let best = null;
    let bestRatio = 0;
    for (const sec of SECTIONS) {
      const el = preview.querySelector(`[data-preview-section="${sec.previewSection}"]`);
      if (!el) continue;
      const top = el.getBoundingClientRect().top - scroll.getBoundingClientRect().top;
      const bottom = top + el.offsetHeight;
      const visible = Math.max(0, Math.min(bottom, viewportH) - Math.max(top, 0));
      const ratio = visible / Math.max(1, el.offsetHeight);
      if (ratio > bestRatio) { bestRatio = ratio; best = sec.id; }
    }
    if (best) {
      /* 只更新药丸视觉高亮，不改 activeSection（activeSection 代表卡片内容） */
      document.querySelectorAll(".fse-pill").forEach((pill) => {
        pill.classList.toggle("active", pill.dataset.fseSection === best);
      });
    }
  };

  scroll.addEventListener("scroll", scrollSpyHandler, { passive: true });
}

/* 同步右侧卡片内容（不滚动预览） */
function syncCardToSection(sectionId) {
  const cardBody = document.querySelector(".fse-card-body");
  const cardTitle = document.querySelector(".fse-card-title");
  if (cardBody) {
    cardBody.style.opacity = "0";
    setTimeout(() => {
      cardBody.innerHTML = renderSectionContent(sectionId);
      cardBody.style.opacity = "1";
      if (cardTitle) {
        const sec = SECTIONS.find((s) => s.id === sectionId);
        cardTitle.textContent = sec ? sectionLabel(sec) : "";
      }
    }, 120);
  }
}

/* ============================================================
 *  #3 键盘快捷键
 * ============================================================ */

function installKeyboardShortcuts() {
  keydownHandler = (e) => {
    if (!document.fullscreenElement) return;
    /* 输入框内不拦截数字键 */
    const typing = e.target.matches("input, textarea");

    /* Ctrl+S / Cmd+S 保存 */
    if ((e.ctrlKey || e.metaKey) && e.key === "s") {
      e.preventDefault();
      saveProject();
      return;
    }

    if (typing) return;

    /* ` 切换纯净预览 */
    if (e.key === "`") {
      e.preventDefault();
      state.purePreview ? exitPurePreview() : enterPurePreview();
      return;
    }

    /* 1-7 切换 section */
    const num = parseInt(e.key);
    if (num >= 1 && num <= SECTIONS.length) {
      switchSection(SECTIONS[num - 1].id);
      return;
    }

    /* ←→ 切换 section */
    if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
      e.preventDefault();
      const idx = SECTIONS.findIndex((s) => s.id === activeSection);
      const next = e.key === "ArrowLeft"
        ? SECTIONS[(idx - 1 + SECTIONS.length) % SECTIONS.length]
        : SECTIONS[(idx + 1) % SECTIONS.length];
      switchSection(next.id);
      return;
    }

    /* ↑↓ 切换产品 */
    if ((e.key === "ArrowUp" || e.key === "ArrowDown") && activeSection === "products") {
      e.preventDefault();
      navigateProduct(e.key === "ArrowUp" ? -1 : 1);
      return;
    }
  };

  document.addEventListener("keydown", keydownHandler);
}

function navigateProduct(dir) {
  const items = (state.activeProject?.data?.quoteItems || []).filter((it) => it.type !== "accessory");
  if (!items.length) return;
  const cards = document.querySelectorAll(".fse-product-card:not(.fse-accessory)");
  if (!cards.length) return;
  const current = document.querySelector(".fse-product-card.fse-active-product");
  let idx = current ? Number(current.dataset.fseItem) : -1;

  /* 找下一个主产品索引 */
  const mainIndices = items.map((it) => {
    const fullItems = state.activeProject.data.quoteItems;
    return fullItems.indexOf(it);
  });
  const currentPos = mainIndices.indexOf(idx);
  const nextPos = Math.max(0, Math.min(mainIndices.length - 1, currentPos + dir));
  const nextIdx = mainIndices[nextPos];

  cards.forEach((c) => c.classList.remove("fse-active-product"));
  const target = document.querySelector(`.fse-product-card[data-fse-item="${nextIdx}"]`);
  if (target) {
    target.classList.add("fse-active-product");
    target.scrollIntoView({ behavior: "smooth", block: "nearest" });
    scrollToPreviewItem(nextIdx);
  }
}

/* ============================================================
 *  命令栏 HTML
 * ============================================================ */

function buildCommandBar() {
  const pills = SECTIONS.map((s) =>
    `<button class="fse-pill${s.id === activeSection ? " active" : ""}" data-fse-section="${s.id}" type="button">
      <span class="fse-pill-icon">${SECTION_ICONS[s.icon]}</span>
      <span class="fse-pill-label">${sectionLabel(s)}</span>
    </button>`
  ).join("");
  return `<nav class="fse-pills">${pills}</nav>`;
}

/* ============================================================
 *  上下文卡片 HTML（暗色主题）
 * ============================================================ */

function buildCardWrapper(bodyHtml) {
  const sec = SECTIONS.find((s) => s.id === activeSection);
  return `
    <div class="fse-card-head">
      <strong class="fse-card-title">${sec ? sectionLabel(sec) : ""}</strong>
      <button class="fse-card-close" type="button" data-fse-close title="${t("close")}">✕</button>
    </div>
    <div class="fse-card-body">${bodyHtml}</div>
  `;
}

/* ============================================================
 *  Section 内容生成器
 * ============================================================ */

function renderSectionContent(sectionId) {
  const data = state.activeProject?.data;
  if (!data) return "";
  switch (sectionId) {
    case "info": return renderInfoSection(data);
    case "parties": return renderPartiesSection(data);
    case "products": return renderProductsSection(data);
    case "pricing": return renderPricingSection(data);
    case "terms": return renderTermsSection(data);
    case "footer": return renderFooterSection(data);
    case "images": return renderImagesSection(data);
    default: return "";
  }
}

function bumpTrailingNumber(str, delta) {
  const match = str.match(/^(.*?)(\d+)$/);
  if (!match) return str;
  const next = parseInt(match[2], 10) + delta;
  if (next < 0) return str;
  return match[1] + String(next).padStart(match[2].length, "0");
}

function renderInfoSection(data) {
  const m = data.quoteMeta || {};
  return `<div class="fse-fields">
    <label class="fse-field fse-field--inc" data-fse-highlight-path="quoteMeta.quoteNo">
      <span>${escapeHtml(t("quoteNo"))}</span>
      <span class="fse-input-wrap">
        <input data-fse-path="quoteMeta.quoteNo" value="${escapeHtml(String(m.quoteNo || ""))}" autocomplete="off">
        <button class="fse-inc-btn" type="button" data-fse-bump="quoteMeta.quoteNo:1" title="V1 → V2">↑</button>
        <button class="fse-inc-btn" type="button" data-fse-bump="quoteMeta.quoteNo:-1" title="V2 → V1">↓</button>
      </span>
    </label>
    ${fseDateField(t("date"), "quoteMeta.date", m.date)}
    ${fseField(t("validity"), "quoteMeta.validity", m.validity)}
    ${fseField(t("title"), "quoteMeta.title", m.title)}
  </div>`;
}

function renderPartiesSection(data) {
  const from = data.from || {};
  const to = data.to || {};
  return `<div class="fse-fields">
    <div class="fse-sub-title">${t("fromSupplier")}</div>
    ${fseField(t("company"), "from.company", from.company)}
    ${fseField(t("contact"), "from.name", from.name)}
    ${fseField(t("whatsapp"), "from.whatsapp", from.whatsapp)}
    ${fseField(t("email"), "from.email", from.email)}
    <div class="fse-sub-title" style="margin-top:12px">${t("toCustomer")}</div>
    ${fseField(t("company"), "to.company", to.company)}
    ${fseField(t("contact"), "to.name", to.name)}
    ${fseField(t("whatsapp"), "to.whatsapp", to.whatsapp)}
    ${fseField(t("email"), "to.email", to.email)}
  </div>`;
}

/* #4 产品快捷操作：上移/下移/复制 */
function renderProductsSection(data) {
  const items = data.quoteItems || [];
  if (!items.length) {
    return `<div class="fse-empty">${t("noProducts")}</div>
            <button class="fse-add-btn" type="button" data-fse-add-product>${t("addProduct")}</button>`;
  }

  let html = '<div class="fse-product-list">';
  items.forEach((item, i) => {
    if (item.type === "accessory") {
      const params = Array.isArray(item.parameters) ? item.parameters : [];
      const total = item.pricing?.totalAmount || "";
      html += `
        <div class="fse-product-card fse-accessory" data-fse-item="${i}">
          <div class="fse-product-main">
            <span class="fse-acc-icon">↳</span>
            <span class="fse-product-name">${escapeHtml(item.accessoryName || "Accessory")}</span>
            <span class="fse-product-total">${escapeHtml(total)}</span>
          </div>
          <div class="fse-product-params">
            ${params.filter((p) => !p._new).map((p) => `
              <div class="fse-param-row">
                <span class="fse-param-name">${escapeHtml(p.name || "")}</span>
                <span class="fse-param-val">${escapeHtml(p.lineTotal || "")}</span>
              </div>
            `).join("")}
          </div>
        </div>`;
    } else {
      const pr = item.pricing || {};
      html += `
        <div class="fse-product-card" data-fse-item="${i}">
          <div class="fse-product-main">
            <span class="fse-product-no">${i + 1}</span>
            <input class="fse-product-name-input" type="text" value="${escapeHtml(item.product?.enName || "Product")}" data-fse-product-name="${i}" placeholder="Product Name">
            <span class="fse-product-total">${escapeHtml(pr.totalAmount || "")}</span>
          </div>
          <div class="fse-product-fields">
            ${fseInlineField(t("qty"), `item-pricing:${i}:quantity`, extractNumeric(pr.quantity), qtySuffix(pr.quantity), `fse-qty-suffix-${i}`, `${i}:quantity`)}
            ${fseInlineField(t("price"), `item-pricing:${i}:unitPrice`, extractNumeric(pr.unitPrice), "/set", null, `${i}:unitPrice`)}
          </div>
          <div class="fse-product-actions">
            <button type="button" class="fse-action-btn" data-fse-move-up="${i}" title="${t('moveUp')}">↑</button>
            <button type="button" class="fse-action-btn" data-fse-move-down="${i}" title="${t('moveDown')}">↓</button>
            <button type="button" class="fse-action-btn" data-fse-duplicate="${i}" title="${t('duplicate')}">⧉</button>
            <button type="button" class="fse-action-btn fse-action-del" data-fse-delete="${i}" title="${t('close')}">✕</button>
          </div>
        </div>`;
    }
  });
  html += "</div>";
  html += `<button class="fse-add-btn" type="button" data-fse-add-product>${t("addProduct")}</button>`;
  return html;
}

function renderPricingSection(data) {
  const pr = data.pricing || {};
  const freightMode = (pr.enabledItems || []).includes("freight");
  return `<div class="fse-fields">
    <label class="fse-toggle-row">
      <span>${t("subtotalFreight")}</span>
      <button class="fse-switch${freightMode ? " on" : ""}" type="button" data-fse-freight-mode="${freightMode}"></button>
    </label>
    ${freightMode ? fseField(t("subtotal"), "pricing.subtotal", extractNumeric(pr.subtotal)) : ""}
    ${freightMode ? fseField(t("freight"), "pricing.freight", extractNumeric(pr.freight)) : ""}
    ${fseField(t("total"), "pricing.totalAmount", extractNumeric(pr.totalAmount))}
  </div>`;
}

function renderTermsSection(data) {
  const terms = data.terms || {};
  const items = terms.items || [];
  let html = '<div class="fse-terms-list">';
  items.forEach((item, i) => {
    html += `
      <div class="fse-term-card">
        <div class="fse-term-head">
          <input class="fse-term-title" data-term-title="${i}" value="${escapeHtml(item.title || "")}" placeholder="${t("titlePlaceholder")}">
          <button class="fse-term-del" type="button" data-delete-term="${i}" title="${t("close")}">✕</button>
        </div>
        <textarea class="fse-term-body" data-term-content="${i}" placeholder="${t("contentPlaceholder")}" rows="3">${escapeHtml(item.content || "")}</textarea>
      </div>`;
  });
  html += "</div>";
  html += `<button class="fse-add-btn" type="button" data-fse-add-term>${t("addTerm")}</button>`;
  return html;
}

function renderFooterSection(data) {
  const f = data.footer || {};
  return `<div class="fse-fields">
    ${fseField(t("company"), "footer.company", f.company)}
    ${fseField(t("website"), "footer.website", f.website)}
    ${fseField(t("email"), "footer.email", f.email)}
    ${fseField(t("phone"), "footer.phone", f.phone)}
  </div>`;
}

function renderImagesSection(data) {
  const galleryPreset = normalizeGalleryPreset(data);
  const selectedIds = data.selectedImageIds || [];

  /* 布局选择 */
  let html = `<div class="fse-gallery-layout">
    <div class="fse-sub-title">${t("galleryLayout")}</div>
    <div class="fse-gallery-presets">
      ${GALLERY_PRESETS.map((p) => `
        <button class="fse-gallery-preset${p.id === galleryPreset ? " active" : ""}" type="button" data-fse-gallery-preset="${p.id}" title="${escapeHtml(p.label)}">
          <span class="layout-icon layout-${p.id}"><i></i><i></i><i></i><i></i></span>
          <em>${escapeHtml(p.label)}</em>
        </button>`).join("")}
    </div>
  </div>`;

  /* 画廊图片列表 */
  html += `<div class="fse-sub-title">${t("galleryTitle")}</div>`;
  if (!selectedIds.length) {
    html += `<div class="fse-empty" style="margin:8px 0">${t("galleryEmpty")}</div>`;
  } else {
    html += '<div class="fse-gallery-items">';
    selectedIds.forEach((id, idx) => {
      const img = state.images.find((im) => Number(im.id) === Number(id));
      if (!img) return;
      html += `<div class="fse-gallery-item" data-fse-gallery-item="${idx}">
        <img src="${img.url}" alt="${escapeHtml(img.originalName)}" class="fse-gallery-thumb">
        <span class="fse-gallery-name">${escapeHtml(img.originalName)}</span>
        <button class="fse-gallery-act" type="button" data-fse-replace-gallery="${idx}" title="${t("galleryReplace")}">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
        </button>
        <button class="fse-gallery-act fse-gallery-act--del" type="button" data-fse-remove-gallery="${idx}" title="${t("galleryRemove")}">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
        </button>
      </div>`;
    });
    html += "</div>";
  }

  return html;
}

/* ============================================================
 *  字段辅助
 * ============================================================ */

function fseField(label, path, value) {
  return `
    <label class="fse-field" data-fse-highlight-path="${path}">
      <span>${escapeHtml(label)}</span>
      <input data-fse-path="${path}" value="${escapeHtml(String(value || ""))}" autocomplete="off">
    </label>`;
}

function fseDateField(label, path, value) {
  const d = value ? new Date(value) : null;
  const iso = d && !isNaN(d.getTime()) ? d.toISOString().slice(0, 10) : "";
  return `
    <label class="fse-field fse-date-field" data-fse-highlight-path="${path}">
      <span>${escapeHtml(label)}</span>
      <span class="fse-date-wrap">
        <input data-fse-path="${path}" value="${escapeHtml(String(value || ""))}" autocomplete="off" class="fse-date-text">
        <input type="date" class="fse-date-picker" value="${iso}">
        <span class="fse-date-icon" title="选择日期">
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="1.5" y="3" width="13" height="11.5" rx="1.5"/><line x1="1.5" y1="7" x2="14.5" y2="7"/><line x1="5" y1="1" x2="5" y2="4.5"/><line x1="11" y1="1" x2="11" y2="4.5"/></svg>
        </span>
      </span>
    </label>`;
}

function fseInlineField(label, dataAttr, value, suffix, suffixId, stepKey) {
  const stepBtns = stepKey
    ? `<button class="fse-inc-btn" type="button" data-fse-step="${stepKey}:1">↑</button><button class="fse-inc-btn" type="button" data-fse-step="${stepKey}:-1">↓</button>`
    : "";
  return `
    <label class="fse-inline-field">
      <span>${escapeHtml(label)}</span>
      <span class="fse-input-with-suffix">
        <input data-fse-item-pricing="${dataAttr}" value="${escapeHtml(String(value || ""))}" autocomplete="off" inputmode="decimal">
        ${suffix ? `<span class="fse-field-suffix" ${suffixId ? `id="${suffixId}"` : ""}>${escapeHtml(suffix)}</span>` : ""}
        ${stepBtns}
      </span>
    </label>`;
}

function qtySuffix(qty) {
  const n = parseFloat(extractNumeric(qty));
  if (!n || n === 1) return "set";
  return "sets";
}

function pencilIcon() {
  return `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/><path d="m15 5 4 4"/></svg>`;
}

/* ============================================================
 *  事件绑定
 * ============================================================ */

function bindBarEvents(bar) {
  bar.querySelectorAll("[data-fse-section]").forEach((pill) => {
    pill.addEventListener("click", () => switchSection(pill.dataset.fseSection));
  });
}

function bindCardEvents(card) {
  card.addEventListener("click", (e) => {
    if (e.target.closest("[data-fse-close]")) closeCard();
  });
  card.addEventListener("input", handleCardInput);
  card.addEventListener("focus", handleCardFocus, true);
  card.addEventListener("blur", handleCardBlur, true);
  card.addEventListener("click", handleCardClick);

  /* #2 字段 hover → 预览高亮 */
  card.addEventListener("mouseover", handleFieldHover);
  card.addEventListener("mouseout", handleFieldHoverOut);
}

/* ============================================================
 *  #2 字段↔预览高亮
 * ============================================================ */

const HIGHLIGHT_PATH_MAP = {
  "quoteMeta.quoteNo": "[data-preview-section='basic'] .quote-meta-no",
  "quoteMeta.date": "[data-preview-section='basic'] .quote-meta-date",
  "quoteMeta.validity": "[data-preview-section='basic'] .quote-meta-validity",
  "quoteMeta.title": "[data-preview-section='basic'] .quote-meta-title",
  "from.company": "[data-preview-party='from'] .party-company",
  "from.name": "[data-preview-party='from'] .party-name",
  "from.whatsapp": "[data-preview-party='from'] .party-whatsapp",
  "from.email": "[data-preview-party='from'] .party-email",
  "to.company": "[data-preview-party='to'] .party-company",
  "to.name": "[data-preview-party='to'] .party-name",
  "to.whatsapp": "[data-preview-party='to'] .party-whatsapp",
  "to.email": "[data-preview-party='to'] .party-email",
  "footer.company": "[data-preview-section='footer'] .footer-company",
  "footer.website": "[data-preview-section='footer'] .footer-website",
  "footer.email": "[data-preview-section='footer'] .footer-email",
  "footer.phone": "[data-preview-section='footer'] .footer-phone",
};

let highlightedEl = null;

function handleFieldHover(e) {
  const label = e.target.closest("[data-fse-highlight-path]");
  if (!label) return;
  const path = label.dataset.fseHighlightPath;
  const selector = HIGHLIGHT_PATH_MAP[path];
  if (!selector) return;
  const preview = document.querySelector("#quote-preview");
  if (!preview) return;
  const target = preview.querySelector(selector);
  if (target && target !== highlightedEl) {
    clearHighlight();
    highlightedEl = target;
    target.classList.add("fse-preview-highlight");
  }
}

function handleFieldHoverOut(e) {
  const label = e.target.closest("[data-fse-highlight-path]");
  if (!label) return;
  clearHighlight();
}

function clearHighlight() {
  if (highlightedEl) {
    highlightedEl.classList.remove("fse-preview-highlight");
    highlightedEl = null;
  }
}

/* ============================================================
 *  输入处理
 * ============================================================ */

function handleCardInput(e) {
  const input = e.target;

  if (input.dataset.fsePath) {
    recordUndoSnapshot();
    const path = input.dataset.fsePath;
    if (path.startsWith("pricing.")) {
      const text = input.value.replace(/[^\d.,]/g, "").replace(/(\..*)\./g, "$1");
      input.value = text;
      setByPath(state.activeProject.data, path, text ? `$${text}` : "");
      if (path === "pricing.totalAmount") {
        recalcFreightFromTotal(state.activeProject.data);
      } else {
        updateQuoteTotals(state.activeProject.data);
      }
      syncPricingFieldValues(input.closest(".fse-card-body"));
    } else {
      setByPath(state.activeProject.data, path, input.value);
    }
    scheduleDebouncedRender();
    return;
  }

  if (input.dataset.fseItemPricing) {
    recordUndoSnapshot();
    const parts = input.dataset.fseItemPricing.split(":");
    const index = Number(parts[1]);
    const field = parts[2];
    const items = state.activeProject.data.quoteItems;
    if (!items[index]) return;
    const raw = input.value.replace(/[^\d.,]/g, "").replace(/(\..*)\./g, "$1");
    input.value = raw;
    const item = items[index];
    if (field === "quantity") {
      item.pricing.quantity = raw;
      /* 动态更新数量后缀：1→/set, >1→/sets */
      const suffixEl = document.getElementById(`fse-qty-suffix-${index}`);
      if (suffixEl) suffixEl.textContent = qtySuffix(raw);
    } else if (field === "unitPrice") {
      item.pricing.unitPrice = raw ? `$${raw}` : "";
    }
    const qty = parseAmountNumber(item.pricing.quantity);
    const price = parseAmountNumber(item.pricing.unitPrice);
    if (qty && price) item.pricing.totalAmount = `$${(qty * price).toLocaleString("en-US")}`;
    updateQuoteTotals(state.activeProject.data);
    scheduleDebouncedRender();
    return;
  }

  if (input.dataset.fseProductName != null) {
    recordUndoSnapshot();
    const index = Number(input.dataset.fseProductName);
    const items = state.activeProject.data.quoteItems;
    if (items[index]) {
      items[index].product.enName = input.value;
      scheduleDebouncedRender();
    }
    return;
  }

  if (input.dataset.termTitle != null || input.dataset.termContent != null) {
    recordUndoSnapshot();
    const terms = state.activeProject.data.terms;
    const items = terms.items || [];
    if (input.dataset.termTitle != null) {
      const idx = Number(input.dataset.termTitle);
      if (items[idx]) items[idx].title = input.value;
    } else {
      const idx = Number(input.dataset.termContent);
      if (items[idx]) items[idx].content = input.value;
    }
    scheduleDebouncedRender();
    return;
  }

  if (input.classList.contains("fse-date-picker")) {
    const wrap = input.closest(".fse-date-wrap");
    const textInput = wrap?.querySelector(".fse-date-text");
    if (!textInput) return;
    const d = new Date(input.value + "T00:00:00");
    const display = isNaN(d.getTime()) ? input.value : d.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
    textInput.value = display;
    textInput.dispatchEvent(new Event("input", { bubbles: true }));
  }
}

function handleCardFocus(e) {
  if (e.target.matches("input, textarea")) recordUndoSnapshot();
}

function handleCardBlur(e) {
  if (e.target.matches("input, textarea")) {
    clearTimeout(debounceTimer);
    debounceTimer = null;
    markDirty();
  }
}

function handleCardClick(e) {
  const target = e.target;

  /* 编号递增/递减按钮 */
  if (target.closest("[data-fse-bump]")) {
    const raw = target.closest("[data-fse-bump]").dataset.fseBump;
    const [path, delta] = raw.split(":");
    const input = target.closest(".fse-input-wrap")?.querySelector("input");
    if (!input) return;
    recordUndoSnapshot();
    input.value = bumpTrailingNumber(input.value, Number(delta));
    setByPath(state.activeProject.data, path, input.value);
    markDirty();
    return;
  }

  /* 数量/单价加减按钮 */
  if (target.closest("[data-fse-step]")) {
    const raw = target.closest("[data-fse-step]").dataset.fseStep;
    const [index, field, delta] = raw.split(":");
    const input = target.closest(".fse-input-with-suffix")?.querySelector("input");
    if (!input) return;
    recordUndoSnapshot();
    let val = parseFloat(input.value) || 0;
    val = Math.max(0, val + Number(delta));
    input.value = val;
    input.dispatchEvent(new Event("input", { bubbles: true }));
    return;
  }

  /* 产品卡片点击 → 滚动预览 */
  const productCard = target.closest("[data-fse-item]");
  if (productCard && !target.matches("input, button")) {
    const idx = Number(productCard.dataset.fseItem);
    scrollToPreviewItem(idx);
    return;
  }

  /* #4 产品快捷操作 */
  if (target.closest("[data-fse-move-up]")) {
    moveProduct(Number(target.closest("[data-fse-move-up]").dataset.fseMoveUp), -1);
    return;
  }
  if (target.closest("[data-fse-move-down]")) {
    moveProduct(Number(target.closest("[data-fse-move-down]").dataset.fseMoveDown), 1);
    return;
  }
  if (target.closest("[data-fse-duplicate]")) {
    duplicateProduct(Number(target.closest("[data-fse-duplicate]").dataset.fseDuplicate));
    return;
  }

  /* 删除产品（含配件） */
  if (target.closest("[data-fse-delete]")) {
    const idx = Number(target.closest("[data-fse-delete]").dataset.fseDelete);
    removeQuoteItem(idx);
    updateQuoteTotals(state.activeProject.data);
    markDirty();
    refreshCardBody();
    return;
  }

  /* 删除条款 */
  if (target.closest("[data-delete-term]")) {
    const idx = Number(target.closest("[data-delete-term]").dataset.deleteTerm);
    const items = state.activeProject.data.terms?.items || [];
    if (items[idx]) {
      recordUndoSnapshot();
      items.splice(idx, 1);
      markDirty();
      refreshCardBody();
    }
    return;
  }

  /* 添加条款 */
  if (target.closest("[data-fse-add-term]")) {
    const terms = state.activeProject.data.terms;
    if (!terms.items) terms.items = [];
    recordUndoSnapshot();
    terms.items.push({ title: "NEW TERM", content: "" });
    markDirty();
    refreshCardBody();
    return;
  }

  /* 添加产品 */
  if (target.closest("[data-fse-add-product]")) {
    showProductPicker();
    return;
  }

  /* Freight 模式切换 */
  if (target.closest("[data-fse-freight-mode]")) {
    const btn = target.closest("[data-fse-freight-mode]");
    const current = btn.dataset.fseFreightMode === "true";
    recordUndoSnapshot();
    const pr = state.activeProject.data.pricing;
    pr.enabledItems = current ? ["total"] : ["subtotal", "freight", "total"];
    updateQuoteTotals(state.activeProject.data);
    markDirty();
    refreshCardBody();
    return;
  }

  /* 画廊布局切换 */
  if (target.closest("[data-fse-gallery-preset]")) {
    const preset = target.closest("[data-fse-gallery-preset]").dataset.fseGalleryPreset;
    recordUndoSnapshot();
    const data = state.activeProject.data;
    data.layout.galleryPreset = preset;
    normalizeGalleryLayout(data, state.images);
    markDirty();
    refreshCardBody();
    return;
  }

  /* 画廊图片替换 → 打开图库选择器 */
  if (target.closest("[data-fse-replace-gallery]")) {
    const idx = Number(target.closest("[data-fse-replace-gallery]").dataset.fseReplaceGallery);
    const data = state.activeProject.data;
    const currentImageId = (data.selectedImageIds || [])[idx] || null;
    showImageLibraryPicker({ type: "gallery", index: idx, currentImageId });
    return;
  }

  /* 画廊图片移除 */
  if (target.closest("[data-fse-remove-gallery]")) {
    const idx = Number(target.closest("[data-fse-remove-gallery]").dataset.fseRemoveGallery);
    const data = state.activeProject.data;
    recordUndoSnapshot();
    data.selectedImageIds.splice(idx, 1);
    normalizeGalleryLayout(data, state.images);
    markDirty();
    refreshCardBody();
    return;
  }

  /* 日期图标 */
  if (target.closest(".fse-date-icon")) {
    const wrap = target.closest(".fse-date-wrap");
    const picker = wrap?.querySelector(".fse-date-picker");
    if (picker) picker.showPicker?.() || picker.focus();
    return;
  }
}

/* ============================================================
 *  #4 产品快捷操作
 * ============================================================ */

function moveProduct(index, dir) {
  const items = state.activeProject.data.quoteItems;
  if (!items || !items[index]) return;
  /* 收集产品组（产品+配件） */
  const groupStart = index;
  let groupEnd = index + 1;
  while (groupEnd < items.length && items[groupEnd].type === "accessory" &&
         (items[groupEnd].parentId === items[index].id || items[groupEnd].groupId === items[index].groupId)) {
    groupEnd++;
  }
  const groupSize = groupEnd - groupStart;

  /* 目标位置 */
  let targetStart;
  if (dir === -1) {
    if (groupStart === 0) return;
    /* 找前一个组的起点 */
    let prev = groupStart - 1;
    while (prev > 0 && items[prev].type === "accessory") prev--;
    targetStart = prev;
  } else {
    if (groupEnd >= items.length) return;
    /* 找下一个组的终点 */
    let next = groupEnd;
    while (next < items.length && items[next].type === "accessory") next++;
    if (next >= items.length) return;
    /* next 现在指向下一个主产品，找到它的组末尾 */
    let nextEnd = next + 1;
    while (nextEnd < items.length && items[nextEnd].type === "accessory") nextEnd++;
    targetStart = next;
    /* 交换：把当前组移到 next 组之后 */
    const group = items.splice(groupStart, groupSize);
    items.splice(nextEnd - groupSize, 0, ...group);
    recordUndoSnapshot();
    markDirty();
    refreshCardBody();
    return;
  }

  /* dir === -1: 把当前组移到前一个组之前 */
  const group = items.splice(groupStart, groupSize);
  items.splice(targetStart, 0, ...group);
  recordUndoSnapshot();
  markDirty();
  refreshCardBody();
}

function duplicateProduct(index) {
  const items = state.activeProject.data.quoteItems;
  if (!items || !items[index]) return;
  const item = JSON.parse(JSON.stringify(items[index]));
  /* 收集配件 */
  const accessories = [];
  let j = index + 1;
  while (j < items.length && items[j].type === "accessory") {
    accessories.push(JSON.parse(JSON.stringify(items[j])));
    j++;
  }
  /* 生成新 ID */
  item.id = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  if (item.groupId) item.groupId = item.id;
  accessories.forEach((acc) => {
    acc.id = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    acc.parentId = item.id;
    acc.groupId = item.groupId || item.id;
  });
  recordUndoSnapshot();
  items.splice(j, 0, item, ...accessories);
  updateQuoteTotals(state.activeProject.data);
  markDirty();
  refreshCardBody();
}

/* ============================================================
 *  Section 切换
 * ============================================================ */

function switchSection(sectionId) {
  if (sectionId === activeSection) return;
  activeSection = sectionId;

  document.querySelectorAll(".fse-pill").forEach((pill) => {
    pill.classList.toggle("active", pill.dataset.fseSection === sectionId);
  });

  syncCardToSection(sectionId);

  const sec = SECTIONS.find((s) => s.id === sectionId);
  if (sec) {
    scrollSpySuppressed = true;
    scrollToPreviewSection(sec.previewSection);
    /* smooth scroll 约 500ms，抑制期间让用户选择不被 scroll spy 覆盖 */
    setTimeout(() => { scrollSpySuppressed = false; }, 600);
  }
}

/* ============================================================
 *  预览联动
 * ============================================================ */

function scrollToPreviewSection(sectionName) {
  const preview = document.querySelector("#quote-preview");
  const el = preview?.querySelector(`[data-preview-section="${sectionName}"]`);
  const scroll = document.querySelector(".preview-scroll");
  if (!el || !scroll || !preview) return;
  /* el 相对于 preview 容器的偏移 */
  let top = 0;
  let node = el;
  while (node && node !== preview) {
    top += node.offsetTop;
    node = node.offsetParent;
  }
  scroll.scrollTo({ top: top * state.zoom - 20, behavior: "smooth" });
}

function scrollToPreviewItem(itemIndex) {
  const preview = document.querySelector("#quote-preview");
  const el = preview?.querySelector(`[data-preview-item="${itemIndex}"]`);
  const scroll = document.querySelector(".preview-scroll");
  if (!el || !scroll || !preview) return;
  let top = 0;
  let node = el;
  while (node && node !== preview) {
    top += node.offsetTop;
    node = node.offsetParent;
  }
  scroll.scrollTo({ top: top * state.zoom - 40, behavior: "smooth" });
}

export function syncSectionFromPreview(sectionName) {
  const map = {
    basic: "info", parties: "parties", pricing: "products",
    terms: "terms", footer: "footer", gallery: "images",
  };
  const sectionId = map[sectionName];
  if (sectionId && sectionId !== activeSection) switchSection(sectionId);
}

/* ============================================================
 *  卡片开关
 * ============================================================ */

function closeCard() {
  cardOpen = false;
  const card = document.querySelector(".fse-card");
  const toggle = document.querySelector(".fse-toggle");
  if (card) { card.classList.remove("fse-card-open"); card.classList.add("fse-card-closed"); }
  if (toggle) toggle.classList.add("fse-toggle-visible");
  const scroll = document.querySelector(".preview-scroll");
  if (scroll) scroll.classList.remove("fse-scroll-margin");
  setTimeout(() => fitPreviewToPanel(), 320);
}

function openCard() {
  cardOpen = true;
  const card = document.querySelector(".fse-card");
  const toggle = document.querySelector(".fse-toggle");
  if (card) { card.classList.remove("fse-card-closed"); card.classList.add("fse-card-open"); }
  if (toggle) toggle.classList.remove("fse-toggle-visible");
  const scroll = document.querySelector(".preview-scroll");
  if (scroll) scroll.classList.add("fse-scroll-margin");
  setTimeout(() => fitPreviewToPanel(), 320);
}

/* ============================================================
 *  语言切换
 * ============================================================ */

function toggleLang() {
  lang = lang === "en" ? "zh" : "en";
  document.querySelectorAll(".fse-pill").forEach((pill) => {
    const sec = SECTIONS.find((s) => s.id === pill.dataset.fseSection);
    if (sec) {
      const svg = SECTION_ICONS[sec.icon] || "";
      pill.innerHTML = `<span class="fse-pill-icon">${svg}</span><span class="fse-pill-label">${sectionLabel(sec)}</span>`;
      pill.classList.toggle("active", sec.id === activeSection);
    }
  });
  /* 右上角操作栏 */
  const langBtn = document.querySelector("[data-fse-lang]");
  if (langBtn) langBtn.textContent = t("langSwitch");
  const saveBtn = document.querySelector("[data-fse-save]");
  if (saveBtn) saveBtn.title = t("save");
  const exportBtn = document.querySelector("[data-fse-export]");
  if (exportBtn) {
    const span = exportBtn.querySelector("span");
    if (span) span.textContent = t("export");
    exportBtn.title = t("export");
  }
  const cardTitle = document.querySelector(".fse-card-title");
  const sec = SECTIONS.find((s) => s.id === activeSection);
  if (cardTitle && sec) cardTitle.textContent = sectionLabel(sec);
  refreshCardBody();
}

/* ============================================================
 *  防抖渲染
 * ============================================================ */

function scheduleDebouncedRender() {
  quietDirty();
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    debounceTimer = null;
    renderQuotePreview();
  }, 200);
}

function syncPricingFieldValues(container) {
  if (!container) return;
  const pr = state.activeProject.data.pricing;
  container.querySelectorAll("[data-fse-path^='pricing.']").forEach((input) => {
    const key = input.dataset.fsePath.replace("pricing.", "");
    if (pr[key] !== undefined && document.activeElement !== input) {
      input.value = extractNumeric(pr[key]);
    }
  });
}

function refreshCardBody() {
  const cardBody = document.querySelector(".fse-card-body");
  if (cardBody) cardBody.innerHTML = renderSectionContent(activeSection);
}

/* ============================================================
 *  产品选择弹窗
 * ============================================================ */

function showProductPicker() {
  const products = state.products || [];
  if (!products.length) return;

  const overlay = document.createElement("div");
  overlay.className = "fse-picker-overlay";
  const grid = products.map((p) => `
    <button class="fse-picker-card" type="button" data-pick-product="${p.id}">
      <img src="${p.thumbnailUrl || ""}" alt="">
      <span>${escapeHtml(p.enName || p.cnName)}</span>
    </button>
  `).join("");
  overlay.innerHTML = `
    <div class="fse-picker-panel">
      <div class="fse-picker-head">
        <strong>${t("addProductTitle")}</strong>
        <button type="button" class="fse-picker-close" data-close-picker>✕</button>
      </div>
      <div class="fse-picker-grid">${grid}</div>
    </div>`;
  document.querySelector(".preview-panel")?.appendChild(overlay);

  overlay.addEventListener("click", (e) => {
    if (e.target.closest("[data-close-picker]") || e === overlay) {
      overlay.remove();
      return;
    }
    const card = e.target.closest("[data-pick-product]");
    if (card) {
      selectProduct(card.dataset.pickProduct);
      overlay.remove();
      refreshCardBody();
      markDirty();
    }
  });
}

/* ============================================================
 *  保存 / 导出
 * ============================================================ */

/* ============================================================
 *  纯净预览模式
 * ============================================================ */

function enterPurePreview() {
  state.purePreview = true;
  /* 隐藏所有浮动 UI */
  toggleFullscreenUI(false);
  /* 创建退出按钮 */
  const panel = document.querySelector(".preview-panel");
  if (!panel) return;
  const exitBtn = document.createElement("button");
  exitBtn.className = "fse-pure-exit";
  exitBtn.type = "button";
  exitBtn.title = t("exitPure");
  exitBtn.innerHTML = `
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
    <span>${t("exitPure")}</span>
  `;
  exitBtn.addEventListener("click", exitPurePreview);
  panel.appendChild(exitBtn);
  /* 重渲染为纯净版 + 适配屏幕 */
  renderQuotePreview();
  requestAnimationFrame(() => fitPreviewToPanel());
}

function exitPurePreview() {
  state.purePreview = false;
  const exitBtn = document.querySelector(".fse-pure-exit");
  if (exitBtn) exitBtn.remove();
  /* 恢复所有浮动 UI */
  toggleFullscreenUI(true);
  /* 恢复交互式预览 */
  renderQuotePreview();
}

function toggleFullscreenUI(show) {
  const selectors = [".fse-bar", ".fse-mini-toolbar", ".fse-actions"];
  selectors.forEach((sel) => {
    const el = document.querySelector(sel);
    if (el) el.style.display = show ? "" : "none";
  });
  /* 右侧卡片 */
  const card = document.querySelector(".fse-card");
  if (card) {
    if (show) card.classList.replace("fse-card-closed", "fse-card-open");
    card.style.display = show ? "" : "none";
  }
  const toggle = document.querySelector(".fse-toggle");
  if (toggle) toggle.style.display = show ? "" : "none";
}

async function saveProject() {
  if (!state.activeProject) return;
  try {
    await api(`/api/projects/${state.activeProject.id}`, {
      method: "PUT",
      body: { data: state.activeProject.data },
    });
    state.dirty = false;
    const status = document.querySelector("#save-state");
    if (status) status.textContent = "已保存";
    showToast("保存成功", { tone: "success" });
  } catch {
    showToast("保存失败，请重试", { tone: "error" });
  }
}

function exportPdf() {
  if (!state.activeProject) return;
  window.open(`/api/projects/${state.activeProject.id}/pdf`, "_blank");
}

/* ============================================================
 *  清理（退出全屏时调用）
 * ============================================================ */

/** 供外部调用：刷新右侧上下文卡片内容（全屏模式下预览区编辑后同步） */
export function refreshFullscreenCard() {
  const cardBody = document.querySelector(".fse-card-body");
  if (cardBody) cardBody.innerHTML = renderSectionContent(activeSection);
}

export function cleanupFullscreenPro() {
  /* 退出纯净模式 */
  if (state.purePreview) {
    state.purePreview = false;
    document.querySelector(".fse-pure-exit")?.remove();
  }
  if (scrollSpyHandler) {
    document.querySelector(".preview-scroll")?.removeEventListener("scroll", scrollSpyHandler);
    scrollSpyHandler = null;
  }
  if (keydownHandler) {
    document.removeEventListener("keydown", keydownHandler);
    keydownHandler = null;
  }
  if (previewImageClickHandler) {
    document.querySelector(".preview-scroll")?.removeEventListener("click", previewImageClickHandler);
    previewImageClickHandler = null;
  }
  clearHighlight();
  /* 清理图片相关浮动元素 */
  document.querySelectorAll(".fse-img-menu, .fse-img-picker").forEach((el) => el.remove());
  /* 恢复原工具栏 */
  const toolbar = document.querySelector(".preview-toolbar");
  if (toolbar) toolbar.classList.remove("fse-toolbar-hidden");
}

/* ============================================================
 *  图片管理：点击事件 + 浮动菜单 + 图库弹窗 + 上传
 * ============================================================ */

function installPreviewImageClickHandler() {
  const scroll = document.querySelector(".preview-scroll");
  if (!scroll) return;

  previewImageClickHandler = (e) => {
    if (!document.fullscreenElement || state.purePreview) return;

    const target = e.target;

    /* 画廊图片点击 */
    const galleryFig = target.closest("figure[data-gallery-idx]");
    if (galleryFig) {
      e.preventDefault();
      e.stopPropagation();
      const idx = Number(galleryFig.dataset.galleryIdx);
      showImageActionMenu(galleryFig, "gallery", idx);
      return;
    }

    /* 画廊占位符点击 */
    const galleryPlaceholder = target.closest("[data-gallery-placeholder]");
    if (galleryPlaceholder) {
      e.preventDefault();
      e.stopPropagation();
      showImageActionMenu(galleryPlaceholder, "gallery-add", -1);
      return;
    }

    /* 产品行图片点击 */
    const productImg = target.closest("[data-product-image-item]");
    if (productImg) {
      e.preventDefault();
      e.stopPropagation();
      const itemIdx = Number(productImg.dataset.productImageItem);
      showImageActionMenu(productImg, "product", itemIdx);
      return;
    }

    /* 产品行图片占位符点击 */
    const productPlaceholder = target.closest("[data-product-image-placeholder]");
    if (productPlaceholder) {
      e.preventDefault();
      e.stopPropagation();
      const itemIdx = Number(productPlaceholder.dataset.productImagePlaceholder);
      showImageActionMenu(productPlaceholder, "product-add", itemIdx);
      return;
    }

    /* 点击空白区域关闭菜单 */
    closeImageActionMenu();
  };

  scroll.addEventListener("click", previewImageClickHandler, true);
}

/* ---- 浮动操作菜单 ---- */

function showImageActionMenu(targetEl, type, index) {
  closeImageActionMenu();

  const hasImage = !type.endsWith("-add");
  const realType = type.replace("-add", "");
  const menu = document.createElement("div");
  menu.className = "fse-img-menu";

  /* 菜单定位：在目标元素右侧或下方 */
  const rect = targetEl.getBoundingClientRect();
  const panel = document.querySelector(".preview-panel");
  const panelRect = panel?.getBoundingClientRect();
  if (panelRect) {
    let left = rect.right + 8;
    let top = rect.top;
    /* 右侧空间不足时改为下方 */
    if (left + 180 > panelRect.right) {
      left = rect.left;
      top = rect.bottom + 8;
    }
    /* 超出底部时往上 */
    if (top + 140 > panelRect.bottom) {
      top = panelRect.bottom - 148;
    }
    menu.style.left = `${left - panelRect.left}px`;
    menu.style.top = `${top - panelRect.top}px`;
  }

  const currentImageId = getCurrentImageId(realType, index);

  let btns = "";
  btns += `<button class="fse-img-menu-btn" type="button" data-img-action="library">
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
    <span>${t("imgLibrary")}</span>
  </button>`;
  if (hasImage) {
    btns += `<button class="fse-img-menu-btn fse-img-menu-del" type="button" data-img-action="remove">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
      <span>${t("imgRemove")}</span>
    </button>`;
  }
  menu.innerHTML = btns;

  /* 事件 */
  menu.querySelector("[data-img-action='library']")?.addEventListener("click", () => {
    closeImageActionMenu();
    showImageLibraryPicker({ type: realType, index, currentImageId });
  });
  if (hasImage) {
    menu.querySelector("[data-img-action='remove']")?.addEventListener("click", () => {
      closeImageActionMenu();
      removeImage(realType, index);
    });
  }

  panel?.appendChild(menu);
}

function closeImageActionMenu() {
  document.querySelector(".fse-img-menu")?.remove();
}

function getCurrentImageId(type, index) {
  const data = state.activeProject?.data;
  if (!data) return null;
  if (type === "gallery") {
    const ids = data.selectedImageIds || [];
    return ids[index] || null;
  }
  if (type === "product") {
    const items = data.quoteItems || [];
    return items[index]?.imageId || null;
  }
  return null;
}

/* ---- 图片操作 ---- */

function removeImage(type, index) {
  recordUndoSnapshot();
  const data = state.activeProject?.data;
  if (!data) return;

  if (type === "gallery") {
    const ids = data.selectedImageIds || [];
    if (ids[index] != null) {
      ids.splice(index, 1);
    }
  } else if (type === "product") {
    const items = data.quoteItems || [];
    if (items[index]) items[index].imageId = "";
  }

  markDirty();
  renderQuotePreview();
  if (activeSection === "images") refreshCardBody();
}

function selectImage(type, index, imageId) {
  recordUndoSnapshot();
  const data = state.activeProject?.data;
  if (!data) return;

  if (type === "gallery") {
    const ids = data.selectedImageIds || [];
    if (index >= 0 && index < ids.length) {
      ids[index] = imageId;
    } else {
      ids.push(imageId);
    }
  } else if (type === "product") {
    const items = data.quoteItems || [];
    if (items[index]) items[index].imageId = imageId;
  }

  markDirty();
  renderQuotePreview();
  if (activeSection === "images") refreshCardBody();
}

/* ---- 图片库选择弹窗 ---- */

function showImageLibraryPicker({ type, index, currentImageId }) {
  const panel = document.querySelector(".preview-panel");
  if (!panel) return;

  closeImageActionMenu();

  const images = state.images || [];
  const cards = images.length
    ? images.map((img) => {
        const selected = Number(img.id) === Number(currentImageId);
        return `<button class="fse-img-picker-card${selected ? " is-selected" : ""}" type="button" data-pick-image="${img.id}">
          ${selected ? `<span class="fse-img-picker-check">✓</span>` : ""}
          <img src="${img.url}" alt="${escapeHtml(img.originalName)}">
          <span>${escapeHtml(img.originalName)}</span>
        </button>`;
      }).join("")
    : `<div class="fse-empty">${t("imgNoImages")}</div>`;

  const overlay = document.createElement("div");
  overlay.className = "fse-img-picker";
  overlay.innerHTML = `
    <div class="fse-img-picker-panel">
      <div class="fse-img-picker-head">
        <strong>${t("imgAddTitle")}</strong>
        <button type="button" class="fse-img-picker-close" data-close-img-picker>✕</button>
      </div>
      <div class="fse-img-picker-grid">${cards}</div>
    </div>`;

  panel.appendChild(overlay);

  /* 事件 */
  overlay.addEventListener("click", (e) => {
    if (e.target.closest("[data-close-img-picker]") || e === overlay) {
      overlay.remove();
      return;
    }
    const card = e.target.closest("[data-pick-image]");
    if (card) {
      const imageId = Number(card.dataset.pickImage);
      selectImage(type, index, imageId);
      overlay.remove();
    }
  });
}
