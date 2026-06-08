/**
 * 登录页
 */
import { state, app } from "../state.js";
import { api, loadWorkspace } from "../api.js";

let _renderProjectsPage;

export function registerLoginCallbacks({ renderProjectsPage }) {
  _renderProjectsPage = renderProjectsPage;
}

export function renderLoginPage() {
  state.view = "login";
  app.innerHTML = `
    <main class="login-page">
      <article class="login-quote-overlay" aria-hidden="true">
        <header class="login-paper-head">
          <div class="login-paper-logo">
            <img src="/src/assets/login-logo-transparent.png" alt="">
            <span>Lifting Solutions, Built for You</span>
          </div>
          <dl>
            <div><dt>Quote No.</dt><dd>QT-20250604-001</dd></div>
            <div><dt>Date</dt><dd>June 4, 2026</dd></div>
            <div><dt>Validity</dt><dd>10 days</dd></div>
          </dl>
        </header>

        <section class="login-paper-title">
          <h2>QUOTATION</h2>
          <p>Smart Quote,&nbsp;&nbsp;Professional Solution</p>
        </section>

        <section class="login-paper-parties">
          <div class="paper-party from">
            <span>FROM</span>
            <strong>Henan Zoke Crane Co., Ltd.</strong>
            <p><b>Tel</b> +86 18600015589</p>
            <p><b>Email</b> krystal@zkhoist.com</p>
            <p><b>Web</b> www.zkhoist.com</p>
          </div>
          <div class="paper-party to">
            <span>TO</span>
            <strong>Rajitha Sampath</strong>
            <p><b>Tel</b> +94 777870404</p>
            <p><b>Email</b> inforajitha@gmail.com</p>
          </div>
        </section>

        <section class="login-paper-spec">
          <div class="paper-ribbon"><span>PRODUCT & SPECIFICATIONS</span></div>
          <div class="paper-table">
            <div class="paper-table-head">
              <span>No.</span>
              <span>Product Specifications</span>
              <span>Quantity</span>
            </div>
            <div class="paper-table-row">
              <span>1.</span>
              <div>
                <strong>HD European Wire Rope Hoist</strong>
                <p>- Lifting capacity: 3 t</p>
                <p>- Lifting height: 6 m</p>
                <p>- Lifting speed: 5/0.8 (m/min)</p>
                <p>- Trolley travel speed: 5-20 (m/min)</p>
                <p>- Voltage: 380V/3 Phase/60Hz</p>
                <p>- Work duty: FEM 2m (ISO M5)</p>
                <p>- Control method: Pendant + Remote Control</p>
                <p>- VFD: Schneider</p>
                <p>- Main Electrical components: Schneider</p>
                <p>- Load limiter and lifting height limiter included</p>
              </div>
              <span>1 set</span>
            </div>
          </div>
        </section>

        <img class="login-paper-hoist" src="/src/product-previews/product_1_real_cutout.png" alt="">

        <footer class="login-paper-footer">
          <span>Your Trusted Partner<br>in Lifting Solutions.</span>
          <i>PASS</i>
          <strong>TOTAL&nbsp;&nbsp;&nbsp;$2,478</strong>
        </footer>
      </article>
      <section class="login-workbench" aria-label="报价单工作台登录">
        <aside class="login-panel">
          <div class="login-brand">
            <img src="/src/assets/login-logo-transparent.png" alt="ZK Hoist">
            <div>
              <p>QUOTE WORKBENCH</p>
              <h1>进入报价单工作台</h1>
            </div>
          </div>

          <form id="login-form" class="login-form">
            <fieldset class="login-role-field">
              <legend>身份</legend>
              <div class="login-role-group" role="tablist" aria-label="登录身份">
                <button type="button" class="login-role-card active" data-role="admin" aria-selected="true">
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M12 3 19 6v5c0 4.4-2.8 7.3-7 9-4.2-1.7-7-4.6-7-9V6z"></path>
                    <path d="m9.5 12 1.7 1.7 3.5-4"></path>
                  </svg>
                  <span>管理员</span>
                </button>
                <button type="button" class="login-role-card" data-role="sales" aria-selected="false">
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
                    <circle cx="12" cy="7" r="4"></circle>
                  </svg>
                  <span>销售用户</span>
                </button>
              </div>
            </fieldset>

            <label>
              <span>账号</span>
              <div class="login-input-wrap">
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
                  <circle cx="12" cy="7" r="4"></circle>
                </svg>
                <input name="username" value="admin" placeholder="请输入账号" autocomplete="username">
              </div>
            </label>

            <label>
              <span>密码</span>
              <div class="login-input-wrap">
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <rect x="5" y="10" width="14" height="10" rx="2"></rect>
                  <path d="M8 10V7a4 4 0 0 1 8 0v3"></path>
                </svg>
                <input name="password" type="password" placeholder="请输入密码"
                       autocomplete="current-password">
                <button class="login-password-toggle" type="button" aria-label="显示或隐藏密码">
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6Z"></path>
                    <circle cx="12" cy="12" r="3"></circle>
                  </svg>
                </button>
              </div>
            </label>

            <div class="login-form-row">
              <label class="login-remember">
                <input type="checkbox" name="remember">
                <span>记住账号</span>
              </label>
            </div>

            <button class="login-submit" type="submit">进入报价工作台</button>
            <p id="login-error" class="form-error" role="alert"></p>
          </form>

          <div class="login-security-note" aria-label="访问提示">
            <span>
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M12 3 19 6v5c0 4.4-2.8 7.3-7 9-4.2-1.7-7-4.6-7-9V6z"></path>
                <path d="m9.5 12 1.7 1.7 3.5-4"></path>
              </svg>
              内部授权访问
            </span>
            <i></i>
            <span>SmartQuote</span>
          </div>
        </aside>
      </section>
    </main>
  `;

  const usernameInput = document.querySelector(
    '#login-form input[name="username"]'
  );
  const passwordInput = document.querySelector(
    '#login-form input[name="password"]'
  );

  // 读取记住的账号
  const remembered = localStorage.getItem("smartquote_username");
  if (remembered) {
    usernameInput.value = remembered;
    document.querySelector('.login-form input[name="remember"]').checked = true;
    // 切换到对应角色的 tab
    const role = localStorage.getItem("smartquote_role") || "admin";
    document.querySelectorAll(".login-role-card").forEach((c) => {
      const isTarget = c.dataset.role === role;
      c.classList.toggle("active", isTarget);
      c.setAttribute("aria-selected", String(isTarget));
    });
  }

  // 角色选择：切换身份并预填账号
  document.querySelectorAll(".login-role-card").forEach((card) => {
    card.addEventListener("click", () => {
      document
        .querySelectorAll(".login-role-card")
        .forEach((c) => {
          c.classList.remove("active");
          c.setAttribute("aria-selected", "false");
        });
      card.classList.add("active");
      card.setAttribute("aria-selected", "true");
      if (card.dataset.role === "admin") {
        usernameInput.value = "admin";
      } else {
        usernameInput.value = "";
      }
      usernameInput.focus();
    });
  });

  document
    .querySelector(".login-password-toggle")
    .addEventListener("click", () => {
      const visible = passwordInput.type === "text";
      passwordInput.type = visible ? "password" : "text";
    });

  // 表单提交
  document
    .querySelector("#login-form")
    .addEventListener("submit", async (event) => {
      event.preventDefault();
      const form = new FormData(event.currentTarget);
      const error = document.querySelector("#login-error");
      const btn = document.querySelector(".login-submit");
      error.textContent = "";
      btn.disabled = true;
      btn.textContent = "正在进入…";

      try {
        const result = await api("/api/login", {
          method: "POST",
          allow401: true,
          body: {
            username: form.get("username"),
            password: form.get("password"),
          },
        });
        state.user = result.user;
        // 记住账号
        const remember = form.get("remember");
        if (remember) {
          localStorage.setItem("smartquote_username", form.get("username"));
          localStorage.setItem("smartquote_role", result.user.role || "sales");
        } else {
          localStorage.removeItem("smartquote_username");
          localStorage.removeItem("smartquote_role");
        }
        await loadWorkspace();
        _renderProjectsPage();
      } catch (err) {
        error.textContent = err.message;
        btn.disabled = false;
        btn.textContent = "进入报价工作台";
      }
    });
}
