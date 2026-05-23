// =====================================================================
// 喵掌櫃股票研究所 — Dashboard (v2)
// =====================================================================
"use strict";

const CFG = window.MIAO_CONFIG || { API_BASE: "" };
const API_BASE = (CFG.API_BASE || "").replace(/\/$/, "");
const REFRESH_MS = CFG.AUTO_REFRESH_MS || 60000;
const api = (p) => API_BASE + p;

// ---- DOM helpers ----------------------------------------------------
const $ = (id) => document.getElementById(id);
const setText = (id, v) => { const el = $(id); if (el) el.textContent = v ?? "--"; };
const setHTML = (id, h) => { const el = $(id); if (el) el.innerHTML = h; };

function escapeHtml(s) {
    if (s === null || s === undefined) return "";
    return String(s).replace(/[&<>"']/g, c => (
        {"&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;"}[c]
    ));
}

// ---- Formatters -----------------------------------------------------
const fmt = {
    pct(x, digits = 2) {
        if (x === null || x === undefined || isNaN(x)) return "—";
        return (Number(x) * 100).toFixed(digits) + "%";
    },
    num(x, digits = 2) {
        if (x === null || x === undefined || isNaN(x)) return "—";
        return Number(x).toLocaleString(undefined, {
            minimumFractionDigits: digits, maximumFractionDigits: digits,
        });
    },
    int(x) {
        if (x === null || x === undefined || isNaN(x)) return "—";
        return Number(x).toLocaleString();
    },
    date(x) {
        if (!x) return "—";
        return String(x).slice(0, 10);
    },
    datetime(x) {
        if (!x) return "—";
        return String(x).slice(0, 19).replace("T", " ");
    },
    ago(x) {
        if (!x) return "—";
        const ms = Date.now() - new Date(x).getTime();
        if (ms < 0) return fmt.datetime(x);
        const sec = Math.floor(ms / 1000);
        if (sec < 60) return `${sec}s ago`;
        const min = Math.floor(sec / 60);
        if (min < 60) return `${min}m ago`;
        const hr = Math.floor(min / 60);
        if (hr < 24) return `${hr}h ago`;
        return `${Math.floor(hr / 24)}d ago`;
    },
};

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
    setTimeout(() => el.classList.remove("show"), 3000);
}

// ---- HTTP -----------------------------------------------------------
async function apiGet(path) {
    if (!API_BASE) throw new Error("API_BASE 未設定,請編輯 config.js");
    const r = await fetch(api(path), { method: "GET", cache: "no-store" });
    if (!r.ok) throw new Error(`${r.status} ${r.statusText}`);
    return r.json();
}

// ---- Direction / Bias helpers --------------------------------------
function directionTag(d) {
    if (d === "bullish") return `<span class="tag up">▲ 偏多</span>`;
    if (d === "bearish") return `<span class="tag down">▼ 偏空</span>`;
    return `<span class="tag muted">— 中性</span>`;
}
function biasTag(bias) {
    if (!bias) return `<span class="tag muted">—</span>`;
    if (bias.includes("空")) return `<span class="tag down">${escapeHtml(bias)}</span>`;
    if (bias.includes("多")) return `<span class="tag up">${escapeHtml(bias)}</span>`;
    return `<span class="tag muted">${escapeHtml(bias)}</span>`;
}
function statusTag(s) {
    const cls = ({active:"up", watch:"warn", testing:"info",
                  draft:"muted", deprecated:"muted", rejected:"down"})[s] || "muted";
    return `<span class="tag ${cls}">${escapeHtml(s)}</span>`;
}

// ---- Connection state --------------------------------------------------
let lastSuccess = null;

function showConnError(err) {
    const msg = `<div class="error-banner">
        <b>無法連接 API</b>:${escapeHtml(err.message || err)}<br>
        <span class="muted">API_BASE = <code>${escapeHtml(API_BASE || "(未設定)")}</code></span><br>
        <span class="muted" style="font-size:11px">
        檢查清單:① config.js 的 API_BASE 是否正確 ② Replit 後台是否在 Run 模式 ③ Replit dev URL 可能要登入 Replit 帳號才能訪問,正式部署請改用 Deployment URL (.replit.app)
        </span>
    </div>`;
    setHTML("signals-body", msg);
    setHTML("rules-body", `<div class="empty">—</div>`);
    setHTML("report-body", `<div class="empty">—</div>`);
}

function updateConnStatus(apiOk, dbOk) {
    const apiDot = $("api-dot"), apiLabel = $("api-label");
    const dbDot = $("db-dot"), dbLabel = $("db-label");
    if (apiOk) {
        apiDot.className = "dot up";
        apiLabel.textContent = "API";
    } else {
        apiDot.className = "dot down";
        apiLabel.textContent = "API";
    }
    if (dbOk) {
        dbDot.className = "dot up";
        dbLabel.textContent = "DB";
    } else {
        dbDot.className = "dot down";
        dbLabel.textContent = "DB";
    }
}

// =====================================================================
// 載入各區塊
// =====================================================================
async function loadKPIs() {
    const [health, system, research] = await Promise.all([
        apiGet("/api/health").catch(() => null),
        apiGet("/api/system/status").catch(() => null),
        apiGet("/api/research/status").catch(() => null),
    ]);
    updateConnStatus(!!health?.ok, !!health?.database?.ok);

    if (system) {
        setText("v-mode", system.system_mode || "?");
        setText("v-mode-sub", system.daily_job_enabled
            ? "排程 ON" : "排程已暫停");
        $("kpi-mode").className = "kpi " + (system.system_mode === "maintenance" ? "warn" : "");

        setText("v-data-date", fmt.date(system.last_data_date));
        setText("v-data-date-sub", system.last_daily_run_at
            ? fmt.ago(system.last_daily_run_at) : "尚未跑批");

        setText("v-version", system.current_rule_version || "?");
        setText("v-version-sub", system.last_export_at
            ? `exported ${fmt.ago(system.last_export_at)}` : "未匯出");
    }
    if (research) {
        setText("v-rules", research.active_rules ?? "—");
        setText("v-rules-sub", "active");

        setText("v-signals", research.signals_today ?? 0);
        setText("v-signals-sub", "today");

        setText("v-features", research.features_today ?? 0);
        setText("v-features-sub", "今日");

        setText("v-outcomes", research.outcomes_completed_5d ?? 0);
        setText("v-outcomes-sub", "全期累計");

        const q = research.data_quality_issues_7d || {};
        const qTotal = Object.values(q).reduce((a, b) => a + b, 0);
        setText("v-quality", qTotal);
        $("kpi-quality").className = "kpi " + (qTotal > 0 ? "warn" : "good");
        const issues = Object.keys(q).length ? Object.entries(q).map(([k, v]) =>
            `${k}:${v}`).join(" / ") : "無異常";
        setText("v-quality-sub", issues);
    }
    if (system) {
        const lastJob = system.last_job;
        if (lastJob && lastJob.job_name) {
            setText("api-base-label",
                `last job · ${lastJob.job_name} (${lastJob.status})`);
        } else {
            setText("api-base-label", API_BASE);
        }
    }
}

async function loadSignals() {
    try {
        const r = await apiGet("/api/signals/today");
        setText("signals-meta", r.date ? `${r.date} · ${r.count} 筆` : "—");
        const items = r.items || [];
        if (!items.length) {
            setHTML("signals-body", `<div class="empty">本日尚未偵測到訊號</div>`);
            return;
        }
        const rows = items.map(s => `
            <tr>
                <td class="mono"><strong>${escapeHtml(s.symbol)}</strong></td>
                <td class="name">${escapeHtml(s.name || "")}</td>
                <td><span class="tag accent">${escapeHtml(s.signal_code)}</span></td>
                <td>${directionTag(s.direction)}</td>
                <td class="num">${fmt.num(s.strength, 2)}</td>
                <td class="dim">${escapeHtml(s.rule_id || "")}</td>
            </tr>`).join("");
        setHTML("signals-body", `<table class="data">
            <thead><tr>
                <th>代號</th><th>名稱</th><th>訊號</th>
                <th>方向</th><th class="num">強度</th><th>規則</th>
            </tr></thead><tbody>${rows}</tbody></table>`);
    } catch (e) {
        setHTML("signals-body", `<div class="empty">讀取失敗:${escapeHtml(e.message)}</div>`);
    }
}

async function loadRules() {
    try {
        const r = await apiGet("/api/rules/latest");
        const rules = r.rules || [];
        const counts = rules.reduce((acc, x) => {
            acc[x.status] = (acc[x.status] || 0) + 1; return acc;
        }, {});
        const tag = (k, v) => `<span class="tag ${
            k==='active'?'up':k==='watch'?'warn':k==='testing'?'info':'muted'
        }">${k}:${v}</span>`;
        const counterHtml = Object.entries(counts).map(([k, v]) => tag(k, v)).join(" ");
        setText("rules-meta", `${rules.length} 條 · v${r.version || "?"}`);
        const rows = rules.slice(0, 30).map(rl => {
            const ev = rl.evaluation || {};
            const e5 = ev["5D"] || {};
            const winRate = e5.win_rate;
            const winCls = winRate >= 0.55 ? "pos" : winRate <= 0.45 ? "neg" : "";
            return `<tr>
                <td class="mono">${escapeHtml(rl.rule_id)}</td>
                <td class="name">${escapeHtml(rl.name || "")}</td>
                <td>${biasTag(rl.bias)}</td>
                <td>${statusTag(rl.status)}</td>
                <td class="num">${e5.sample_count ?? "—"}</td>
                <td class="num ${winCls}">${fmt.pct(winRate, 1)}</td>
            </tr>`;
        }).join("");
        const summary = `<div style="padding:6px 12px; border-bottom:1px solid var(--border); display:flex; gap:6px; flex-wrap:wrap">${counterHtml}</div>`;
        setHTML("rules-body", summary + `<table class="data">
            <thead><tr><th>規則</th><th>名稱</th><th>方向</th>
                <th>狀態</th><th class="num">樣本</th><th class="num">5D 勝率</th></tr></thead>
            <tbody>${rows}</tbody></table>`);
    } catch (e) {
        setHTML("rules-body", `<div class="empty">讀取失敗:${escapeHtml(e.message)}</div>`);
    }
}

async function loadReport() {
    try {
        const r = await apiGet("/api/reports/latest");
        if (!r.report) {
            setHTML("report-body", `<div class="empty">尚無研究報告<br>
                <span style="font-size:11px">啟動 AI 研究員後產生</span></div>`);
            setText("report-meta", "—");
            return;
        }
        const rep = r.report;
        const sug = rep.rule_suggestions || {};
        const status = rep.approved_status;
        const statusTag = `<span class="tag ${
            status==="approved" ? "up" : status==="rejected" ? "down" : "warn"
        }">${escapeHtml(status)}</span>`;
        setText("report-meta", `${fmt.date(rep.week_start)} ~ ${fmt.date(rep.week_end)}`);
        let bodyHtml = `<div style="margin-bottom:8px">${statusTag}</div>`;
        bodyHtml += `<div class="findings">${escapeHtml(rep.findings || "(空)")}</div>`;
        if (sug.risk_reminders?.length) {
            bodyHtml += `<div class="section-title">風險提醒</div>`;
            bodyHtml += sug.risk_reminders.map(r =>
                `<div style="font-size:11.5px; color:var(--warn); margin:2px 0">• ${escapeHtml(r)}</div>`
            ).join("");
        }
        if (sug.rule_suggestions?.length) {
            bodyHtml += `<div class="section-title">規則建議 (${sug.rule_suggestions.length})</div>`;
            bodyHtml += sug.rule_suggestions.slice(0, 3).map(s =>
                `<div class="tag info" style="margin:2px 4px 2px 0">${escapeHtml(s.rule_id || "")} ${escapeHtml(s.action || "")}</div>`
            ).join("");
        }
        setHTML("report-body", bodyHtml);
    } catch (e) {
        setHTML("report-body", `<div class="empty">讀取失敗:${escapeHtml(e.message)}</div>`);
    }
}

// ---- Single stock lookup --------------------------------------------
async function lookupStock() {
    const sym = $("symbol-input").value.trim();
    if (!sym) { toast("請輸入股票代號", "error"); return; }
    const resBox = $("lookup-result");
    resBox.innerHTML = `<span class="spinner"></span> 查詢中...`;
    try {
        const [sum, sigs, fc] = await Promise.all([
            apiGet(`/api/stocks/${sym}/summary`),
            apiGet(`/api/stocks/${sym}/signals`),
            apiGet(`/api/stocks/${sym}/forecast`),
        ]);
        resBox.innerHTML = "";
        if (sum.error) { toast(sum.error, "error"); return; }
        const info = sum.info, lastPx = (sum.prices || []).slice(-1)[0],
              ft = sum.features_today || {};
        const fcRows = (fc.items || []).map(f => `
            <tr><td><span class="tag accent">${escapeHtml(f.horizon)}</span></td>
                <td class="num pos">${fmt.pct(f.prob_up)}</td>
                <td class="num neg">${fmt.pct(f.prob_down)}</td>
                <td class="num dim">${fmt.pct(f.prob_sideways)}</td>
                <td class="num">${fmt.num(f.confidence_score, 2)}</td></tr>`).join("");
        const sigRows = (sigs.items || []).slice(0, 15).map(s => `
            <tr><td class="mono">${escapeHtml(s.date)}</td>
                <td><span class="tag accent">${escapeHtml(s.signal_code)}</span></td>
                <td>${directionTag(s.direction)}</td>
                <td class="num ${s.return_1d >= 0 ? 'pos' : 'neg'}">${fmt.pct(s.return_1d)}</td>
                <td class="num ${s.return_5d >= 0 ? 'pos' : 'neg'}">${fmt.pct(s.return_5d)}</td>
                <td class="num ${s.return_20d >= 0 ? 'pos' : 'neg'}">${fmt.pct(s.return_20d)}</td></tr>`).join("");
        setText("lookup-title",
            `${info.symbol} ${info.name}  (${info.category || "?"})`);
        setHTML("lookup-modal-body", `
            <div class="stat-grid" style="grid-template-columns:repeat(4,1fr); margin-bottom:12px">
                <div class="row"><span class="k">收盤</span><span class="v">${lastPx ? fmt.num(lastPx.close) : "—"}</span></div>
                <div class="row"><span class="k">MA20</span><span class="v">${fmt.num(ft.ma20)}</span></div>
                <div class="row"><span class="k">RSI14</span><span class="v">${fmt.num(ft.rsi14, 1)}</span></div>
                <div class="row"><span class="k">K/D</span><span class="v">${fmt.num(ft.kd_k, 1)} / ${fmt.num(ft.kd_d, 1)}</span></div>
            </div>
            <div class="section-title">機率預測(最新)</div>
            <table class="data">
                <thead><tr><th>期間</th><th class="num">上漲</th><th class="num">下跌</th>
                    <th class="num">震盪</th><th class="num">信心</th></tr></thead>
                <tbody>${fcRows || `<tr><td colspan="5" class="dim">無預測資料</td></tr>`}</tbody>
            </table>
            <div class="section-title">最近 15 筆訊號</div>
            <table class="data">
                <thead><tr><th>日期</th><th>訊號</th><th>方向</th>
                    <th class="num">1D</th><th class="num">5D</th><th class="num">20D</th></tr></thead>
                <tbody>${sigRows || `<tr><td colspan="6" class="dim">無訊號紀錄</td></tr>`}</tbody>
            </table>`);
        $("lookup-modal").classList.add("show");
    } catch (e) {
        resBox.innerHTML = `<span class="tag down">查詢失敗</span> ${escapeHtml(e.message)}`;
    }
}

// =====================================================================
// Main loop
// =====================================================================
async function refreshAll() {
    if (!API_BASE) {
        showConnError({ message: "API_BASE 未設定" });
        return;
    }
    try {
        await Promise.all([
            loadKPIs(), loadSignals(), loadRules(), loadReport(),
        ]);
        lastSuccess = new Date();
        setText("last-update", lastSuccess.toLocaleTimeString());
    } catch (e) {
        console.error(e);
        showConnError(e);
    }
}

function tickClock() {
    const d = new Date();
    setText("clock", d.toLocaleTimeString("zh-TW", { hour12: false }));
}

window.addEventListener("DOMContentLoaded", () => {
    setText("api-base-label", API_BASE || "API_BASE 未設定");
    setText("refresh-interval", `${REFRESH_MS / 1000}s`);
    tickClock();
    setInterval(tickClock, 1000);

    refreshAll();
    setInterval(refreshAll, REFRESH_MS);

    $("refresh-btn").addEventListener("click", () => {
        toast("正在重新整理...");
        refreshAll();
    });
    $("lookup-btn").addEventListener("click", lookupStock);
    $("symbol-input").addEventListener("keydown", e => {
        if (e.key === "Enter") lookupStock();
    });
    $("lookup-close").addEventListener("click", () => {
        $("lookup-modal").classList.remove("show");
    });
    $("lookup-modal").addEventListener("click", e => {
        if (e.target.id === "lookup-modal") {
            $("lookup-modal").classList.remove("show");
        }
    });
});
