/**
 * 用户管理页（仅 admin 可见）
 */
import { state, app } from "../state.js";
import { listUsers, createUserAccount, updateUserAccount, deleteUserAccount, resetUserPassword } from "../api.js";
import { escapeHtml } from "../utils.js";
import { topbarMarkup, bindTopbar } from "../topbar.js";
import { showAppModal, showContentModal } from "../ui.js";

let _renderProjectsPage;
let _cachedUsers = [];

export function registerUsersCallbacks({ renderProjectsPage }) {
  _renderProjectsPage = renderProjectsPage;
}

export async function renderUsersPage() {
  state.view = "users";
  const users = await listUsers();
  _cachedUsers = users;
  const isAdmin = state.user?.role === "admin";

  if (!isAdmin) {
    _renderProjectsPage();
    return;
  }

  app.innerHTML = `
    <main class="app-shell">
      ${topbarMarkup("projects")}
      <section class="user-page">
        <div class="section-header">
          <div>
            <p class="eyebrow">User Management</p>
            <h2>用户管理</h2>
          </div>
          <div class="section-actions">
            <button class="ghost-button" data-back-projects>返回项目列表</button>
            <button class="primary-button" data-create-user>添加销售</button>
          </div>
        </div>
        <div class="user-table">
          ${users.map(userRowMarkup).join("")}
        </div>
      </section>
    </main>
  `;

  bindTopbar();
  bindUserPageEvents();
}

function userRowMarkup(user) {
  const isSelf = user.id === state.user.id;
  const roleLabel = user.role === "admin" ? "管理员" : "销售";

  return `
    <article class="user-row">
      <div class="user-info">
        <strong>${escapeHtml(user.display_name)}</strong>
        <span>${escapeHtml(user.username)}</span>
      </div>
      <span class="user-role ${user.role}">${roleLabel}</span>
      <span class="user-time">${formatUserTime(user.created_at)}</span>
      <div class="row-actions">
        ${isSelf
          ? `<span class="user-self-badge">当前账号</span>`
          : `
            <button class="ghost-button" data-edit-user="${user.id}">编辑</button>
            <button class="ghost-button" data-reset-password="${user.id}">重置密码</button>
            <button class="icon-button danger" data-delete-user="${user.id}" title="删除">×</button>
          `
        }
      </div>
    </article>
  `;
}

function bindUserPageEvents() {
  document.querySelector("[data-back-projects]")?.addEventListener("click", () => {
    _renderProjectsPage();
  });
  document.querySelector("[data-create-user]")?.addEventListener("click", openCreateUserModal);

  document.querySelectorAll("[data-edit-user]").forEach((btn) => {
    btn.addEventListener("click", () => openEditUserModal(Number(btn.dataset.editUser)));
  });
  document.querySelectorAll("[data-reset-password]").forEach((btn) => {
    btn.addEventListener("click", () => openResetPasswordModal(Number(btn.dataset.resetPassword)));
  });
  document.querySelectorAll("[data-delete-user]").forEach((btn) => {
    btn.addEventListener("click", () => confirmDeleteUser(Number(btn.dataset.deleteUser)));
  });
}

/* ---- 弹窗操作 ---- */

function openCreateUserModal() {
  showContentModal({
    title: "添加销售账号",
    className: "project-name-modal",
    body: userFormBody({ username: "", displayName: "", password: "",
      company: "", contactName: "", whatsapp: "", emailContact: "", website: "", phone: ""
    }, "创建账号"),
    onMount(root, close) {
      const form = root.querySelector(".user-form");
      form.addEventListener("submit", async (event) => {
        event.preventDefault();
        const fd = new FormData(form);
        try {
          await createUserAccount({
            username: fd.get("username"),
            password: fd.get("password"),
            displayName: fd.get("displayName"),
            role: "sales",
            company: fd.get("company"),
            contactName: fd.get("contactName"),
            whatsapp: fd.get("whatsapp"),
            emailContact: fd.get("emailContact"),
            website: fd.get("website"),
            phone: fd.get("phone")
          });
          close("ok");
          renderUsersPage();
        } catch (err) {
          showFormError(form, err.message);
        }
      });
      form.querySelector("[name='username']").focus();
    }
  });
}

function openEditUserModal(userId) {
  showContentModal({
    title: "编辑用户信息",
    className: "project-name-modal",
    body: userEditBody(userId, "保存"),
    onMount(root, close) {
      const form = root.querySelector(".user-form");
      form.addEventListener("submit", async (event) => {
        event.preventDefault();
        const fd = new FormData(form);
        try {
          await updateUserAccount(userId, {
            displayName: fd.get("displayName"),
            role: fd.get("role"),
            company: fd.get("company"),
            contactName: fd.get("contactName"),
            whatsapp: fd.get("whatsapp"),
            emailContact: fd.get("emailContact"),
            website: fd.get("website"),
            phone: fd.get("phone")
          });
          close("ok");
          renderUsersPage();
        } catch (err) {
          showFormError(form, err.message);
        }
      });
      form.querySelector("[name='displayName']").focus();
    }
  });
}

function openResetPasswordModal(userId) {
  showContentModal({
    title: "重置密码",
    className: "project-name-modal",
    body: `
      <form class="project-name-form user-form">
        <label class="field">
          <span>新密码</span>
          <input name="password" type="password" placeholder="请输入新密码" required>
        </label>
        <div class="project-name-actions">
          <button class="ghost-button" type="button" data-modal-cancel>取消</button>
          <button class="primary-button" type="submit">确认重置</button>
        </div>
      </form>
    `,
    onMount(root, close) {
      const form = root.querySelector(".user-form");
      form.addEventListener("submit", async (event) => {
        event.preventDefault();
        const fd = new FormData(form);
        try {
          await resetUserPassword(userId, fd.get("password"));
          close("ok");
          renderUsersPage();
        } catch (err) {
          showFormError(form, err.message);
        }
      });
      form.querySelector("[name='password']").focus();
    }
  });
}

async function confirmDeleteUser(userId) {
  const action = await showAppModal({
    title: "确认删除用户？",
    message: "删除后该用户将无法登录，但其创建的项目和图片会保留。",
    tone: "danger",
    actions: [
      { label: "确认删除", value: "delete", variant: "danger" },
      { label: "取消", value: "cancel", variant: "secondary" }
    ]
  });
  if (action === "delete") {
    await deleteUserAccount(userId);
    renderUsersPage();
  }
}

/* ---- 工具函数 ---- */

function contactFieldsMarkup({ company = "", contactName = "", whatsapp = "", emailContact = "", website = "", phone = "" }) {
  const e = escapeHtml;
  return `
    <p class="field-group-label">联系方式（用于报价单自动填充）</p>
    <label class="field">
      <span>公司名</span>
      <input name="company" value="${e(company)}" placeholder="例如：Henan Zoke Crane Co., Ltd.">
    </label>
    <label class="field">
      <span>联系人姓名</span>
      <input name="contactName" value="${e(contactName)}" placeholder="例如：Krystal">
    </label>
    <label class="field">
      <span>WhatsApp</span>
      <input name="whatsapp" value="${e(whatsapp)}" placeholder="例如：+86 16609015589">
    </label>
    <label class="field">
      <span>邮箱</span>
      <input name="emailContact" value="${e(emailContact)}" placeholder="例如：krystal@zkhoist.com">
    </label>
    <label class="field">
      <span>网站</span>
      <input name="website" value="${e(website)}" placeholder="例如：www.zkhoist.com">
    </label>
    <label class="field">
      <span>电话</span>
      <input name="phone" value="${e(phone)}" placeholder="例如：+86 16609015589">
    </label>
  `;
}

function userFormBody({ username, displayName, password,
  company, contactName, whatsapp, emailContact, website, phone }, submitLabel) {
  return `
    <form class="project-name-form user-form">
      <label class="field">
        <span>登录用户名</span>
        <input name="username" value="${escapeHtml(username)}" placeholder="例如：zhangsan" required>
      </label>
      <label class="field">
        <span>显示名称</span>
        <input name="displayName" value="${escapeHtml(displayName)}" placeholder="例如：张三">
      </label>
      <label class="field">
        <span>初始密码</span>
        <input name="password" type="password" value="${escapeHtml(password)}" placeholder="请设置密码" required>
      </label>
      ${contactFieldsMarkup({ company, contactName, whatsapp, emailContact, website, phone })}
      <div class="project-name-actions">
        <button class="ghost-button" type="button" data-modal-cancel>取消</button>
        <button class="primary-button" type="submit">${escapeHtml(submitLabel)}</button>
      </div>
    </form>
  `;
}

function userEditBody(userId, submitLabel) {
  const u = _cachedUsers.find((x) => x.id === userId) || {};
  const esc = escapeHtml;
  return `
    <form class="project-name-form user-form">
      <input type="hidden" name="userId" value="${userId}">
      <label class="field">
        <span>显示名称</span>
        <input name="displayName" value="${esc(u.display_name || "")}" placeholder="例如：张三" required>
      </label>
      <label class="field">
        <span>角色</span>
        <select name="role">
          <option value="sales" ${u.role === "sales" ? "selected" : ""}>销售</option>
          <option value="admin" ${u.role === "admin" ? "selected" : ""}>管理员</option>
        </select>
      </label>
      ${contactFieldsMarkup({
        company: u.company, contactName: u.contact_name,
        whatsapp: u.whatsapp, emailContact: u.email_contact,
        website: u.website, phone: u.phone
      })}
      <div class="project-name-actions">
        <button class="ghost-button" type="button" data-modal-cancel>取消</button>
        <button class="primary-button" type="submit">${esc(submitLabel)}</button>
      </div>
    </form>
  `;
}

function showFormError(form, message) {
  let errorEl = form.querySelector(".form-error");
  if (!errorEl) {
    errorEl = document.createElement("p");
    errorEl.className = "form-error";
    form.appendChild(errorEl);
  }
  errorEl.textContent = message;
}

function formatUserTime(value) {
  if (!value) return "";
  return new Date(value).toLocaleDateString("zh-CN");
}
