/**
 * 批量导入：文本解析、别名匹配、占位符
 */
import { modules } from "./state.js";
import { escapeHtml, escapeRegExp } from "./utils.js";
import { modalIconSvg } from "./icons.js";

export function showBulkImportModal(moduleId) {
  return new Promise((resolve) => {
    const title = `${currentImportModuleLabel(moduleId)}批量导入`;
    const root = document.createElement("div");
    root.className = "app-modal-root";
    root.innerHTML = `
      <div class="app-modal-backdrop" data-modal-cancel></div>
      <section class="app-modal app-modal-import" role="dialog" aria-modal="true" aria-labelledby="bulk-import-title">
        <div class="app-modal-mark" aria-hidden="true">${modalIconSvg("default")}</div>
        <div class="app-modal-content">
          <h2 id="bulk-import-title">${escapeHtml(title)}</h2>
          <p>粘贴已准备好的整段信息，系统会根据字段名称自动识别并导入。</p>
        </div>
        <label class="bulk-import-field">
          <span>粘贴内容</span>
          <textarea id="bulk-import-textarea" placeholder="${escapeHtml(importPlaceholder(moduleId))}"></textarea>
        </label>
        <div class="app-modal-actions">
          <button class="modal-button modal-button-secondary" type="button" data-modal-action="cancel">取消</button>
          <button class="modal-button modal-button-primary" type="button" data-modal-action="import">识别并导入</button>
        </div>
      </section>
    `;

    const close = (value) => {
      document.removeEventListener("keydown", onKeydown);
      root.remove();
      resolve(value);
    };

    const onKeydown = (event) => {
      if (event.key === "Escape") close("");
      if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
        close(root.querySelector("#bulk-import-textarea").value.trim());
      }
    };

    root.querySelector('[data-modal-action="cancel"]').addEventListener("click", () => close(""));
    root.querySelector('[data-modal-action="import"]').addEventListener("click", () => {
      close(root.querySelector("#bulk-import-textarea").value.trim());
    });
    root.querySelector("[data-modal-cancel]").addEventListener("click", () => close(""));
    document.addEventListener("keydown", onKeydown);
    document.body.appendChild(root);
    root.querySelector("#bulk-import-textarea").focus();
  });
}

export function currentImportModuleLabel(moduleId) {
  return modules.find((module) => module.id === moduleId)?.label || "信息";
}

export function importPlaceholder(moduleId) {
  const placeholders = {
    basic: "报价单编号：QT-20260604-001\n日期：June 4, 2026\n有效期：10 days\n标题：QUOTATION",
    company: "Company: Henan Zoke Crane Co., Ltd.\nName: Krystal\nWhatsApp: +86 16609015589\nEmail: krystal@zkhoist.com",
    customer: "客户：Rajitha Sampath\n姓名：Rajitha Sampath\nWhatsApp：+94778790404\nEmail：inforajitha@gmail.com",
    pricing: "数量：1 set\n单价：$2,478/set\n总价：$2,478",
    terms: "Shipment Term: EXW Changyuan, Xinxiang City, Henan Province, China.\nPayment Term: T/T: 40% deposit on order, balance before shipment.\nLead Time: 25 workdays after receipt of deposit.\nPackage: All crane bodies are packed in waterproof cloth.",
    footer: "公司：Henan Zoke Crane Co., Ltd.\n网站：www.zkhoist.com\n邮箱：krystal@zkhoist.com\n电话：+86 16609015589"
  };
  return placeholders[moduleId] || "Name: ...\nWhatsApp: ...\nEmail: ...";
}

export function parseImportText(moduleId, text) {
  const specs = importSpecs()[moduleId] || [];
  return specs
    .map((spec) => {
      const value = extractImportValue(text, spec.aliases, spec);
      return value ? { path: spec.path, value } : null;
    })
    .filter(Boolean);
}

export function importSpecs() {
  return {
    basic: [
      { path: "quoteMeta.quoteNo", aliases: ["报价单编号", "报价编号", "quote no", "quotation no", "quote number"] },
      { path: "quoteMeta.date", aliases: ["报价日期", "日期", "date"] },
      { path: "quoteMeta.validity", aliases: ["有效期", "validity", "valid"] },
      { path: "quoteMeta.title", aliases: ["标题", "title", "subject"] }
    ],
    company: partyImportSpecs("from"),
    customer: partyImportSpecs("to"),
    pricing: [
      { path: "pricing.quantity", aliases: ["数量", "qty", "quantity"] },
      { path: "pricing.unitPrice", aliases: ["单价", "unit price", "price"] },
      { path: "pricing.totalAmount", aliases: ["总价", "总金额", "total amount", "total"] }
    ],
    terms: [
      { path: "terms.shipment", aliases: ["shipment terms", "shipping term", "shipment term", "shipment", "贸易条件", "贸易条款", "运输条款", "发货条款"] },
      { path: "terms.payment", aliases: ["payment terms", "payment term", "payment", "付款条件", "付款方式", "付款条款"] },
      { path: "terms.leadTime", aliases: ["lead time", "delivery time", "交期", "货期"] },
      { path: "terms.package", aliases: ["package", "packaging", "包装", "包装方式"], multiline: true }
    ],
    footer: [
      { path: "footer.company", aliases: ["公司", "company", "company name"] },
      { path: "footer.website", aliases: ["网站", "网址", "website", "web", "site"] },
      { path: "footer.email", aliases: ["邮箱", "email", "e-mail"], fallback: "email" },
      { path: "footer.phone", aliases: ["电话", "手机", "whatsapp", "phone", "tel", "mobile"], fallback: "phone" }
    ]
  };
}

export function partyImportSpecs(prefix) {
  return [
    { path: `${prefix}.company`, aliases: ["公司/客户", "客户公司", "客户", "公司", "company", "customer", "client"] },
    { path: `${prefix}.name`, aliases: ["联系人姓名", "customer name", "contact name", "姓名", "联系人", "名字", "name", "contact", "contact person"] },
    { path: `${prefix}.whatsapp`, aliases: ["联系人电话", "contact phone", "联系电话", "whatsapp", "whats app", "电话", "手机", "phone", "tel", "mobile"], fallback: "phone" },
    { path: `${prefix}.email`, aliases: ["联系人邮箱", "contact email", "联系邮箱", "邮箱", "email", "e-mail"], fallback: "email" }
  ];
}

export function extractImportValue(text, aliases, spec = {}) {
  const lines = String(text || "")
    .replace(/\r/g, "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];

    // 1) 严格匹配：alias 在行首
    for (const alias of aliases) {
      const escaped = escapeRegExp(alias);
      const match = line.match(new RegExp(`^\\s*${escaped}\\s*(?:[:：=\\-]|\\s{2,})\\s*(.+)$`, "i"));
      if (match?.[1]) {
        const firstValue = cleanImportedValue(match[1]);
        if (!spec.multiline) return firstValue;
        return cleanImportedValue([firstValue, ...collectIndentedFollowingLines(lines, index)].join("\n"));
      }
    }

    // 2) 子串匹配：alias 在行内任意位置 + 分隔符，选最长 alias
    let bestValue = null;
    let bestAliasLen = 0;
    for (const alias of aliases) {
      const escaped = escapeRegExp(alias);
      const match = line.match(new RegExp(`${escaped}\\s*[:：=\\-]\\s*(.+)$`, "i"));
      if (match?.[1] && alias.length > bestAliasLen) {
        bestValue = match[1];
        bestAliasLen = alias.length;
      }
    }
    if (bestValue) return cleanImportedValue(bestValue);
  }

  if (spec.fallback === "email") {
    return text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)?.[0] || "";
  }

  if (spec.fallback === "phone") {
    return text.match(/(?:\+?\d[\d\s\-()]{6,}\d)/)?.[0]?.replace(/\s+/g, " ").trim() || "";
  }

  return "";
}

export function collectIndentedFollowingLines(lines, startIndex) {
  const collected = [];
  for (let index = startIndex + 1; index < lines.length; index += 1) {
    if (/^[\w一-龥 /+-]{2,}\s*[:：=]/.test(lines[index])) break;
    collected.push(lines[index]);
  }
  return collected;
}

export function cleanImportedValue(value) {
  return String(value || "")
    .replace(/\s*[(\（][^)）]*[)\）]\s*$/g, "")
    .replace(/^["'"''"]+|["'"''"]+$/g, "")
    .trim();
}
