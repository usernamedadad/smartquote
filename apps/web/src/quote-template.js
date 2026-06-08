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
  normalizeQuoteItems, updateQuoteTotals, extractNumeric
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

export function parameterRows(parameters = {}) {
  return Object.entries(parameters)
    .filter(([, value]) => valueText(value).trim() !== "")
    .map(([key, value]) => {
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
    })
    .join("");
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

function galleryGridMarkup(images, options) {
  const count = images.length;
  const countClass = `gallery-${Math.min(count, 6)}`;
  const imageSrc = options.imageSrc || ((img) => img.url);

  const items = images.map((image, index) => {
    const src = imageSrc(image);
    if (!src) return "";
    const span = (count === 3 && index === 0) ? ' class="gallery-span"' : '';
    const figDrag = options.draggable ? ` draggable="true" data-preview-gallery-image="${image.id}"` : "";
    return `<figure${span}${figDrag}><img src="${src}" alt="${escapeHtml(image.originalName)}"></figure>`;
  }).filter(Boolean).join("");

  const drag = options.draggable ? `draggable="true" data-preview-section="gallery"` : "";
  const dragClass = options.draggable ? " draggable-preview-section" : "";
  const classes = options.galleryClasses ? ` ${options.galleryClasses}` : "";

  return `
    <section class="gallery-section${dragClass}" ${drag} aria-label="Product images">
      <div class="gallery ${countClass}${classes}">${items}</div>
    </section>
  `;
}

function quoteItemRowsMarkup(data) {
  const items = normalizeQuoteItems(data);
  return items.map((item, index) => {
    if (item.type === "accessory") return accessoryRowsMarkup(item, index);
    const qty = item.pricing?.quantity || "";
    const qtyNum = parseFloat(qty);
    const qtyDisplay = qty ? `${extractNumeric(qty)} ${qtyNum === 1 ? "set" : "sets"}` : "";
    return `
      <tr class="product-row ${index > 0 ? "product-row-separated" : ""}">
        <td>${index + 1}.</td>
        <td><h3>${escapeHtml(item.product?.enName || "")}</h3>${parameterRows(item.parameters)}</td>
        <td>${escapeHtml(qtyDisplay)}</td>
        <td>${escapeHtml(item.pricing?.unitPrice || "")}</td>
        <td>${amountCellMarkup(item.pricing?.totalAmount)}</td>
      </tr>
    `;
  }).join("");
}

function accessoryRowsMarkup(item, index) {
  const params = Array.isArray(item.parameters) ? item.parameters : [];
  const fallbackUnit = item.unit || "";
  const name = escapeHtml(item.accessoryName || item.product?.enName || "");
  const rowSep = index > 0 ? "product-row-separated" : "";

  const visibleParams = params.filter((p) => p.name.trim());
  const detailRows = visibleParams.map((p) => {
    const pUnit = p.unit || fallbackUnit;
    const qtyNum = parseFloat(extractNumeric(p.quantity)) || 0;
    const qtyUnitForm = pUnit ? (qtyNum === 1 ? pUnit : `${pUnit}s`) : "";
    const pQty = p.quantity ? (qtyUnitForm ? `${extractNumeric(p.quantity)} ${qtyUnitForm}` : extractNumeric(p.quantity)) : "";
    const pPrice = p.unitPrice ? (pUnit ? `$${extractNumeric(p.unitPrice)}/${pUnit}` : `$${extractNumeric(p.unitPrice)}`) : "";
    return `<tr class="accessory-detail-row">
      <td>- ${escapeHtml(p.name)}</td>
      <td>${escapeHtml(pQty)}</td>
      <td>${escapeHtml(pPrice)}</td>
      <td>${amountCellMarkup(p.lineTotal)}</td>
    </tr>`;
  }).join("");

  return `<tr class="product-row accessory-row ${rowSep}">
    <td rowspan="${visibleParams.length + 1}">${index + 1}.</td>
    <td><h3>${name}</h3></td>
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
            ${quoteItemRowsMarkup(data)}
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
    return galleryGridMarkup(images, options);
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

  return `
    <header class="topbar">
      <img class="brand-logo" src="${logoSrc}" alt="ZK Hoist">
      <dl class="quote-meta" aria-label="Quote information">
        <div class="meta-row"><dt>${escapeHtml(labels.quoteNo)}</dt><dd>${escapeHtml(data.quoteMeta?.quoteNo || "")}</dd></div>
        <div class="meta-row"><dt>${escapeHtml(labels.date)}</dt><dd>${escapeHtml(data.quoteMeta?.date || "")}</dd></div>
        <div class="meta-row"><dt>${escapeHtml(labels.validity)}</dt><dd>${escapeHtml(data.quoteMeta?.validity || "")}</dd></div>
      </dl>
    </header>

    <section class="hero-title" aria-label="Quotation title">
      <div class="title-ribbon title-ribbon-large"><span>${escapeHtml(title)}</span></div>
    </section>

    ${quoteSectionsMarkup(data, images, params, opts)}
  `;
}
