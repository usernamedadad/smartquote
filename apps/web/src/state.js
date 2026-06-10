/**
 * 全局状态、模块配置、布局常量
 */

export const state = {
  user: null,
  products: [],
  projects: [],
  images: [],
  activeProject: null,
  activeModule: "basic",
  view: "login",
  zoom: 0.62,
  dirty: false,
  saving: false,
  undoStack: [],
  originalProjectData: null,
  draggingImageId: null,
  previewDrag: null,
  sidebarCollapsed: false,
  sidebarMotion: false,
  purePreview: false
};

export const modules = [
  { id: "basic", label: "报价单标题", icon: "title" },
  { id: "company", label: "公司信息", icon: "company" },
  { id: "customer", label: "客户信息", icon: "customer" },
  { id: "parameters", label: "产品参数", icon: "parameters" },
  { id: "images", label: "产品图片", icon: "image" },
  { id: "pricing", label: "产品价格", icon: "price" },
  { id: "terms", label: "条款和条件", icon: "terms" },
  { id: "footer", label: "页脚信息", icon: "footer" }
];

export { normalizeQuoteLayout, defaultQuoteSectionOrder, defaultPartyOrder } from "./quote-template.js";

export const app = document.querySelector("#app");
