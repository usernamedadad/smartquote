/**
 * 顶栏：HTML 生成 + 事件绑定（projects 和 editor 共用）
 */
import { state } from "./state.js";
import { escapeHtml } from "./utils.js";
import { saveProject, saveStateText, api } from "./api.js";
import { confirmUnsavedLeave } from "./ui.js";
import { translateIconSvg, pencilIconSvg } from "./icons.js";
import { translateQuote, getTranslationLabel } from "./translate.js";

let _renderLoginPage, _loadWorkspace, _renderProjectsPage, _renderEditorPage, _exportPdf;

export function registerTopbarCallbacks({ renderLoginPage, loadWorkspace, renderProjectsPage, renderEditorPage, exportPdf }) {
  _renderLoginPage = renderLoginPage;
  _loadWorkspace = loadWorkspace;
  _renderProjectsPage = renderProjectsPage;
  _renderEditorPage = renderEditorPage;
  _exportPdf = exportPdf;
}

export function topbarMarkup(scope) {
  const project = state.activeProject;
  return `
    <header class="app-topbar">
      <div class="topbar-brand">
        <span class="brand-lockup">
          <img src="/assets/logo-mark.png" alt="ZK">
          <strong>报价单编辑器</strong>
        </span>
        ${project ? `
          <i class="topbar-divider" aria-hidden="true"></i>
          <button class="ghost-button" data-back-projects>返回主页</button>
          <i class="topbar-divider" aria-hidden="true"></i>
          <span class="quote-number">当前项目：<span class="inline-rename" data-rename-current-project><b id="topbar-project-name">${escapeHtml(project.projectName)}</b><button class="inline-rename-pencil" title="修改项目名称">${pencilIconSvg()}</button></span></span>
        ` : ""}
      </div>
      <div class="topbar-actions">
        ${scope === "editor" ? `
          <span id="save-state" class="save-state">${saveStateText()}</span>
          <button class="ghost-button" data-save-project>保存报价单</button>
          <button class="ghost-button" data-translate>${translateIconSvg()} ${escapeHtml(getTranslationLabel())}</button>
          <button class="primary-button" data-export-pdf>导出 PDF</button>
          <i class="topbar-divider" aria-hidden="true"></i>
          <span class="topbar-username">${escapeHtml(state.user?.display_name || state.user?.username || "")}</span>
        ` : `
          <span class="topbar-username">${escapeHtml(state.user?.display_name || state.user?.username || "")}</span>
          <button class="ghost-button" data-logout>退出</button>
        `}
      </div>
    </header>
  `;
}

export function bindTopbar() {
  const logout = document.querySelector("[data-logout]");
  if (logout) {
    logout.addEventListener("click", async () => {
      if (!(await confirmUnsavedLeave())) return;
      await api("/api/logout", { method: "POST" });
      state.user = null;
      _renderLoginPage();
    });
  }

  const back = document.querySelector("[data-back-projects]");
  if (back) {
    back.addEventListener("click", async () => {
      if (!(await confirmUnsavedLeave())) return;
      await _loadWorkspace();
      _renderProjectsPage();
    });
  }

  const save = document.querySelector("[data-save-project]");
  if (save) save.addEventListener("click", saveProject);

  const pdf = document.querySelector("[data-export-pdf]");
  if (pdf) pdf.addEventListener("click", async () => { await _exportPdf(); });

  const translate = document.querySelector("[data-translate]");
  if (translate) translate.addEventListener("click", translateQuote);

  const renameWrap = document.querySelector("[data-rename-current-project]");
  if (renameWrap) {
    const pencil = renameWrap.querySelector(".inline-rename-pencil");
    pencil.addEventListener("click", () => {
      const project = state.activeProject;
      if (!project) return;
      const currentName = project.projectName || "";
      const nameEl = document.getElementById("topbar-project-name");
      const input = document.createElement("input");
      input.type = "text";
      input.value = currentName;
      input.className = "inline-rename-input";
      input.placeholder = "输入项目名称";
      nameEl.replaceWith(input);
      input.focus();
      input.select();
      pencil.style.display = "none";

      const finish = async (save) => {
        const newName = save ? input.value.trim() : currentName;
        input.replaceWith(nameEl);
        pencil.style.display = "";
        if (save && newName !== currentName) {
          nameEl.textContent = newName;
          await api(`/api/projects/${project.id}`, {
            method: "PUT",
            body: { projectName: newName }
          });
          project.projectName = newName;
        }
      };

      input.addEventListener("keydown", (e) => {
        if (e.key === "Enter") { e.preventDefault(); finish(true); }
        if (e.key === "Escape") finish(false);
      });
      input.addEventListener("blur", () => finish(true));
    });
  }
}
