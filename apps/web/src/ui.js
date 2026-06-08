/**
 * UI 弹窗：模态框、未保存确认
 */
import { state } from "./state.js";
import { escapeHtml } from "./utils.js";
import { saveProject } from "./api.js";
import { modalIconSvg } from "./icons.js";

export function showAppModal({ title, message, tone = "default", actions = [] }) {
  return new Promise((resolve) => {
    const root = document.createElement("div");
    root.className = "app-modal-root";
    root.innerHTML = `
      <div class="app-modal-backdrop" data-modal-cancel></div>
      <section class="app-modal app-modal-${tone}" role="dialog" aria-modal="true" aria-labelledby="app-modal-title">
        <div class="app-modal-mark" aria-hidden="true">${modalIconSvg(tone)}</div>
        <div class="app-modal-content">
          <h2 id="app-modal-title">${escapeHtml(title)}</h2>
          <p>${escapeHtml(message)}</p>
        </div>
        <div class="app-modal-actions">
          ${actions.map((action) => `
            <button class="modal-button modal-button-${action.variant || "secondary"}" type="button" data-modal-action="${escapeHtml(action.value)}">
              ${escapeHtml(action.label)}
            </button>
          `).join("")}
        </div>
      </section>
    `;

    const close = (value) => {
      document.removeEventListener("keydown", onKeydown);
      root.remove();
      resolve(value);
    };

    const onKeydown = (event) => {
      if (event.key === "Escape") close("cancel");
    };

    root.querySelectorAll("[data-modal-action]").forEach((button) => {
      button.addEventListener("click", () => close(button.dataset.modalAction));
    });
    root.querySelector("[data-modal-cancel]").addEventListener("click", () => close("cancel"));
    document.addEventListener("keydown", onKeydown);
    document.body.appendChild(root);
    root.querySelector("[data-modal-action]")?.focus();
  });
}

export function showContentModal({ title, body, className = "", onMount }) {
  return new Promise((resolve) => {
    const root = document.createElement("div");
    root.className = "app-modal-root";
    root.innerHTML = `
      <div class="app-modal-backdrop" data-modal-cancel></div>
      <section class="content-modal ${className}" role="dialog" aria-modal="true" aria-labelledby="content-modal-title">
        <header class="content-modal-header">
          <h2 id="content-modal-title">${escapeHtml(title)}</h2>
          <button class="content-modal-close" type="button" aria-label="关闭" data-modal-cancel>×</button>
        </header>
        <div class="content-modal-body">${body}</div>
      </section>
    `;

    const close = (value = "close") => {
      document.removeEventListener("keydown", onKeydown);
      root.remove();
      resolve(value);
    };

    const onKeydown = (event) => {
      if (event.key === "Escape") close("cancel");
    };

    root.querySelectorAll("[data-modal-cancel]").forEach((button) => {
      button.addEventListener("click", () => close("cancel"));
    });
    document.addEventListener("keydown", onKeydown);
    document.body.appendChild(root);
    onMount?.(root, close);
    root.querySelector(".content-modal-close")?.focus();
  });
}

export async function confirmUnsavedLeave() {
  if (!state.dirty) return true;

  const action = await showAppModal({
    title: "离开当前报价单？",
    message: "当前报价单有未保存的更改。你可以先保存，也可以不保存直接离开。",
    tone: "warning",
    actions: [
      { label: "保存并离开", value: "save", variant: "primary" },
      { label: "不保存离开", value: "discard", variant: "danger" },
      { label: "继续编辑", value: "cancel", variant: "secondary" }
    ]
  });

  if (action === "save") {
    await saveProject();
    return true;
  }

  if (action === "discard") {
    state.dirty = false;
    return true;
  }

  return false;
}

/* ---- Toast 提示 ---- */

let _toastTimer = 0;

export function showToast(message, { tone = "success" } = {}) {
  clearTimeout(_toastTimer);
  document.querySelector("#app-toast")?.remove();

  const colors = {
    success: { bg: "#ecfdf5", text: "#065f46", border: "#a7f3d0" },
    error: { bg: "#fef2f2", text: "#991b1b", border: "#fecaca" }
  };
  const c = colors[tone] || colors.success;

  const toast = document.createElement("div");
  toast.id = "app-toast";
  toast.textContent = message;
  Object.assign(toast.style, {
    position: "fixed", bottom: "24px", left: "50%", transform: "translateX(-50%)",
    padding: "10px 22px", borderRadius: "8px",
    background: c.bg, color: c.text, border: `1px solid ${c.border}`,
    fontSize: "14px", fontWeight: "600", zIndex: "9999",
    boxShadow: "0 4px 12px rgba(0,0,0,0.1)"
  });
  document.body.appendChild(toast);
  _toastTimer = setTimeout(() => toast.remove(), 3000);
}
