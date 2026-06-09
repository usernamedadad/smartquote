# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

SmartQuote 是河南中科起重公司的内部报价编辑器，供销售人员快速生成工业起重设备（钢丝绳葫芦、链条葫芦、桥式起重机等）的专业 PDF 报价单。采用三栏布局：模块导航 + 表单编辑 + 实时预览。

## Commands

```bash
npm run dev      # 开发模式（--watch 自动重启）
npm start        # 生产模式
```

无构建步骤、无测试、无 linter。要求 **Node.js >= 24**（依赖内置 `node:sqlite`）。

## Architecture

```
apps/web/index.html       # SPA 入口（<div id="app"> + ES module 加载 main.js）
apps/server/src/
  server.mjs          # HTTP 服务器，手动路由（if/else + regex），API 路由
  http-helpers.mjs    # HTTP 工具函数（readJson/sendJson/parseCookies/contentType 等）
  database.mjs        # SQLite schema（4表：users/sessions/projects/images），种子数据，项目/图片数据访问（含用户隔离）
  user-store.mjs      # 用户管理 CRUD + 用户管理 API 路由处理
  static-server.mjs   # 静态文件服务 + PDF 下载工具函数
  renderQuote.mjs     # Playwright PDF 导出（模板由 quote-template.js 共享）
apps/web/src/
  main.js             # 入口编排：boot() + 混合函数 + 回调注册
  state.js            # 全局 state 对象 + modules 数组（re-export quote-template 布局函数）
  api.js              # fetch 封装 + 纯 API 调用
  utils.js            # 纯工具函数（escapeHtml/setByPath/formatTime/normalizeProductParameters 等）
  quote-template.js   # 报价单 HTML 模板（预览 + PDF 共用，纯函数无浏览器/Node API 依赖）
  icons.js            # 所有 SVG 图标生成函数
  history.js          # 编辑历史：撤销/重做快照栈（MAX_UNDO_STEPS=50）
  ui.js               # 弹窗系统（showAppModal/confirmUnsavedLeave/showContentModal）
  bulk-import.js      # 批量导入解析（别名子串匹配/正则提取/值清洗/占位符）
  translate.js        # 翻译功能（语言列表、文本提取/回填、语言选择弹窗、翻译流程编排）
  topbar.js           # 顶栏 HTML + 事件绑定（projects 和 editor 共用，不含撤销/重做）
  views/
    login.js          # 登录页渲染
    projects.js       # 项目列表页渲染（含项目命名弹窗、admin 用户管理入口）
    profile.js        # 个人中心页（头像banner/联系方式编辑/密码修改）
    users.js          # 用户管理页渲染（仅 admin 可见）
    editor.js         # 编辑器外壳（三栏布局/侧栏/模块切换/预览控制/撤销重做/项目切换面板）
    editor-modules.js # 8 个模块表单 + bindEditorFields + 产品/图片操作
    preview.js        # 报价预览缩放/拖拽/markDirty（模板由 quote-template.js 生成）
  styles.css          # CSS 入口（@import 清单）
  css/                # 按业务拆分的 CSS 子文件
  product-previews/   # 6 种产品缩略图（SVG + PNG）
data/
  products.json       # 6 种产品目录及参数模板
templates/
  index.html          # 报价单 HTML 模板（1024×1536px 固定布局，仅供参考）
  logo.png            # 公司 logo
uploads/images/       # 用户上传图片存储
storage/              # SQLite 数据库（运行时生成）
```

### Module Dependency Graph

```
state.js  utils.js  icons.js  history.js            ← 零依赖叶子（state re-export quote-template）
    |         |         |         |
    v         v         v         v
quote-template.js ← utils       ← 纯函数，预览和 PDF 共用的模板
api.js ← state, history              bulk-import.js ← state, utils, icons
ui.js  ← state, utils, api           topbar.js ← state, utils, ui, api, history, icons, translate
translate.js ← state, api, ui, utils, quote-template             ← 翻译功能模块

views/preview.js       ← state, utils, history, quote-template
views/login.js         ← state, api → views/projects.js
views/profile.js       ← state, api, utils, ui（由 projects.js import）
views/users.js         ← state, api, utils, topbar, ui
views/editor.js        ← state, utils, icons, topbar, preview, editor-modules, quote-template, history, api
views/editor-modules.js ← state, utils, icons, ui, bulk-import, preview, projects

renderQuote.mjs ← quote-template, database     ← 服务端也导入 quote-template

main.js ← 以上所有（顶层编排，无人导入它）
```

循环依赖通过 `register*Callbacks()` 注入模式解决。**新增需要跨模块调用的函数时**，不要直接 import——在调用方声明 `let _fnName`，导出 `registerXxxCallbacks({ fnName })`，在 `main.js` 中注入。调用时用 `_fnName()` 而非原名。

### Key Design Decisions

- **零外部依赖**：package.json 无任何依赖，核心仅用 Node 24 内置模块
- **Playwright 可选**：PDF 导出在 Playwright 不可用时优雅降级
- **项目数据存储**：报价数据以 JSON 字符串存入 `data_json` 列（非关系型规范化），每次保存序列化整个数据对象
- **前端无框架**：全局 `state` 对象 + `innerHTML` 重渲染，无构建工具，ES modules 由浏览器原生加载。高频操作（字段输入）只刷新预览区（`markDirty()` → `renderQuotePreview()`），结构性操作（增删产品、切换模块）才全量重渲染（`_renderEditorPage()`），预览滚动位置在重渲染前后自动保存恢复
- **CSS 拆分**：`styles.css` 为 `@import` 清单，浏览器按需加载 `css/` 下子文件。报价单 CSS 拆为 `quote-sheet-layout.css`（布局框架）和 `quote-sheet-content.css`（价格/条款/画廊等），PDF 导出直接读取这两个文件，无需维护独立的 `templates/style.css`
- **图片上传**：通过 base64 data URL 在 JSON body 中传输（非 multipart），上限 16MB
- **报价编号格式**：`QT-YYYYMMDD-NNN`（日期 + 当日全局序号，取最大序号+重试防并发撞号）
- **API 错误信息**为中文，报价单输出为英文
- **图片画廊**：CSS Grid 自适应布局（根据图片数量：1 全宽 / 2 两列 / 3 上宽下两窄 / 4 两列两行 / 5-6 三列两行），行高 `auto`，图片按原始比例自然显示（`width: 100%; height: auto`）。用户只需选择图片 + 调整顺序，无手动定位。画廊 CSS 只需维护一处：`css/quote-sheet-content.css`（`renderQuote.mjs` 直接读取该文件用于 PDF 导出）。PDF 导出时通过覆盖规则去掉预览中的 figure 边框/背景
- **布局可定制**：报价单的 sections 和 parties 顺序可通过拖拽重排，存储在 `data.layout` 中
- **项目列表页**：三栏布局（侧栏导航 + 主区域 + 信息栏），顶部显示头像+名称+角色标签，卡片网格第一个为虚线框「+」新建卡片，后续为项目卡片（顶部真实报价单缩略预览 + 下方详细信息），右下角三点菜单含重命名/删除操作。`normalizeProjectListRow` 返回完整 `data` 字段供前端渲染预览和计算金额。侧栏不含帮助模块，底部仅有退出登录
- **个人中心页**（`views/profile.js`）：蓝色渐变 banner + 首字母头像 + 角色标签 → 统计卡片（项目数/图片数/登录账号）→ 联系方式表单（6 字段，2 列 grid）→ 密码修改表单。sales 用户可编辑自己的联系方式（`PUT /api/me/profile`），admin 只能在用户管理页编辑
- **配件序号**：配件卡片的序号圆圈为橙色（`.is-accessory .quote-item-no { background: #e8830c }`），产品为蓝色，视觉区分
- **包装条款差异化**：葫芦类（product_1~4）使用 `"Packed in strong plywood crate."`，桥机类（product_5~6）使用防水布+木板箱的长文本。创建项目时按默认产品类型选择（`server.mjs` 的 `getPackageText()`）；编辑器中产品增删/移动时 `syncPackageTerm()` 自动根据 `quoteItems[0]` 的类型更新 PACKAGE 条款

### User Isolation & Auth

- 默认账号：`admin` / `admin123`
- Session-based 认证：`randomBytes(32)` token → `sessions` 表 + `smartquote_session` HttpOnly cookie（30 天）
- 密码哈希：`SHA-256(salt:password)` 单次哈希（无迭代）
- **角色**：`admin` 管理用户、看所有数据；`sales` 只看自己的项目和图片 + 全局默认图片（`created_by IS NULL`）
- **数据隔离**：所有项目/图片查询函数接受 `userId` / `isAdmin` 参数，后端强制过滤
- **用户管理**：仅 admin 可在用户管理页创建/编辑/删除销售账号、重置密码，无开放注册。API 由 `user-store.mjs` 处理
- **用户联系方式**：users 表存储 `display_name` + 6 个联系方式字段（company/contact_name/whatsapp/email_contact/website/phone），admin 在用户管理页填写，sales 在个人中心自行编辑。前端直接使用数据库字段名（`state.user.display_name`，非驼峰）。创建新项目时 `createDefaultProjectData(product, user)` 从当前用户联系方式填充 `from` 和 `footer`，字段为空时 fallback 到默认值（Krystal 的信息）。个人中心保存后需手动更新 banner/顶栏 DOM（不会自动重渲染）

### Frontend State & Data Binding

`state` 对象驱动视图切换（`state.view`）：`login` → `projects` → `editor`（`users` 为 admin 专用视图）

编辑器有 8 个模块（`state.activeModule`）：`basic`、`company`、`customer`、`parameters`、`images`、`pricing`、`terms`、`footer`

数据绑定通过 HTML 属性实现：
- `data-path="quoteMeta.quoteNo"` — 点号路径映射到 state，`input` 事件自动调用 `setByPath()` 更新
- `data-param` / `data-param-value` / `data-param-checkbox` / `data-param-array` — 产品参数字段绑定
- 每次编辑触发 `markDirty()` → 快照入栈 + 预览重渲染

### Undo/Redo

`history.js` 维护 `state.undoStack`（JSON 快照栈，上限 50 步）和 `state.originalProjectData`（打开项目时的初始状态）。`markDirty()` 在每次数据变更时自动调用 `recordUndoSnapshot()`。撤销/重做按钮位于预览面板工具栏左侧（非顶部栏），分别调用 `undoLastChange()` 和 `restoreOriginalProjectData()`。

### API Routes

认证：除 `POST /login` 和 `GET /me` 外，所有 API 需 `smartquote_session` cookie。

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/login` | 登录，设 HttpOnly cookie |
| GET | `/api/me` | 当前用户（未登录返回 null） |
| PUT | `/api/me/profile` | 修改自己的联系方式和显示名称（需登录，body 驼峰如 `displayName`，返回的 `user` 对象为数据库下划线字段） |
| POST | `/api/logout` | 登出 |
| GET/POST | `/api/users` | 用户列表 / 创建用户（仅 admin） |
| PUT/DELETE/POST | `/api/users/:id` | 修改用户 / 删除用户 / 重置密码（仅 admin） |
| GET | `/api/products` | 产品目录（来自 products.json） |
| GET/POST/DELETE | `/api/images` `[/:id]` | 图片管理（按用户隔离，admin 看全部） |
| GET/POST | `/api/projects` | 项目列表（按用户隔离）/ 创建项目 |
| GET/PUT/DELETE | `/api/projects/:id` | 单项目 CRUD（验证归属，PUT 支持 `data` 更新或 `projectName` 重命名） |
| POST | `/api/projects/:id/duplicate` | 复制项目（验证源项目归属，新报价编号） |
| GET | `/api/projects/:id/pdf` | Playwright PDF 导出（验证归属） |
| GET | `/api/projects/:id/html` | 独立 HTML 导出（验证归属） |
| POST | `/api/translate` | 批量翻译文本（需登录，body: `{texts, targetLang}`，调用 Google Translate 免费接口） |

新增 API 需在 `server.mjs` 的 `handleApi()` 中按顺序插入 if/else 分支。

## Development Notes

- 产品参数为自由 key-value，不同产品类型字段不同（参见 `data/products.json`）。`utils.js` 的 `normalizeProductParameters()` 在打开项目时对特殊参数做规范化（如 "included" 类标记转为 `true`）
- **产品+配件模型**：`quoteItems` 数组中的条目分两种类型（`type` 字段）：
  - `"product"`：主产品，可上移/下移/删除/添加配件，删除时连带其配件
  - `"accessory"`：配件，通过 `parentId` 绑定父产品，不可独立移动，紧跟父产品排列
  - 配件卡片样式不同（虚线边框 + "配件"标签），名称可编辑（`accessoryName` 字段）
  - **配件参数结构为数组**：`parameters: [{ name, quantity, unitPrice, lineTotal, unit }]`，每个参数行有独立的数量/单价/行总价/单位。旧格式 `{key: true}` 对象在 `normalizeQuoteItem` 中自动迁移
  - **配件每行参数独立单位**：每个参数行有自己的 `unit` 字段，默认为空（无兜底 `"set"`）。空单位时数量/单价无后缀；有单位时**数量**后缀遵循复数规则（qty=1 → `/unit`，qty>1 → `/units`），**单价**后缀始终用单数形式（`/unit`，不加 s）。单位输入框聚焦时下方显示快捷选项列表（`data-unit-pick`）
  - **配件卡片级定价已移除**：pricing 只保留 `totalAmount`（由 `recalcAccessoryTotal()` 汇总参数行总价，用于报价总价汇总），不再有卡片级 `quantity`/`unitPrice`
  - `buildItemGroups()` 将扁平数组分组（产品+其配件），移动/删除按组操作
  - 报价单中配件行为多行结构：主行只显示名称（最右列留空），子行显示各参数的数量/单价/行总价（含 `$` 前缀）
- **产品选择逻辑**：产品条上的卡片支持点击切换——点击未选中的产品添加到清单（按添加顺序自动编号），点击已选中的产品移除及其配件。允许空产品列表（新建项目仍默认预置欧式葫芦）。点击产品后自动滚动到对应序号卡片（补偿 sticky 产品条高度，`.module-editor.scrollTo()`）
- **预览→编辑区导航优化**：`switchToModule` 在同模块时跳过 `renderEditorPage()` 全量重渲染——同模块无 `itemIndex` 直接返回，有 `itemIndex` 时仅滚动到目标卡片。跨模块时才重渲染 + 滚动
- 数量/单价输入框仅允许纯数字输入（`inputmode="decimal"`）。**产品**数量后缀动态：1 → `/set`，>1 → `/sets`；单价固定 `/set`。**配件**每行参数有独立 `unit` 字段（默认空），数量后缀为空时不显示，有单位时 qty=1 → `/unit`，qty>1 → `/units`（加 s 复数）；单价后缀有单位时始终为 `/unit`（单数，不加 s）
- **价格列 `$` 对齐**：报价单中 Total Amount 列和 Summary 行（SUBTOTAL/FREIGHT/TOTAL）的数值使用 `text-align: left; padding-left: 20px`，确保所有 `$` 符号在同一竖线上对齐。Summary grid 为 `1fr 147px`（147px 精确匹配 Total Amount 列宽）。三处 CSS 同步
- **TOTAL 可编辑**：Pricing 模块的 TOTAL 字段可编辑。启用 Subtotal + Freight 时，编辑 TOTAL 会反算 FREIGHT（`recalcFreightFromTotal`）；未启用时 TOTAL 直接使用用户输入值
- **配件序号颜色**：配件序号圆圈为橙色（`#e8830c`），产品为蓝色（`#1f5bd6`），通过 `.is-accessory .quote-item-no` 覆盖
- 报价单中所有产品/配件分项之间通过 `product-row-separated` 类添加双线分隔（`border-top: 2px double #1d1d1d`）
- 报价单模板统一在 `quote-template.js`（纯函数模块，无浏览器/Node API），预览和 PDF 共用 `quoteBodyMarkup(data, images, params, options)`。差异通过 `options` 参数处理：`imageSrc`（图片路径）、`draggable`（拖拽属性）、`logoSrc`、`galleryClasses`、`heroTitleFallback`、`labels`（翻译后的模板标签覆盖默认英文标签）
- `quote-template.js` 导出 `LABEL_KEYS`（18 个标签 key 数组）和 `DEFAULT_LABELS`（默认英文标签值），翻译时标签与数据文本一起批量发送给翻译 API，翻译结果存入 `translation.labels`。渲染时 `quoteBodyMarkup` 内部合并 `options.labels` 与 `DEFAULT_LABELS`
- 画廊渲染使用 CSS Grid（`gallery-1` 到 `gallery-6` 类名控制列数），行高 `auto` 图片按原始比例自然显示。样式维护两处：`css/quote-sheet-content.css`（浏览器预览，`renderQuote.mjs` 直接读取用于 PDF 导出）和 `templates/style.css`（独立 HTML 模板）。PDF 导出时覆盖去掉 figure 的边框/背景/圆角
- 项目列表卡片为 3 列纵向布局，顶部显示真实报价单缩略预览（CSS `transform: scale(0.26)` + `contain: layout paint`），下方显示标题/客户/编号/产品/金额/时间，右下角三点菜单。`database.mjs` 的 `normalizeProjectListRow` 返回完整 `data` 字段供前端计算金额和渲染预览
- `state.js` 的 `normalizeQuoteLayout` / `defaultQuoteSectionOrder` / `defaultPartyOrder` 已迁移至 `quote-template.js`，`state.js` 通过 re-export 保持向后兼容
- 预览通过 CSS `transform: scale(state.zoom)` 缩放，原始尺寸 1024×1536px
- 唯一运行时配置：`PORT` 环境变量（默认 5173）
- 数据库使用 Node 24 同步 API（`DatabaseSync`、`db.prepare().get()` / `.all()` / `.run()`）
- `user-store.mjs` 通过 `initUserStore(db, hashPassword)` 注入数据库实例和密码哈希函数，由 `database.mjs` 的 `initDatabase()` 调用
- `ui.js` 的 `showContentModal()` 用于需要自定义 HTML 内容的弹窗（项目命名、图库浏览、用户管理等），通过 `onMount(root, close)` 回调绑定内部事件
- **项目切换面板**：预览工具栏右侧"项目切换"按钮触发右侧滑入面板（宽 45vw），2 列卡片网格，每张卡片含缩略预览+项目信息。hover 时预览变灰+中央显示"使用"。`editor.js` 中的 `openProjectSwitchPanel()` 调用 `loadWorkspace()` 刷新数据后渲染，`switchCardMarkup()` 复用 `quoteBodyMarkup` 生成缩略图，`scaleSwitchPreviews()` 动态计算缩放比
- **图片管理滚动**：`.selected-images` 和 `.choose-grid` 设有 `max-height: 280px` + `overflow-y: auto` + 隐藏滚动条，图片多时可鼠标滚轮浏览。**CSS Grid 嵌套场景中此方案失效**——子元素的 `height` + `overflow-y: auto` 不产生约束（grid 行根据内容自动扩展），必须用普通 `display: block` 包裹容器做滚动层（参见 `editor.css` 的 `.sidebar-asset-scroll`、`.project-switch-scroll`）
- **产品条布局**：`.product-strip` 使用 `repeat(6, 1fr)` 均分 6 张产品卡片，无横向滚动。参数编辑模块中产品条用 `.product-strip-sticky`（`position: sticky; top: 0`）固定在编辑区顶部，滚动参数列表时始终可见。`.editor-card` 已去掉 `overflow: hidden` 以允许 sticky 生效，滚动由外层 `.module-editor` 控制
- **预览区行内编辑**：`options.interactive` 为 true 时，报价单模板支持在预览区直接编辑数据：
  - **产品自定义参数**：`__custom_` 前缀参数渲染为 `<input class="pe-param-input">`（可见输入框），内置参数保持纯文本。`+ Param` 浮动按钮添加新参数
  - **配件可编辑行**：`_new` 标记的配件参数行渲染为卡片行（`.pe-new-row`），内部用下划线输入框（`.pe-line-input`）编辑名称/数量/单位/单价。添加配件时自动预置一个 `_new` 参数行
  - **日期选择器**：报价日期旁显示日历图标（`.pe-date-icon`），点击触发隐藏的 `<input type="date">`，选完后转为英文长格式存储（如 `"June 9, 2025"`）。编辑区和预览区均有此功能
  - **quietDirty()**：输入事件中调用，更新 dirty 标记和删除翻译但不触发预览重渲染（防输入框失焦）。`blur` 事件中调用 `_refreshEditor()` 同步编辑区
  - **靶向 DOM 更新**：`updateLineTotalCell()` / `updateSummaryCells()` 直接更新依赖值，不做全量重渲染
  - **`_refreshEditor` 回调**：通过 `registerPreviewCallbacks` 注入 `renderEditorPage`，预览区编辑失焦后刷新编辑区面板
  - **`normalizeAccessoryParameters`** 保留 `_new` 标记：`...(p._new ? { _new: true } : {})`，防止规范化时丢失
  - CSS 统一用 `pe-` 前缀（preview-edit），属性用 `data-edit-` 前缀。样式在 `css/preview.css`

### Common Development Patterns

**新增 API 路由**：在 `server.mjs` 的 `handleApi()` 中按顺序插入 if/else 分支。涉及用户隔离的查询必须传 `user.id` 和 `user.role === "admin"`。

**新增编辑器模块**：在 `state.js` 的 `modules` 数组添加条目 → 在 `editor-modules.js` 添加表单 HTML 和 `bindEditorFields` 逻辑 → 在 `quote-template.js` 的 `quoteSectionMarkup` 添加新区块渲染。

**修改报价单布局**：只改 `quote-template.js`，预览和 PDF 自动同步。不要改 `preview.js` 或 `renderQuote.mjs` 中的模板逻辑。

**新增跨模块调用**：调用方声明 `let _fnName`，导出 `registerXxxCallbacks({ fnName })`，在 `main.js` 中注入。不要直接 import。

**新增数据库查询**：函数签名必须包含 `userId` 和 `isAdmin` 参数。admin 路径不加 `WHERE created_by = ?`，sales 路径加 `WHERE created_by = ?` 或 `WHERE created_by IS NULL OR created_by = ?`（需要包含全局资源时）。

**新增数据库写操作**：涉及多步写操作（读后写、先删 A 再删 B 等）必须用 `withTransaction(fn)` 包裹。如需在 `user-store.mjs` 中使用，通过 `initUserStore` 第三参数获取。

**固定高度滚动容器**：在 CSS Grid 嵌套场景中（grid 内套 grid），子元素的 `height` + `overflow-y: auto` 不生效——grid 行会根据内容自动扩展忽略固定高度。解决方案是在 grid 和滚动内容之间插入一个普通 `display: block` 包裹容器，在 block 容器上设 `height` + `overflow-y: auto`。单层 grid 不受此影响，`grid-template-rows` 固定行 + `min-height: 0; overflow-y: auto` 通常有效。已有实例：`.sidebar-asset-scroll`（编辑器侧栏图片网格）、`.project-switch-scroll`（项目切换面板）。

**项目主页三栏布局**：`.project-dashboard` 使用 `height: 100vh`（非 `min-height`）固定视口，`.home-main` 设 `overflow-y: auto` 内部滚动。右侧 `.home-info` 用 `grid-template-rows: 1fr auto auto` 保证三个卡片位置固定，"最近编辑"列表在 `1fr` 行内滚动。

## Data Safety

- **SQLite WAL 模式**：`initDatabase()` 中 `PRAGMA journal_mode=WAL`，提升并发读写性能
- **自动备份**：启动时备份一次 + 每 6 小时定时备份，使用 `VACUUM INTO` 生成独立一致副本至 `storage/backups/`，保留最近 7 份（`backupDatabase()`）
- **事务保护**：`database.mjs` 的 `withTransaction(fn)` 工具函数（手动 `BEGIN`/`COMMIT`/`ROLLBACK`），包裹 createProject/updateProject/renameProject/migrateProjectNames/deleteUser 等多步操作。`user-store.mjs` 通过 `initUserStore(db, hashPassword, withTransaction)` 获取事务函数
- **Session 过期清理**：启动时清理一次 + 每 24 小时定时清理，删除 `sessions` 表中超过 30 天的记录（`cleanExpiredSessions()`）
- **数据容错**：前端 `sanitizeProjectData(data)` 在 `openProject` 中补齐缺失的顶层字段（quoteMeta/from/to/footer/pricing/terms/quoteItems 等），防止旧数据或损坏数据导致白屏。后端 `parseJson()` 解析失败返回空对象
- **全局错误捕获**：前端 `window.onerror` + `unhandledrejection` 通过 `showToast` 显示红色提示（非白屏）；后端 `uncaughtException` 直接 `process.exit(1)` 防止状态不一致
- **保存反馈**：`saveProject()` 成功显示绿色 toast "保存成功"，失败显示红色 toast "保存失败，请重试"
- **未保存保护**：`window.beforeunload` 检测 `state.dirty` 时阻止关闭/刷新
- **安全响应头**：所有响应添加 `X-Content-Type-Options: nosniff` 和 `X-Frame-Options: DENY`
- **前端弹窗**：统一使用 `showToast(message, { tone })` 显示反馈（成功绿色/错误红色），不使用浏览器原生 `alert()`/`confirm()`。需要用户确认的操作使用 `showAppModal()`
- **数据库备份**：`VACUUM INTO` 要求目标文件不存在，`backupDatabase()` 在同秒重启时会撞名，已在写入前用 `existsSync` + `unlinkSync` 清除同名文件

### 项目数据规范化链

打开项目时依次执行，任何环节出问题都不会崩溃：

```
sanitizeProjectData()  → 补齐缺失顶层字段
  → normalizeQuoteLayout()  → sections/parties 排序
  → normalizeQuoteItems()   → 产品/配件结构规范化 + 定价计算
  → normalizeTerms()        → 条款 items 数组
  → normalizeGalleryLayout() → 画廊布局规范化
```

## Translation System

- **翻译流程**：编辑好英文报价 → 点击翻译按钮选择语言 → 预览切换为翻译版本 → 导出 PDF
- **数据存储**：翻译结果存在 `project.data.translation` 中，结构为 `{ lang, rtl, labels, data }`。`data` 是原始数据的深拷贝（文本字段已翻译），`labels` 是 18 个模板标签的翻译。保存项目时翻译一并持久化
- **渲染逻辑**：三处渲染（`preview.js`、`projects.js`、`renderQuote.mjs`）统一模式：`translation?.data || data` 作为渲染数据，`translation?.labels` 作为标签，RTL 语言加 `dir="rtl"`
- **不翻译字段**：`from.company`、`to.company`、`footer.company`（logo 和双方公司名称不变）
- **编辑清翻译**：`markDirty()` 检测到 `data.translation` 存在时自动删除，用户需重新翻译
- **翻译引擎**：服务端 `batchTranslate()` 调用 Google Translate 免费接口（`translate.googleapis.com`），并发 5，单次超时 5 秒，翻译失败返回原文
- **文本同步**：`translate.js` 的 `extractTexts()` 和 `buildTranslatedData()` 必须严格同步——遍历数据的顺序完全一致，通过递增索引一一对应
- **不翻译 pricing**：产品 `quantity` 和 `unitPrice` 是数字+固定单位（`/set`），不送翻译 API。配件参数行的 `quantity`/`unitPrice`/`lineTotal` 也不翻译，只翻译参数 `name`
- **RTL 语言**：阿拉伯语(ar)、希伯来语(he)、波斯语(fa)、乌尔都语(ur)、库尔德语(ku)。`renderQuote.mjs` 中有 RTL CSS 注入，浏览器预览通过 `dir="rtl"` 属性处理

## PDF Export

- **CSS 一致性**：`renderQuote.mjs` 的 `quoteExportCss()` 直接读取 `css/quote-sheet-layout.css` + `css/quote-sheet-content.css` 生成 PDF 样式，浏览器预览和 PDF 导出共用同一份 CSS，无需多处同步。PDF 额外覆盖去掉画廊 figure 的边框/背景/圆角（预览中的边框仅用于布局定义）
- **输出策略**：`measureContentHeight()` 测量内容实际高度，PDF 页面高度取 `max(1536, contentHeight)`，确保内容不截断；内容 ≤ 1536px 时仍为标准单页尺寸
- **翻译容器弹性高度**：所有承载翻译文本的容器使用 `min-height` 而非固定 `height`（`.meta-row`、`.pricing-table thead th`、`.terms-box`、`.footer-text`、`.summary-line`），确保翻译后文本换行时容器自动撑高不溢出
