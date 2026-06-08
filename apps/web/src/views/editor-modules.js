/**
 * 编辑器模块：8 个模块的表单 HTML + 字段绑定 + 产品/图片操作
 */
import { state, modules } from "../state.js";
import {
  escapeHtml, splitParameterValue, setByPath, productPreviewUrl, productSeriesLabel,
  normalizeTerms, calculateTotalAmount, isLineOnlyParameter, normalizeGalleryLayout,
  normalizeQuoteItems, createQuoteItemFromProduct, createCraneSupportQuoteItems,
  updateQuoteTotals, recalcAccessoryTotal, sumAmountStrings, parseAmountNumber, extractNumeric
} from "../utils.js";
import { parameterIconSvg } from "../icons.js";
import { recordUndoSnapshot } from "../history.js";
import { markDirty } from "./preview.js";
import { showAppModal } from "../ui.js";
import { showBulkImportModal, parseImportText } from "../bulk-import.js";
import { emptyMarkup } from "./projects.js";

let _renderEditorPage;

export function registerEditorModulesCallbacks({ renderEditorPage }) {
  _renderEditorPage = renderEditorPage;
}

/* ---- 模块内容分发 ---- */

export function renderModuleEditor() {
  const container = document.querySelector("#module-editor-body");
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
      ${fieldMarkup("报价单编号", "quoteMeta.quoteNo", data.quoteMeta.quoteNo)}
      ${fieldMarkup("报价日期", "quoteMeta.date", data.quoteMeta.date)}
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

  return `
    <article class="quote-item-card ${collapsed}" data-quote-item="${index}">
      <div class="quote-item-header" data-toggle-quote-item="${index}">
        <span class="toggle-icon">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 6 15 12 9 18"/></svg>
        </span>
        <span class="quote-item-no">${index + 1}</span>
        <strong>${escapeHtml(item.product.enName || "Untitled Item")}</strong>
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
        <div class="parameter-list">
          ${Object.entries(item.parameters || {}).map(([key, value]) => parameterFieldMarkup(key, value, index)).join("")}
        </div>
        <button class="add-accessory-button" type="button" data-add-accessory="${index}">+ 添加配件</button>
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

function parameterFieldMarkup(key, value, itemIndex) {
  if (Array.isArray(value)) {
    return `
      <label class="field-row">
        <span class="field-label"><i>${parameterIconSvg(key)}</i>${escapeHtml(key)}</span>
        <textarea data-item-param-array="${itemIndex}:${escapeHtml(key)}">${escapeHtml(value.join("\n"))}</textarea>
      </label>
    `;
  }

  if (isLineOnlyParameter(value)) {
    return `
      <label class="field-row parameter-line-row">
        <span class="field-label"><i>${parameterIconSvg(key)}</i>整行文本</span>
        <input data-item-param-line="${itemIndex}:${escapeHtml(key)}" value="${escapeHtml(key)}">
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
      </label>
    `;
  }

  return `
      <label class="field-row">
        <span class="field-label"><i>${parameterIconSvg(key)}</i>${escapeHtml(key)}</span>
      <input data-item-param="${itemIndex}:${escapeHtml(key)}" value="${escapeHtml(value)}">
      </label>
  `;
}

function imagesEditorMarkup(data) {
  const selectedIds = data.selectedImageIds || [];
  const selectedImages = selectedIds.map((id) => state.images.find((image) => Number(image.id) === Number(id))).filter(Boolean);

  return `
    <div class="image-editor">
      <section class="inserted-image-panel">
        <h3>已插入报价单（上下拖动调整顺序）</h3>
        <div class="selected-images" data-drop-target>
          ${selectedImages.length ? selectedImages.map(selectedImageMarkup).join("") : emptyMarkup("未选择图片")}
        </div>
      </section>
      <section class="image-library-panel">
        <h3>${state.user?.role === "admin" ? "全部图库" : "我的图库"}</h3>
        <div class="choose-grid">
          ${state.images.map((image) => chooseImageMarkup(image, selectedIds)).join("")}
        </div>
      </section>
    </div>
  `;
}

function chooseImageMarkup(image, selectedIds) {
  return `
    <button class="choose-image ${selectedIds.map(Number).includes(Number(image.id)) ? "selected" : ""}" draggable="true" data-toggle-image="${image.id}">
      <img src="${image.url}" alt="${escapeHtml(image.originalName)}">
      <span>${escapeHtml(image.originalName)}</span>
    </button>
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
      <label class="field">
        <span>标题</span>
        <input data-term-title="${index}" value="${escapeHtml(item.title)}">
      </label>
      <label class="field">
        <span>内容</span>
        <textarea data-term-content="${index}">${escapeHtml(item.content)}</textarea>
      </label>
      <button class="icon-button danger" type="button" title="删除标题" data-remove-term="${index}">×</button>
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

function fieldMarkup(label, path, value) {
  return `
    <label class="field">
      <span>${escapeHtml(label)}</span>
      <input data-path="${path}" value="${escapeHtml(value)}" autocomplete="off">
    </label>
  `;
}

/* ---- 字段事件绑定 ---- */

function bindEditorFields(container) {
  container.querySelectorAll("input, textarea").forEach((input) => {
    input.addEventListener("focus", recordUndoSnapshot);
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

  container.querySelectorAll("[data-pricing-freight-mode]").forEach((input) => {
    input.addEventListener("change", () => {
      const pricing = state.activeProject.data.pricing;
      pricing.enabledItems = input.checked ? ["subtotal", "freight", "total"] : ["total"];
      updateQuoteTotals(state.activeProject.data);
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
      if (event.target.closest("[data-move-quote-item]") || event.target.closest("[data-remove-quote-item]") || event.target.closest("[data-accessory-name]")) return;
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

  container.querySelectorAll("[data-toggle-image]").forEach((button) => {
    button.addEventListener("click", () => toggleProjectImage(Number(button.dataset.toggleImage)));
    button.addEventListener("dragstart", () => {
      state.draggingLibraryImageId = Number(button.dataset.toggleImage);
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
    const additions = product.id === "product_6"
      ? createCraneSupportQuoteItems(state.products)
      : [createQuoteItemFromProduct(product)];
    state.activeProject.data.quoteItems.push(...additions);
  }

  updateQuoteTotals(state.activeProject.data);
  syncPackageTerm(state.activeProject.data);
  markDirty();
  rerenderCurrentModule();
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
}

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
  if (!parent || parent.type === "accessory") return;
  recordUndoSnapshot();

  const accessory = createQuoteItemFromProduct({
    id: "custom_accessory",
    cnName: "配件",
    enName: "Accessory",
    parameters: {}
  }, { type: "accessory", parentId: parent.id, accessoryName: "Accessory" });

  let insertAt = parentIndex + 1;
  while (insertAt < items.length && items[insertAt].type === "accessory" && (items[insertAt].parentId === parent.id || items[insertAt].groupId === parent.groupId)) {
    insertAt++;
  }

  items.splice(insertAt, 0, accessory);
  updateQuoteTotals(state.activeProject.data);
  markDirty();
  rerenderCurrentModule();
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
  if (!item || !newKey || newKey === oldKey) {
    markDirty();
    return;
  }
  const entries = Object.entries(item.parameters || {}).map(([key, value]) => key === oldKey ? [newKey, value] : [key, value]);
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

function recalcFreightFromTotal(data) {
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
