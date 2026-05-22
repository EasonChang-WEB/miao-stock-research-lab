// =====================================================================
// 喵掌櫃股票研究所 — 前台 (index.html) JS
// =====================================================================

const CFG = window.MIAO_CONFIG || { API_BASE: "" };
const API = (p) => CFG.API_BASE.replace(/\/$/, "") + p;

// ---- Toast ----------------------------------------------------------
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
    setTimeout(() => el.classList.remove("show"), 3200);
}

// ---- API helper -----------------------------------------------------
async function apiGet(path) {
    const r = await fetch(API(path), { method: "GET" });
    if (!r.ok) throw new Error(`${r.status} ${r.statusText}`);
    return r.json();
}

// ---- Formatters -----------------------------------------------------
function fmtPct(x) {
    if (x === null || x === undefined) return "—";
    return (x * 100).toFixed(2) + "%";
}
function fmtNum(x, digits = 2) {
    if (x === null || x === undefined) return "—";
    return Number(x).toLocaleString(undefined, {
        minimumFractionDigits: digits, maximumFractionDigits: digits
    });
}
function fmtDate(x) {
    if (!x) return "—";
    return String(x).slice(0, 19).replace("T", " ");
}
function directionBadge(d) {
    const cls = d === "bullish" ? "bullish"
              : d === "bearish" ? "bearish" : "neutral";
    const label = d === "bullish" ? "偏多"
                : d === "bearish" ? "偏空" : "中性";
    return `<span class="badge ${cls}">${label}</span>`;
}
function statusBadge(ok, labelTrue = "在線", labelFalse = "離線") {
    return `<span class="badge ${ok ? "ok" : "danger"}">${ok ? labelTrue : labelFalse}</span>`;
}

// ---- 系統狀態 -------------------------------------------------------
async function loadSystem() {
    const el = document.getElementById("sys-status");
    try {
        const [h, s, r] = await Promise.all([
            apiGet("/api/health"),
            apiGet("/api/system/status"),
            apiGet("/api/research/status"),
        ]);
        const dbOk = h.database && h.database.ok;
        el.innerHTML = `
            <div class="card compact">
              <div class="label">API</div>
              <div class="value small">${statusBadge(h.ok)}</div>
            </div>
            <div class="card compact">
              <div class="label">資料庫</div>
              <div class="value small">${statusBadge(dbOk)}</div>
            </div>
            <div class="card compact">
              <div class="label">系統模式</div>
              <div class="value small">
                <span class="badge ${s.system_mode === "maintenance" ? "warn" : "ok"}">
                  ${s.system_mode || "?"}
                </span>
              </div>
            </div>
            <div class="card compact">
              <div class="label">每日排程</div>
              <div class="value small">
                ${statusBadge(s.daily_job_enabled, "ON", "已暫停")}
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
              <div class="label">規則版本</div>
              <div class="value small">${s.current_rule_version || "—"}</div>
            </div>
            <div class="card compact">
              <div class="label">活躍規則</div>
              <div class="value small">${r.active_rules ?? 0}</div>
            </div>
        `;
    } catch (e) {
        el.innerHTML = `<div class="card"><span class="danger">無法連接 API:${e.message}</span><br>
            <span class="muted">請確認 config.js 中的 API_BASE 是否正確。</span></div>`;
    }
}

// ---- 研究任務狀態 ---------------------------------------------------
async function loadResearch() {
    const el = document.getElementById("research-status");
    try {
        const r = await apiGet("/api/research/status");
        el.innerHTML = `
            <div class="stat-flex">
              <span class="pill">今日 features:${r.features_today ?? 0}</span>
              <span class="pill">今日 signals:${r.signals_today ?? 0}</span>
              <span class="pill">已完成 5D outcome:${r.outcomes_completed_5d ?? 0}</span>
              <span class="pill">活躍規則:${r.active_rules ?? 0}</span>
            </div>
            <div style="margin-top:10px">
              <span class="label">過去 7 日資料品質警示</span>
              <div>${
                Object.keys(r.data_quality_issues_7d || {}).length === 0
                  ? '<span class="muted">無</span>'
                  : Object.entries(r.data_quality_issues_7d).map(
                      ([k, v]) => `<span class="badge warn" style="margin-right:6px">${k}:${v}</span>`
                  ).join("")
              }</div>
            </div>
        `;
    } catch (e) {
        el.innerHTML = `<span class="muted">無資料</span>`;
    }
}

// ---- 規則摘要 -------------------------------------------------------
async function loadRules() {
    const el = document.getElementById("rules-summary");
    try {
        const r = await apiGet("/api/rules/latest");
        const rules = r.rules || [];
        const statusCnt = rules.reduce((acc, x) => {
            acc[x.status] = (acc[x.status] || 0) + 1; return acc;
        }, {});
        const rows = rules.slice(0, 15).map(rl => {
            const ev = rl.evaluation || {};
            const e5 = ev["5D"] || {};
            return `<tr>
                <td>${rl.rule_id}</td>
                <td>${rl.name}</td>
                <td>${directionBadge(
                    (rl.bias && (rl.bias.includes("多") ? "bullish"
                        : rl.bias.includes("空") ? "bearish" : "neutral")) || "neutral")}</td>
                <td>${rl.status}</td>
                <td>${e5.sample_count ?? "—"}</td>
                <td>${fmtPct(e5.win_rate)}</td>
                <td>${fmtPct(e5.avg_return)}</td>
            </tr>`;
        }).join("");
        el.innerHTML = `
            <div class="stat-flex" style="margin-bottom:10px">
              <span class="pill">總規則:${rules.length}</span>
              ${Object.entries(statusCnt).map(
                ([k, v]) => `<span class="pill">${k}:${v}</span>`).join("")}
              <span class="pill">版本:${r.version || "?"}</span>
            </div>
            <div class="scroll-y"><table>
              <thead><tr>
                <th>規則</th><th>名稱</th><th>方向</th><th>狀態</th>
                <th>樣本</th><th>5D 勝率</th><th>5D 平均</th>
              </tr></thead>
              <tbody>${rows || `<tr><td colspan="7" class="muted">無資料</td></tr>`}</tbody>
            </table></div>
        `;
    } catch (e) {
        el.innerHTML = `<span class="muted">無資料</span>`;
    }
}

// ---- 今日訊號 -------------------------------------------------------
async function loadSignals() {
    const el = document.getElementById("today-signals");
    try {
        const r = await apiGet("/api/signals/today");
        if (!r.date || (r.items || []).length === 0) {
            el.innerHTML = `<span class="muted">尚無訊號</span>`; return;
        }
        const rows = r.items.map(s => `
          <tr>
            <td>${s.symbol}</td>
            <td>${s.name || ""}</td>
            <td>${s.signal_code}</td>
            <td>${directionBadge(s.direction)}</td>
            <td>${fmtNum(s.strength, 2)}</td>
            <td>${s.rule_id || ""}</td>
          </tr>
        `).join("");
        el.innerHTML = `
          <div class="muted" style="margin-bottom:8px">日期:${r.date}  •  共 ${r.count} 筆</div>
          <div class="scroll-y"><table>
            <thead><tr><th>代號</th><th>名稱</th><th>訊號</th>
              <th>方向</th><th>強度</th><th>規則</th></tr></thead>
            <tbody>${rows}</tbody>
          </table></div>
        `;
    } catch (e) {
        el.innerHTML = `<span class="muted">無資料</span>`;
    }
}

// ---- 最新研究報告 ---------------------------------------------------
async function loadReport() {
    const el = document.getElementById("latest-report");
    try {
        const r = await apiGet("/api/reports/latest");
        if (!r.report) { el.innerHTML = `<span class="muted">尚無研究報告</span>`; return; }
        const rep = r.report;
        const sug = rep.rule_suggestions || {};
        el.innerHTML = `
          <div class="muted" style="margin-bottom:6px">
            ${rep.week_start} ~ ${rep.week_end} •
            <span class="badge ${rep.approved_status === "approved" ? "ok"
              : rep.approved_status === "rejected" ? "danger" : "warn"}">
              ${rep.approved_status}
            </span>
          </div>
          <div style="white-space: pre-wrap; line-height:1.65">${rep.findings || ""}</div>
          ${(sug.rule_suggestions || []).length > 0 ? `
            <details style="margin-top:10px"><summary>規則建議 (${sug.rule_suggestions.length})</summary>
              <pre style="white-space:pre-wrap; background:#fbf7f1; padding:10px; border-radius:6px;">${JSON.stringify(sug.rule_suggestions, null, 2)}</pre>
            </details>` : ""}
        `;
    } catch (e) {
        el.innerHTML = `<span class="muted">無資料</span>`;
    }
}

// ---- 單檔查詢 -------------------------------------------------------
async function lookupStock() {
    const inp = document.getElementById("symbol-input");
    const sym = (inp.value || "").trim();
    const out = document.getElementById("stock-result");
    if (!sym) { toast("請輸入股票代號", "error"); return; }
    out.innerHTML = `<span class="spinner"></span> 查詢中...`;
    try {
        const [sum, sigs, fc] = await Promise.all([
            apiGet(`/api/stocks/${sym}/summary`),
            apiGet(`/api/stocks/${sym}/signals`),
            apiGet(`/api/stocks/${sym}/forecast`),
        ]);
        if (sum.error) { out.innerHTML = `<span class="danger">${sum.error}</span>`; return; }
        const info = sum.info;
        const lastPx = sum.prices && sum.prices.length
            ? sum.prices[sum.prices.length - 1] : null;
        const ft = sum.features_today || {};
        const sigRows = (sigs.items || []).slice(0, 15).map(s => `
          <tr><td>${s.date}</td><td>${s.signal_code}</td>
              <td>${directionBadge(s.direction)}</td>
              <td>${fmtPct(s.return_1d)}</td>
              <td>${fmtPct(s.return_5d)}</td>
              <td>${fmtPct(s.return_20d)}</td></tr>`).join("");
        const fcRows = (fc.items || []).map(f => `
          <tr><td>${f.horizon}</td>
              <td>${fmtPct(f.prob_up)}</td>
              <td>${fmtPct(f.prob_down)}</td>
              <td>${fmtPct(f.prob_sideways)}</td>
              <td>${fmtNum(f.confidence_score, 2)}</td></tr>`).join("");
        out.innerHTML = `
          <div class="card">
            <h3 style="margin-top:0">${info.symbol} ${info.name}
              <span class="muted" style="font-size:13px">(${info.category || "?"})</span></h3>
            <div class="stat-flex">
              <span class="pill">收盤:${lastPx ? fmtNum(lastPx.close) : "—"}</span>
              <span class="pill">MA20:${fmtNum(ft.ma20)}</span>
              <span class="pill">RSI14:${fmtNum(ft.rsi14)}</span>
              <span class="pill">K:${fmtNum(ft.kd_k)} / D:${fmtNum(ft.kd_d)}</span>
            </div>
            <h4>最近訊號</h4>
            <div class="scroll-y"><table>
              <thead><tr><th>日期</th><th>訊號</th><th>方向</th>
                <th>1D</th><th>5D</th><th>20D</th></tr></thead>
              <tbody>${sigRows || `<tr><td colspan="6" class="muted">無</td></tr>`}</tbody>
            </table></div>
            <h4>機率預測(最新)</h4>
            <table>
              <thead><tr><th>期間</th><th>上漲</th><th>下跌</th>
                <th>震盪</th><th>信心</th></tr></thead>
              <tbody>${fcRows || `<tr><td colspan="5" class="muted">無</td></tr>`}</tbody>
            </table>
          </div>
        `;
    } catch (e) {
        out.innerHTML = `<span class="danger">查詢失敗:${e.message}</span>`;
    }
}

// ---- 初始載入 + 自動刷新 --------------------------------------------
async function refresh() {
    await Promise.all([
        loadSystem(), loadResearch(), loadRules(),
        loadSignals(), loadReport(),
    ]);
    document.getElementById("last-refresh").textContent =
        new Date().toLocaleString(CFG.LOCALE || "zh-TW");
}

window.addEventListener("DOMContentLoaded", () => {
    refresh();
    setInterval(refresh, CFG.AUTO_REFRESH_MS || 60000);

    document.getElementById("refresh-btn").addEventListener("click", refresh);
    document.getElementById("lookup-btn").addEventListener("click", lookupStock);
    document.getElementById("symbol-input").addEventListener("keydown", e => {
        if (e.key === "Enter") lookupStock();
    });
});
