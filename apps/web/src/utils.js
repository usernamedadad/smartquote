/**
 * 纯工具函数：无状态依赖
 */

export function setByPath(object, path, value) {
  const parts = path.split(".");
  let target = object;
  for (let index = 0; index < parts.length - 1; index += 1) {
    target = target[parts[index]];
  }
  target[parts.at(-1)] = value;
}

export function valueText(value) {
  if (Array.isArray(value)) return value.filter(Boolean).join("; ");
  if (value === true) return "included";
  return String(value ?? "");
}

export function normalizeTerms(terms = {}) {
  if (Array.isArray(terms.items)) {
    terms.items = terms.items
      .map((item) => ({
        title: String(item.title || "").trim(),
        content: String(item.content || "")
      }))
      .filter((item) => item.title || item.content);
    return terms;
  }

  terms.items = [
    { title: "SHIPMENT TERM", content: terms.shipment || "" },
    { title: "PAYMENT TERM", content: terms.payment || "" },
    { title: "LEAD TIME", content: terms.leadTime || "" },
    { title: "PACKAGE", content: terms.package || "" }
  ].filter((item) => item.title || item.content);
  return terms;
}

export function normalizeGalleryLayout(data, images = []) {
  if (!data.layout || typeof data.layout !== "object") data.layout = {};
  const selectedIds = Array.isArray(data.selectedImageIds) ? data.selectedImageIds : [];
  const visibleIds = selectedIds
    .map((id) => Number(id))
    .filter((id) => images.some((image) => Number(image.id) === id));
  const savedItems = Array.isArray(data.layout.galleryItems) ? data.layout.galleryItems : [];
  const savedById = new Map(savedItems.map((item) => [Number(item.imageId), item]));
  const defaults = defaultGalleryLayout(visibleIds);

  data.layout.galleryItems = visibleIds.map((id, index) => {
    const saved = savedById.get(id);
    const fallback = defaults[index] || defaultGalleryItem(id);
    return normalizeGalleryItem(saved, fallback, id, index);
  });

  return data.layout.galleryItems;
}

export function defaultGalleryLayout(imageIds = []) {
  const ids = imageIds.map((id) => Number(id));
  if (!ids.length) return [];

  if (ids.length === 1) {
    return [{ imageId: ids[0], x: 170, y: 20, width: 660, height: 300, zIndex: 1 }];
  }

  if (ids.length === 2) {
    return [
      { imageId: ids[0], x: 40, y: 18, width: 920, height: 160, zIndex: 1 },
      { imageId: ids[1], x: 40, y: 198, width: 920, height: 160, zIndex: 2 }
    ];
  }

  if (ids.length === 3) {
    return [
      { imageId: ids[0], x: 40, y: 16, width: 920, height: 165, zIndex: 1 },
      { imageId: ids[1], x: 40, y: 200, width: 440, height: 150, zIndex: 2 },
      { imageId: ids[2], x: 520, y: 200, width: 440, height: 150, zIndex: 3 }
    ];
  }

  if (ids.length === 4) {
    return ids.map((id, index) => ({
      imageId: id,
      x: index % 2 === 0 ? 40 : 520,
      y: Math.floor(index / 2) === 0 ? 20 : 200,
      width: 440,
      height: 155,
      zIndex: index + 1
    }));
  }

  return ids.slice(0, 6).map((id, index) => ({
    imageId: id,
    x: 28 + (index % 3) * 324,
    y: 20 + Math.floor(index / 3) * 178,
    width: 296,
    height: 150,
    zIndex: index + 1
  }));
}

export function resetGalleryLayout(data, images = []) {
  if (!data.layout || typeof data.layout !== "object") data.layout = {};
  const selectedIds = Array.isArray(data.selectedImageIds) ? data.selectedImageIds : [];
  const visibleIds = selectedIds
    .map((id) => Number(id))
    .filter((id) => images.some((image) => Number(image.id) === id));
  data.layout.galleryItems = defaultGalleryLayout(visibleIds);
  return data.layout.galleryItems;
}

export function calculateTotalAmount(quantity, unitPrice) {
  const quantityNumber = parseAmountNumber(quantity);
  const unitNumber = parseAmountNumber(unitPrice);
  if (!Number.isFinite(quantityNumber) || !Number.isFinite(unitNumber)) return "";

  const total = quantityNumber * unitNumber;
  const prefix = String(unitPrice || "").trim().match(/^[^\d.-]+/)?.[0] || "";
  const decimals = decimalPlaces(unitNumber);
  const formatted = total.toLocaleString("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals
  });
  return `${prefix}${formatted}`;
}

export function normalizeQuoteItems(data, products = []) {
  if (!data || typeof data !== "object") return [];

  if (!Array.isArray(data.quoteItems) || !data.quoteItems.length) {
    if (data.product?.id || data.product?.enName) {
      data.quoteItems = [legacyQuoteItem(data)];
    } else {
      data.quoteItems = [];
      normalizePricingConfig(data);
      return data.quoteItems;
    }
  }

  data.quoteItems = data.quoteItems
    .map((item, index) => normalizeQuoteItem(item, index))
    .filter((item) => item.product.enName || (Array.isArray(item.parameters) ? item.parameters.length : Object.keys(item.parameters).length));

  normalizePricingConfig(data);
  syncLegacyProductFields(data);
  updateQuoteTotals(data);
  return data.quoteItems;
}

export function createQuoteItemFromProduct(product, options = {}) {
  const pricing = options.pricing || {};
  return normalizeQuoteItem({
    id: options.id || uniqueId("item"),
    type: options.type || "product",
    groupId: options.groupId || "",
    parentId: options.parentId || "",
    accessoryName: options.accessoryName || "",
    product: {
      id: product?.id || "",
      cnName: product?.cnName || "",
      enName: product?.enName || ""
    },
    parameters: options.type === "accessory"
      ? normalizeAccessoryParameters(structuredClone(product?.parameters || {}))
      : normalizeProductParameters(structuredClone(product?.parameters || {}), product?.id || ""),
    pricing: options.type === "accessory"
      ? { totalAmount: pricing.totalAmount || "" }
      : {
          quantity: pricing.quantity || "1 set",
          unitPrice: pricing.unitPrice || "",
          totalAmount: pricing.totalAmount || ""
        },
    unit: options.type === "accessory" ? (options.unit || "") : undefined,
    collapsed: Boolean(options.collapsed)
  });
}

export function createCraneSupportQuoteItems(products = []) {
  const crane = products.find((product) => product.id === "product_5") || products.find((product) => product.id === "product_6");
  const combo = products.find((product) => product.id === "product_6") || crane;
  const comboParams = structuredClone(combo?.parameters || {});
  const supportParts = Array.isArray(comboParams["Steel Structure Parts"]) ? comboParams["Steel Structure Parts"] : [];
  delete comboParams["Steel Structure Parts"];

  const craneItem = createQuoteItemFromProduct({
    ...combo,
    id: combo?.id || "",
    cnName: combo?.cnName || "",
    enName: combo?.enName || "",
    parameters: comboParams
  });

  const supportParams = {};
  supportParts.filter(Boolean).forEach((part) => { supportParams[part] = true; });

  const supportItem = createQuoteItemFromProduct({
    id: "steel_structure_parts",
    cnName: "支撑结构配件",
    enName: "Steel Structure Parts",
    parameters: supportParams
  }, { type: "accessory", parentId: craneItem.id, accessoryName: "Steel Structure Parts" });

  return [craneItem, supportItem];
}

export function normalizePricingConfig(data) {
  if (!data.pricing || typeof data.pricing !== "object") data.pricing = {};
  const savedItems = Array.isArray(data.pricing.enabledItems) ? data.pricing.enabledItems : ["total"];
  const enabled = savedItems
    .map((item) => String(item).toLowerCase())
    .filter((item, index, items) => ["subtotal", "freight", "total"].includes(item) && items.indexOf(item) === index);

  const freightMode = enabled.includes("subtotal") || enabled.includes("freight");
  data.pricing.enabledItems = freightMode ? ["subtotal", "freight", "total"] : ["total"];
  data.pricing.freight = data.pricing.freight || "";
  data.pricing.subtotal = data.pricing.subtotal || "";
  data.pricing.totalAmount = data.pricing.totalAmount || "";
  return data.pricing;
}

export function updateQuoteTotals(data) {
  normalizePricingConfig(data);
  const items = Array.isArray(data.quoteItems) ? data.quoteItems : [];
  const subtotal = sumAmountStrings(items.map((item) => item.pricing?.totalAmount));
  if (subtotal) data.pricing.subtotal = subtotal;

  const enabled = new Set(data.pricing.enabledItems);
  if (enabled.has("freight")) {
    const total = sumAmountStrings([data.pricing.subtotal, data.pricing.freight]);
    data.pricing.totalAmount = total || data.pricing.subtotal || "";
  } else if (data.pricing.subtotal) {
    data.pricing.totalAmount = data.pricing.subtotal;
  }

  return data.pricing;
}

export function sumAmountStrings(values = []) {
  const parts = values
    .map((value) => amountParts(value))
    .filter((part) => Number.isFinite(part.number));
  if (!parts.length) return "";

  const total = parts.reduce((sum, part) => sum + part.number, 0);
  const prefix = parts.find((part) => part.prefix)?.prefix || "";
  const decimals = Math.max(...parts.map((part) => part.decimals));
  return `${prefix}${total.toLocaleString("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals
  })}`;
}

function legacyQuoteItem(data) {
  return {
    id: "item_legacy",
    type: "product",
    product: data.product || {},
    parameters: data.productParameters || {},
    pricing: data.pricing || {},
    collapsed: false
  };
}

function normalizeQuoteItem(item, index) {
  const source = item || {};
  const product = source.product || {};
  const productId = product.id || source.productId || "";
  const pricing = source.pricing || {};
  const isAccessory = source.type === "accessory";

  let parameters = isAccessory
    ? normalizeAccessoryParameters(source.parameters || source.productParameters || {})
    : normalizeProductParameters(source.parameters || source.productParameters || {}, productId);

  const normalized = {
    id: source.id || uniqueId(`item_${index + 1}`),
    type: isAccessory ? "accessory" : "product",
    groupId: source.groupId || "",
    parentId: source.parentId || "",
    accessoryName: source.accessoryName || "",
    product: {
      id: productId,
      cnName: product.cnName || product.cn_name || "",
      enName: product.enName || product.en_name || source.enName || ""
    },
    parameters,
    pricing: isAccessory
      ? { totalAmount: pricing.totalAmount || "" }
      : {
          quantity: pricing.quantity || "",
          unitPrice: pricing.unitPrice || "",
          totalAmount: pricing.totalAmount || ""
        },
    collapsed: Boolean(source.collapsed)
  };

  if (isAccessory) {
    normalized.unit = source.unit || "";
    recalcAccessoryTotal(normalized);
  } else {
    const total = calculateTotalAmount(normalized.pricing.quantity, normalized.pricing.unitPrice);
    if (total) normalized.pricing.totalAmount = total;
  }
  return normalized;
}

function normalizeAccessoryParameters(params) {
  if (Array.isArray(params)) {
    return params.map((p) => ({
      name: String(p.name || ""),
      quantity: String(p.quantity || ""),
      unitPrice: String(p.unitPrice || ""),
      lineTotal: String(p.lineTotal || ""),
      unit: String(p.unit || "")
    }));
  }
  return Object.entries(params || {}).map(([key]) => ({
    name: key,
    quantity: "",
    unitPrice: "",
    lineTotal: ""
  }));
}

export function recalcAccessoryTotal(item) {
  const lines = Array.isArray(item.parameters) ? item.parameters : [];
  const total = sumAmountStrings(lines.map((l) => l.lineTotal));
  if (total) item.pricing.totalAmount = total;
}

function syncLegacyProductFields(data) {
  const first = data.quoteItems?.[0];
  if (!first) return;
  data.product = structuredClone(first.product);
  data.productParameters = structuredClone(first.parameters);
  data.pricing.quantity = first.pricing.quantity || data.pricing.quantity || "";
  data.pricing.unitPrice = first.pricing.unitPrice || data.pricing.unitPrice || "";
  if (!data.pricing.totalAmount) data.pricing.totalAmount = first.pricing.totalAmount || "";
}

function uniqueId(prefix) {
  if (globalThis.crypto?.randomUUID) return `${prefix}_${globalThis.crypto.randomUUID()}`;
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function amountParts(value) {
  const text = String(value ?? "").trim();
  const number = parseAmountNumber(text);
  const prefix = text.match(/^[^\d.-]+/)?.[0] || "";
  const numberText = text.replaceAll(",", "").match(/-?\d+(?:\.\d+)?/)?.[0] || "";
  return {
    number,
    prefix,
    decimals: numberText.includes(".") ? numberText.split(".")[1].length : 0
  };
}

function normalizeGalleryItem(saved, fallback, imageId, index) {
  const migrated = migrateLegacyPercentItem(saved);
  const source = migrated || saved || {};
  const width = clampNumber(source.width, fallback.width, 48, 1800);
  const height = clampNumber(source.height, fallback.height, 36, 1200);
  return {
    imageId,
    x: clampNumber(source.x, fallback.x, -3000, 3000),
    y: clampNumber(source.y, fallback.y, -3000, 3000),
    width,
    height,
    zIndex: clampNumber(source.zIndex, fallback.zIndex || index + 1, 1, 999)
  };
}

function defaultGalleryItem(imageId) {
  return { imageId, x: 40, y: 20, width: 440, height: 180, zIndex: 1 };
}

function migrateLegacyPercentItem(item) {
  if (!item) return null;
  const width = Number(item.width);
  const height = Number(item.height);
  const x = Number(item.x);
  const y = Number(item.y);
  if (![width, height, x, y].every(Number.isFinite)) return null;
  if (width > 100 || height > 100 || x > 100 || y > 100) return null;
  return {
    x: x * 10,
    y: y * 3.6,
    width: width * 10,
    height: height * 3.6,
    zIndex: item.zIndex
  };
}

function clampNumber(value, fallback, min, max) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(min, Math.min(max, Number(number.toFixed(2))));
}

export function normalizeProductParameters(parameters = {}, productId = "") {
  const entries = [];

  for (const [key, value] of Object.entries(parameters || {})) {
    if (key === "Remark") {
      const remark = String(value || "").trim();
      if (/^Load limiter and lifting height limiter included\.?$/i.test(remark)) {
        entries.push(["Load limiter and lifting height limiter included", true]);
        continue;
      }
      if (/^Lifting height limiter included\.?$/i.test(remark)) {
        entries.push(["Lifting height limiter included", true]);
        continue;
      }
    }

    if ((key === "Crane Rails" || key === "Crane Rails included") && (value === true || /^included\.?$/i.test(String(value || "").trim()))) {
      entries.push(["Crane Rails", true]);
      continue;
    }

    entries.push([key, value]);
  }

  const loadIndex = entries.findIndex(([key]) => key === "Load limiter and lifting height limiter included");
  const controlIndex = entries.findIndex(([key]) => key === "Control method");
  if ((productId === "product_5" || productId === "product_6") && loadIndex >= 0 && controlIndex >= 0 && loadIndex !== controlIndex + 1) {
    const [loadEntry] = entries.splice(loadIndex, 1);
    const nextControlIndex = entries.findIndex(([key]) => key === "Control method");
    entries.splice(nextControlIndex + 1, 0, loadEntry);
  }

  return Object.fromEntries(entries);
}

export function isLineOnlyParameter(value) {
  return value === true;
}

export function lineParameterText(key) {
  return String(key || "");
}

export function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

/**
 * 项目数据容错：补齐缺失的顶层字段，防止渲染崩溃
 */
export function sanitizeProjectData(data) {
  if (!data || typeof data !== "object") return createEmptyProjectData();

  data.quoteMeta = Object.assign({ quoteNo: "", date: "", validity: "", title: "QUOTATION" }, data.quoteMeta);
  data.from = Object.assign({ company: "", name: "", whatsapp: "", email: "" }, data.from);
  data.to = Object.assign({ company: "", name: "", whatsapp: "", email: "" }, data.to);
  data.product = data.product || { id: "", cnName: "", enName: "" };
  data.productParameters = data.productParameters || {};
  data.quoteItems = Array.isArray(data.quoteItems) ? data.quoteItems : [];
  data.pricing = Object.assign({ quantity: "", unitPrice: "", totalAmount: "", subtotal: "", freight: "", enabledItems: ["total"] }, data.pricing);
  data.terms = data.terms || {};
  data.footer = Object.assign({ company: "", website: "", email: "", phone: "" }, data.footer);
  data.selectedImageIds = Array.isArray(data.selectedImageIds) ? data.selectedImageIds : [];
  data.layout = data.layout || {};
  if (data.translation && typeof data.translation === "object") {
    data.translation.data = data.translation.data || {};
    data.translation.labels = data.translation.labels || {};
  }
  return data;
}

function createEmptyProjectData() {
  return {
    quoteMeta: { quoteNo: "", date: "", validity: "", title: "QUOTATION" },
    from: { company: "", name: "", whatsapp: "", email: "" },
    to: { company: "", name: "", whatsapp: "", email: "" },
    product: { id: "", cnName: "", enName: "" },
    productParameters: {},
    quoteItems: [],
    pricing: { quantity: "", unitPrice: "", totalAmount: "", subtotal: "", freight: "", enabledItems: ["total"] },
    terms: {},
    footer: { company: "", website: "", email: "", phone: "" },
    selectedImageIds: [],
    layout: {}
  };
}

export function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function splitParameterValue(value) {
  const text = String(value ?? "").trim();
  const parenMatch = text.match(/^(.+?)\s*\((m\/min)\)$/i);
  if (parenMatch) {
    return { text: parenMatch[1].trim(), unit: parenMatch[2], format: "paren" };
  }

  const spaceMatch = text.match(/^(.+?)\s+(t|m)$/i);
  if (spaceMatch) {
    return { text: spaceMatch[1].trim(), unit: spaceMatch[2], format: "space" };
  }

  return { text, unit: "", format: "" };
}

export function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

export function formatTime(value) {
  if (!value) return "";
  return new Date(value).toLocaleString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  });
}

export function formatSaveClock(value) {
  if (!value) return "";
  return new Date(value).toLocaleTimeString("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
  });
}

export function productSeriesLabel(product) {
  const labels = {
    product_1: "ZE Series",
    product_2: "CD Series",
    product_3: "CH Series",
    product_4: "CF Series",
    product_5: "Single Girder",
    product_6: "Crane + Support"
  };
  return labels[product.id] || product.enName;
}

export function productPreviewUrl(product) {
  return `/src/product-previews/${product.id}.png`;
}

export function parseAmountNumber(value) {
  const match = String(value ?? "").replaceAll(",", "").match(/-?\d+(?:\.\d+)?/);
  return match ? Number(match[0]) : NaN;
}

export function extractNumeric(value) {
  const match = String(value || "").match(/-?[\d,.]+(?:\.\d+)?/);
  return match ? match[0] : "";
}

function decimalPlaces(value) {
  const text = String(value);
  return text.includes(".") ? text.split(".")[1].length : 0;
}
