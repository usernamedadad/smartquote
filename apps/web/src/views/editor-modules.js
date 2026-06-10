/**
 * 编辑器模块：8 个模块的表单 HTML + 字段绑定 + 产品/图片操作
 */
import { state, modules } from "../state.js";
import {
  escapeHtml, fileToDataUrl, splitParameterValue, setByPath, productPreviewUrl, productSeriesLabel,
  normalizeTerms, calculateTotalAmount, isLineOnlyParameter, normalizeGalleryLayout,
  normalizeQuoteItems, createQuoteItemFromProduct, createCraneSupportQuoteItems,
  updateQuoteTotals, recalcAccessoryTotal, sumAmountStrings, parseAmountNumber, extractNumeric,
  GALLERY_PRESETS, normalizeGalleryPreset
} from "../utils.js";
import { parameterIconSvg, iconSvg } from "../icons.js";
import { recordUndoSnapshot } from "../history.js";
import { api, loadWorkspace } from "../api.js";
import { markDirty } from "./preview.js";
import { showAppModal, showContentModal, showToast } from "../ui.js";
import { showBulkImportModal, parseImportText } from "../bulk-import.js";
import { emptyMarkup } from "./projects.js";

let _renderEditorPage, _uploadImageFromFile, _deleteImage, _refreshFullscreenCard;

export function registerEditorModulesCallbacks({ renderEditorPage, uploadImageFromFile, deleteImage, refreshFullscreenCard }) {
  _renderEditorPage = renderEditorPage;
  _uploadImageFromFile = uploadImageFromFile;
  _deleteImage = deleteImage;
  _refreshFullscreenCard = refreshFullscreenCard;
}

/* ---- 模块内容分发 ---- */

export function renderModuleEditor() {
  const container = document.querySelector("#module-editor-body");
  if (!container) return;
  const data = state.activeProject.data;

  if (state.activeModule === "basic") container.innerHTML = basicEditorMarkup(data);
  if (state.activeModule === "company") container.innerHTML = companyEditorMarkup(data);
  if (state.activeModule === "customer") container.innerHTML = customerEditorMarkup(data);
  if (state.activeModule === "parameters") container.innerHTML = parametersEditorMarkup(data);
  if (state.activeModule === "images") container.innerHTML = imagesEditorMarkup(data);
  if (state.activeModule === "pricing") container.innerHTML = pricingEditorMarkup(data);
  if (state.activeModule === "terms") container.innerHTML = termsEditorMarkup(data);
  if (state.activeModule === "footer") container.innerHTML = footerEditorMarkup(data);

  bindEditorFields(container);
}

/* ---- 8 个模块 HTML ---- */

function basicEditorMarkup(data) {
  return `
    <div class="form-grid two">
      ${quoteNoFieldMarkup(data.quoteMeta.quoteNo)}
      ${dateFieldMarkup("报价日期", "quoteMeta.date", data.quoteMeta.date)}
      ${fieldMarkup("有效期", "quoteMeta.validity", data.quoteMeta.validity)}
      ${fieldMarkup("标题", "quoteMeta.title", data.quoteMeta.title)}
    </div>
    ${bulkImportMarkup("basic")}
  `;
}

function companyEditorMarkup(data) {
  return `
    <div class="form-stack">
      <h3>FROM</h3>
      ${fieldMarkup("公司", "from.company", data.from.company)}
      ${fieldMarkup("姓名", "from.name", data.from.name)}
      ${fieldMarkup("WhatsApp", "from.whatsapp", data.from.whatsapp)}
      ${fieldMarkup("Email", "from.email", data.from.email)}
    </div>
    ${bulkImportMarkup("company")}
  `;
}

function customerEditorMarkup(data) {
  return `
    <div class="form-stack">
      <h3>TO</h3>
      ${fieldMarkup("公司/客户", "to.company", data.to.company)}
      ${fieldMarkup("姓名", "to.name", data.to.name)}
      ${fieldMarkup("WhatsApp", "to.whatsapp", data.to.whatsapp)}
      ${fieldMarkup("Email", "to.email", data.to.email)}
    </div>
    ${bulkImportMarkup("customer")}
  `;
}

function parametersEditorMarkup(data) {
  const items = normalizeQuoteItems(data, state.products);
  const productOrderMap = buildProductOrderMap(items);
  return `
    <div class="product-strip-sticky">
      <h3 class="form-section-title">产品类型</h3>
      <div class="product-strip">
        ${state.products.map((product) => {
          const order = productOrderMap.get(product.id);
          const isActive = order != null;
          return `
            <button class="product-card ${isActive ? "active" : ""}" data-product-id="${product.id}">
              <span class="product-check">${isActive ? order + 1 : ""}</span>
              <span class="product-thumb">
                <img src="${productPreviewUrl(product)}" alt="${escapeHtml(product.cnName)}">
              </span>
              <strong>${escapeHtml(product.cnName)}</strong>
              <small>${escapeHtml(productSeriesLabel(product))}</small>
            </button>
          `;
        }).join("")}
      </div>
    </div>
    <h3 class="form-section-title parameter-heading">参数编辑</h3>
    <div class="quote-item-list">
      ${items.length ? buildItemGroups(items).map(group =>
        `<div class="product-group">${group.map(item => {
          const index = items.indexOf(item);
          return quoteItemEditorMarkup(item, index, items);
        }).join("")}</div>`
      ).join("") : `<div class="empty-state">点击上方产品类型添加报价条目</div>`}
    </div>
  `;
}

function buildProductOrderMap(items) {
  const map = new Map();
  let order = 0;
  for (const item of items) {
    if (item.type === "accessory") continue;
    const pid = item.product?.id;
    if (pid && !map.has(pid)) {
      map.set(pid, order);
      order++;
    }
  }
  return map;
}

function quoteItemEditorMarkup(item, index, allItems) {
  const collapsed = item.collapsed ? "collapsed" : "";
  const isAccessory = item.type === "accessory";

  if (isAccessory) {
    return accessoryCardMarkup(item, index, allItems, collapsed);
  }

  const isFirstProduct = !allItems.slice(0, index).some((i) => i.type !== "accessory");
  const isLastProduct = !allItems.slice(index + 1).some((i) => i.type !== "accessory");
  const builtInKeys = getBuiltInParameterKeys(item.product?.id);
  const productImage = state.images.find((image) => Number(image.id) === Number(item.imageId));

  return `
    <article class="quote-item-card ${collapsed}" data-quote-item="${index}">
      <div class="quote-item-header" data-toggle-quote-item="${index}">
        <span class="toggle-icon">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 6 15 12 9 18"/></svg>
        </span>
        <span class="quote-item-no">${index + 1}</span>
        <strong>${escapeHtml(item.product.enName || "Untitled Item")}</strong>
        <button class="header-add-accessory" type="button" data-add-accessory="${index}">+ 配件</button>
        <div class="quote-item-hover-actions">
          ${!isFirstProduct ? `<button class="hover-action" type="button" title="上移" data-move-quote-item="${index}:up">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="18 15 12 9 6 15"/></svg>
          </button>` : ""}
          ${!isLastProduct ? `<button class="hover-action" type="button" title="下移" data-move-quote-item="${index}:down">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>
          </button>` : ""}
          <button class="hover-action danger" type="button" title="删除" data-remove-quote-item="${index}">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>
          </button>
        </div>
      </div>
      <div class="quote-item-body">
        <div class="form-grid three compact-pricing-grid">
          ${itemPricingFieldMarkup("数量", index, "quantity", item.pricing.quantity)}
          ${itemPricingFieldMarkup("单价", index, "unitPrice", item.pricing.unitPrice)}
          ${itemPricingFieldMarkup("行总价", index, "totalAmount", item.pricing.totalAmount)}
        </div>
        ${quoteItemImageEditorMarkup(index, productImage)}
        <div class="parameter-list">
          ${Object.entries(item.parameters || {}).map(([key, value]) => parameterFieldMarkup(key, value, index, builtInKeys)).join("")}
          <button class="add-param-button" type="button" data-add-param="${index}">+ 添加参数</button>
        </div>
      </div>
    </article>
  `;
}

function accessoryCardMarkup(item, index, allItems, collapsed) {
  const parentItem = allItems.find((i) => i.id === item.parentId);
  const parentName = parentItem?.product?.enName || "";
  const params = Array.isArray(item.parameters) ? item.parameters : [];
  return `
    <article class="quote-item-card is-accessory ${collapsed}" data-quote-item="${index}">
      <div class="quote-item-header" data-toggle-quote-item="${index}">
        <span class="toggle-icon">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 6 15 12 9 18"/></svg>
        </span>
        <span class="quote-item-no">${index + 1}</span>
        <span class="accessory-badge">配件</span>
        <input class="accessory-name-input" type="text" value="${escapeHtml(item.accessoryName || item.product.enName || "Accessory")}" data-accessory-name="${index}" placeholder="配件名称">
        <em class="accessory-parent">— ${escapeHtml(parentName)}</em>
        <div class="quote-item-hover-actions">
          <button class="hover-action danger" type="button" title="删除" data-remove-quote-item="${index}">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>
          </button>
        </div>
      </div>
      <div class="quote-item-body">
        <div class="accessory-param-list">
          ${params.map((p, pi) => accessoryParamGroupMarkup(index, pi, p)).join("")}
          <button class="add-accessory-button" type="button" data-add-accessory-param="${index}">+ 添加参数</button>
        </div>
      </div>
    </article>
  `;
}

function accessoryParamGroupMarkup(itemIndex, paramIndex, param) {
  const pUnit = param.unit || "";
  const qtyNum = parseFloat(extractNumeric(param.quantity)) || 0;
  const qtySuffix = pUnit ? (qtyNum === 1 ? pUnit : `${pUnit}s`) : "";
  const priceSuffix = pUnit || "";
  const qtySuffixHtml = qtySuffix ? `<span class="param-suffix qty-suffix">${escapeHtml(qtySuffix)}</span>` : '<span class="param-suffix qty-suffix"></span>';
  const priceSuffixHtml = priceSuffix ? `<span class="param-suffix price-suffix">${escapeHtml(priceSuffix)}</span>` : '<span class="param-suffix price-suffix"></span>';
  return `
    <div class="accessory-param-group">
      <div class="accessory-param-name-row">
        <input type="text" class="param-name-input" value="${escapeHtml(param.name)}" data-accessory-param-name="${itemIndex}:${paramIndex}" placeholder="参数名称">
        <span class="param-unit-wrap">
          <input type="text" class="param-unit-input" value="${escapeHtml(pUnit)}" data-accessory-param-unit="${itemIndex}:${paramIndex}" placeholder="单位">
          <div class="param-unit-droplist">
            <button type="button" data-unit-pick="set">set</button>
            <button type="button" data-unit-pick="meter">meter</button>
            <button type="button" data-unit-pick="pc">pc</button>
          </div>
        </span>
        <button class="accessory-param-remove" type="button" data-remove-accessory-param="${itemIndex}:${paramIndex}" title="删除">×</button>
      </div>
      <div class="accessory-param-pricing-row">
        <label class="param-field">
          <span>数量</span>
          <span class="param-input-wrap">
            <input data-accessory-param-pricing="${itemIndex}:${paramIndex}:quantity" value="${escapeHtml(extractNumeric(param.quantity))}" inputmode="decimal" placeholder="0">
            ${qtySuffixHtml}
          </span>
        </label>
        <label class="param-field">
          <span>单价</span>
          <span class="param-input-wrap">
            <em>$</em>
            <input data-accessory-param-pricing="${itemIndex}:${paramIndex}:unitPrice" value="${escapeHtml(extractNumeric(param.unitPrice))}" inputmode="decimal" placeholder="0">
            ${priceSuffixHtml}
          </span>
        </label>
        <label class="param-field">
          <span>总价</span>
          <span class="param-input-wrap">
            <em>$</em>
            <input data-accessory-param-pricing="${itemIndex}:${paramIndex}:lineTotal" value="${escapeHtml(extractNumeric(param.lineTotal))}" readonly placeholder="0">
          </span>
        </label>
      </div>
    </div>
  `;
}

function itemPricingFieldMarkup(label, index, field, value) {
  if (field === "unitPrice" || field === "totalAmount") {
    return `
      <label class="field">
        <span>${escapeHtml(label)}</span>
        <span class="money-control ${field === "unitPrice" ? "with-suffix" : ""}">
          <em>$</em>
          <input data-item-pricing="${index}:${field}" value="${escapeHtml(extractNumeric(value))}" inputmode="decimal">
          ${field === "unitPrice" ? "<b>/set</b>" : ""}
        </span>
      </label>
    `;
  }
  const num = parseAmountNumber(value);
  const suffix = Number.isFinite(num) && num !== 1 ? " sets" : " set";
  return `
    <label class="field">
      <span>${escapeHtml(label)}</span>
      <span class="money-control with-suffix">
        <input data-item-pricing="${index}:${field}" value="${escapeHtml(extractNumeric(value))}" inputmode="decimal">
        <b data-qty-suffix="${index}">${suffix}</b>
      </span>
    </label>
  `;
}

function formatPricingInputValue(field, value) {
  const text = String(value || "").trim();
  if (!text) return "";
  if (field === "quantity") {
    const num = parseFloat(text.replace(/,/g, ""));
    const unit = Number.isFinite(num) && num !== 1 ? "sets" : "set";
    return `${text} ${unit}`;
  }
  if (field === "unitPrice") return `$${text}/set`;
  if (field === "totalAmount") return `$${text}`;
  return text;
}

/** 获取产品模板中内置的参数 key 集合（用于区分可删除的自定义参数） */
function getBuiltInParameterKeys(productId) {
  if (!productId) return new Set();
  const product = state.products.find((p) => p.id === productId);
  if (!product?.parameters) return new Set();
  return new Set(Object.keys(product.parameters));
}

function parameterFieldMarkup(key, value, itemIndex, builtInKeys = new Set()) {
  const isBuiltIn = builtInKeys.has(key) && key;
  const delBtn = isBuiltIn ? "" : `<button class="param-delete-btn" type="button" data-delete-param="${itemIndex}:${escapeHtml(key)}" title="删除参数">×</button>`;

  if (Array.isArray(value)) {
    return `
      <label class="field-row">
        <span class="field-label"><i>${parameterIconSvg(key)}</i>${escapeHtml(key)}</span>
        <textarea data-item-param-array="${itemIndex}:${escapeHtml(key)}">${escapeHtml(value.join("\n"))}</textarea>
        ${delBtn}
      </label>
    `;
  }

  /* 自定义参数（key 以 __custom_ 开头）：左侧标签固定"自定义参数"，右侧编辑值 */
  if (key.startsWith("__custom_")) {
    return `
      <label class="field-row">
        <span class="field-label"><i>${parameterIconSvg(key)}</i>自定义参数</span>
        <input data-item-param="${itemIndex}:${escapeHtml(key)}" value="${escapeHtml(value)}" placeholder="输入参数值">
        ${delBtn}
      </label>
    `;
  }

  if (isLineOnlyParameter(value)) {
    return `
      <label class="field-row parameter-line-row">
        <span class="field-label"><i>${parameterIconSvg(key)}</i>${escapeHtml(key)}</span>
        <input data-item-param-line="${itemIndex}:${escapeHtml(key)}" value="${escapeHtml(key)}">
        ${delBtn}
      </label>
    `;
  }

  const unit = splitParameterValue(value);
  if (unit.unit) {
    return `
      <label class="field-row">
        <span class="field-label"><i>${parameterIconSvg(key)}</i>${escapeHtml(key)}</span>
        <span class="param-control">
          <input data-item-param-value="${itemIndex}:${escapeHtml(key)}" data-param-unit="${escapeHtml(unit.unit)}" data-param-unit-format="${unit.format}" value="${escapeHtml(unit.text)}">
          <em>${escapeHtml(unit.unit)}</em>
        </span>
        ${delBtn}
      </label>
    `;
  }

  return `
      <label class="field-row">
        <span class="field-label"><i>${parameterIconSvg(key)}</i>${escapeHtml(key)}</span>
      <input data-item-param="${itemIndex}:${escapeHtml(key)}" value="${escapeHtml(value)}">
      ${delBtn}
      </label>
  `;
}

function imagesEditorMarkup(data) {
  const selectedIds = data.selectedImageIds || [];
  const selectedImages = selectedIds.map((id) => state.images.find((image) => Number(image.id) === Number(id))).filter(Boolean);
  const galleryPreset = normalizeGalleryPreset(data);

  return `
    <div class="image-editor">
      <section class="gallery-layout-panel">
        <h3>图片布局</h3>
        <div class="gallery-layout-options">
          ${GALLERY_PRESETS.map((preset) => galleryPresetButtonMarkup(preset, galleryPreset)).join("")}
        </div>
      </section>
      <section class="inserted-image-panel">
        <h3>已插入报价单（上下拖动调整顺序）</h3>
        <div class="selected-images" data-drop-target>
          ${selectedImages.length ? selectedImages.map(selectedImageMarkup).join("") : emptyMarkup("未选择图片")}
        </div>
      </section>
      <section class="image-library-panel">
        <h3>${state.user?.role === "admin" ? "全部图库" : "我的图库"}</h3>
        <div class="choose-grid">
          <label class="choose-image image-upload-new" data-upload-drop>
            <input id="image-module-upload" type="file" accept="image/*">
            <span class="image-upload-new-icon">+</span>
            <span>上传图片</span>
          </label>
          ${state.images.map((image) => chooseImageMarkup(image, selectedIds)).join("")}
        </div>
      </section>
    </div>
  `;
}

function galleryPresetButtonMarkup(preset, current) {
  return `
    <button class="gallery-layout-option ${preset.id === current ? "active" : ""}" type="button" data-gallery-preset="${preset.id}" title="${escapeHtml(preset.label)}">
      <span class="layout-icon layout-${preset.id}" aria-hidden="true"><i></i><i></i><i></i><i></i></span>
      <em>${escapeHtml(preset.label)}</em>
    </button>
  `;
}

function quoteItemImageEditorMarkup(index, image) {
  return `
    <section class="quote-item-image-editor">
      <div class="quote-item-image-copy">
        <strong>产品图片</strong>
        <span>${image ? escapeHtml(image.originalName) : "未选择"}</span>
      </div>
      <button class="quote-item-image-thumb" type="button" data-select-item-image="${index}" title="选择产品图片">
        ${image ? `<img src="${image.url}" alt="${escapeHtml(image.originalName)}">` : `<span>+</span>`}
        ${image ? `<span class="thumb-remove image-card-delete" data-remove-item-image="${index}" title="删除图片">×</span>` : ""}
      </button>
      <div class="quote-item-image-actions">
        ${image ? `<button class="ghost-button" type="button" data-remove-item-image="${index}">移除</button>` : ""}
      </div>
    </section>
  `;
}

function chooseImageMarkup(image, selectedIds) {
  return `
    <div class="choose-image ${selectedIds.map(Number).includes(Number(image.id)) ? "selected" : ""}" draggable="true" data-toggle-image="${image.id}">
      <button class="choose-image-select" type="button" draggable="false" title="插入/移除图片">
        <img src="${image.url}" alt="${escapeHtml(image.originalName)}">
        <span>${escapeHtml(image.originalName)}</span>
      </button>
      <button class="choose-image-delete image-card-delete" type="button" data-delete-library-image="${image.id}" title="从图库删除">×</button>
    </div>
  `;
}

function selectedImageMarkup(image) {
  return `
    <article class="selected-image-row" draggable="true" data-selected-image="${image.id}">
      <img src="${image.url}" alt="${escapeHtml(image.originalName)}">
      <span>${escapeHtml(image.originalName)}</span>
      <button class="icon-button" data-move-image="${image.id}:up">↑</button>
      <button class="icon-button" data-move-image="${image.id}:down">↓</button>
      <button class="icon-button danger" data-remove-image="${image.id}">×</button>
    </article>
  `;
}

function pricingEditorMarkup(data) {
  const pricing = updateQuoteTotals(data);
  const freightMode = (pricing.enabledItems || []).includes("freight");
  return `
    <div class="pricing-mode-panel">
      <div>
        <strong>价格汇总方式</strong>
      </div>
      <label class="switch-control">
        <input type="checkbox" data-pricing-freight-mode ${freightMode ? "checked" : ""}>
        <span></span>
        <em>启用 Subtotal + Freight</em>
      </label>
    </div>
    <div class="pricing-summary-editor ${freightMode ? "with-freight" : ""}">
      ${pricingSummaryFieldMarkup("SUBTOTAL", "pricing.subtotal", pricing.subtotal, true, freightMode)}
      ${pricingSummaryFieldMarkup("FREIGHT", "pricing.freight", pricing.freight, false, freightMode)}
      ${pricingSummaryFieldMarkup("TOTAL", "pricing.totalAmount", pricing.totalAmount, false, true)}
    </div>
    <div class="price-item-summary">
      ${normalizeQuoteItems(data, state.products).map((item, index) => `
        <article>
          <span>${index + 1}. ${escapeHtml(item.product.enName)}</span>
          <strong>${escapeHtml(item.pricing.totalAmount || "-")}</strong>
        </article>
      `).join("")}
    </div>
    ${bulkImportMarkup("pricing")}
  `;
}

function pricingSummaryFieldMarkup(label, path, value, readonly, visible) {
  return `
    <label class="pricing-summary-field ${visible ? "" : "is-hidden"}">
      <span>${escapeHtml(label)}</span>
      <span class="money-control">
        <em>$</em>
        <input data-path="${path}" value="${escapeHtml(extractNumeric(value))}" inputmode="decimal" ${readonly ? "readonly" : ""}>
      </span>
    </label>
  `;
}

function termsEditorMarkup(data) {
  normalizeTerms(data.terms);
  return `
    <div class="terms-editor-list">
      ${data.terms.items.map((item, index) => termsItemMarkup(item, index)).join("")}
    </div>
    <button class="ghost-button add-term-button" type="button" data-add-term>新增标题</button>
    ${bulkImportMarkup("terms")}
  `;
}

function termsItemMarkup(item, index) {
  return `
    <article class="term-item">
      <div class="term-header">
        <input class="term-title-input" data-term-title="${index}" value="${escapeHtml(item.title)}" placeholder="条款标题">
        <button class="term-del-btn" type="button" title="删除" data-remove-term="${index}">✕</button>
      </div>
      <textarea class="term-content-input" data-term-content="${index}" placeholder="输入条款内容...">${escapeHtml(item.content)}</textarea>
    </article>
  `;
}

function footerEditorMarkup(data) {
  return `
    <div class="form-grid two">
      ${fieldMarkup("公司", "footer.company", data.footer.company)}
      ${fieldMarkup("网站", "footer.website", data.footer.website)}
      ${fieldMarkup("邮箱", "footer.email", data.footer.email)}
      ${fieldMarkup("电话", "footer.phone", data.footer.phone)}
    </div>
    ${bulkImportMarkup("footer")}
  `;
}

/* ---- 通用表单组件 ---- */

function bulkImportMarkup(moduleId) {
  return `
    <section class="bulk-import-panel">
      <div>
        <strong>批量导入</strong>
        <span>粘贴整段信息，系统会自动识别并填入上方字段。</span>
      </div>
      <button class="ghost-button" type="button" data-import-module="${moduleId}">一键导入</button>
    </section>
  `;
}

function bumpTrailingNumber(str, delta) {
  const match = str.match(/^(.*?)(\d+)$/);
  if (!match) return str;
  const next = parseInt(match[2], 10) + delta;
  if (next < 0) return str;
  return match[1] + String(next).padStart(match[2].length, "0");
}

function quoteNoFieldMarkup(value) {
  return `
    <label class="field field--inc">
      <span>报价单编号</span>
      <span class="field-input-wrap">
        <input data-path="quoteMeta.quoteNo" value="${escapeHtml(value)}" autocomplete="off">
        <button class="inc-btn" type="button" data-bump="quoteMeta.quoteNo:1" title="V1 → V2">↑</button>
        <button class="inc-btn" type="button" data-bump="quoteMeta.quoteNo:-1" title="V2 → V1">↓</button>
      </span>
    </label>
  `;
}

function fieldMarkup(label, path, value) {
  return `
    <label class="field">
      <span>${escapeHtml(label)}</span>
      <input data-path="${path}" value="${escapeHtml(value)}" autocomplete="off">
    </label>
  `;
}

function dateFieldMarkup(label, path, value) {
  const d = value ? new Date(value) : null;
  const iso = d && !isNaN(d.getTime()) ? d.toISOString().slice(0, 10) : "";
  return `
    <label class="field ed-date-field">
      <span>${escapeHtml(label)}</span>
      <span class="ed-date-wrap">
        <input data-path="${path}" value="${escapeHtml(value)}" autocomplete="off" class="ed-date-text">
        <input type="date" class="ed-date-picker" value="${iso}">
        <span class="ed-date-icon" title="选择日期"><svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="1.5" y="3" width="13" height="11.5" rx="1.5"/><line x1="1.5" y1="7" x2="14.5" y2="7"/><line x1="5" y1="1" x2="5" y2="4.5"/><line x1="11" y1="1" x2="11" y2="4.5"/></svg></span>
      </span>
    </label>
  `;
}

/* ---- 字段事件绑定 ---- */

function bindEditorFields(container) {
  container.querySelectorAll("input, textarea").forEach((input) => {
    input.addEventListener("focus", recordUndoSnapshot);
  });

  /* 编号递增/递减按钮 */
  container.querySelectorAll("[data-bump]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const raw = btn.dataset.bump;
      const [path, delta] = raw.split(":");
      const input = btn.closest(".field-input-wrap")?.querySelector("input");
      if (!input) return;
      recordUndoSnapshot();
      input.value = bumpTrailingNumber(input.value, Number(delta));
      setByPath(state.activeProject.data, path, input.value);
      markDirty();
    });
  });

  /* 日期选择器：图标触发隐藏 date input */
  container.querySelectorAll(".ed-date-wrap").forEach((wrap) => {
    const textInput = wrap.querySelector(".ed-date-text");
    const picker = wrap.querySelector(".ed-date-picker");
    const icon = wrap.querySelector(".ed-date-icon");
    if (!picker || !icon) return;

    icon.addEventListener("click", () => {
      picker.showPicker?.() || picker.focus();
    });

    picker.addEventListener("input", () => {
      const d = new Date(picker.value + "T00:00:00");
      const display = isNaN(d.getTime()) ? picker.value : d.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
      textInput.value = display;
      textInput.dispatchEvent(new Event("input", { bubbles: true }));
    });
  });

  container.querySelectorAll("[data-path]").forEach((input) => {
    input.addEventListener("input", () => {
      const path = input.dataset.path;
      if (path.startsWith("pricing.")) {
        const text = input.value.replace(/[^\d.,]/g, "").replace(/(\..*)\./g, "$1");
        input.value = text;
        setByPath(state.activeProject.data, path, text ? `$${text}` : "");
        // 用户编辑 TOTAL 时反算 FREIGHT，其他情况正常汇总
        if (path === "pricing.totalAmount") {
          recalcFreightFromTotal(state.activeProject.data);
        } else {
          updateQuoteTotals(state.activeProject.data);
        }
        syncPricingInputs(container);
      } else {
        setByPath(state.activeProject.data, path, input.value);
      }
      markDirty();
    });
  });

  container.querySelectorAll("[data-item-pricing]").forEach((input) => {
    const [, field] = input.dataset.itemPricing.split(":");
    if (field === "quantity" || field === "unitPrice" || field === "totalAmount") {
      input.addEventListener("input", () => {
        input.value = input.value.replace(/[^\d.,]/g, "").replace(/(\..*)\./g, "$1");
      });
    }
    input.addEventListener("input", () => {
      const [index, field] = input.dataset.itemPricing.split(":");
      const item = state.activeProject.data.quoteItems[Number(index)];
      if (!item) return;
      item.pricing[field] = formatPricingInputValue(field, input.value);
      if (field === "quantity") {
        const suffixEl = container.querySelector(`[data-qty-suffix="${index}"]`);
        if (suffixEl) {
          const num = parseFloat(input.value.replace(/,/g, ""));
          suffixEl.textContent = Number.isFinite(num) && num !== 1 ? " sets" : " set";
        }
      }
      if (field === "quantity" || field === "unitPrice") {
        const total = calculateTotalAmount(item.pricing.quantity, item.pricing.unitPrice);
        if (total) item.pricing.totalAmount = total;
        const totalInput = container.querySelector(`[data-item-pricing="${index}:totalAmount"]`);
        if (totalInput && total) totalInput.value = extractNumeric(total);
      }
      updateQuoteTotals(state.activeProject.data);
      syncPricingInputs(container);
      markDirty();
    });
  });

  container.querySelectorAll("[data-item-param]").forEach((input) => {
    input.addEventListener("input", () => updateItemParameter(input.dataset.itemParam, input.value));
  });

  container.querySelectorAll("[data-item-param-value]").forEach((input) => {
    input.addEventListener("input", () => {
      const unit = input.dataset.paramUnit;
      const format = input.dataset.paramUnitFormat;
      updateItemParameter(input.dataset.itemParamValue, format === "paren" ? `${input.value} (${unit})` : `${input.value} ${unit}`);
    });
  });

  container.querySelectorAll("[data-item-param-line]").forEach((input) => {
    input.addEventListener("input", () => renameItemParameter(input));
  });

  container.querySelectorAll("[data-item-param-array]").forEach((textarea) => {
    textarea.addEventListener("input", () => updateItemParameter(
      textarea.dataset.itemParamArray,
      textarea.value.split("\n").map((line) => line.trim()).filter(Boolean)
    ));
  });

  /* 删除产品参数 */
  container.querySelectorAll("[data-delete-param]").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      const { index, key } = parseIndexedKey(button.dataset.deleteParam);
      const item = state.activeProject.data.quoteItems?.[index];
      if (!item || !item.parameters) return;
      recordUndoSnapshot();
      delete item.parameters[key];
      markDirty();
      rerenderCurrentModule();
    });
  });

  /* 空 key 参数重命名 */
  container.querySelectorAll("[data-item-param-rename]").forEach((input) => {
    input.addEventListener("input", () => {
      const { index } = parseIndexedKey(input.dataset.itemParamRename);
      const item = state.activeProject.data.quoteItems?.[index];
      if (!item || !item.parameters) return;
      const newKey = input.value.trim();
      const value = item.parameters[""] ?? "";
      delete item.parameters[""];
      if (newKey) {
        item.parameters[newKey] = value;
      } else {
        item.parameters[""] = value;
      }
      markDirty();
    });
    input.addEventListener("focus", recordUndoSnapshot);
  });

  container.querySelectorAll("[data-pricing-freight-mode]").forEach((input) => {
    input.addEventListener("change", () => {
      const pricing = state.activeProject.data.pricing;
      pricing.enabledItems = input.checked ? ["subtotal", "freight", "total"] : ["total"];
      updateQuoteTotals(state.activeProject.data);
      markDirty();
      rerenderCurrentModule();
    });
  });

  container.querySelectorAll("[data-gallery-preset]").forEach((button) => {
    button.addEventListener("click", () => {
      recordUndoSnapshot();
      state.activeProject.data.layout = state.activeProject.data.layout || {};
      state.activeProject.data.layout.galleryPreset = button.dataset.galleryPreset;
      normalizeGalleryLayout(state.activeProject.data, state.images);
      markDirty();
      rerenderCurrentModule();
    });
  });

  container.querySelectorAll("[data-term-title]").forEach((input) => {
    input.addEventListener("input", () => {
      normalizeTerms(state.activeProject.data.terms);
      state.activeProject.data.terms.items[Number(input.dataset.termTitle)].title = input.value;
      syncLegacyTerms();
      markDirty();
    });
  });

  container.querySelectorAll("[data-term-content]").forEach((textarea) => {
    textarea.addEventListener("input", () => {
      normalizeTerms(state.activeProject.data.terms);
      state.activeProject.data.terms.items[Number(textarea.dataset.termContent)].content = textarea.value;
      syncLegacyTerms();
      markDirty();
    });
  });

  container.querySelector("[data-add-term]")?.addEventListener("click", () => {
    recordUndoSnapshot();
    normalizeTerms(state.activeProject.data.terms);
    state.activeProject.data.terms.items.push({ title: "NEW TERM", content: "" });
    syncLegacyTerms();
    markDirty();
    rerenderCurrentModule();
  });

  container.querySelectorAll("[data-remove-term]").forEach((button) => {
    button.addEventListener("click", () => {
      recordUndoSnapshot();
      normalizeTerms(state.activeProject.data.terms);
      state.activeProject.data.terms.items.splice(Number(button.dataset.removeTerm), 1);
      syncLegacyTerms();
      markDirty();
      rerenderCurrentModule();
    });
  });

  container.querySelectorAll("[data-product-id]").forEach((button) => {
    button.addEventListener("click", () => selectProduct(button.dataset.productId));
  });

  container.querySelectorAll("[data-toggle-quote-item]").forEach((header) => {
    header.addEventListener("click", (event) => {
      if (event.target.closest("[data-move-quote-item]") || event.target.closest("[data-remove-quote-item]") || event.target.closest("[data-add-accessory]") || event.target.closest("[data-accessory-name]")) return;
      toggleQuoteItem(Number(header.dataset.toggleQuoteItem));
    });
  });

  container.querySelectorAll("[data-remove-quote-item]").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      removeQuoteItem(Number(button.dataset.removeQuoteItem));
    });
  });

  container.querySelectorAll("[data-move-quote-item]").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      const [index, direction] = button.dataset.moveQuoteItem.split(":");
      moveQuoteItem(Number(index), direction);
    });
  });

  container.querySelectorAll("[data-add-accessory]").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      addAccessory(Number(button.dataset.addAccessory));
    });
  });

  container.querySelectorAll("[data-select-item-image]").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      openQuoteItemImagePicker(Number(button.dataset.selectItemImage));
    });
  });

  container.querySelectorAll("[data-remove-item-image]").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      const item = state.activeProject.data.quoteItems?.[Number(button.dataset.removeItemImage)];
      if (!item || item.type === "accessory") return;
      recordUndoSnapshot();
      item.imageId = "";
      markDirty();
      rerenderCurrentModule();
    });
  });

  container.querySelectorAll("[data-add-param]").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      const index = Number(button.dataset.addParam);
      const item = state.activeProject.data.quoteItems?.[index];
      if (!item || item.type === "accessory") return;
      recordUndoSnapshot();
      if (!item.parameters || typeof item.parameters !== "object" || Array.isArray(item.parameters)) return;
      const customKey = `__custom_${Date.now()}`;
      item.parameters[customKey] = "";
      markDirty();
      rerenderCurrentModule();
      requestAnimationFrame(() => {
        const input = document.querySelector(`[data-item-param="${index}:${customKey}"]`);
        if (input) input.focus();
      });
    });
  });

  container.querySelectorAll("[data-accessory-name]").forEach((input) => {
    input.addEventListener("input", () => {
      const item = state.activeProject.data.quoteItems?.[Number(input.dataset.accessoryName)];
      if (!item) return;
      item.accessoryName = input.value;
      item.product.enName = input.value;
      markDirty();
    });
    input.addEventListener("click", (event) => event.stopPropagation());
    input.addEventListener("focus", recordUndoSnapshot);
  });

  container.querySelectorAll("[data-add-accessory-param]").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      const index = Number(button.dataset.addAccessoryParam);
      const item = state.activeProject.data.quoteItems?.[index];
      if (!item || item.type !== "accessory") return;
      recordUndoSnapshot();
      if (!Array.isArray(item.parameters)) item.parameters = [];
      item.parameters.push({ name: "", quantity: "", unitPrice: "", lineTotal: "", unit: "" });
      markDirty();
      rerenderCurrentModule();
    });
  });

  container.querySelectorAll("[data-remove-accessory-param]").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      const token = button.dataset.removeAccessoryParam;
      const sep = token.indexOf(":");
      const itemIndex = Number(token.slice(0, sep));
      const paramIndex = Number(token.slice(sep + 1));
      const item = state.activeProject.data.quoteItems?.[itemIndex];
      if (!item || !Array.isArray(item.parameters)) return;
      recordUndoSnapshot();
      item.parameters.splice(paramIndex, 1);
      recalcAccessoryTotal(item);
      updateQuoteTotals(state.activeProject.data);
      markDirty();
      rerenderCurrentModule();
    });
  });

  container.querySelectorAll("[data-accessory-param-unit]").forEach((input) => {
    input.addEventListener("input", () => {
      const token = input.dataset.accessoryParamUnit;
      const sep = token.indexOf(":");
      const itemIndex = Number(token.slice(0, sep));
      const paramIndex = Number(token.slice(sep + 1));
      const item = state.activeProject.data.quoteItems?.[itemIndex];
      if (!item || !Array.isArray(item.parameters)) return;
      const param = item.parameters[paramIndex];
      if (!param) return;
      const newUnit = input.value.trim();
      param.unit = newUnit;
      const qtyNum = parseFloat(extractNumeric(param.quantity)) || 0;
      const group = input.closest(".accessory-param-group");
      if (newUnit) {
        const qtyUnitForm = qtyNum === 1 ? newUnit : `${newUnit}s`;
        if (param.quantity) param.quantity = `${extractNumeric(param.quantity)} ${qtyUnitForm}`;
        if (param.unitPrice) param.unitPrice = `$${extractNumeric(param.unitPrice)} /${newUnit}`;
        if (group) {
          const qtySfx = group.querySelector(".qty-suffix");
          const priceSfx = group.querySelector(".price-suffix");
          if (qtySfx) qtySfx.textContent = qtyUnitForm;
          if (priceSfx) priceSfx.textContent = newUnit;
        }
      } else {
        if (param.quantity) param.quantity = extractNumeric(param.quantity);
        if (param.unitPrice) param.unitPrice = `$${extractNumeric(param.unitPrice)}`;
        if (group) {
          const qtySfx = group.querySelector(".qty-suffix");
          const priceSfx = group.querySelector(".price-suffix");
          if (qtySfx) qtySfx.textContent = "";
          if (priceSfx) priceSfx.textContent = "";
        }
      }
      markDirty();
    });
    input.addEventListener("focus", recordUndoSnapshot);
    input.addEventListener("focus", () => {
      const droplist = input.nextElementSibling;
      if (droplist) droplist.classList.add("open");
    });
    input.addEventListener("blur", () => {
      const droplist = input.nextElementSibling;
      if (droplist) setTimeout(() => droplist.classList.remove("open"), 150);
    });
  });

  container.querySelectorAll("[data-unit-pick]").forEach((btn) => {
    btn.addEventListener("mousedown", (e) => {
      e.preventDefault();
      const wrap = btn.closest(".param-unit-wrap");
      const input = wrap?.querySelector("[data-accessory-param-unit]");
      if (!input) return;
      input.value = btn.dataset.unitPick;
      input.dispatchEvent(new Event("input"));
      const droplist = wrap.querySelector(".param-unit-droplist");
      if (droplist) droplist.classList.remove("open");
    });
  });

  container.querySelectorAll("[data-accessory-param-name]").forEach((input) => {
    input.addEventListener("input", () => {
      const token = input.dataset.accessoryParamName;
      const sep = token.indexOf(":");
      const itemIndex = Number(token.slice(0, sep));
      const paramIndex = Number(token.slice(sep + 1));
      const item = state.activeProject.data.quoteItems?.[itemIndex];
      if (!item || !Array.isArray(item.parameters)) return;
      item.parameters[paramIndex].name = input.value;
      markDirty();
    });
    input.addEventListener("focus", recordUndoSnapshot);
  });

  container.querySelectorAll("[data-accessory-param-pricing]").forEach((input) => {
    input.addEventListener("input", () => {
      input.value = input.value.replace(/[^\d.,]/g, "").replace(/(\..*)\./g, "$1");
    });
    input.addEventListener("input", () => {
      const parts = input.dataset.accessoryParamPricing.split(":");
      const itemIndex = Number(parts[0]);
      const paramIndex = Number(parts[1]);
      const field = parts[2];
      const item = state.activeProject.data.quoteItems?.[itemIndex];
      if (!item || !Array.isArray(item.parameters)) return;
      const param = item.parameters[paramIndex];
      if (!param) return;

      if (field === "quantity") {
        const unit = param.unit || "";
        const qtyNum = parseFloat(input.value.trim()) || 0;
        const unitForm = unit ? (qtyNum === 1 ? unit : `${unit}s`) : "";
        param.quantity = input.value.trim() ? (unitForm ? `${input.value.trim()} ${unitForm}` : input.value.trim()) : "";
        /* 数量变化时只更新数量后缀（复数联动），单价后缀不变 */
        const group = input.closest(".accessory-param-group");
        if (group) {
          const qtySfx = group.querySelector(".qty-suffix");
          if (qtySfx) qtySfx.textContent = unitForm || "";
        }
      } else if (field === "unitPrice") {
        const unit = param.unit || "";
        param.unitPrice = input.value.trim() ? (unit ? `$${input.value.trim()}/${unit}` : `$${input.value.trim()}`) : "";
      }

      if (field === "quantity" || field === "unitPrice") {
        const total = calculateTotalAmount(param.quantity, param.unitPrice);
        param.lineTotal = total || "";
        const totalInput = container.querySelector(
          `[data-accessory-param-pricing="${itemIndex}:${paramIndex}:lineTotal"]`
        );
        if (totalInput) totalInput.value = extractNumeric(total);
      }

      recalcAccessoryTotal(item);
      updateQuoteTotals(state.activeProject.data);
      syncPricingInputs(container);
      markDirty();
    });
    input.addEventListener("focus", recordUndoSnapshot);
  });

  container.querySelectorAll("[data-toggle-image]").forEach((el) => {
    el.addEventListener("click", () => toggleProjectImage(Number(el.dataset.toggleImage)));
    el.addEventListener("dragstart", () => {
      state.draggingLibraryImageId = Number(el.dataset.toggleImage);
    });
  });

  container.querySelectorAll("[data-delete-library-image]").forEach((button) => {
    button.addEventListener("click", async (event) => {
      event.stopPropagation();
      const imageId = Number(button.dataset.deleteLibraryImage);
      try {
        await api(`/api/images/${imageId}`, { method: "DELETE" });
        await loadWorkspace();
        /* 清理引用 */
        const data = state.activeProject?.data;
        if (data) {
          recordUndoSnapshot();
          data.selectedImageIds = (data.selectedImageIds || []).filter(id => Number(id) !== imageId);
          (data.quoteItems || []).forEach(item => {
            if (Number(item.imageId) === imageId) item.imageId = "";
          });
          normalizeGalleryLayout(data, state.images);
          markDirty();
        }
        rerenderCurrentModule();
      } catch (err) {
        console.error("删除图片失败:", err);
        showToast("删除失败: " + err.message, { tone: "error" });
      }
    });
  });

  const dropTarget = container.querySelector("[data-drop-target]");
  if (dropTarget) {
    dropTarget.addEventListener("dragover", (e) => {
      e.preventDefault();
      // 仅从图库拖入时显示高亮，内部排序不触发（避免抖动）
      if (state.draggingLibraryImageId != null) {
        dropTarget.classList.add("drop-hover");
      }
    });
    dropTarget.addEventListener("dragleave", () => {
      dropTarget.classList.remove("drop-hover");
    });
    dropTarget.addEventListener("drop", () => {
      dropTarget.classList.remove("drop-hover");
      const id = state.draggingLibraryImageId;
      state.draggingLibraryImageId = null;
      if (id == null) return;
      const ids = state.activeProject.data.selectedImageIds || [];
      if (!ids.map(Number).includes(Number(id))) toggleProjectImage(id);
    });
  }

  // 图片上传：点击 / 拖拽
  container.querySelector("#image-module-upload")?.addEventListener("change", async (event) => {
    const file = event.currentTarget.files?.[0];
    if (file && file.type.startsWith("image/")) await _uploadImageFromFile(file);
  });
  const uploadDrop = container.querySelector("[data-upload-drop]");
  if (uploadDrop) {
    uploadDrop.addEventListener("dragover", (e) => { e.preventDefault(); uploadDrop.classList.add("drop-hover"); });
    uploadDrop.addEventListener("dragleave", () => uploadDrop.classList.remove("drop-hover"));
    uploadDrop.addEventListener("drop", async (e) => {
      e.preventDefault();
      uploadDrop.classList.remove("drop-hover");
      const file = e.dataTransfer?.files?.[0];
      if (file && file.type.startsWith("image/")) await _uploadImageFromFile(file);
    });
  }

  bindSelectedImageButtons(container);

  bindSelectedImageRows(container);

  container.querySelectorAll("[data-import-module]").forEach((button) => {
    button.addEventListener("click", () => importModuleText(button.dataset.importModule));
  });
}

/** 绑定已选图片行的拖拽事件（供局部刷新复用） */
function bindSelectedImageRows(container) {
  container.querySelectorAll("[data-selected-image]").forEach((row) => {
    row.addEventListener("dragstart", () => {
      state.draggingImageId = Number(row.dataset.selectedImage);
      row.classList.add("dragging");
    });
    row.addEventListener("dragend", () => {
      row.classList.remove("dragging");
    });
    row.addEventListener("dragover", (event) => event.preventDefault());
    row.addEventListener("drop", () => reorderImageByDrop(Number(row.dataset.selectedImage)));
  });
}

/* ---- 包装条款自动同步 ---- */

const CRANE_PACKAGE = "All crane bodies are packed in waterproof cloth.\nAccessories and electrical components are packed in strong plywood crate.";
const HOIST_PACKAGE = "Packed in strong plywood crate.";
const HOIST_IDS = new Set(["product_1", "product_2", "product_3", "product_4"]);

function syncPackageTerm(data) {
  const items = data.quoteItems || [];
  const first = items.find((i) => i.type === "product");
  if (!first) return;
  const text = HOIST_IDS.has(first.product?.id) ? HOIST_PACKAGE : CRANE_PACKAGE;
  data.terms = data.terms || {};
  data.terms.package = text;
  if (Array.isArray(data.terms.items)) {
    const pkg = data.terms.items.find((t) => (t.title || "").toUpperCase() === "PACKAGE");
    if (pkg) pkg.content = text;
  }
}

/* ---- 产品 / 图片操作 ---- */

function selectProduct(productId) {
  const product = state.products.find((item) => item.id === productId);
  if (!product) return;
  recordUndoSnapshot();
  normalizeQuoteItems(state.activeProject.data, state.products);

  const items = state.activeProject.data.quoteItems || [];
  const existing = items.filter((item) => item.product?.id === productId);

  if (existing.length) {
    // 产品已存在：移除该产品及其配件
    const removedIds = new Set(existing.map((item) => item.id));
    state.activeProject.data.quoteItems = items.filter((item) => {
      if (item.product?.id === productId) return false;
      if (item.parentId && removedIds.has(item.parentId)) return false;
      if (item.groupId && existing.some((e) => e.groupId === item.groupId)) return false;
      return true;
    });
    if (!state.activeProject.data.quoteItems.length) {
      state.activeProject.data.product = {};
      state.activeProject.data.productParameters = {};
    }
  } else {
    // 产品不存在：添加新产品
    const additions = product.id === "product_6"
      ? createCraneSupportQuoteItems(state.products)
      : [createQuoteItemFromProduct(product)];
    state.activeProject.data.quoteItems.push(...additions);
  }

  updateQuoteTotals(state.activeProject.data);
  syncPackageTerm(state.activeProject.data);

  if (!existing.length) {
    // 仅添加时：折叠其他卡片，展开新产品及其配件
    const allItems = state.activeProject.data.quoteItems;
    const targetIds = new Set();
    const targetItem = allItems.find((item) => item.product?.id === productId);
    if (targetItem) {
      targetIds.add(targetItem.id);
      allItems.filter((item) => item.parentId === targetItem.id).forEach((a) => targetIds.add(a.id));
    }
    allItems.forEach((item) => { item.collapsed = !targetIds.has(item.id); });
  }

  markDirty();
  rerenderCurrentModule();

  // 滚动到对应产品的序号卡片（补偿 sticky 产品条高度）
  const allItems = state.activeProject.data.quoteItems;
  const targetIndex = allItems.findIndex((item) => item.product?.id === productId);
  if (targetIndex >= 0) {
    requestAnimationFrame(() => {
      const card = document.querySelector(`[data-quote-item="${targetIndex}"]`);
      const sticky = document.querySelector(".product-strip-sticky");
      if (card && sticky) {
        const editor = document.querySelector(".module-editor");
        if (editor) {
          const offset = card.offsetTop - editor.offsetTop - sticky.offsetHeight - 8;
          editor.scrollTo({ top: offset, behavior: "smooth" });
        }
      }
    });
  }
}

function toggleQuoteItem(index) {
  const item = state.activeProject.data.quoteItems?.[index];
  if (!item) return;
  recordUndoSnapshot();
  item.collapsed = !item.collapsed;
  markDirty();
  rerenderCurrentModule();
}

function removeQuoteItem(index) {
  const items = state.activeProject.data.quoteItems || [];
  if (!items[index]) return;
  recordUndoSnapshot();
  const item = items[index];
  if (item.type === "accessory") {
    items.splice(index, 1);
  } else {
    state.activeProject.data.quoteItems = items.filter((i) => i !== item && i.parentId !== item.id && (!item.groupId || i.groupId !== item.groupId || i === item));
  }
  if (!state.activeProject.data.quoteItems.length) {
    state.activeProject.data.product = {};
    state.activeProject.data.productParameters = {};
  }
  updateQuoteTotals(state.activeProject.data);
  syncPackageTerm(state.activeProject.data);
  markDirty();
  rerenderCurrentModule();
}

function moveQuoteItem(index, direction) {
  const items = state.activeProject.data.quoteItems || [];
  if (!items[index] || items[index].type === "accessory") return;

  const groups = buildItemGroups(items);
  let flatIdx = 0;
  let groupIdx = -1;
  for (let g = 0; g < groups.length; g++) {
    if (flatIdx <= index && index < flatIdx + groups[g].length) {
      groupIdx = g;
      break;
    }
    flatIdx += groups[g].length;
  }
  if (groupIdx < 0) return;

  const targetIdx = direction === "up" ? groupIdx - 1 : groupIdx + 1;
  if (targetIdx < 0 || targetIdx >= groups.length) return;

  recordUndoSnapshot();
  [groups[groupIdx], groups[targetIdx]] = [groups[targetIdx], groups[groupIdx]];
  state.activeProject.data.quoteItems = groups.flat();
  syncPackageTerm(state.activeProject.data);
  markDirty();
  rerenderCurrentModule();
}

function rerenderCurrentModule() {
  renderModuleEditor();
  if (state.previewFullscreen && _refreshFullscreenCard) _refreshFullscreenCard();
}

export { addAccessory, selectProduct, removeQuoteItem, openQuoteItemImagePicker };

/** 仅刷新已选图片列表（拖拽排序用，避免整模块重渲染抖动） */
export function rerenderSelectedImages() {
  const container = document.querySelector(".selected-images");
  if (!container) return;
  const data = state.activeProject.data;
  const selectedIds = data.selectedImageIds || [];
  const selectedImages = selectedIds.map((id) => state.images.find((img) => Number(img.id) === Number(id))).filter(Boolean);
  container.innerHTML = selectedImages.length ? selectedImages.map(selectedImageMarkup).join("") : emptyMarkup("未选择图片");
  bindSelectedImageRows(container);
  bindSelectedImageButtons(container);
  // 同步刷新图库中的选中状态
  document.querySelectorAll(".choose-image").forEach((btn) => {
    const id = Number(btn.dataset.toggleImage);
    btn.classList.toggle("selected", selectedIds.map(Number).includes(id));
  });
}

/** 绑定已选图片行的按钮事件（供局部刷新复用） */
function bindSelectedImageButtons(container) {
  container.querySelectorAll("[data-remove-image]").forEach((button) => {
    button.addEventListener("click", () => removeProjectImage(Number(button.dataset.removeImage)));
  });
  container.querySelectorAll("[data-move-image]").forEach((button) => {
    button.addEventListener("click", () => {
      const [id, direction] = button.dataset.moveImage.split(":");
      moveProjectImage(Number(id), direction);
    });
  });
}

function buildItemGroups(items) {
  const groups = [];
  let i = 0;
  while (i < items.length) {
    const product = items[i];
    const group = [product];
    i++;
    while (i < items.length && items[i].type === "accessory" && (items[i].parentId === product.id || items[i].groupId === product.groupId)) {
      group.push(items[i]);
      i++;
    }
    groups.push(group);
  }
  return groups;
}

function addAccessory(parentIndex) {
  const items = state.activeProject.data.quoteItems || [];
  const parent = items[parentIndex];
  if (!parent || parent.type === "accessory") return -1;
  recordUndoSnapshot();

  const accessory = createQuoteItemFromProduct({
    id: "custom_accessory",
    cnName: "配件",
    enName: "Accessory",
    parameters: {}
  }, { type: "accessory", parentId: parent.id, accessoryName: "Accessory" });

  // 自动预置一个可编辑参数行，省去用户再点 "+ Row"
  if (Array.isArray(accessory.parameters)) {
    accessory.parameters.push({ name: " ", quantity: "", unitPrice: "", lineTotal: "", unit: "", _new: true });
  }

  let insertAt = parentIndex + 1;
  while (insertAt < items.length && items[insertAt].type === "accessory" && (items[insertAt].parentId === parent.id || items[insertAt].groupId === parent.groupId)) {
    insertAt++;
  }

  items.splice(insertAt, 0, accessory);
  updateQuoteTotals(state.activeProject.data);
  markDirty();
  rerenderCurrentModule();
  return insertAt;
}

function updateItemParameter(token, value) {
  const { index, key } = parseIndexedKey(token);
  const item = state.activeProject.data.quoteItems?.[index];
  if (!item) return;
  item.parameters[key] = value;
  markDirty();
}

function renameItemParameter(input) {
  const { index, key: oldKey } = parseIndexedKey(input.dataset.itemParamLine);
  const item = state.activeProject.data.quoteItems?.[index];
  const newKey = input.value.trim();
  if (!item) { markDirty(); return; }

  /* 空占位 key → 正式 key：重命名后刷新编辑器，让 UI 从"输入框"变成正式参数行 */
  if (!oldKey && newKey) {
    const entries = Object.entries(item.parameters || {}).map(([k, v]) => k === oldKey ? [newKey, v] : [k, v]);
    item.parameters = Object.fromEntries(entries);
    markDirty();
    rerenderCurrentModule();
    /* 刷新后自动聚焦到新参数行并全选文本 */
    requestAnimationFrame(() => {
      const newInput = document.querySelector(`[data-item-param-line="${index}:${CSS.escape(newKey)}"]`);
      if (newInput) { newInput.focus(); newInput.select(); }
    });
    return;
  }

  if (!newKey || newKey === oldKey) { markDirty(); return; }
  const entries = Object.entries(item.parameters || {}).map(([k, v]) => k === oldKey ? [newKey, v] : [k, v]);
  item.parameters = Object.fromEntries(entries);
  input.dataset.itemParamLine = `${index}:${newKey}`;
  markDirty();
}

function parseIndexedKey(token) {
  const separator = String(token || "").indexOf(":");
  return {
    index: Number(String(token || "").slice(0, separator)),
    key: String(token || "").slice(separator + 1)
  };
}

export function recalcFreightFromTotal(data) {
  const pricing = data.pricing || {};
  const enabled = new Set(pricing.enabledItems || []);
  if (!enabled.has("freight")) return;
  const subtotalNum = parseAmountNumber(pricing.subtotal);
  const totalNum = parseAmountNumber(pricing.totalAmount);
  if (Number.isFinite(totalNum)) {
    const freightNum = Number.isFinite(subtotalNum) ? totalNum - subtotalNum : 0;
    const prefix = String(pricing.totalAmount || "").trim().match(/^[^\d.-]+/)?.[0] || "$";
    pricing.freight = freightNum !== 0 ? `${prefix}${freightNum.toLocaleString("en-US")}` : "";
    // TOTAL 保留用户输入的原始格式，不重新格式化
  }
}

function syncPricingInputs(container) {
  const pricing = state.activeProject.data.pricing || {};
  ["subtotal", "freight", "totalAmount"].forEach((field) => {
    const input = container.querySelector(`[data-path="pricing.${field}"]`);
    if (input) input.value = extractNumeric(pricing[field] || "");
  });
}

function syncLegacyTerms() {
  const terms = normalizeTerms(state.activeProject.data.terms);
  const byTitle = new Map(terms.items.map((item) => [item.title.trim().toUpperCase(), item.content]));
  terms.shipment = byTitle.get("SHIPMENT TERM") || terms.items[0]?.content || "";
  terms.payment = byTitle.get("PAYMENT TERM") || terms.items[1]?.content || "";
  terms.leadTime = byTitle.get("LEAD TIME") || terms.items[2]?.content || "";
  terms.package = byTitle.get("PACKAGE") || terms.items[3]?.content || "";
}

function toggleProjectImage(id) {
  const ids = state.activeProject.data.selectedImageIds || [];
  recordUndoSnapshot();
  if (ids.map(Number).includes(Number(id))) {
    state.activeProject.data.selectedImageIds = ids.filter((imageId) => Number(imageId) !== Number(id));
  } else {
    state.activeProject.data.selectedImageIds = [...ids, id];
  }
  normalizeGalleryLayout(state.activeProject.data, state.images);
  markDirty();
  rerenderSelectedImages();
}

function removeProjectImage(id) {
  recordUndoSnapshot();
  state.activeProject.data.selectedImageIds = (state.activeProject.data.selectedImageIds || []).filter((imageId) => Number(imageId) !== Number(id));
  normalizeGalleryLayout(state.activeProject.data, state.images);
  markDirty();
  rerenderSelectedImages();
}

function moveProjectImage(id, direction) {
  const ids = [...(state.activeProject.data.selectedImageIds || [])];
  const index = ids.findIndex((imageId) => Number(imageId) === Number(id));
  const target = direction === "up" ? index - 1 : index + 1;
  if (index < 0 || target < 0 || target >= ids.length) return;
  recordUndoSnapshot();
  [ids[index], ids[target]] = [ids[target], ids[index]];
  state.activeProject.data.selectedImageIds = ids;
  normalizeGalleryLayout(state.activeProject.data, state.images);
  markDirty();
  rerenderSelectedImages();
}

function reorderImageByDrop(targetId) {
  const sourceId = state.draggingImageId;
  if (!sourceId || sourceId === targetId) return;
  const ids = [...(state.activeProject.data.selectedImageIds || [])];
  const sourceIndex = ids.findIndex((id) => Number(id) === Number(sourceId));
  const targetIndex = ids.findIndex((id) => Number(id) === Number(targetId));
  if (sourceIndex < 0 || targetIndex < 0) return;
  recordUndoSnapshot();
  const [item] = ids.splice(sourceIndex, 1);
  ids.splice(targetIndex, 0, item);
  state.activeProject.data.selectedImageIds = ids;
  state.draggingImageId = null;
  normalizeGalleryLayout(state.activeProject.data, state.images);
  markDirty();
  rerenderSelectedImages();
}

function openQuoteItemImagePicker(index) {
  const item = state.activeProject.data.quoteItems?.[index];
  if (!item || item.type === "accessory") return;

  showContentModal({
    title: "选择产品图片",
    className: "product-image-picker-modal",
    body: `
      <div class="product-image-picker-grid">
        ${state.images.length ? state.images.map((image) => productImagePickMarkup(image, item.imageId)).join("") : `<div class="empty-state">还没有图片</div>`}
      </div>
      <div class="product-image-picker-upload">
        <label class="ghost-button">
          ${iconSvg("upload")} 从本地上传
          <input type="file" accept="image/*" id="product-image-upload" hidden>
        </label>
      </div>
    `,
    onMount(root, close) {
      root.querySelectorAll("[data-pick-item-image]").forEach((button) => {
        button.addEventListener("click", () => {
          recordUndoSnapshot();
          item.imageId = Number(button.dataset.pickItemImage);
          markDirty();
          close("picked");
          rerenderCurrentModule();
        });
      });
      root.querySelectorAll("[data-delete-library-image]").forEach((button) => {
        button.addEventListener("click", async (event) => {
          event.stopPropagation();
          const imageId = Number(button.dataset.deleteLibraryImage);
          try {
            await api(`/api/images/${imageId}`, { method: "DELETE" });
            await loadWorkspace();
            /* 如果删除的正是当前产品使用的图片，清除引用 */
            if (Number(item.imageId) === imageId) {
              recordUndoSnapshot();
              item.imageId = "";
              markDirty();
            }
            /* 移除该卡片并刷新 */
            const card = button.closest(".product-image-pick");
            if (card) card.remove();
            const grid = root.querySelector(".product-image-picker-grid");
            if (grid && !grid.children.length) {
              grid.innerHTML = `<div class="empty-state">还没有图片</div>`;
            }
            rerenderCurrentModule();
          } catch (err) {
            console.error("删除图片失败:", err);
            showToast("删除失败: " + err.message, { tone: "error" });
          }
        });
      });
      root.querySelector("#product-image-upload")?.addEventListener("change", async (event) => {
        const file = event.currentTarget.files?.[0];
        if (!file || !file.type.startsWith("image/")) return;
        try {
          const dataUrl = await fileToDataUrl(file);
          const { image } = await api("/api/images", { method: "POST", body: { filename: file.name, dataUrl } });
          await loadWorkspace();
          recordUndoSnapshot();
          item.imageId = Number(image.id);
          close("uploaded");
          markDirty();
          rerenderCurrentModule();
        } catch (err) {
          console.error("产品图片上传失败:", err);
          showToast("上传失败: " + err.message, { tone: "error" });
        }
      });
    }
  });
}

function productImagePickMarkup(image, currentId) {
  return `
    <div class="product-image-pick ${Number(image.id) === Number(currentId) ? "selected" : ""}">
      <button class="product-image-pick-select" type="button" data-pick-item-image="${image.id}" title="选择此图片">
        <img src="${image.url}" alt="${escapeHtml(image.originalName)}">
        <span>${escapeHtml(image.originalName)}</span>
      </button>
      <button class="product-image-pick-delete image-card-delete" type="button" data-delete-library-image="${image.id}" title="从图库删除">×</button>
    </div>
  `;
}

async function importModuleText(moduleId) {
  const text = await showBulkImportModal(moduleId);
  if (!text) return;

  const updates = parseImportText(moduleId, text);
  if (!updates.length) {
    await showAppModal({
      title: "未识别到有效信息",
      message: "请检查粘贴内容是否包含字段名称，例如 Name、WhatsApp、Email、公司、单价、交期等。",
      tone: "warning",
      actions: [{ label: "我知道了", value: "ok", variant: "primary" }]
    });
    return;
  }

  recordUndoSnapshot();
  updates.forEach(({ path, value }) => setByPath(state.activeProject.data, path, value));
  markDirty();
  rerenderCurrentModule();
}

/* ---- 图库管理弹窗（从 editor.js 迁移） ---- */

function openGalleryManagerModal() {
  showContentModal({
    title: state.user?.role === "admin" ? "图片库管理（全部）" : "图片库管理",
    className: "gallery-library-modal",
    body: `
      <div class="gallery-library">
        <label class="editor-upload-drop gallery-modal-upload">
          <input id="gallery-modal-upload" type="file" accept="image/*">
          <span class="upload-cloud">⇧</span>
          <b>拖拽图片到此处上传</b>
          <em>或点击上传</em>
        </label>
        <div class="gallery-modal-grid">
          ${state.images.length ? state.images.map(galleryModalImageMarkup).join("") : `<div class="empty-state">还没有图片</div>`}
        </div>
      </div>
    `,
    onMount(root, close) {
      root.querySelector("#gallery-modal-upload")?.addEventListener("change", async (event) => {
        const file = event.currentTarget.files?.[0];
        if (file && file.type.startsWith("image/")) {
          await _uploadImageFromFile(file);
          close("refresh");
          openGalleryManagerModal();
        }
      });
      root.querySelectorAll("[data-gallery-preview]").forEach((button) => {
        button.addEventListener("click", () => {
          const image = state.images.find((item) => Number(item.id) === Number(button.dataset.galleryPreview));
          if (image) openImagePreviewModal(image);
        });
      });
      root.querySelectorAll("[data-gallery-delete]").forEach((button) => {
        button.addEventListener("click", async (event) => {
          event.stopPropagation();
          await _deleteImage(button.dataset.galleryDelete);
          close("refresh");
          openGalleryManagerModal();
        });
      });
    }
  });
}

function galleryModalImageMarkup(image) {
  const locked = image.filename === "image4.png";
  return `
    <article class="gallery-modal-card">
      <button class="gallery-modal-thumb" type="button" data-gallery-preview="${image.id}">
        <img src="${image.url}" alt="${escapeHtml(image.originalName)}">
      </button>
      <div class="gallery-modal-meta">
        <span>${escapeHtml(image.originalName)}</span>
        <button class="icon-button danger" type="button" ${locked ? "disabled" : ""} title="删除" data-gallery-delete="${image.id}">×</button>
      </div>
    </article>
  `;
}

function openImagePreviewModal(image) {
  showContentModal({
    title: image.originalName || "图片预览",
    className: "image-preview-modal",
    body: `
      <figure class="image-preview-frame">
        <img src="${image.url}" alt="${escapeHtml(image.originalName)}">
        <figcaption>${escapeHtml(image.originalName)}</figcaption>
      </figure>
    `
  });
}
