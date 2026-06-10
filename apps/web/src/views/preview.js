/**
 * 报价预览：渲染、缩放、拖拽排序、markDirty
 */
import { state } from "../state.js";
import {
  normalizeGalleryLayout, normalizeQuoteItems, escapeHtml, productPreviewUrl,
  calculateTotalAmount, recalcAccessoryTotal, updateQuoteTotals, parseAmountNumber, extractNumeric
} from "../utils.js";
import { quoteBodyMarkup, normalizeQuoteLayout } from "../quote-template.js";
import { recordUndoSnapshot } from "../history.js";

let previewRenderFrame = 0;
let _rerenderSelectedImages;
let _addAccessory;
let _selectProduct;
let _switchToModule;
let _removeQuoteItem;
let _refreshEditor;
let _syncSectionFromPreview;
let _refreshFullscreenCard;
let _cardRefreshTimer = 0;
let _refreshModuleEditor;
let _moduleRefreshTimer = 0;
let _openQuoteItemImagePicker;

export function registerPreviewCallbacks({ rerenderSelectedImages, addAccessory, selectProduct, removeQuoteItem, switchToModule, refreshEditor, syncSectionFromPreview, refreshFullscreenCard, refreshModuleEditor, openQuoteItemImagePicker }) {
  _rerenderSelectedImages = rerenderSelectedImages;
  _addAccessory = addAccessory;
  _selectProduct = selectProduct;
  _removeQuoteItem = removeQuoteItem;
  _switchToModule = switchToModule;
  _refreshEditor = refreshEditor;
  _syncSectionFromPreview = syncSectionFromPreview;
  _refreshFullscreenCard = refreshFullscreenCard;
  _refreshModuleEditor = refreshModuleEditor;
  _openQuoteItemImagePicker = openQuoteItemImagePicker;
}

export function markDirty() {
  state.dirty = true;
  if (state.activeProject?.data?.translation) {
    delete state.activeProject.data.translation;
  }
  const status = document.querySelector("#save-state");
  if (status) status.textContent = "未保存";
  const projectName = document.querySelector("#topbar-project-name");
  if (projectName) projectName.textContent = state.activeProject?.projectName || "";
  scheduleQuotePreviewRender();
  /* 全屏模式：结构变更后立即刷新右侧卡片 */
  if (state.previewFullscreen && _refreshFullscreenCard) {
    _refreshFullscreenCard();
  }
}

/** 延迟刷新编辑器：blur 后检查焦点是否仍在预览区内，避免覆盖刚触发的渲染 */
function deferredRefreshEditor() {
  requestAnimationFrame(() => {
    const active = document.activeElement;
    /* 焦点仍在预览区（包括输入框、按钮等） → 跳过刷新 */
    if (active && active.closest("#quote-preview")) return;
    /* 全屏模式：刷新右侧卡片 */
    if (state.previewFullscreen && _refreshFullscreenCard) {
      _refreshFullscreenCard();
    }
    if (_refreshEditor) _refreshEditor();
  });
}

/** 更新 dirty 标记但不触发预览重渲染（用于预览区内联编辑） */
export function quietDirty() {
  state.dirty = true;
  if (state.activeProject?.data?.translation) {
    delete state.activeProject.data.translation;
  }
  const status = document.querySelector("#save-state");
  if (status) status.textContent = "未保存";
  const projectName = document.querySelector("#topbar-project-name");
  if (projectName) projectName.textContent = state.activeProject?.projectName || "";
  /* 全屏模式：防抖刷新右侧卡片，实现输入时实时同步 */
  if (state.previewFullscreen && _refreshFullscreenCard) {
    /* 焦点在全屏卡片内时跳过刷新——用户正在输入，刷新会销毁输入框 */
    if (document.activeElement?.closest(".fse-card")) return;
    clearTimeout(_cardRefreshTimer);
    _cardRefreshTimer = setTimeout(_refreshFullscreenCard, 120);
  }
  /* 常规模式：防抖刷新左侧编辑区面板 */
  if (!state.previewFullscreen && _refreshModuleEditor) {
    clearTimeout(_moduleRefreshTimer);
    _moduleRefreshTimer = setTimeout(_refreshModuleEditor, 200);
  }
}

let _pendingFocusTarget = null;

/** 记录下次重渲染后需要自动聚焦的元素选择器 */
export function schedulePreviewRefocus(selector) {
  _pendingFocusTarget = selector;
}

/** 靶向更新配件行总价单元格 */
function updateLineTotalCell(preview, itemIndex, paramIndex, value) {
  const cell = preview.querySelector(`[data-linetotal-cell="${itemIndex}:${paramIndex}"]`);
  if (cell) cell.textContent = String(value || "").trim();
}

/** 靶向更新汇总金额 */
function updateSummaryCells(preview) {
  const pricing = updateQuoteTotals(state.activeProject.data);
  const freightMode = (pricing.enabledItems || []).includes("freight");
  const summaryLines = preview.querySelectorAll(".summary-line strong");
  if (freightMode && summaryLines.length >= 3) {
    summaryLines[0].textContent = pricing.subtotal || "";
    summaryLines[1].textContent = pricing.freight || "";
    summaryLines[2].textContent = pricing.totalAmount || pricing.subtotal || "";
  } else if (summaryLines.length >= 1) {
    summaryLines[0].textContent = pricing.totalAmount || pricing.subtotal || "";
  }
}

function scheduleQuotePreviewRender() {
  if (previewRenderFrame) cancelAnimationFrame(previewRenderFrame);
  previewRenderFrame = requestAnimationFrame(() => {
    previewRenderFrame = 0;
    renderQuotePreview();
  });
}

export function renderQuotePreview() {
  if (previewRenderFrame) {
    cancelAnimationFrame(previewRenderFrame);
    previewRenderFrame = 0;
  }
  const preview = document.querySelector("#quote-preview");
  if (!preview || !state.activeProject) return;

  const data = state.activeProject.data;
  const translation = data.translation;
  const renderData = translation?.data || data;

  normalizeQuoteItems(data, state.products);
  normalizeGalleryLayout(data, state.images);
  const selectedImages = (data.selectedImageIds || [])
    .map((id) => state.images.find((image) => Number(image.id) === Number(id)))
    .filter(Boolean);

  const body = quoteBodyMarkup(renderData, selectedImages, "", {
    imageSrc: (img) => img.url,
    logoSrc: "/assets/logo.png",
    draggable: true,
    interactive: !state.purePreview,
    galleryPlaceholder: state.previewFullscreen && !state.purePreview,
    galleryClasses: "preview-gallery custom-gallery-layout",
    assetImages: state.images,
    labels: translation?.labels,
  });

  const dir = translation?.rtl ? ' dir="rtl"' : "";
  preview.innerHTML = `<main class="sheet quote-sheet"${dir} aria-label="Quotation sheet">${body}</main>`;
  applyPreviewZoom();
  bindPreviewDragSorting(preview);
  bindPreviewInteractiveActions(preview);
  bindSectionClickNavigation(preview);
  bindPreviewInlineEditing(preview);

  /* 结构性操作后自动聚焦新输入 */
  if (_pendingFocusTarget) {
    const selector = _pendingFocusTarget;
    _pendingFocusTarget = null;
    requestAnimationFrame(() => {
      const el = preview.querySelector(selector);
      if (el) { el.focus(); el.select?.(); }
    });
  }
}

export function setPreviewZoom(value) {
  state.zoom = Math.max(0.35, Math.min(1.2, Number(value.toFixed(2))));
  applyPreviewZoom();
}

export function fitPreviewToPanel() {
  const scroll = document.querySelector(".preview-scroll");
  if (!scroll) return;
  const availableWidth = Math.max(320, scroll.clientWidth - 34);
  setPreviewZoom(availableWidth / 1024);
}

export function applyPreviewZoom() {
  const preview = document.querySelector("#quote-preview");
  const stage = document.querySelector(".preview-stage");
  const label = document.querySelector("[data-preview-zoom-label]");
  if (!preview || !stage) return;

  const sheet = preview.querySelector(".quote-sheet");
  const sheetHeight = sheet?.offsetHeight || 1536;
  preview.style.transform = `scale(${state.zoom})`;
  stage.style.width = `${Math.ceil(1024 * state.zoom)}px`;
  stage.style.height = `${Math.ceil(sheetHeight * state.zoom)}px`;
  if (label) label.textContent = `${Math.round(state.zoom * 100)}%`;
}

/* ---- 预览拖拽排序 ---- */

function bindPreviewDragSorting(preview) {
  preview.querySelectorAll("[data-preview-section]").forEach((section) => {
    section.addEventListener("dragstart", (event) => {
      event.dataTransfer.setData("text/plain", `section:${section.dataset.previewSection}`);
      event.dataTransfer.effectAllowed = "move";
      state.previewDrag = { type: "section", id: section.dataset.previewSection };
      section.classList.add("is-dragging");
    });

    section.addEventListener("dragend", () => {
      state.previewDrag = null;
      section.classList.remove("is-dragging");
      preview.querySelectorAll(".is-drop-target").forEach((item) => item.classList.remove("is-drop-target"));
    });

    section.addEventListener("dragover", (event) => {
      if (state.previewDrag?.type !== "section") return;
      event.preventDefault();
      section.classList.add("is-drop-target");
    });

    section.addEventListener("dragleave", () => {
      section.classList.remove("is-drop-target");
    });

    section.addEventListener("drop", (event) => {
      if (state.previewDrag?.type !== "section") return;
      event.preventDefault();
      section.classList.remove("is-drop-target");
      swapPreviewItems("sections", state.previewDrag.id, section.dataset.previewSection);
    });
  });

  /* ---- 画廊图片拖拽排序 ---- */
  preview.querySelectorAll("[data-preview-gallery-image]").forEach((fig) => {
    fig.addEventListener("dragstart", (event) => {
      event.stopPropagation();
      event.dataTransfer.setData("text/plain", `gallery:${fig.dataset.previewGalleryImage}`);
      event.dataTransfer.effectAllowed = "move";
      state.previewDrag = { type: "gallery-image", id: fig.dataset.previewGalleryImage };
      fig.classList.add("is-dragging");
    });

    fig.addEventListener("dragend", () => {
      state.previewDrag = null;
      fig.classList.remove("is-dragging");
      preview.querySelectorAll(".is-drop-target").forEach((el) => el.classList.remove("is-drop-target"));
    });

    fig.addEventListener("dragover", (event) => {
      if (state.previewDrag?.type !== "gallery-image") return;
      event.preventDefault();
      event.stopPropagation();
      fig.classList.add("is-drop-target");
    });

    fig.addEventListener("dragleave", () => {
      fig.classList.remove("is-drop-target");
    });

    fig.addEventListener("drop", (event) => {
      if (state.previewDrag?.type !== "gallery-image") return;
      event.preventDefault();
      event.stopPropagation();
      fig.classList.remove("is-drop-target");
      reorderPreviewGalleryImage(state.previewDrag.id, fig.dataset.previewGalleryImage);
    });
  });

  preview.querySelectorAll("[data-preview-party]").forEach((card) => {
    card.addEventListener("dragstart", (event) => {
      event.stopPropagation();
      event.dataTransfer.setData("text/plain", `party:${card.dataset.previewParty}`);
      event.dataTransfer.effectAllowed = "move";
      state.previewDrag = { type: "party", id: card.dataset.previewParty };
      card.classList.add("is-dragging");
    });

    card.addEventListener("dragend", () => {
      state.previewDrag = null;
      card.classList.remove("is-dragging");
      preview.querySelectorAll(".is-drop-target").forEach((item) => item.classList.remove("is-drop-target"));
    });

    card.addEventListener("dragover", (event) => {
      if (state.previewDrag?.type !== "party") return;
      event.preventDefault();
      event.stopPropagation();
      card.classList.add("is-drop-target");
    });

    card.addEventListener("dragleave", () => {
      card.classList.remove("is-drop-target");
    });

    card.addEventListener("drop", (event) => {
      if (state.previewDrag?.type !== "party") return;
      event.preventDefault();
      event.stopPropagation();
      card.classList.remove("is-drop-target");
      swapPreviewItems("parties", state.previewDrag.id, card.dataset.previewParty);
    });
  });
}

function swapPreviewItems(layoutKey, sourceId, targetId) {
  if (!state.activeProject || !sourceId || !targetId || sourceId === targetId) return;
  normalizeQuoteLayout(state.activeProject.data);
  const items = state.activeProject.data.layout[layoutKey];
  const sourceIndex = items.indexOf(sourceId);
  const targetIndex = items.indexOf(targetId);
  if (sourceIndex < 0 || targetIndex < 0) return;
  recordUndoSnapshot();
  [items[sourceIndex], items[targetIndex]] = [items[targetIndex], items[sourceIndex]];
  state.previewDrag = null;
  markDirty();
}

function reorderPreviewGalleryImage(sourceId, targetId) {
  if (!state.activeProject || sourceId === targetId) return;
  const ids = [...(state.activeProject.data.selectedImageIds || [])];
  const sourceIndex = ids.findIndex((id) => String(id) === String(sourceId));
  const targetIndex = ids.findIndex((id) => String(id) === String(targetId));
  if (sourceIndex < 0 || targetIndex < 0) return;
  recordUndoSnapshot();
  const [item] = ids.splice(sourceIndex, 1);
  ids.splice(targetIndex, 0, item);
  state.activeProject.data.selectedImageIds = ids;
  normalizeGalleryLayout(state.activeProject.data, state.images);
  state.previewDrag = null;
  markDirty();
  // 同步刷新编辑区已选图片列表
  if (typeof _rerenderSelectedImages === "function") _rerenderSelectedImages();
}

/* ---- 预览区快速操作（添加配件/产品） ---- */

function bindPreviewInteractiveActions(preview) {
  preview.querySelectorAll("[data-add-accessory]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const parentIndex = Number(btn.dataset.addAccessory);
      if (typeof _addAccessory === "function") {
        const newIndex = _addAccessory(parentIndex);
        if (newIndex >= 0) schedulePreviewRefocus(`[data-edit-acc-name="${newIndex}:0"]`);
      }
    });
  });

  const addProductBtn = preview.querySelector("[data-add-product]");
  if (addProductBtn) {
    addProductBtn.addEventListener("click", () => showProductPicker());
  }

  preview.querySelectorAll("[data-remove-preview-item]").forEach((btn) => {
    btn.addEventListener("click", (event) => {
      event.stopPropagation();
      if (typeof _removeQuoteItem === "function") _removeQuoteItem(Number(btn.dataset.removePreviewItem));
    });
  });

  /* Subtotal + Freight 快捷开关 */
  preview.querySelectorAll("[data-toggle-freight-mode]").forEach((btn) => {
    btn.addEventListener("click", (event) => {
      event.stopPropagation();
      const current = btn.dataset.toggleFreightMode === "true";
      const pr = state.activeProject?.data?.pricing;
      if (!pr) return;
      recordUndoSnapshot();
      pr.enabledItems = current ? ["total"] : ["subtotal", "freight", "total"];
      updateQuoteTotals(state.activeProject.data);
      markDirty();
      if (typeof _refreshEditor === "function") _refreshEditor();
    });
  });

  /* 产品图片：点击占位符或已有图片 → 打开图片选择器 */
  preview.querySelectorAll("[data-product-image-placeholder], [data-product-image-item]").forEach((el) => {
    el.style.cursor = "pointer";
    el.addEventListener("click", (event) => {
      event.stopPropagation();
      const itemIndex = Number(el.dataset.productImagePlaceholder ?? el.dataset.productImageItem);
      if (typeof _openQuoteItemImagePicker === "function") _openQuoteItemImagePicker(itemIndex);
    });
  });
}

function showProductPicker() {
  if (!state.products?.length || !state.activeProject) return;

  /* 关闭已打开的面板 */
  closeProductPicker();

  const existingIds = new Set(
    (state.activeProject.data.quoteItems || [])
      .filter((i) => i.type === "product")
      .map((i) => i.product?.id)
  );
  const available = state.products.filter((p) => !existingIds.has(p.id));
  if (!available.length) return;

  const actionTd = document.querySelector("[data-add-product]")?.closest("td");
  if (!actionTd) return;

  const cards = available.map((p) => `
    <button class="picker-product-card" data-pick-product="${p.id}">
      <img src="${productPreviewUrl(p)}" alt="${escapeHtml(p.cnName)}">
      <span>${escapeHtml(p.cnName)}</span>
    </button>`
  ).join("");

  /* 保存原始内容以便关闭时恢复 */
  const originalHtml = actionTd.innerHTML;
  actionTd.dataset.originalContent = originalHtml;

  /* 替换为产品选择面板 */
  actionTd.innerHTML = `<div class="preview-product-panel">${cards}</div>`;

  const panel = actionTd.querySelector(".preview-product-panel");

  /* 点击选择产品 */
  panel.querySelectorAll("[data-pick-product]").forEach((card) => {
    card.addEventListener("click", () => {
      if (typeof _selectProduct === "function") _selectProduct(card.dataset.pickProduct);
      closeProductPicker();
    });
  });

  /* Escape 关闭 */
  const closeOnEsc = (e) => {
    if (e.key === "Escape") {
      closeProductPicker();
      document.removeEventListener("keydown", closeOnEsc);
    }
  };
  document.addEventListener("keydown", closeOnEsc);
}

function closeProductPicker() {
  document.querySelectorAll(".preview-product-panel").forEach((panel) => {
    const td = panel.closest("td");
    if (td?.dataset.originalContent) {
      td.innerHTML = td.dataset.originalContent;
      delete td.dataset.originalContent;
      /* 重新绑定按钮事件 */
      const btn = td.querySelector("[data-add-product]");
      if (btn) btn.addEventListener("click", () => showProductPicker());
    } else {
      panel.remove();
    }
  });
}

/* ---- 预览区点击 section 跳转编辑器对应模块 ---- */

const SECTION_TO_MODULE = {
  basic: "basic",
  pricing: "parameters",
  gallery: "images",
  terms: "terms",
  footer: "footer",
};

const PARTY_TO_MODULE = {
  from: "company",
  to: "customer",
};

function bindSectionClickNavigation(preview) {
  if (typeof _switchToModule !== "function") return;

  /* Party 卡片精确映射 */
  preview.querySelectorAll("[data-preview-party]").forEach((card) => {
    card.addEventListener("click", (event) => {
      if (event.target.closest("input")) return;
      /* 全屏模式：仅联动命令栏，不触发 renderEditorPage */
      if (state.previewFullscreen) {
        if (_syncSectionFromPreview) _syncSectionFromPreview("parties");
        return;
      }
      const moduleId = PARTY_TO_MODULE[card.dataset.previewParty];
      if (moduleId) _switchToModule(moduleId);
    });
  });

  /* Section 级别映射 */
  preview.querySelectorAll("[data-preview-section]").forEach((section) => {
    section.addEventListener("click", (event) => {
      if (event.target.closest("[data-preview-party]")) return;
      if (event.target.closest("[data-preview-item]")) return;
      if (event.target.closest("button")) return;
      if (event.target.closest("input")) return;
      const sectionId = section.dataset.previewSection;
      /* 全屏模式：仅联动命令栏 */
      if (state.previewFullscreen) {
        if (_syncSectionFromPreview) _syncSectionFromPreview(sectionId);
        return;
      }
      const moduleId = SECTION_TO_MODULE[sectionId];
      if (moduleId) _switchToModule(moduleId);
    });
  });

  /* 产品/配件行点击 → 跳转 parameters 模块并滚动到对应卡片 */
  preview.querySelectorAll("[data-preview-item]").forEach((row) => {
    row.style.cursor = "pointer";
    row.addEventListener("click", (event) => {
      if (event.target.closest("button")) return;
      if (event.target.closest("input")) return;
      /* 全屏模式：仅联动命令栏 */
      if (state.previewFullscreen) {
        if (_syncSectionFromPreview) _syncSectionFromPreview("pricing");
        return;
      }
      const itemIndex = Number(row.dataset.previewItem);
      _switchToModule("parameters", itemIndex);
    });
  });
}

/* ---- 预览区内联编辑 ---- */

/** 解析 "INDEX:KEY" 格式的 token（与 editor-modules 的 parseIndexedKey 一致） */
function parseEditKey(token) {
  const sep = String(token || "").indexOf(":");
  return { index: Number(String(token || "").slice(0, sep)), key: String(token || "").slice(sep + 1) };
}

function bindPreviewInlineEditing(preview) {
  const data = state.activeProject?.data;
  if (!data) return;

  /* 日期选择器：点击日历图标触发原生 date input */
  const dateInput = preview.querySelector("[data-edit-date]");
  const dateIcon = preview.querySelector(".pe-date-icon");
  if (dateInput && dateIcon) {
    dateIcon.addEventListener("click", (e) => {
      e.stopPropagation();
      dateInput.showPicker?.() || dateInput.focus();
    });
    dateInput.addEventListener("input", () => {
      if (!data.quoteMeta) data.quoteMeta = {};
      const iso = dateInput.value; // YYYY-MM-DD
      const d = new Date(iso + "T00:00:00");
      const display = isNaN(d.getTime()) ? iso : d.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
      data.quoteMeta.date = display;
      /* 同步显示文本（第一个文本节点） */
      const wrap = dateInput.closest(".pe-date-wrap");
      if (wrap) wrap.firstChild.textContent = display;
      quietDirty();
    });
    dateInput.addEventListener("blur", deferredRefreshEditor);
    dateInput.addEventListener("click", (e) => e.stopPropagation());
  }

  /* 产品自定义参数编辑（<input> 输入框） */
  preview.querySelectorAll("[data-edit-param]").forEach((input) => {
    input.addEventListener("focus", recordUndoSnapshot);
    input.addEventListener("input", () => {
      const { index, key } = parseEditKey(input.dataset.editParam);
      const item = data.quoteItems?.[index];
      if (!item?.parameters) return;
      item.parameters[key] = input.value;
      quietDirty();
    });
    input.addEventListener("blur", deferredRefreshEditor);
    input.addEventListener("click", (e) => e.stopPropagation());
  });

  /* + Param 按钮 */
  preview.querySelectorAll("[data-add-param-preview]").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const index = Number(btn.dataset.addParamPreview);
      const item = data.quoteItems?.[index];
      if (!item || item.type === "accessory") return;
      recordUndoSnapshot();
      const customKey = `__custom_${Date.now()}`;
      item.parameters[customKey] = "";
      schedulePreviewRefocus(`[data-edit-param="${index}:${customKey}"]`);
      markDirty();
      if (_refreshEditor) _refreshEditor();
    });
  });

  /* 删除自定义参数 */
  preview.querySelectorAll("[data-delete-param]").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const { index, key } = parseEditKey(btn.dataset.deleteParam);
      const item = data.quoteItems?.[index];
      if (!item?.parameters || !(key in item.parameters)) return;
      recordUndoSnapshot();
      delete item.parameters[key];
      markDirty();
      if (_refreshEditor) _refreshEditor();
    });
  });

  /* 配件名称编辑 */
  preview.querySelectorAll("[data-edit-acc-title]").forEach((input) => {
    input.addEventListener("focus", recordUndoSnapshot);
    input.addEventListener("input", () => {
      const index = Number(input.dataset.editAccTitle);
      const item = data.quoteItems?.[index];
      if (!item) return;
      item.accessoryName = input.value;
      if (item.product) item.product.enName = input.value;
      quietDirty();
    });
    input.addEventListener("blur", deferredRefreshEditor);
    input.addEventListener("click", (e) => e.stopPropagation());
  });

  /* 配件参数名编辑 */
  preview.querySelectorAll("[data-edit-acc-name]").forEach((el) => {
    el.addEventListener("focus", recordUndoSnapshot);
    el.addEventListener("input", () => {
      const { index, key } = parseEditKey(el.dataset.editAccName);
      const item = data.quoteItems?.[index];
      if (!item || !Array.isArray(item.parameters)) return;
      const param = item.parameters[Number(key)];
      if (param) param.name = el.value;
      quietDirty();
    });
    el.addEventListener("blur", deferredRefreshEditor);
    el.addEventListener("click", (e) => e.stopPropagation());
  });

  /* 配件数量编辑（仅数字） */
  preview.querySelectorAll("[data-edit-acc-qty]").forEach((el) => {
    el.addEventListener("focus", recordUndoSnapshot);
    el.addEventListener("input", () => {
      const cleaned = (el.value || "").replace(/[^\d.]/g, "").replace(/(\..*)\./g, "$1");
      if (cleaned !== el.value) el.value = cleaned;
      const { index, key } = parseEditKey(el.dataset.editAccQty);
      const item = data.quoteItems?.[index];
      if (!item || !Array.isArray(item.parameters)) return;
      const param = item.parameters[Number(key)];
      if (!param) return;
      const unit = param.unit || "";
      const qtyNum = parseFloat(cleaned) || 0;
      const unitForm = unit ? (qtyNum === 1 ? unit : `${unit}s`) : "";
      param.quantity = cleaned ? (unitForm ? `${cleaned} ${unitForm}` : cleaned) : "";
      param.lineTotal = calculateTotalAmount(param.quantity, param.unitPrice) || "";
      updateLineTotalCell(preview, index, key, param.lineTotal);
      recalcAccessoryTotal(item);
      updateSummaryCells(preview);
      quietDirty();
    });
    el.addEventListener("blur", deferredRefreshEditor);
    el.addEventListener("click", (e) => e.stopPropagation());
  });

  /* 配件单价编辑（仅数字） */
  preview.querySelectorAll("[data-edit-acc-price]").forEach((el) => {
    el.addEventListener("focus", recordUndoSnapshot);
    el.addEventListener("input", () => {
      const cleaned = (el.value || "").replace(/[^\d.]/g, "").replace(/(\..*)\./g, "$1");
      if (cleaned !== el.value) el.value = cleaned;
      const { index, key } = parseEditKey(el.dataset.editAccPrice);
      const item = data.quoteItems?.[index];
      if (!item || !Array.isArray(item.parameters)) return;
      const param = item.parameters[Number(key)];
      if (!param) return;
      const unit = param.unit || "";
      param.unitPrice = cleaned ? (unit ? `$${cleaned}/${unit}` : `$${cleaned}`) : "";
      param.lineTotal = calculateTotalAmount(param.quantity, param.unitPrice) || "";
      updateLineTotalCell(preview, index, key, param.lineTotal);
      recalcAccessoryTotal(item);
      updateSummaryCells(preview);
      quietDirty();
    });
    el.addEventListener("blur", deferredRefreshEditor);
    el.addEventListener("click", (e) => e.stopPropagation());
  });

  /* 配件单位编辑 */
  preview.querySelectorAll("[data-edit-acc-unit]").forEach((el) => {
    el.addEventListener("focus", recordUndoSnapshot);
    /* 聚焦时显示快捷选项 */
    const droplist = el.nextElementSibling;
    if (droplist?.classList.contains("pe-unit-droplist")) {
      el.addEventListener("focus", () => { droplist.classList.add("open"); highlightIdx = -1; });
      el.addEventListener("blur", () => setTimeout(() => droplist.classList.remove("open"), 150));
    }
    /* 键盘导航快捷选项：↑↓ 切换高亮，Enter 选择 */
    let highlightIdx = -1;
    el.addEventListener("keydown", (e) => {
      if (!droplist?.classList.contains("pe-unit-droplist") || !droplist.classList.contains("open")) return;
      const options = Array.from(droplist.querySelectorAll("button"));
      if (!options.length) return;
      if (e.key === "ArrowDown") {
        e.preventDefault();
        e.stopImmediatePropagation();
        highlightIdx = Math.min(highlightIdx + 1, options.length - 1);
        options.forEach((o) => o.classList.remove("pe-unit-active"));
        options[highlightIdx].classList.add("pe-unit-active");
        options[highlightIdx].scrollIntoView({ block: "nearest" });
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        e.stopImmediatePropagation();
        highlightIdx = Math.max(highlightIdx - 1, 0);
        options.forEach((o) => o.classList.remove("pe-unit-active"));
        options[highlightIdx].classList.add("pe-unit-active");
        options[highlightIdx].scrollIntoView({ block: "nearest" });
      } else if (e.key === "Enter" && highlightIdx >= 0) {
        e.preventDefault();
        e.stopImmediatePropagation();
        const value = options[highlightIdx].dataset.peUnitPick;
        el.value = value;
        el.dispatchEvent(new Event("input"));
        droplist.classList.remove("open");
        highlightIdx = -1;
      }
    });
    el.addEventListener("input", () => {
      const { index, key } = parseEditKey(el.dataset.editAccUnit);
      const item = data.quoteItems?.[index];
      if (!item || !Array.isArray(item.parameters)) return;
      const param = item.parameters[Number(key)];
      if (!param) return;
      param.unit = el.value.trim();
      quietDirty();
    });
    el.addEventListener("blur", deferredRefreshEditor);
    el.addEventListener("click", (e) => e.stopPropagation());
  });

  /* 配件单位快捷选项 */
  preview.querySelectorAll("[data-pe-unit-pick]").forEach((btn) => {
    btn.addEventListener("mousedown", (e) => {
      e.preventDefault();
      const wrap = btn.closest(".pe-unit-wrap");
      const input = wrap?.querySelector("[data-edit-acc-unit]");
      if (!input) return;
      input.value = btn.dataset.peUnitPick;
      input.dispatchEvent(new Event("input"));
      const droplist = wrap.querySelector(".pe-unit-droplist");
      if (droplist) droplist.classList.remove("open");
    });
  });

  /* + Row 按钮（配件添加参数行） */
  preview.querySelectorAll("[data-add-acc-row]").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const index = Number(btn.dataset.addAccRow);
      const item = data.quoteItems?.[index];
      if (!item || item.type !== "accessory") return;
      recordUndoSnapshot();
      if (!Array.isArray(item.parameters)) item.parameters = [];
      /* 直接追加新行，不碰已有参数 */
      const newIdx = item.parameters.length;
      item.parameters.push({ name: " ", quantity: "", unitPrice: "", lineTotal: "", unit: "", _new: true });
      schedulePreviewRefocus(`[data-edit-acc-name="${index}:${newIdx}"]`);
      markDirty();
      if (_refreshEditor) _refreshEditor();
    });
  });

  /* Enter 键：配件行跳到同行下一个输入框，无下一个则 blur 退出编辑；
     非配件行（产品自定义参数）直接 blur */
  preview.querySelectorAll(".pe-param-input, .pe-line-input").forEach((input) => {
    input.addEventListener("keydown", (e) => {
      if (e.key !== "Enter") return;
      e.preventDefault();
      const row = input.closest("tr");
      if (row) {
        const fields = Array.from(row.querySelectorAll(".pe-line-input"));
        const idx = fields.indexOf(input);
        if (idx >= 0 && idx < fields.length - 1) {
          fields[idx + 1].focus();
          return;
        }
      }
      input.blur();
    });
  });

  /* 删除配件参数行（_new 行） */
  preview.querySelectorAll("[data-delete-acc-row]").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const { index, key } = parseEditKey(btn.dataset.deleteAccRow);
      const item = data.quoteItems?.[index];
      if (!item || !Array.isArray(item.parameters)) return;
      const paramIndex = Number(key);
      if (paramIndex < 0 || paramIndex >= item.parameters.length) return;
      recordUndoSnapshot();
      item.parameters.splice(paramIndex, 1);
      markDirty();
      if (_refreshEditor) _refreshEditor();
    });
  });
}
