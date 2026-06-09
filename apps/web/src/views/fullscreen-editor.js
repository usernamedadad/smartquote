/**
 * 全屏 Pro 编辑模式：画布 + 命令栏 + 上下文卡片
 */
import { state } from "../state.js";
import { escapeHtml, setByPath, updateQuoteTotals, parseAmountNumber } from "../utils.js";
import { recordUndoSnapshot, undoLastChange, restoreOriginalProjectData } from "../history.js";
import { renderQuotePreview, markDirty, quietDirty, fitPreviewToPanel } from "./preview.js";
import { api } from "../api.js";
import { showToast } from "../ui.js";
import { selectProduct, recalcFreightFromTotal, removeQuoteItem } from "./editor-modules.js";

/* ---- 常量 ---- */

const SECTIONS = [
  { id: "info", en: "Info", zh: "信息", previewSection: "basic", icon: "ℹ" },
  { id: "parties", en: "Parties", zh: "双方", previewSection: "parties", icon: "👥" },
  { id: "products", en: "Products", zh: "产品", previewSection: "pricing", icon: "📦" },
  { id: "pricing", en: "Pricing", zh: "定价", previewSection: "pricing", icon: "💰" },
  { id: "terms", en: "Terms", zh: "条款", previewSection: "terms", icon: "📄" },
  { id: "footer", en: "Footer", zh: "页脚", previewSection: "footer", icon: "📝" },
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
    shortcutHint: "1-6 Sections · ↑↓ Products · Ctrl+S Save",
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
    shortcutHint: "1-6 切换区块 · ↑↓ 切换产品 · Ctrl+S 保存",
  },
};

let lang = "en";
let activeSection = "info";
let debounceTimer = null;
let cardOpen = true;
let scrollSpyHandler = null;
let keydownHandler = null;

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

  /* 事件 */
  bindBarEvents(bar);
  bindCardEvents(card);
  installKeyboardShortcuts();
  installScrollSpy();

  panel.requestFullscreen?.();
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
      /* 只更新药丸高亮，不改 activeSection / 卡片标题 / 卡片内容 */
      document.querySelectorAll(".fse-pill").forEach((pill) => {
        pill.classList.toggle("active", pill.dataset.fseSection === best);
      });
    }
  };

  scroll.addEventListener("scroll", scrollSpyHandler, { passive: true });
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

    /* 1-6 切换 section */
    const num = parseInt(e.key);
    if (num >= 1 && num <= SECTIONS.length) {
      switchSection(SECTIONS[num - 1].id);
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
  const pills = SECTIONS.map((s, i) =>
    `<button class="fse-pill${s.id === activeSection ? " active" : ""}" data-fse-section="${s.id}" type="button">
      <span class="fse-pill-icon">${s.icon}</span>${sectionLabel(s)}<span class="fse-pill-key">${i + 1}</span>
    </button>`
  ).join("");
  return `
    <div class="fse-bar-inner">
      <nav class="fse-pills">${pills}</nav>
      <div class="fse-bar-actions">
        <button class="fse-bar-lang" type="button" data-fse-lang title="切换语言">${t("langSwitch")}</button>
        <button class="fse-bar-save" type="button" data-fse-save>${t("save")}</button>
        <button class="fse-bar-export" type="button" data-fse-export>${t("export")}</button>
      </div>
    </div>
    <div class="fse-bar-hint">${t("shortcutHint")}</div>
  `;
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
    default: return "";
  }
}

function renderInfoSection(data) {
  const m = data.quoteMeta || {};
  return `<div class="fse-fields">
    ${fseField(t("quoteNo"), "quoteMeta.quoteNo", m.quoteNo)}
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
            <span class="fse-product-name">${escapeHtml(item.product?.enName || item.product?.cnName || "Product")}</span>
            <span class="fse-product-total">${escapeHtml(pr.totalAmount || "")}</span>
          </div>
          <div class="fse-product-fields">
            ${fseInlineField(t("qty"), `item-pricing:${i}:quantity`, stripDollar(pr.quantity))}
            ${fseInlineField(t("price"), `item-pricing:${i}:unitPrice`, stripDollar(pr.unitPrice))}
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
    ${freightMode ? fseField(t("subtotal"), "pricing.subtotal", stripDollar(pr.subtotal)) : ""}
    ${freightMode ? fseField(t("freight"), "pricing.freight", stripDollar(pr.freight)) : ""}
    ${fseField(t("total"), "pricing.totalAmount", stripDollar(pr.totalAmount))}
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

function fseInlineField(label, dataAttr, value) {
  return `
    <label class="fse-inline-field">
      <span>${escapeHtml(label)}</span>
      <input data-fse-item-pricing="${dataAttr}" value="${escapeHtml(String(value || ""))}" autocomplete="off" inputmode="decimal">
    </label>`;
}

function stripDollar(s) {
  if (!s) return "";
  return String(s).replace(/^\$/, "");
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
  bar.querySelector("[data-fse-lang]")?.addEventListener("click", toggleLang);
  bar.querySelector("[data-fse-save]")?.addEventListener("click", saveProject);
  bar.querySelector("[data-fse-export]")?.addEventListener("click", exportPdf);
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

  const sec = SECTIONS.find((s) => s.id === sectionId);
  if (sec) scrollToPreviewSection(sec.previewSection);
}

/* ============================================================
 *  预览联动
 * ============================================================ */

function scrollToPreviewSection(sectionName) {
  const el = document.querySelector(`#quote-preview [data-preview-section="${sectionName}"]`);
  const scroll = document.querySelector(".preview-scroll");
  if (!el || !scroll) return;
  const offset = el.closest(".sheet")?.offsetTop || 0;
  scroll.scrollTo({ top: offset * state.zoom - 20, behavior: "smooth" });
}

function scrollToPreviewItem(itemIndex) {
  const el = document.querySelector(`#quote-preview [data-preview-item="${itemIndex}"]`);
  const scroll = document.querySelector(".preview-scroll");
  if (!el || !scroll) return;
  const top = (el.closest(".sheet")?.offsetTop || 0) + el.offsetTop;
  scroll.scrollTo({ top: top * state.zoom - 40, behavior: "smooth" });
}

export function syncSectionFromPreview(sectionName) {
  const map = {
    basic: "info", parties: "parties", pricing: "products",
    terms: "terms", footer: "footer",
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
    if (sec) pill.querySelector(".fse-pill-icon")?.remove(); // rebuild text
    /* 保持图标+key，只更新文本 */
    const icon = sec?.icon || "";
    const idx = SECTIONS.findIndex((s) => s.id === pill.dataset.fseSection) + 1;
    pill.innerHTML = `<span class="fse-pill-icon">${icon}</span>${sectionLabel(sec)}<span class="fse-pill-key">${idx}</span>`;
  });
  const langBtn = document.querySelector("[data-fse-lang]");
  if (langBtn) langBtn.textContent = t("langSwitch");
  const saveBtn = document.querySelector("[data-fse-save]");
  if (saveBtn) saveBtn.textContent = t("save");
  const exportBtn = document.querySelector("[data-fse-export]");
  if (exportBtn) exportBtn.textContent = t("export");
  const hint = document.querySelector(".fse-bar-hint");
  if (hint) hint.textContent = t("shortcutHint");
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
      input.value = stripDollar(pr[key]);
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
      <img src="${p.thumbnail || ""}" alt="">
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

export function cleanupFullscreenPro() {
  if (scrollSpyHandler) {
    document.querySelector(".preview-scroll")?.removeEventListener("scroll", scrollSpyHandler);
    scrollSpyHandler = null;
  }
  if (keydownHandler) {
    document.removeEventListener("keydown", keydownHandler);
    keydownHandler = null;
  }
  clearHighlight();
  /* 恢复原工具栏 */
  const toolbar = document.querySelector(".preview-toolbar");
  if (toolbar) toolbar.classList.remove("fse-toolbar-hidden");
}
