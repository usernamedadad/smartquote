/**
 * 报价单 HTML 模板：预览和 PDF 共用的唯一实现
 *
 * options 参数：
 *   imageSrc(img)       — 图片路径解析回调，默认返回 img.url
 *   logoSrc             — logo 路径，默认 "/assets/logo.png"
 *   draggable           — 是否加拖拽属性，默认 false
 *   galleryClasses      — gallery div 额外 class
 *   heroTitleFallback   — 空标题的后备文本
 */
import {
  escapeHtml, valueText, normalizeTerms,
  isLineOnlyParameter, lineParameterText,
  normalizeQuoteItems, updateQuoteTotals, extractNumeric, normalizeGalleryPreset
} from "./utils.js";

export {
  escapeHtml, normalizeTerms, normalizeGalleryLayout, normalizeProductParameters,
  normalizeQuoteItems, updateQuoteTotals
} from "./utils.js";

/* ---- 布局常量与规范化 ---- */

export const defaultQuoteSectionOrder = ["parties", "pricing", "gallery", "terms", "footer"];
export const defaultPartyOrder = ["from", "to"];

export const LABEL_KEYS = [
  "from", "to", "name", "whatsapp", "email",
  "quoteNo", "date", "validity",
  "productPricing", "termsConditions",
  "no", "productSpecs", "quantity", "unitPrice", "totalAmount",
  "subtotal", "freight", "total"
];

export const DEFAULT_LABELS = {
  from: "FROM",
  to: "TO",
  name: "Name:",
  whatsapp: "WhatsApp:",
  email: "Email:",
  quoteNo: "Quote No.",
  date: "Date",
  validity: "Validity",
  productPricing: "PRODUCT & PRICING",
  termsConditions: "TERMS & CONDITIONS",
  no: "No.",
  productSpecs: "Product Specifications",
  quantity: "Quantity",
  unitPrice: "Unit Price",
  totalAmount: "Total Amount",
  subtotal: "SUBTOTAL",
  freight: "FREIGHT",
  total: "TOTAL",
};

export function normalizeQuoteLayout(data) {
  if (!data.layout || typeof data.layout !== "object") data.layout = {};

  const validSections = new Set(defaultQuoteSectionOrder);
  const savedSections = Array.isArray(data.layout.sections) ? data.layout.sections : [];
  data.layout.sections = [
    ...savedSections.filter((id) => validSections.has(id)),
    ...defaultQuoteSectionOrder.filter((id) => !savedSections.includes(id))
  ];

  const validParties = new Set(defaultPartyOrder);
  const savedParties = Array.isArray(data.layout.parties) ? data.layout.parties : [];
  data.layout.parties = [
    ...savedParties.filter((id) => validParties.has(id)),
    ...defaultPartyOrder.filter((id) => !savedParties.includes(id))
  ];
}

/* ---- 参数行 ---- */

export function parameterRows(parameters = {}, itemIndex = -1, interactive = false) {
  const entries = Object.entries(parameters)
    .filter(([key, value]) => {
      if (!key) return false;
      /* interactive 模式下始终显示自定义参数（即使值为空） */
      if (interactive && key.startsWith("__custom_")) return true;
      return valueText(value).trim() !== "";
    });

  let html = entries.map(([key, value]) => {
    /* 自定义参数：interactive 时渲染为可编辑 input */
    if (key.startsWith("__custom_")) {
      if (interactive) {
        return `<p class="pe-custom-row">- <input class="pe-param-input" data-edit-param="${itemIndex}:${escapeHtml(key)}" value="${escapeHtml(valueText(value))}" placeholder="输入参数内容..."><button class="pe-delete" data-delete-param="${itemIndex}:${escapeHtml(key)}" title="删除">×</button></p>`;
      }
      return `<p>- ${escapeHtml(valueText(value))}</p>`;
    }

    /* 以下为内置参数，保持纯文本渲染，不做编辑 */

    if (isLineOnlyParameter(value)) {
      return `<p>- ${escapeHtml(lineParameterText(key))}</p>`;
    }

    if (Array.isArray(value)) {
      if (key === "Steel Structure Parts") {
        return value.filter(Boolean).map((item) => `<p>- ${escapeHtml(item)}</p>`).join("");
      }

      return `
        <div class="parameter-split">
          <span>- ${escapeHtml(key)}:</span>
          <div>${value.filter(Boolean).map((item) => `<b>${escapeHtml(item)}</b>`).join("")}</div>
        </div>
      `;
    }

    return `<p>- ${escapeHtml(key)}: ${escapeHtml(valueText(value))}</p>`;
  }).join("");

  if (interactive && itemIndex >= 0) {
    html += `<button class="pe-float-btn" data-add-param-preview="${itemIndex}">+ Param</button>`;
  }
  return html;
}

/* ---- 条款 ---- */

export function termsMarkup(terms = {}) {
  normalizeTerms(terms);
  return terms.items
    .map((item) => {
      const title = String(item.title || "").trim();
      const lines = String(item.content || "").split("\n").filter(Boolean);
      if (!title && !lines.length) return "";
      return `
        <h3>${escapeHtml(title)}:</h3>
        ${lines.length ? lines.map((line) => `<p>${escapeHtml(line)}</p>`).join("") : "<p></p>"}
      `;
    })
    .join("");
}

/* ---- 各区块渲染 ---- */

function partyCardMarkup(partyId, data, options) {
  const source = partyId === "to" ? (data.to || {}) : (data.from || {});
  const labels = options.labels || DEFAULT_LABELS;
  const label = partyId === "to" ? labels.to : labels.from;
  const title = source.company;
  const drag = options.draggable ? `draggable="true" data-preview-party="${partyId}"` : "";
  const dragClass = options.draggable ? " draggable-party-card" : "";

  return `
    <article class="party-card party-${partyId}${dragClass}" ${drag}>
      <div class="party-label"><span>${escapeHtml(label)}</span><i></i></div>
      <h2>${escapeHtml(title)}</h2>
      <div class="party-lines">
        <span>${escapeHtml(labels.name)}</span><strong>${escapeHtml(source.name)}</strong>
        <span>${escapeHtml(labels.whatsapp)}</span><strong>${escapeHtml(source.whatsapp)}</strong>
        <span>${escapeHtml(labels.email)}</span><strong>${escapeHtml(source.email)}</strong>
      </div>
    </article>
  `;
}

function galleryGridMarkup(data, images, options) {
  const preset = normalizeGalleryPreset(data);
  const visibleImages = images.slice(0, galleryPresetSlotCount(preset));
  const count = visibleImages.length;
  const countClass = `gallery-${Math.min(count, 6)}`;
  const imageSrc = options.imageSrc || ((img) => img.url);

  const items = visibleImages.map((image, index) => {
    const src = imageSrc(image);
    if (!src) return "";
    const figureClass = galleryFigureClass(preset, index, count);
    const span = figureClass ? ` class="${figureClass}"` : "";
    const figDrag = options.draggable ? ` draggable="true" data-preview-gallery-image="${image.id}"` : "";
    return `<figure${span}${figDrag}><img src="${src}" alt="${escapeHtml(image.originalName)}"></figure>`;
  }).filter(Boolean).join("");

  const drag = options.draggable ? `draggable="true" data-preview-section="gallery"` : "";
  const dragClass = options.draggable ? " draggable-preview-section" : "";
  const classes = options.galleryClasses ? ` ${options.galleryClasses}` : "";

  return `
    <section class="gallery-section${dragClass}" ${drag} aria-label="Product images">
      <div class="gallery gallery-preset-${preset} ${countClass}${classes}">${items}</div>
    </section>
  `;
}

function galleryPresetSlotCount(preset) {
  if (preset === "single-full") return 1;
  if (preset === "two-columns" || preset === "two-rows") return 2;
  if (preset === "hero-left" || preset === "hero-top") return 3;
  return 6;
}

function galleryFigureClass(preset, index, count) {
  if (count < 3) return "";
  if (preset === "hero-left" && index === 0) return "gallery-span gallery-span-left";
  if (preset === "hero-top" && index === 0) return "gallery-span gallery-span-top";
  return "";
}

function quoteItemRowsMarkup(data, options) {
  const items = normalizeQuoteItems(data);
  const interactive = options?.interactive;
  let html = "";

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    if (item.type === "accessory") {
      html += accessoryRowsMarkup(item, i, interactive);
    } else {
      const qty = item.pricing?.quantity || "";
      const qtyNum = parseFloat(qty);
      const qtyDisplay = qty ? `${extractNumeric(qty)} ${qtyNum === 1 ? "set" : "sets"}` : "";
      const accBtn = interactive
        ? `<button class="preview-add-btn preview-acc-btn" data-add-accessory="${i}">+ Acc</button>`
        : "";
      const productSpecs = productSpecMarkup(item, i, options);
      const deleteBtn = interactive ? `<button class="preview-delete-btn" data-remove-preview-item="${i}" title="删除">×</button>` : "";
      html += `
        <tr class="product-row ${i > 0 ? "product-row-separated" : ""}" ${interactive ? `data-preview-item="${i}"` : ""}>
          <td class="product-no-cell">${accBtn}<span class="product-no-text">${i + 1}.</span> ${deleteBtn}</td>
          <td>${productSpecs}</td>
          <td>${escapeHtml(qtyDisplay)}</td>
          <td>${escapeHtml(item.pricing?.unitPrice || "")}</td>
          <td>${amountCellMarkup(item.pricing?.totalAmount)}</td>
        </tr>`;
    }
  }

  // 底部 "+ Add Product"
  if (interactive) {
    html += `<tr class="preview-action-row"><td colspan="5"><button class="preview-add-btn" data-add-product>+ Add Product</button></td></tr>`;
  }

  return html;
}

function productSpecMarkup(item, itemIndex, options) {
  const interactive = options?.interactive || false;
  const body = `<div class="product-name-bar"><h3>${escapeHtml(item.product?.enName || "")}</h3></div>${parameterRows(item.parameters, itemIndex, interactive)}`;
  const productImage = quoteImageById(item.imageId, options);

  if (!productImage) return body;

  const imageSrc = options.imageSrc || ((img) => img.url);
  const src = imageSrc(productImage);
  if (!src) return body;

  return `
    <div class="product-spec-with-image">
      <div class="product-spec-text">${body}</div>
      <figure class="product-inline-image">
        <img src="${src}" alt="${escapeHtml(productImage.originalName || item.product?.enName || "")}">
      </figure>
    </div>
  `;
}

function quoteImageById(imageId, options = {}) {
  if (!imageId) return null;
  const id = Number(imageId);
  if (typeof options.imageById === "function") return options.imageById(id);
  const images = options.assetImages || options.images || [];
  return images.find((image) => Number(image.id) === id) || null;
}

function accessoryRowsMarkup(item, index, interactive = false) {
  const params = Array.isArray(item.parameters) ? item.parameters : [];
  const fallbackUnit = item.unit || "";
  const name = escapeHtml(item.accessoryName || item.product?.enName || "");
  const rowSep = index > 0 ? "product-row-separated" : "";
  const itemAttr = interactive ? `data-preview-item="${index}"` : "";
  const deleteBtn = interactive ? `<button class="preview-delete-btn" data-remove-preview-item="${index}" title="删除">×</button>` : "";

  /* 只显示有名称的参数行；interactive 时也显示 _new 标记的新行 */
  const visibleParams = interactive
    ? params.filter((p) => p.name.trim() || p._new)
    : params.filter((p) => p.name.trim());
  const rowCount = visibleParams.length + 1;

  /* + Row 浮动按钮放在名称 <td> 内，不占表格行 */
  const addRowBtn = interactive
    ? `<button class="pe-float-btn" data-add-acc-row="${index}">+ Row</button>`
    : "";

  const nameHtml = `<h3>${name}</h3>${addRowBtn}`;

  const detailRows = visibleParams.map((p, pi) => {
    const pUnit = p.unit || fallbackUnit;
    const qtyNum = parseFloat(extractNumeric(p.quantity)) || 0;
    const qtyUnitForm = pUnit ? (qtyNum === 1 ? pUnit : `${pUnit}s`) : "";
    const pQty = p.quantity ? (qtyUnitForm ? `${extractNumeric(p.quantity)} ${qtyUnitForm}` : extractNumeric(p.quantity)) : "";
    const pPrice = p.unitPrice ? (pUnit ? `$${extractNumeric(p.unitPrice)}/${pUnit}` : `$${extractNumeric(p.unitPrice)}`) : "";

    /* 只有 _new 标记的行才渲染为可编辑卡片行 */
    if (interactive && p._new) {
      const rawQty = extractNumeric(p.quantity || "");
      const rawPrice = extractNumeric(p.unitPrice || "");
      const rawUnit = p.unit || "";
      return `<tr class="accessory-detail-row pe-new-row">
        <td><input class="pe-line-input pe-name-field" data-edit-acc-name="${index}:${pi}" value="${escapeHtml(p.name.trim())}" placeholder="参数名称"></td>
        <td><input class="pe-line-input pe-qty-field" data-edit-acc-qty="${index}:${pi}" value="${escapeHtml(rawQty)}" placeholder="数量"> <input class="pe-line-input pe-unit-field" data-edit-acc-unit="${index}:${pi}" value="${escapeHtml(rawUnit)}" placeholder="单位"></td>
        <td>$<input class="pe-line-input pe-price-field" data-edit-acc-price="${index}:${pi}" value="${escapeHtml(rawPrice)}" placeholder="单价"></td>
        <td class="pe-linetotal" data-linetotal-cell="${index}:${pi}">${amountCellMarkup(p.lineTotal)}<button class="pe-delete" data-delete-acc-row="${index}:${pi}" title="删除">×</button></td>
      </tr>`;
    }
    return `<tr class="accessory-detail-row">
      <td>- ${escapeHtml(p.name)}</td>
      <td>${escapeHtml(pQty)}</td>
      <td>${escapeHtml(pPrice)}</td>
      <td>${amountCellMarkup(p.lineTotal)}</td>
    </tr>`;
  }).join("");

  return `<tr class="product-row accessory-row ${rowSep}" ${itemAttr}>
    <td rowspan="${rowCount}">${index + 1}. ${deleteBtn}</td>
    <td>${nameHtml}</td>
    <td></td><td></td><td></td>
  </tr>${detailRows}`;
}

/* 金额列：保留 $ 与数字紧贴，由 CSS text-align:right 统一右对齐 */
function amountCellMarkup(value) {
  return escapeHtml(String(value || "").trim());
}

function pricingSummaryRowsMarkup(data, options = {}) {
  const labels = options.labels || DEFAULT_LABELS;
  const pricing = updateQuoteTotals(data);
  const freightMode = (pricing.enabledItems || []).includes("freight");
  const rows = [];

  if (freightMode) {
    rows.push({ label: labels.subtotal, value: pricing.subtotal || pricing.totalAmount || "" });
    rows.push({ label: labels.freight, value: pricing.freight || "" });
  }
  rows.push({ label: labels.total, value: pricing.totalAmount || pricing.subtotal || "" });

  return `
    <tr class="total-row">
      <td colspan="3"></td>
      <td colspan="2" class="summary-cell">
        <div class="summary-table" aria-label="Price summary">
          ${rows.map((row) => `
            <div class="summary-line">
              <span>${escapeHtml(row.label)}</span>
              <strong>${amountCellMarkup(row.value)}</strong>
            </div>
          `).join("")}
        </div>
      </td>
    </tr>
  `;
}

function quoteSectionMarkup(sectionId, data, images, params, options) {
  const drag = options.draggable ? `draggable="true" data-preview-section="${sectionId}"` : "";
  const dragClass = options.draggable ? " draggable-preview-section" : "";
  const labels = options.labels || DEFAULT_LABELS;

  if (sectionId === "parties") {
    return `
      <section class="party-grid${dragClass}" ${drag} aria-label="Company and customer information">
        ${data.layout.parties.map((partyId) => partyCardMarkup(partyId, data, options)).join("")}
      </section>
    `;
  }

  if (sectionId === "pricing") {
    return `
      <section class="pricing-section${dragClass}" ${drag} aria-label="Product and pricing">
        <div class="title-ribbon title-ribbon-small"><span>${escapeHtml(labels.productPricing)}</span></div>
        <table class="pricing-table">
          <thead>
            <tr>
              <th>${escapeHtml(labels.no)}</th>
              <th>${escapeHtml(labels.productSpecs)}</th>
              <th>${escapeHtml(labels.quantity)}</th>
              <th>${escapeHtml(labels.unitPrice)}</th>
              <th>${escapeHtml(labels.totalAmount)}</th>
            </tr>
          </thead>
          <tbody>
            ${quoteItemRowsMarkup(data, options)}
            ${pricingSummaryRowsMarkup(data, options)}
          </tbody>
        </table>
      </section>
    `;
  }

  if (sectionId === "terms") {
    return `
      <section class="terms-section${dragClass}" ${drag} aria-label="Terms and conditions">
        <div class="title-ribbon title-ribbon-small"><span>${escapeHtml(labels.termsConditions)}</span></div>
        <div class="terms-box">${termsMarkup(data.terms)}</div>
      </section>
    `;
  }

  if (sectionId === "gallery") {
    if (!images.length) return "";
    return galleryGridMarkup(data, images, options);
  }

  if (sectionId === "footer") {
    const footer = data.footer || {};
    return `
      <div class="footer${dragClass}" ${drag}>
        <div class="footer-line"></div>
        <div class="footer-text">
          <span>${escapeHtml(footer.company)}</span>
          <b>|</b>
          <span>${escapeHtml(footer.website)}</span>
          <b>|</b>
          <span>${escapeHtml(footer.email)}</span>
          <b>|</b>
          <span>${escapeHtml(footer.phone)}</span>
        </div>
      </div>
    `;
  }

  return "";
}

function quoteSectionsMarkup(data, images, params, options) {
  return data.layout.sections
    .map((sectionId) => quoteSectionMarkup(sectionId, data, images, params, options))
    .filter(Boolean)
    .join("");
}

/* ---- 主入口：输出 topbar + hero-title + sections（不含外层 main 包裹） ---- */

export function quoteBodyMarkup(data, images, params, options = {}) {
  normalizeQuoteLayout(data);
  const title = data.quoteMeta?.title || options.heroTitleFallback || "";
  const logoSrc = options.logoSrc || "/assets/logo.png";
  const labels = { ...DEFAULT_LABELS, ...(options.labels || {}) };
  const opts = { ...options, labels };
  const interactive = options?.interactive;
  const basicAttr = interactive ? `data-preview-section="basic"` : "";
  const dateValue = data.quoteMeta?.date || "";
  /* 将 "June 9, 2025" 等格式转为 YYYY-MM-DD 供 date input 使用 */
  let dateIso = "";
  if (dateValue) {
    const d = new Date(dateValue);
    if (!isNaN(d.getTime())) dateIso = d.toISOString().slice(0, 10);
  }
  const dateDisplay = interactive
    ? `<dd class="pe-date-wrap">${escapeHtml(dateValue)}<input type="date" class="pe-date-input" data-edit-date value="${escapeHtml(dateIso)}"><span class="pe-date-icon" title="选择日期"><svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="1.5" y="3" width="13" height="11.5" rx="1.5"/><line x1="1.5" y1="7" x2="14.5" y2="7"/><line x1="5" y1="1" x2="5" y2="4.5"/><line x1="11" y1="1" x2="11" y2="4.5"/></svg></span></dd>`
    : `<dd>${escapeHtml(dateValue)}</dd>`;

  return `
    <header class="topbar" ${basicAttr}>
      <img class="brand-logo" src="${logoSrc}" alt="ZK Hoist">
      <dl class="quote-meta" aria-label="Quote information">
        <div class="meta-row"><dt>${escapeHtml(labels.quoteNo)}</dt><dd>${escapeHtml(data.quoteMeta?.quoteNo || "")}</dd></div>
        <div class="meta-row"><dt>${escapeHtml(labels.date)}</dt>${dateDisplay}</div>
        <div class="meta-row"><dt>${escapeHtml(labels.validity)}</dt><dd>${escapeHtml(data.quoteMeta?.validity || "")}</dd></div>
      </dl>
    </header>

    <section class="hero-title" ${basicAttr} aria-label="Quotation title">
      <div class="title-ribbon title-ribbon-large"><span>${escapeHtml(title)}</span></div>
    </section>

    ${quoteSectionsMarkup(data, images, params, opts)}
  `;
}
