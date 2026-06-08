/**
 * 翻译功能：语言列表、文本提取、翻译数据构建、语言选择弹窗
 */
import { state } from "./state.js";
import { api, saveProject } from "./api.js";
import { showContentModal, showAppModal } from "./ui.js";
import { normalizeTerms, escapeHtml } from "./utils.js";
import { LABEL_KEYS, DEFAULT_LABELS } from "./quote-template.js";

let _renderEditorPage;

export function registerTranslateCallbacks({ renderEditorPage }) {
  _renderEditorPage = renderEditorPage;
}

/* ---- RTL 语言 ---- */

const RTL_LANGS = new Set(["ar", "he", "fa", "ur", "ku"]);

/* ---- 语言列表 ---- */

const LANGUAGES = [
  { code: "es", cn: "西班牙语", native: "Español" },
  { code: "pt-BR", cn: "葡萄牙语（巴西）", native: "Português (Brasil)" },
  { code: "fr", cn: "法语", native: "Français" },
  { code: "ru", cn: "俄语", native: "Русский" },
  { code: "ar", cn: "阿拉伯语", native: "العربية" },
  { code: "af", cn: "南非荷兰语", native: "Afrikaans" },
  { code: "sq", cn: "阿尔巴尼亚语", native: "Shqip" },
  { code: "hy", cn: "亚美尼亚语", native: "Հայերեն" },
  { code: "az", cn: "阿塞拜疆语", native: "Azərbaycan" },
  { code: "bn", cn: "孟加拉语", native: "বাংলা" },
  { code: "bg", cn: "保加利亚语", native: "Български" },
  { code: "ca", cn: "加泰罗尼亚语", native: "Català" },
  { code: "zh", cn: "中文（简体）", native: "简体中文" },
  { code: "zh-TW", cn: "中文（繁体）", native: "繁體中文" },
  { code: "hr", cn: "克罗地亚语", native: "Hrvatski" },
  { code: "cs", cn: "捷克语", native: "Čeština" },
  { code: "da", cn: "丹麦语", native: "Dansk" },
  { code: "nl", cn: "荷兰语", native: "Nederlands" },
  { code: "et", cn: "爱沙尼亚语", native: "Eesti" },
  { code: "fi", cn: "芬兰语", native: "Suomi" },
  { code: "ka", cn: "格鲁吉亚语", native: "ქართული" },
  { code: "de", cn: "德语", native: "Deutsch" },
  { code: "el", cn: "希腊语", native: "Ελληνικά" },
  { code: "gu", cn: "古吉拉特语", native: "ગુજરાતી" },
  { code: "he", cn: "希伯来语", native: "עברית" },
  { code: "hi", cn: "印地语", native: "हिन्दी" },
  { code: "hu", cn: "匈牙利语", native: "Magyar" },
  { code: "id", cn: "印尼语", native: "Bahasa Indonesia" },
  { code: "it", cn: "意大利语", native: "Italiano" },
  { code: "ja", cn: "日语", native: "日本語" },
  { code: "kk", cn: "哈萨克语", native: "Қазақ" },
  { code: "ko", cn: "韩语", native: "한국어" },
  { code: "ku", cn: "库尔德语", native: "Kurdî" },
  { code: "lv", cn: "拉脱维亚语", native: "Latviešu" },
  { code: "lt", cn: "立陶宛语", native: "Lietuvių" },
  { code: "ms", cn: "马来语", native: "Bahasa Melayu" },
  { code: "ml", cn: "马拉雅拉姆语", native: "മലയാളം" },
  { code: "mr", cn: "马拉地语", native: "मराठी" },
  { code: "mn", cn: "蒙古语", native: "Монгол" },
  { code: "no", cn: "挪威语", native: "Norsk" },
  { code: "fa", cn: "波斯语", native: "فارسی" },
  { code: "pl", cn: "波兰语", native: "Polski" },
  { code: "pt", cn: "葡萄牙语", native: "Português" },
  { code: "pa", cn: "旁遮普语", native: "ਪੰਜਾਬੀ" },
  { code: "ro", cn: "罗马尼亚语", native: "Română" },
  { code: "sr", cn: "塞尔维亚语", native: "Српски" },
  { code: "sk", cn: "斯洛伐克语", native: "Slovenčina" },
  { code: "sl", cn: "斯洛文尼亚语", native: "Slovenščina" },
  { code: "sw", cn: "斯瓦希里语", native: "Kiswahili" },
  { code: "sv", cn: "瑞典语", native: "Svenska" },
  { code: "ta", cn: "泰米尔语", native: "தமிழ்" },
  { code: "te", cn: "泰卢固语", native: "తెలుగు" },
  { code: "th", cn: "泰语", native: "ไทย" },
  { code: "tr", cn: "土耳其语", native: "Türkçe" },
  { code: "uk", cn: "乌克兰语", native: "Українська" },
  { code: "ur", cn: "乌尔都语", native: "اردو" },
  { code: "uz", cn: "乌兹别克语", native: "Oʻzbek" },
  { code: "vi", cn: "越南语", native: "Tiếng Việt" },
];

/* ---- 文本提取（与 buildTranslatedData 严格同步） ---- */

function extractTexts(data) {
  const texts = [];

  // 模板标签
  LABEL_KEYS.forEach(key => texts.push(DEFAULT_LABELS[key]));

  // quoteMeta
  texts.push(data.quoteMeta?.title || "");
  texts.push(data.quoteMeta?.date || "");
  texts.push(data.quoteMeta?.validity || "");

  // quoteItems
  for (const item of (data.quoteItems || [])) {
    texts.push(item.product?.enName || "");
    if (item.accessoryName) texts.push(item.accessoryName);

    if (item.type === "accessory" && Array.isArray(item.parameters)) {
      for (const p of item.parameters) {
        if (p.name) texts.push(p.name);
      }
    } else {
      for (const [key, value] of Object.entries(item.parameters || {})) {
        if (value === true) {
          texts.push(key);
        } else if (Array.isArray(value)) {
          texts.push(key);
          for (const v of value) if (v) texts.push(String(v));
        } else {
          texts.push(key);
          texts.push(String(value));
        }
      }
    }
    // pricing 不翻译：数量/单价是数字+固定单位
  }

  // terms
  if (data.terms) normalizeTerms(data.terms);
  for (const item of (data.terms?.items || [])) {
    texts.push(item.title || "");
    texts.push(item.content || "");
  }

  return texts;
}

/* ---- 构建翻译数据（与 extractTexts 严格同步） ---- */

function buildTranslatedData(original, allTranslations) {
  const numLabels = LABEL_KEYS.length;
  const labelTranslations = allTranslations.slice(0, numLabels);
  const textTranslations = allTranslations.slice(numLabels);

  const labels = {};
  LABEL_KEYS.forEach((key, i) => { labels[key] = labelTranslations[i]; });

  const data = structuredClone(original);
  let i = 0;

  function next(fallback) {
    return textTranslations[i++] || fallback;
  }

  data.quoteMeta.title = next(data.quoteMeta.title);
  data.quoteMeta.date = next(data.quoteMeta.date);
  data.quoteMeta.validity = next(data.quoteMeta.validity);

  for (const item of (data.quoteItems || [])) {
    item.product.enName = next(item.product?.enName || "");
    if (item.accessoryName) item.accessoryName = next(item.accessoryName);

    if (item.type === "accessory" && Array.isArray(item.parameters)) {
      item.parameters = item.parameters.map((p) => ({
        ...p,
        name: p.name ? next(p.name) : p.name
      }));
    } else {
      const newParams = {};
      for (const [key, value] of Object.entries(item.parameters || {})) {
        if (value === true) {
          newParams[next(key)] = true;
        } else if (Array.isArray(value)) {
          newParams[next(key)] = value.map(v => v ? next(String(v)) : v);
        } else {
          newParams[next(key)] = next(String(value));
        }
      }
      item.parameters = newParams;
    }

    // pricing 保持原始数字+单位，不翻译
  }

  if (data.terms) normalizeTerms(data.terms);
  for (const item of (data.terms?.items || [])) {
    item.title = next(item.title || "");
    item.content = next(item.content || "");
  }

  // 恢复不翻译字段
  data.from.company = original.from.company;
  data.to.company = original.to.company;
  data.footer.company = original.footer.company;

  return { labels, data };
}

/* ---- 语言选择弹窗 ---- */

function showLanguageSelector() {
  const currentLang = state.activeProject?.data?.translation?.lang;
  const langButtons = LANGUAGES.map(lang =>
    `<button type="button" class="lang-btn${lang.code === currentLang ? " active" : ""}" data-lang="${lang.code}" data-lang-rtl="${RTL_LANGS.has(lang.code) ? "1" : "0"}" data-search="${escapeHtml(lang.cn)} ${escapeHtml(lang.native)}"><strong>${escapeHtml(lang.cn)}</strong><span>${escapeHtml(lang.native)}</span></button>`
  ).join("");

  const body = `
    <div class="lang-selector">
      ${currentLang ? `<button type="button" class="lang-btn lang-btn-original" data-lang="" data-search="英文 English">English (Original)</button>` : ""}
      <input type="text" class="lang-search" placeholder="搜索语言（中文或原名）..." data-lang-search>
      <div class="lang-grid">${langButtons}</div>
    </div>
  `;

  return showContentModal({
    title: "选择翻译语言",
    className: "lang-modal",
    body,
    onMount(root, close) {
      const search = root.querySelector("[data-lang-search]");
      const grid = root.querySelector(".lang-grid");
      search?.focus();

      search?.addEventListener("input", () => {
        const query = search.value.toLowerCase();
        grid.querySelectorAll(".lang-btn").forEach(btn => {
          const match = btn.dataset.search.toLowerCase().includes(query) || btn.dataset.lang.toLowerCase().includes(query);
          btn.style.display = match ? "" : "none";
        });
      });

      root.querySelectorAll("[data-lang]").forEach(btn => {
        btn.addEventListener("click", () => {
          close({ code: btn.dataset.lang, rtl: btn.dataset.langRtl === "1" });
        });
      });
    }
  }).then(value => value === "cancel" || value === "close" ? null : value);
}

/* ---- 主翻译流程 ---- */

export async function translateQuote() {
  if (!state.activeProject) return;

  const result = await showLanguageSelector();
  if (!result) return;

  // 选择 English → 移除翻译
  if (!result.code) {
    removeTranslation();
    return;
  }

  const data = state.activeProject.data;
  const btn = document.querySelector("[data-translate]");
  const originalText = btn?.textContent || "";
  if (btn) btn.textContent = "翻译中...";

  try {
    const texts = extractTexts(data);
    const { translations } = await api("/api/translate", {
      method: "POST",
      body: { texts, targetLang: result.code }
    });

    const { labels, data: translatedData } = buildTranslatedData(data, translations);
    data.translation = {
      lang: result.code,
      rtl: result.rtl,
      labels,
      data: translatedData
    };

    _renderEditorPage();
    await saveProject();
  } catch (error) {
    if (btn) btn.textContent = originalText;
    await showAppModal({
      title: "翻译失败",
      message: error.message || "请检查网络连接后重试。",
      tone: "danger",
      actions: [{ label: "我知道了", value: "ok", variant: "primary" }]
    });
  }
}

export function removeTranslation() {
  if (!state.activeProject?.data?.translation) return;
  delete state.activeProject.data.translation;
  _renderEditorPage();
}

export function getTranslationLabel() {
  const translation = state.activeProject?.data?.translation;
  if (!translation) return "翻译";
  const lang = LANGUAGES.find(l => l.code === translation.lang);
  return lang ? `${lang.cn}` : translation.lang;
}
