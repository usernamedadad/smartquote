/**
 * 个人中心页
 */
import { state } from "../state.js";
import { api } from "../api.js";
import { escapeHtml } from "../utils.js";
import { showToast } from "../ui.js";

export function profileDashboardMarkup() {
  const u = state.user || {};
  const initial = (u.display_name || u.username || "?")[0].toUpperCase();
  const roleLabel = u.role === "admin" ? "管理员" : "销售";
  const projectCount = state.projects.length;
  const imageCount = state.images.length;

  return `
    <div class="profile-banner">
      <div class="profile-banner-bg"></div>
      <div class="profile-avatar">${initial}</div>
      <div class="profile-banner-info">
        <h1>${escapeHtml(u.display_name || u.username || "")}</h1>
        <span class="profile-role-badge ${u.role}">${roleLabel}</span>
      </div>
    </div>

    <div class="profile-stats">
      <div class="profile-stat-card">
        <div class="profile-stat-value">${projectCount}</div>
        <div class="profile-stat-label">报价项目</div>
      </div>
      <div class="profile-stat-card">
        <div class="profile-stat-value">${imageCount}</div>
        <div class="profile-stat-label">图片数量</div>
      </div>
      <div class="profile-stat-card">
        <div class="profile-stat-value">${escapeHtml(u.username || "")}</div>
        <div class="profile-stat-label">登录账号</div>
      </div>
    </div>

    <div class="profile-section">
      <div class="profile-section-header">
        <h3>联系方式</h3>
        <span class="profile-section-desc">编辑后将应用到新建的报价单</span>
      </div>
      <form class="profile-contact-form">
        <div class="profile-contact-grid">
          <label class="profile-contact-field">
            <span class="profile-contact-label">公司名称</span>
            <input name="company" value="${escapeHtml(u.company || "")}" placeholder="例如：Henan Zoke Crane Co., Ltd.">
          </label>
          <label class="profile-contact-field">
            <span class="profile-contact-label">联系人</span>
            <input name="contactName" value="${escapeHtml(u.contact_name || "")}" placeholder="例如：Krystal Gao">
          </label>
          <label class="profile-contact-field">
            <span class="profile-contact-label">WhatsApp</span>
            <input name="whatsapp" value="${escapeHtml(u.whatsapp || "")}" placeholder="例如：+86 16609015589">
          </label>
          <label class="profile-contact-field">
            <span class="profile-contact-label">邮箱</span>
            <input name="emailContact" value="${escapeHtml(u.email_contact || "")}" placeholder="例如：sales@zkhoist.com">
          </label>
          <label class="profile-contact-field">
            <span class="profile-contact-label">网站</span>
            <input name="website" value="${escapeHtml(u.website || "")}" placeholder="例如：www.zkhoist.com">
          </label>
          <label class="profile-contact-field">
            <span class="profile-contact-label">电话</span>
            <input name="phone" value="${escapeHtml(u.phone || "")}" placeholder="例如：+86 16609015588">
          </label>
        </div>
        <div class="profile-contact-actions">
          <button class="primary-button" type="submit">保存联系方式</button>
        </div>
      </form>
    </div>

    <div class="profile-section">
      <div class="profile-section-header">
        <h3>修改密码</h3>
      </div>
      <form class="profile-password-form">
        <div class="profile-contact-grid">
          <label class="profile-contact-field">
            <span class="profile-contact-label">旧密码</span>
            <input type="password" name="oldPassword" required>
          </label>
          <label class="profile-contact-field">
            <span class="profile-contact-label">新密码</span>
            <input type="password" name="newPassword" required minlength="4">
          </label>
          <label class="profile-contact-field">
            <span class="profile-contact-label">确认新密码</span>
            <input type="password" name="confirmPassword" required minlength="4">
          </label>
        </div>
        <div class="profile-contact-actions">
          <button class="primary-button" type="submit">修改密码</button>
        </div>
      </form>
    </div>
  `;
}

export function bindProfileBindings() {
  bindProfilePassword();
  bindProfileContact();
}

function bindProfilePassword() {
  const form = document.querySelector(".profile-password-form");
  if (!form) return;
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const fd = new FormData(form);
    const oldPassword = fd.get("oldPassword");
    const newPassword = fd.get("newPassword");
    const confirmPassword = fd.get("confirmPassword");
    if (newPassword !== confirmPassword) {
      showToast("两次输入的新密码不一致", { tone: "error" });
      return;
    }
    const res = await api("/api/change-password", {
      method: "POST",
      body: { oldPassword, newPassword }
    });
    if (res.error) {
      showToast(res.error, { tone: "error" });
      return;
    }
    showToast("密码修改成功");
    form.reset();
  });
}

function bindProfileContact() {
  const form = document.querySelector(".profile-contact-form");
  if (!form) return;
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const fd = new FormData(form);
    const res = await api("/api/me/profile", {
      method: "PUT",
      body: {
        company: fd.get("company") || "",
        contactName: fd.get("contactName") || "",
        whatsapp: fd.get("whatsapp") || "",
        emailContact: fd.get("emailContact") || "",
        website: fd.get("website") || "",
        phone: fd.get("phone") || ""
      }
    });
    if (res.error) {
      showToast(res.error, { tone: "error" });
      return;
    }
    if (res.user) state.user = res.user;
    showToast("联系方式已保存");
  });
}
