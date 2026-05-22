// =====================================================================
// 喵掌櫃股票研究所 — 管理者控制頁 JS
// =====================================================================

const CFG = window.MIAO_CONFIG || { API_BASE: "" };
const API = (p) => CFG.API_BASE.replace(/\/$/, "") + p;

const TOKEN_KEY = "miao_admin_token";

function getToken() { return sessionStorage.getItem(TOKEN_KEY) || ""; }
function setToken(t) { sessionStorage.setItem(TOKEN_KEY, t); }
function clearToken() { sessionStorage.removeItem(TOKEN_KEY); }

function toast(msg, kind = "info") {
    let el = document.getElementById("toast");
    if (!el) {
        el = document.createElement("div");
        el.id = "toast";
        el.className = "toast";
        document.body.appendChild(el);
    }
    el.className = "toast " + (kind === "error" ? "error"
                              : kind === "success" ? "success" : "");
    el.textContent = msg;
    el.classList.add("show");
    setTimeout(() => el.classList.remove("show"), 3500);
}

function fmtDate(x) {
    return x ? String(x).slice(0, 19).replace("T", " ") : "—";
}

// ---- HTTP helpers ---------------------------------------------------
async function authFetch(path, options = {}) {
    const token = getToken();
    if (!token) throw new Error("尚未登入");
    const r = await fetch(API(path), {
        ...options,
        headers: {
            "Content-Type": "application/json",
            "Authorization": "Bearer " + token,
            ...(options.headers || {}),
        },
    });
    if (r.status === 401) {
        clearToken(); showLogin();
        throw new Error("Token 無效或已過期,請重新登入");
    }
    if (!r.ok) {
        let msg = `${r.status}`;
        try { msg = (await r.json()).error || msg; } catch (_) {}
        throw new Error(msg);
    }
    return r.json();
}

async function publicGet(path) {
    const r = await fetch(API(path));
    if (!r.ok) throw new Error(`${r.status}`);
    return r.json();
}

// ---- UI switching ---------------------------------------------------
function showLogin() {
    document.getElementById("login-view").style.display = "";
    document.getElementById("admin-view").style.display = "none";
}
function showAdmin() {
    document.getElementById("login-view").style.display = "none";
    document.getElementById("admin-view").style.display = "";
    refreshStatus();
    refreshJobs();
    refreshQuality();
}

// ---- 登入 -----------------------------------------------------------
async function tryLogin() {
    const t = document.getElementById("token-input").value.trim();
    if (!t) { toast("請輸入 Admin Token", "error"); return; }
    setToken(t);
    try {
        await authFetch("/api/admin/job-log");
        toast("登入成功", "success");
        showAdmin();
    } catch (e) {
        toast("登入失敗:" + e.message, "error");
    }
}

// ---- 系統狀態 -------------------------------------------------------
async function refreshStatus() {
    const el = document.getElementById("admin-status");
    try {
        const s = await publicGet("/api/system/status");
        el.innerHTML = `
          <div class="grid grid-4">
            <div class="card compact">
              <div class="label">系統模式</div>
              <div class="value small">
                <span class="badge ${s.system_mode === "maintenance" ? "warn" : "ok"}">
                  ${s.system_mode}
                </span>
              </div>
            </div>
            <div class="card compact">
              <div class="label">每日排程</div>
              <div class="value small">
                <span class="badge ${s.daily_job_enabled ? "ok" : "danger"}">
                  ${s.daily_job_enabled ? "ON" : "已暫停"}
                </span>
              </div>
            </div>
            <div class="card compact">
              <div class="label">AI 研究</div>
              <div class="value small">
                <span class="badge ${s.ai_research_enabled ? "ok" : "muted"}">
                  ${s.ai_research_enabled ? "ON" : "OFF"}
                </span>
              </div>
            </div>
            <div class="card compact">
              <div class="label">規則發布</div>
              <div class="value small">
                <span class="badge ${s.rules_publish_enabled ? "ok" : "muted"}">
                  ${s.rules_publish_enabled ? "ON" : "OFF"}
                </span>
              </div>
            </div>
            <div class="card compact">
              <div class="label">最後資料日期</div>
              <div class="value small">${s.last_data_date || "—"}</div>
            </div>
            <div class="card compact">
              <div class="label">最後跑批</div>
              <div class="value small">${fmtDate(s.last_daily_run_at)}</div>
            </div>
            <div class="card compact">
              <div class="label">最後匯出</div>
              <div class="value small">${fmtDate(s.last_export_at)}</div>
            </div>
            <div class="card compact">
              <div class="label">最後備份</div>
              <div class="value small">${fmtDate(s.last_backup_at)}</div>
            </div>
          </div>
        `;
    } catch (e) {
        el.innerHTML = `<span class="muted">無法取得系統狀態</span>`;
    }
}

// ---- 任務 log -------------------------------------------------------
async function refreshJobs() {
    const el = document.getElementById("job-log");
    try {
        const r = await authFetch("/api/admin/job-log");
        const rows = (r.items || []).map(j => `
          <tr>
            <td>${j.id}</td>
            <td>${j.job_name}</td>
            <td>${fmtDate(j.started_at)}</td>
            <td>${fmtDate(j.finished_at)}</td>
            <td><span class="badge ${
                j.status === "success" ? "ok"
                : j.status === "running" ? "warn"
                : j.status === "skipped" ? "muted" : "danger"
            }">${j.status}</span></td>
            <td>${j.triggered_by || ""}</td>
            <td class="muted">${(j.error_message || "").slice(0, 60)}</td>
          </tr>`).join("");
        el.innerHTML = `<div class="scroll-y"><table>
          <thead><tr><th>#</th><th>任務</th><th>開始</th><th>結束</th>
            <th>狀態</th><th>觸發</th><th>錯誤</th></tr></thead>
          <tbody>${rows || `<tr><td colspan="7" class="muted">無紀錄</td></tr>`}</tbody>
        </table></div>`;
    } catch (e) {
        el.innerHTML = `<span class="muted">${e.message}</span>`;
    }
}

// ---- 品質 log -------------------------------------------------------
async function refreshQuality() {
    const el = document.getElementById("quality-log");
    try {
        const r = await authFetch("/api/admin/quality-log");
        const rows = (r.items || []).slice(0, 30).map(q => `
          <tr>
            <td>${q.check_date}</td>
            <td>${q.symbol || ""}</td>
            <td><span class="badge warn">${q.issue_type}</span></td>
            <td>${q.source || ""}</td>
            <td class="muted">${(q.description || "").slice(0, 80)}</td>
          </tr>`).join("");
        el.innerHTML = `<div class="scroll-y"><table>
          <thead><tr><th>日期</th><th>代號</th><th>類型</th>
            <th>來源</th><th>說明</th></tr></thead>
          <tbody>${rows || `<tr><td colspan="5" class="success">✓ 過去無資料品質異常</td></tr>`}</tbody>
        </table></div>`;
    } catch (e) {
        el.innerHTML = `<span class="muted">${e.message}</span>`;
    }
}

// ---- 操作按鈕 -------------------------------------------------------
async function callAction(path, body = {}, label = "") {
    if (!confirm(`確定要執行「${label || path}」嗎?`)) return;
    toast(`執行中:${label}`, "info");
    try {
        const r = await authFetch(path, {
            method: "POST",
            body: JSON.stringify(body),
        });
        toast(`${label} 完成`, "success");
        console.log("[admin action]", path, r);
        refreshStatus();
        refreshJobs();
    } catch (e) {
        toast(`${label} 失敗:${e.message}`, "error");
    }
}

async function setMode(field, value, label) {
    toast(`設定 ${field} = ${value}`, "info");
    try {
        const r = await authFetch("/api/admin/set-mode", {
            method: "POST",
            body: JSON.stringify({ [field]: value }),
        });
        toast(`${label} 已更新`, "success");
        refreshStatus();
    } catch (e) {
        toast(`設定失敗:${e.message}`, "error");
    }
}

// ---- 綁定 -----------------------------------------------------------
window.addEventListener("DOMContentLoaded", () => {
    const token = getToken();
    if (token) {
        // 嘗試自動進入
        authFetch("/api/admin/job-log").then(() => showAdmin()).catch(() => {
            clearToken(); showLogin();
        });
    } else {
        showLogin();
    }
    document.getElementById("login-btn").addEventListener("click", tryLogin);
    document.getElementById("token-input").addEventListener("keydown", e => {
        if (e.key === "Enter") tryLogin();
    });
    document.getElementById("logout-btn").addEventListener("click", () => {
        clearToken(); showLogin();
        toast("已登出", "info");
    });
    document.getElementById("refresh-all-btn").addEventListener("click", () => {
        refreshStatus(); refreshJobs(); refreshQuality();
    });

    // 操作按鈕
    document.getElementById("act-run-daily").onclick = () =>
        callAction("/api/admin/run-daily", { history_days: 5 }, "手動執行每日更新");
    document.getElementById("act-run-fetch").onclick = () =>
        callAction("/api/admin/run-fetch", { days: 5 }, "重新抓資料");
    document.getElementById("act-run-features").onclick = () =>
        callAction("/api/admin/run-features", {}, "重算技術指標");
    document.getElementById("act-run-signals").onclick = () =>
        callAction("/api/admin/run-signals", {}, "重跑訊號");
    document.getElementById("act-run-outcomes").onclick = () =>
        callAction("/api/admin/run-outcomes", {}, "回填 outcomes");
    document.getElementById("act-run-forecast").onclick = () =>
        callAction("/api/admin/run-forecast", {}, "跑機率預測");
    document.getElementById("act-run-eval").onclick = () =>
        callAction("/api/admin/run-eval", {}, "規則評估");
    document.getElementById("act-run-ai").onclick = () =>
        callAction("/api/admin/run-weekly-ai", {}, "AI 研究員");
    document.getElementById("act-run-backup").onclick = () =>
        callAction("/api/admin/run-backup", {}, "立即備份");
    document.getElementById("act-export-rules").onclick = () =>
        callAction("/api/admin/export-rules", {}, "重新匯出 rules.json");
    document.getElementById("act-init-schema").onclick = () =>
        callAction("/api/admin/init-schema", {}, "建立資料表(只需一次)");
    document.getElementById("act-init-rules").onclick = () =>
        callAction("/api/admin/init-rules", {}, "灌入初始規則");
    document.getElementById("act-pause").onclick = () =>
        callAction("/api/admin/pause-jobs", {}, "暫停每日排程");
    document.getElementById("act-resume").onclick = () =>
        callAction("/api/admin/resume-jobs", {}, "恢復每日排程");
    document.getElementById("act-maintenance-on").onclick = () =>
        setMode("system_mode", "maintenance", "切換維護模式");
    document.getElementById("act-maintenance-off").onclick = () =>
        setMode("system_mode", "normal", "恢復正常模式");
    document.getElementById("act-approve").onclick = () =>
        callAction("/api/admin/approve-report", {}, "通過最新 AI 報告");
});
