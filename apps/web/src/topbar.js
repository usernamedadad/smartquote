/**
 * 顶栏：HTML 生成 + 事件绑定（projects 和 editor 共用）
 */
import { state } from "./state.js";
import { escapeHtml } from "./utils.js";
import { saveProject, saveStateText, api } from "./api.js";
import { confirmUnsavedLeave, showContentModal } from "./ui.js";
import { translateIconSvg } from "./icons.js";
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
          <span class="quote-number">当前项目：<b id="topbar-project-name" data-rename-current-project>${escapeHtml(project.projectName)}</b></span>
          <i class="topbar-divider" aria-hidden="true"></i>
          <span id="save-state" class="save-state">${saveStateText()}</span>
        ` : ""}
      </div>
      <div class="topbar-actions">
        ${scope === "editor" ? `
          <button class="ghost-button" data-back-projects>返回主页</button>
          <button class="ghost-button" data-save-project>保存报价单</button>
          <button class="ghost-button" data-translate>${translateIconSvg()} ${escapeHtml(getTranslationLabel())}</button>
          <button class="primary-button" data-export-pdf>导出 PDF</button>
          <i class="topbar-divider" aria-hidden="true"></i>
          <span>${escapeHtml(state.user?.displayName || "")}</span>
        ` : `
          <span>${escapeHtml(state.user?.displayName || "")}</span>
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

  const renameEl = document.querySelector("[data-rename-current-project]");
  if (renameEl) {
    renameEl.title = "点击修改项目名称";
    renameEl.addEventListener("click", async () => {
      const project = state.activeProject;
      if (!project) return;
      const name = await showContentModal({
        title: "修改项目名称",
        className: "project-name-modal",
        body: `
          <form class="project-name-form">
            <label class="field">
              <span>项目名称</span>
              <input name="projectName" value="${escapeHtml(project.projectName)}" placeholder="例如：斯里兰卡5T桥机报价">
            </label>
            <div class="project-name-actions">
              <button class="ghost-button" type="button" data-project-skip>清空名称</button>
              <button class="primary-button" type="submit">保存名称</button>
            </div>
          </form>
        `,
        onMount(root, close) {
          const input = root.querySelector("[name='projectName']");
          input.focus();
          input.select();
          root.querySelector("[data-project-skip]").addEventListener("click", () => close(""));
          root.querySelector("form").addEventListener("submit", (e) => {
            e.preventDefault();
            close(input.value.trim());
          });
        }
      });
      if (name === null) return;
      await api(`/api/projects/${project.id}`, {
        method: "PUT",
        body: { projectName: name }
      });
      project.projectName = name;
      const nameEl = document.getElementById("topbar-project-name");
      if (nameEl) nameEl.textContent = name;
    });
  }
}
