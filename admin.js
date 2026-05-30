// =====================================================================
// 喵掌櫃股票研究所 — Admin Console (v2)
// =====================================================================
"use strict";

const CFG = window.MIAO_CONFIG || { API_BASE: "" };
const API_BASE = (CFG.API_BASE || "").replace(/\/$/, "");
const api = (p) => API_BASE + p;
const TOKEN_KEY = "miao_admin_token";

const $ = (id) => document.getElementById(id);
const setText = (id, v) => { const el = $(id); if (el) el.textContent = v ?? "--"; };
const setHTML = (id, h) => { const el = $(id); if (el) el.innerHTML = h; };
const escapeHtml = (s) => s == null ? "" : String(s).replace(/[&<>"']/g, c =>
    ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));

function getToken() { return sessionStorage.getItem(TOKEN_KEY) || ""; }
function setToken(t) { sessionStorage.setItem(TOKEN_KEY, t); }
function clearToken() { sessionStorage.removeItem(TOKEN_KEY); }

function fmtDate(x) {
    return x ? String(x).slice(0, 19).replace("T", " ") : "—";
}
function fmtAgo(x) {
    if (!x) return "—";
    const ms = Date.now() - new Date(x).getTime();
    const sec = Math.floor(ms / 1000);
    if (sec < 60) return `${sec}s ago`;
    if (sec < 3600) return `${Math.floor(sec/60)}m ago`;
    if (sec < 86400) return `${Math.floor(sec/3600)}h ago`;
    return `${Math.floor(sec/86400)}d ago`;
}

// ---- Toast ----------------------------------------------------------
function toast(msg, kind = "info") {
    let el = $("toast");
    if (!el) {
        el = document.createElement("div");
        el.id = "toast";
        el.className = "toast";
        document.body.appendChild(el);
    }
    el.className = "toast " + (kind === "error" ? "error" : kind === "success" ? "success" : "");
    el.textContent = msg;
    el.classList.add("show");
    setTimeout(() => el.classList.remove("show"), 3500);
}

// ---- HTTP ------------------------------------------------------------
async function authFetch(path, options = {}) {
    const token = getToken();
    if (!token) throw new Error("尚未登入");
    const r = await fetch(api(path), {
        ...options,
        headers: {
            "Content-Type": "application/json",
            "Authorization": "Bearer " + token,
            ...(options.headers || {}),
        },
    });
    if (r.status === 401) {
        clearToken();
        showLogin();
        throw new Error("Token 無效,請重新登入");
    }
    if (!r.ok) {
        let msg = `${r.status}`;
        try { msg = (await r.json()).error || msg; } catch (_) {}
        throw new Error(msg);
    }
    return r.json();
}

async function publicGet(path) {
    const r = await fetch(api(path));
    if (!r.ok) throw new Error(`${r.status}`);
    return r.json();
}

// ---- View switching --------------------------------------------------
function showLogin() {
    $("login-view").style.display = "flex";
    $("admin-view").style.display = "none";
    $("logout-btn").style.display = "none";
    setText("login-state", "未登入");
    setTimeout(() => $("token-input")?.focus(), 100);
}
function showAdmin() {
    $("login-view").style.display = "none";
    $("admin-view").style.display = "grid";
    $("logout-btn").style.display = "";
    setText("login-state", "✓ 已登入");
    refreshStatus();
    switchTab(currentTab);
}

// v1.0-gamma-2: 訊號成熟度小卡(控制台版,DOM id 加 adm- 前綴)
async function refreshSignalMaturity() {
    try {
        const r = await publicGet("/api/signal-maturity");
        const steps = [
            ["adm-step-detector",     "detector_ready"],
            ["adm-step-signal",       "signal_backfilled"],
            ["adm-step-outcome",      "outcome_ready"],
            ["adm-step-contribution", "contribution_active"],
            ["adm-step-production",   "production_active"],
        ];
        let activeCount = 0;
        steps.forEach(([elId, key]) => {
            const el = document.getElementById(elId);
            if (!el) return;
            const active = !!r[key];
            el.classList.remove("active", "pending");
            el.classList.add(active ? "active" : "pending");
            if (active) activeCount++;
        });
        const stage = document.getElementById("admin-maturity-stage");
        if (stage) stage.textContent = `${r.stage_index ?? activeCount}/5`;
    } catch (e) {
        console.warn("refreshSignalMaturity failed:", e);
    }
}

// ---- Status panel ----------------------------------------------------
async function refreshStatus() {
    try {
        const [health, sys] = await Promise.all([
            publicGet("/api/health").catch(() => null),
            publicGet("/api/system/status").catch(() => null),
        ]);
        // 順手刷新成熟度小卡
        refreshSignalMaturity();
        // 頂部狀態點
        $("api-dot").className = "dot " + (health?.ok ? "up" : "down");
        $("db-dot").className = "dot " + (health?.database?.ok ? "up" : "down");
        $("conn-dot").className = "dot " + (health?.ok ? "up" : "down");
        setText("api-base-label", API_BASE);

        if (!sys) {
            setHTML("status-body", `<div class="empty">無法取得系統狀態</div>`);
            return;
        }
        setText("status-meta", fmtAgo(sys.last_daily_run_at));

        const lastJob = sys.last_job || {};
        const html = `
          <div class="stat-grid" style="grid-template-columns:repeat(4,1fr); margin-bottom:12px">
            <div class="row"><span class="k">系統模式</span>
              <span class="v"><span class="tag ${sys.system_mode==="maintenance"?"warn":"up"}">${escapeHtml(sys.system_mode||"?")}</span></span></div>
            <div class="row"><span class="k">每日排程</span>
              <span class="v"><span class="tag ${sys.daily_job_enabled?"up":"down"}">${sys.daily_job_enabled?"ON":"PAUSED"}</span></span></div>
            <div class="row"><span class="k">AI 研究</span>
              <span class="v"><span class="tag ${sys.ai_research_enabled?"up":"muted"}">${sys.ai_research_enabled?"ON":"OFF"}</span></span></div>
            <div class="row"><span class="k">規則發布</span>
              <span class="v"><span class="tag ${sys.rules_publish_enabled?"up":"muted"}">${sys.rules_publish_enabled?"ON":"OFF"}</span></span></div>
          </div>
          <div class="section-title">時間戳記</div>
          <div class="stat-grid" style="grid-template-columns:repeat(2,1fr)">
            <div class="row"><span class="k">最後資料日</span><span class="v">${escapeHtml(sys.last_data_date || "—")}</span></div>
            <div class="row"><span class="k">最後跑批</span><span class="v">${fmtDate(sys.last_daily_run_at)}</span></div>
            <div class="row"><span class="k">最後匯出</span><span class="v">${fmtDate(sys.last_export_at)}</span></div>
            <div class="row"><span class="k">最後備份</span><span class="v">${fmtDate(sys.last_backup_at)}</span></div>
            <div class="row"><span class="k">規則版本</span><span class="v">${escapeHtml(sys.current_rule_version || "—")}</span></div>
            <div class="row"><span class="k">最近任務</span><span class="v">${escapeHtml(lastJob.job_name || "—")} <span class="tag ${lastJob.status==="success"?"up":lastJob.status==="running"?"warn":lastJob.status==="failed"?"down":"muted"}">${escapeHtml(lastJob.status||"")}</span></span></div>
          </div>
        `;
        setHTML("status-body", html);
    } catch (e) {
        setHTML("status-body", `<div class="empty">${escapeHtml(e.message)}</div>`);
    }
}

// ---- Tab logs --------------------------------------------------------
let currentTab = "jobs";

function setActiveTab(name) {
    ["jobs", "quality"].forEach(t => {
        const el = $(`tab-${t}`);
        if (!el) return;
        if (t === name) {
            el.classList.remove("ghost");
            el.classList.add("primary");
            el.style.background = "var(--accent-dim)";
            el.style.color = "var(--text-0)";
        } else {
            el.classList.remove("primary");
            el.classList.add("ghost");
            el.style.background = "";
            el.style.color = "";
        }
    });
}

async function loadJobLog() {
    try {
        const r = await authFetch("/api/admin/job-log");
        const rows = (r.items || []).map(j => `
          <tr>
            <td class="mono dim">#${j.id}</td>
            <td><strong>${escapeHtml(j.job_name)}</strong></td>
            <td>${fmtDate(j.started_at)}</td>
            <td>${fmtDate(j.finished_at)}</td>
            <td><span class="tag ${
                j.status === "success" ? "up"
                : j.status === "running" ? "warn"
                : j.status === "skipped" ? "muted"
                : "down"
            }">${escapeHtml(j.status)}</span></td>
            <td class="dim">${escapeHtml(j.triggered_by || "")}</td>
            <td class="dim" style="white-space:normal; max-width:300px">${escapeHtml((j.error_message || "").slice(0, 120))}</td>
          </tr>`).join("");
        setHTML("log-body", `<table class="data">
          <thead><tr><th>#</th><th>任務</th><th>開始</th><th>結束</th>
            <th>狀態</th><th>觸發</th><th>備註</th></tr></thead>
          <tbody>${rows || `<tr><td colspan="7" class="dim" style="padding:20px; text-align:center">尚無紀錄</td></tr>`}</tbody>
        </table>`);
    } catch (e) {
        setHTML("log-body", `<div class="empty">${escapeHtml(e.message)}</div>`);
    }
}

async function loadQualityLog() {
    try {
        const r = await authFetch("/api/admin/quality-log");
        const rows = (r.items || []).slice(0, 50).map(q => `
          <tr>
            <td class="mono">${escapeHtml(q.check_date || "")}</td>
            <td class="mono"><strong>${escapeHtml(q.symbol || "—")}</strong></td>
            <td><span class="tag warn">${escapeHtml(q.issue_type)}</span></td>
            <td class="dim">${escapeHtml(q.source || "")}</td>
            <td class="dim" style="white-space:normal; max-width:400px">${escapeHtml((q.description || "").slice(0, 150))}</td>
            <td><span class="tag ${q.status === "resolved" ? "up" : "muted"}">${escapeHtml(q.status)}</span></td>
          </tr>`).join("");
        setHTML("log-body", `<table class="data">
          <thead><tr><th>日期</th><th>代號</th><th>類型</th>
            <th>來源</th><th>說明</th><th>狀態</th></tr></thead>
          <tbody>${rows || `<tr><td colspan="6" style="padding:20px; text-align:center; color:var(--up)">✓ 過去無資料品質異常</td></tr>`}</tbody>
        </table>`);
    } catch (e) {
        setHTML("log-body", `<div class="empty">${escapeHtml(e.message)}</div>`);
    }
}

function switchTab(name) {
    currentTab = name;
    setActiveTab(name);
    setHTML("log-body", `<div class="empty"><span class="spinner"></span>讀取中...</div>`);
    if (name === "jobs") loadJobLog();
    else if (name === "quality") loadQualityLog();
}

// ---- Actions ---------------------------------------------------------
async function callAction(path, body = {}, label = "") {
    if (!confirm(`確定要執行「${label || path}」嗎?`)) return;
    toast(`執行中:${label}`, "info");
    try {
        const r = await authFetch(path, {
            method: "POST",
            body: JSON.stringify(body),
        });
        toast(`✓ ${label} 完成`, "success");
        console.log(`[admin] ${path}`, r);
        refreshStatus();
        if (currentTab === "jobs") loadJobLog();
    } catch (e) {
        toast(`✗ ${label} 失敗:${e.message}`, "error");
    }
}

async function setMode(field, value, label) {
    if (!confirm(`確定要「${label}」嗎?`)) return;
    try {
        await authFetch("/api/admin/set-mode", {
            method: "POST",
            body: JSON.stringify({ [field]: value }),
        });
        toast(`✓ ${label}`, "success");
        refreshStatus();
    } catch (e) {
        toast(`✗ 失敗:${e.message}`, "error");
    }
}

// ---- Login -----------------------------------------------------------
async function tryLogin() {
    const t = $("token-input").value.trim();
    if (!t) { toast("請輸入 Admin Token", "error"); return; }
    setToken(t);
    try {
        await authFetch("/api/admin/job-log");
        toast("登入成功", "success");
        showAdmin();
    } catch (e) {
        clearToken();
        toast("登入失敗:" + e.message, "error");
    }
}

// ---- Clock -----------------------------------------------------------
function tickClock() {
    const d = new Date();
    setText("clock", d.toLocaleTimeString("zh-TW", { hour12: false }));
}

// ---- Boot ------------------------------------------------------------
window.addEventListener("DOMContentLoaded", () => {
    setText("api-base-label", API_BASE || "(未設定)");
    tickClock(); setInterval(tickClock, 1000);

    // 自動嘗試登入
    if (getToken()) {
        authFetch("/api/admin/job-log").then(() => showAdmin()).catch(() => {
            clearToken(); showLogin();
        });
    } else {
        showLogin();
    }

    // Buttons
    $("login-btn").addEventListener("click", tryLogin);
    $("token-input").addEventListener("keydown", e => {
        if (e.key === "Enter") tryLogin();
    });
    $("logout-btn").addEventListener("click", () => {
        clearToken(); showLogin();
        toast("已登出", "info");
    });
    $("refresh-all-btn").addEventListener("click", () => {
        if (getToken()) {
            refreshStatus();
            switchTab(currentTab);
        } else {
            refreshStatus();
        }
    });

    // Tab switching
    $("tab-jobs").addEventListener("click", () => switchTab("jobs"));
    $("tab-quality").addEventListener("click", () => switchTab("quality"));

    // v1.0-gamma-2 double confirm helper(危險按鈕用)
    const confirmAndRun = (msg, endpoint, body, label) => {
        const v = prompt(`⚠️ ${msg}\n\n輸入「CONFIRM」確認執行:`);
        if (v === "CONFIRM") callAction(endpoint, body, label);
        else toast("已取消", "info");
    };
    const bind = (id, fn) => {
        const el = $(id);
        if (el) el.onclick = fn;
    };

    // 🌟 每日核心
    bind("act-run-daily", () =>
        callAction("/api/admin/run-daily-background", { history_days: 5 }, "執行每日完整更新(背景)"));
    bind("act-run-fetch", () => {
        const days = prompt("補抓近 N 日資料(預設 5):", "5");
        if (days === null) return;
        callAction("/api/admin/run-fetch-background", { days: parseInt(days) || 5 }, `重抓資料 (近 ${days} 日)`);
    });
    bind("act-run-backup", () =>
        callAction("/api/admin/run-backup", {}, "立即備份"));
    bind("act-recompute-hit", () =>
        callAction("/api/admin/recompute-is-hit", {}, "補 is_hit / ai_is_hit"));
    bind("act-run-ai-critic-bg", () =>
        callAction("/api/admin/run-ai-critic-background", {}, "補 AI critic (背景)"));

    // 🔧 個別 fetcher
    bind("act-run-international", () => {
        const days = prompt("補近 N 日國際盤(預設 60):", "60");
        if (days === null) return;
        callAction("/api/admin/run-international", { days: parseInt(days) || 60 }, "補國際盤");
    });
    bind("act-run-pcratio", () =>
        callAction("/api/admin/run-pcratio", {}, "補 PC Ratio"));
    bind("act-run-fundamental", () =>
        callAction("/api/admin/run-fundamental", {}, "補基本面"));
    bind("act-run-regime", () =>
        callAction("/api/admin/run-regime", {}, "重算 market regime"));
    bind("act-run-features", () =>
        callAction("/api/admin/run-features", {}, "重算技術指標"));
    bind("act-run-signals", () =>
        callAction("/api/admin/run-signals", {}, "重跑訊號 (today)"));
    bind("act-backfill-signals", () => {
        const start = prompt("補歷史訊號 — 開始日期 (YYYY-MM-DD):");
        if (!start) return;
        const end = prompt("結束日期 (YYYY-MM-DD):");
        if (!end) return;
        callAction("/api/admin/backfill-signals", { start_date: start, end_date: end }, "補歷史訊號");
    });

    // 📊 評估與學習
    bind("act-refresh-learning", () =>
        callAction("/api/admin/refresh-learning-summary", {}, "Refresh learning summary"));
    bind("act-verify-pred", () =>
        callAction("/api/admin/verify-predictions", {}, "Verify predictions"));
    bind("act-prediction-eval", () =>
        callAction("/api/admin/run-prediction-eval", {}, "跑 prediction summary"));

    // 🔍 Diagnostic
    bind("act-diagnose-futures", async () => {
        const d = prompt("輸入日期 (YYYY-MM-DD,留空 = 今天):");
        const date = d || new Date().toISOString().slice(0, 10);
        try {
            const r = await authFetch(`/api/admin/diagnose-futures?date=${date}`);
            const win = window.open("", "_blank", "width=900,height=600");
            win.document.write(`<pre>${escapeHtml(JSON.stringify(r, null, 2))}</pre>`);
        } catch (e) {
            toast("查詢失敗:" + e.message, "error");
        }
    });

    // ⚙️ 系統 / 危險
    bind("act-export-rules", () =>
        callAction("/api/admin/export-rules", {}, "匯出 rules.json"));
    bind("act-approve", () =>
        callAction("/api/admin/approve-report", {}, "通過最新 AI 報告"));
    bind("act-pause", () =>
        confirmAndRun("即將暫停每日排程!後續 daily 不會自動跑。",
                      "/api/admin/pause-jobs", {}, "暫停每日排程"));
    bind("act-resume", () =>
        callAction("/api/admin/resume-jobs", {}, "恢復每日排程"));
    bind("act-maintenance-on", () =>
        confirmAndRun("即將切換維護模式!用戶會看到維護中。",
                      null, null, "切換維護模式") || setMode("system_mode", "maintenance", "切換維護模式"));
    bind("act-maintenance-off", () =>
        setMode("system_mode", "normal", "恢復正常模式"));

    // ⛔ 初始化(僅首次,危險)
    bind("act-init-schema", () =>
        confirmAndRun("即將重建 DB schema!此動作會「重置」資料表結構,僅首次部署用。",
                      "/api/admin/init-schema", {}, "建立資料表"));
    bind("act-init-rules", () =>
        confirmAndRun("即將灌入初始規則!可能覆蓋既有規則。",
                      "/api/admin/init-rules", {}, "灌入初始規則"));

    // 每 30 秒自動刷新狀態(僅在已登入時)
    setInterval(() => {
        if (getToken() && $("admin-view").style.display !== "none") {
            refreshStatus();
        }
    }, 30000);
});
