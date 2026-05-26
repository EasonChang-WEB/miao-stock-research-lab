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

// 5-level confidence badge (v0.5.4: 縮減星等到最多 ★★★,移除 emoji)
function confidenceBadge(level, prob) {
    const pct = prob != null ? (Number(prob) * 100).toFixed(0) : "—";
    const map = {
        strong_bullish: { cls: "sb",  txt: "★★★ 強偏多" },
        bullish:        { cls: "b",   txt: "★★ 偏多"    },
        neutral:        { cls: "neu", txt: "— 中性"     },
        bearish:        { cls: "be",  txt: "▼▼ 偏空"    },
        strong_bearish: { cls: "sbe", txt: "▼▼▼ 強偏空" },
    };
    const m = map[level] || map.neutral;
    return `<span class="conf-badge ${m.cls}" title="${pct}%">${m.txt} ${pct}%</span>`;
}

function hitBadge(isHit) {
    if (isHit === true) return `<span class="tag up">✅</span>`;
    if (isHit === false) return `<span class="tag down">❌</span>`;
    return `<span class="tag muted">⌛</span>`;
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

    // v0.9.3: 整合 KPI → footer 一行小字
    if (system) {
        setText("sb-data-date", fmt.date(system.last_data_date));
        setText("sb-mode", system.system_mode || "?");
        setText("sb-version", system.current_rule_version || "?");
    }
    if (research) {
        const sig = research.signals_today ?? 0;
        const rules = research.active_rules ?? "—";
        setText("sb-signals", `${sig}/${rules}`);

        const q = research.data_quality_issues_7d || {};
        const qTotal = Object.values(q).reduce((a, b) => a + b, 0);
        setText("sb-quality", qTotal > 0 ? `⚠️${qTotal}` : "OK");
    }
    if (system) {
        const lastJob = system.last_job;
        if (lastJob && lastJob.job_name) {
            setText("api-base-label",
                `last_job: ${lastJob.job_name}(${lastJob.status})`);
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
        const raw = r.rules || [];
        // v0.5: 去重 — 同一 rule_id 取第一筆(避免 5D/20D 重複顯示)
        const seen = new Set();
        const rules = [];
        for (const rl of raw) {
            if (seen.has(rl.rule_id)) continue;
            seen.add(rl.rule_id);
            rules.push(rl);
        }
        const counts = rules.reduce((acc, x) => {
            acc[x.status] = (acc[x.status] || 0) + 1; return acc;
        }, {});
        const tag = (k, v) => `<span class="tag ${
            k==='active'?'up':k==='watch'?'warn':k==='testing'?'info':'muted'
        }">${k}:${v}</span>`;
        const counterHtml = Object.entries(counts).map(([k, v]) => tag(k, v)).join(" ");
        setText("rules-meta", `${rules.length} 條(去重後)· v${r.version || "?"}`);
        // 不再 slice,顯示全部
        const rows = rules.map(rl => {
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
        const [sum, sigs, fc, predHist] = await Promise.all([
            apiGet(`/api/stocks/${sym}/summary`),
            apiGet(`/api/stocks/${sym}/signals`),
            apiGet(`/api/stocks/${sym}/forecast`),
            apiGet(`/api/predictions/${sym}/history?limit=30`).catch(() => null),
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

        // v0.4 — 個股預測命中率區塊
        let predBlock = "";
        if (predHist && predHist.total_verified != null) {
            const ovr = predHist.overall_rate;
            const rateColor = ovr >= 0.6 ? "pos" : ovr >= 0.5 ? "" : "neg";
            const sbRate = predHist.strong_bullish_n
                ? (predHist.strong_bullish_hit / predHist.strong_bullish_n * 100).toFixed(0) + "%"
                : "—";
            const sbeRate = predHist.strong_bearish_n
                ? (predHist.strong_bearish_hit / predHist.strong_bearish_n * 100).toFixed(0) + "%"
                : "—";
            const histRows = (predHist.items || []).slice(0, 12).map(p => `
                <tr><td class="mono">${fmt.date(p.prediction_date)}</td>
                    <td>${confidenceBadge(p.confidence_level, p.bullish_prob)}</td>
                    <td class="num">${fmt.pct(p.actual_return_1d, 2)}</td>
                    <td>${hitBadge(p.is_hit)}</td></tr>`).join("");
            predBlock = `
                <div class="section-title">本檔預測命中率</div>
                <div class="stat-grid" style="grid-template-columns:repeat(3,1fr); margin-bottom:8px">
                    <div class="row"><span class="k">整體命中</span>
                        <span class="v ${rateColor}">${fmt.pct(ovr, 1)}</span></div>
                    <div class="row"><span class="k">強偏多</span>
                        <span class="v">${sbRate} (${predHist.strong_bullish_n || 0})</span></div>
                    <div class="row"><span class="k">強偏空</span>
                        <span class="v">${sbeRate} (${predHist.strong_bearish_n || 0})</span></div>
                </div>
                <table class="data">
                    <thead><tr><th>日期</th><th>預測</th>
                        <th class="num">實際 1D</th><th>命中</th></tr></thead>
                    <tbody>${histRows || `<tr><td colspan="4" class="dim">尚無預測紀錄</td></tr>`}</tbody>
                </table>`;
        }

        setHTML("lookup-modal-body", `
            <div class="stat-grid" style="grid-template-columns:repeat(4,1fr); margin-bottom:12px">
                <div class="row"><span class="k">收盤</span><span class="v">${lastPx ? fmt.num(lastPx.close) : "—"}</span></div>
                <div class="row"><span class="k">MA20</span><span class="v">${fmt.num(ft.ma20)}</span></div>
                <div class="row"><span class="k">RSI14</span><span class="v">${fmt.num(ft.rsi14, 1)}</span></div>
                <div class="row"><span class="k">K/D</span><span class="v">${fmt.num(ft.kd_k, 1)} / ${fmt.num(ft.kd_d, 1)}</span></div>
            </div>
            ${predBlock}
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
async function loadPredictionHero() {
    try {
        // v0.9.3 改版:Hero 4 欄(合議/方向感/中性比例/樣本)
        const [v08, quadrant] = await Promise.all([
            apiGet("/api/prediction/overall-v08").catch(() => null),
            apiGet("/api/prediction/quadrant").catch(() => null),
        ]);
        const fmtPct = (v) => v != null ? (v * 100).toFixed(1) + "%" : "--%";

        if (v08 && v08.windows) {
            const all = v08.windows.all || {};
            const w30 = v08.windows["30d"] || {};
            setText("hero-final-all", fmtPct(all.final_hit_rate));
            setText("hero-final-30",  fmtPct(w30.final_hit_rate));
            setText("hero-dir-all",   fmtPct(all.directional_hit_rate));
            setText("hero-dir-30",    fmtPct(w30.directional_hit_rate));
            setText("hero-neu-all",   fmtPct(all.neutral_ratio));
            setText("hero-neu-hit",   fmtPct(all.neutral_hit_rate));

            const sampN = all.n ?? 0;
            setText("hero-sample-n", sampN.toLocaleString());
            setText("hero-sample-info", `已驗證 · 30d ${w30.n ?? 0}`);
        }

        // 後台保留 Math + AI 老 overall(給其他區塊用)
        const overall = await apiGet("/api/prediction/overall").catch(() => null);
        const all_v07 = (overall && overall.windows && overall.windows.all) || {};

        // v0.6 Math × AI 四象限
        if (quadrant && quadrant.windows) {
            const qa = quadrant.windows.all || {};
            const setQ = (id, v) => setText(id, v != null ? (v * 100).toFixed(1) + "%" : "--%");
            setQ("quadrant-consensus", qa.consensus_hit_rate);
            setQ("quadrant-ai-correction", qa.ai_correction_value);
            setQ("quadrant-disagree", qa.disagreement_rate);
            setText("quadrant-both-miss-n",
                `共同盲點 ${qa.quadrant_both_miss ?? 0}/${qa.both_directional_n ?? 0}`);
        }

        // v0.9.3:5 個信心級卡 + sparkline 已從 UI 移除,不再 fillCell
        // 保留 all_v07 變數讓 quadrant 區段不報錯
    } catch (e) {
        console.warn("hero prediction failed:", e);
    }
}

async function loadTodayPredictions() {
    try {
        const r = await apiGet("/api/predictions/today");
        const basis = r.basis_date, target = r.target_date;
        // v0.9.3: title 改成 真實下次交易日期
        if (target) {
            setText("predictions-title", `下次交易日預測 (${fmt.date(target)})`);
        } else {
            setText("predictions-title", "下次交易日預測");
        }
        const metaTxt = basis
            ? `基準日 ${fmt.date(basis)} · ${r.count} 檔`
            : "—";
        setText("predictions-meta", metaTxt);
        const items = r.items || [];
        if (!items.length) {
            setHTML("predictions-body", `<div class="empty">尚無預測資料<br>
                <span style="font-size:11px">須先跑 run_daily 或 run-prediction-backfill</span></div>`);
            return;
        }
        const rows = items.map(p => {
            const sigSnip = Array.isArray(p.main_signals) && p.main_signals.length
                ? p.main_signals.slice(0, 3).map(s => escapeHtml(s.rule_id)).join("·")
                : "—";
            // AI 預測欄(v0.5.4: narrative 只放 title hover,不顯示文字)
            const hasAi = p.ai_bullish_prob != null;
            const aiCell = hasAi
                ? `<span title="${escapeHtml(p.ai_narrative||'(無 AI 說明)')}">${confidenceBadge(p.ai_confidence_level, p.ai_bullish_prob)}</span>`
                : `<span class="tag muted">⌛ 待生成</span>`;
            return `<tr>
                <td class="mono"><strong>${escapeHtml(p.symbol)}</strong></td>
                <td class="name">${escapeHtml(p.symbol_name || "")}</td>
                <td>${confidenceBadge(p.confidence_level, p.bullish_prob)}</td>
                <td>${aiCell}</td>
                <td class="dim" title="${escapeHtml((p.main_signals||[]).map(s=>s.rule_id).join(', '))}">${sigSnip}</td>
                <td class="dim">${escapeHtml(p.regime_label || "—")}</td>
            </tr>`;
        }).join("");
        setHTML("predictions-body", `<table class="data">
            <thead><tr>
                <th>代號</th><th>名稱</th>
                <th>Math 預測</th><th>AI 預測</th>
                <th>主要規則</th><th>市況</th>
            </tr></thead><tbody>${rows}</tbody></table>`);
    } catch (e) {
        setHTML("predictions-body", `<div class="empty">讀取失敗:${escapeHtml(e.message)}</div>`);
    }
}

// v0.5.5 — 最近預測驗證結果面板
async function loadVerifications() {
    try {
        const r = await apiGet("/api/predictions/recent-verified?limit=30");
        setText("verifications-meta", `${r.count || 0} 筆`);
        const items = r.items || [];
        if (!items.length) {
            setHTML("verifications-body", `<div class="empty">尚無已驗證紀錄<br>
                <span style="font-size:11px">等下次交易日後 T+1 結果會回填</span></div>`);
            return;
        }
        const rows = items.map(v => {
            const ret = v.actual_return_1d;
            const retStr = ret != null
                ? `<span class="${ret > 0 ? 'pos' : ret < 0 ? 'neg' : 'dim'}">${ret > 0 ? '+' : ''}${(ret * 100).toFixed(2)}%</span>`
                : '—';
            // v0.6 分歧標籤
            let diffTag = '';
            if (v.is_hit !== null && v.ai_is_hit !== null) {
                if (v.is_hit && v.ai_is_hit)        diffTag = '<span class="tag" style="background:rgba(167,139,250,.15);color:#a78bfa">共識✓</span>';
                else if (!v.is_hit && !v.ai_is_hit) diffTag = '<span class="tag" style="background:rgba(107,114,128,.15);color:#9ca3af">共識✗</span>';
                else if (v.is_hit && !v.ai_is_hit)  diffTag = '<span class="tag" style="background:rgba(74,222,128,.15);color:#86efac">M對</span>';
                else                                 diffTag = '<span class="tag" style="background:rgba(251,191,36,.15);color:#fbbf24">AI對</span>';
            }
            return `<tr>
                <td class="mono dim">${fmt.date(v.prediction_date)}</td>
                <td class="mono"><strong>${escapeHtml(v.symbol)}</strong></td>
                <td class="name">${escapeHtml(v.symbol_name || "")}</td>
                <td>${v.confidence_level ? confidenceBadge(v.confidence_level, v.bullish_prob) : '—'}</td>
                <td>${v.ai_confidence_level ? confidenceBadge(v.ai_confidence_level, v.ai_bullish_prob) : '<span class="tag muted">—</span>'}</td>
                <td class="num">${retStr}</td>
                <td>${hitBadge(v.is_hit)} / ${hitBadge(v.ai_is_hit)}</td>
                <td>${diffTag}</td>
            </tr>`;
        }).join("");
        setHTML("verifications-body", `<table class="data">
            <thead><tr>
                <th>預測日</th><th>代號</th><th>名稱</th>
                <th>Math</th><th>AI</th>
                <th class="num">實際</th><th>命中</th><th>分歧</th>
            </tr></thead><tbody>${rows}</tbody></table>`);
    } catch (e) {
        setHTML("verifications-body", `<div class="empty">讀取失敗:${escapeHtml(e.message)}</div>`);
    }
}

async function refreshAll() {
    if (!API_BASE) {
        showConnError({ message: "API_BASE 未設定" });
        return;
    }
    try {
        await Promise.all([
            loadKPIs(), loadPredictionHero(), loadTodayPredictions(),
            loadVerifications(), loadDisagreementCard(),
            loadSignals(), loadRules(), loadReport(),
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

// =====================================================================
// v0.9.2 — strong_disagreement 警示卡(文案紀律版)
// =====================================================================
async function loadDisagreementCard() {
    try {
        const r = await apiGet("/api/prediction/strong-disagreement?days=7");
        const items = r.items || [];
        const stats = r.stats || {};
        setText("disagree-meta",
            `近 7 天 ${r.count || 0} 筆 · 30 天中性收斂率 ${
                stats.neutral_converge_rate != null
                    ? (stats.neutral_converge_rate * 100).toFixed(1) + "%"
                    : "--"
            }`);
        if (!items.length) {
            setHTML("disagree-body",
                `<div class="empty">近 7 天無強烈分歧記錄</div>`);
            return;
        }
        const rows = items.slice(0, 10).map(v => {
            const mathDir = v.math_direction === "bullish" ? "強偏多 ⬆️" :
                            v.math_direction === "bearish" ? "強偏空 ⬇️" : "中性";
            const aiDir = v.ai_direction === "bullish" ? "強偏多 ⬆️" :
                          v.ai_direction === "bearish" ? "強偏空 ⬇️" : "中性";
            const actualTag = v.actual_direction_v08
                ? `<span class="tag ${v.actual_direction_v08 === 'up' ? 'pos' :
                                       v.actual_direction_v08 === 'down' ? 'neg' : 'dim'}">${
                    v.actual_direction_v08 === 'up' ? '↑' :
                    v.actual_direction_v08 === 'down' ? '↓' : '→'
                } ${v.actual_return_1d != null ? (v.actual_return_1d * 100).toFixed(1) + '%' : '?'}</span>`
                : `<span class="tag muted">待驗證</span>`;
            return `<tr>
                <td class="mono dim">${fmt.date(v.prediction_date)}</td>
                <td class="mono"><strong>${escapeHtml(v.symbol)}</strong></td>
                <td class="name">${escapeHtml(v.symbol_name || '')}</td>
                <td>${mathDir}</td>
                <td>${aiDir}</td>
                <td>${actualTag}</td>
            </tr>`;
        }).join("");
        setHTML("disagree-body", `<table class="data">
            <thead><tr>
                <th>日期</th><th>代號</th><th>名稱</th>
                <th>Math</th><th>AI</th><th>實際</th>
            </tr></thead><tbody>${rows}</tbody></table>`);
    } catch (e) {
        setHTML("disagree-body",
            `<div class="empty">讀取失敗:${escapeHtml(e.message)}</div>`);
    }
}

// =====================================================================
// v0.7.2 — 歷史預測查詢
// =====================================================================
function _aiDirCell(it) {
    if (!it.ai_direction || it.ai_direction === "neutral") {
        return `<span class="tag muted">— 中性</span>`;
    }
    return directionTag(it.ai_direction);
}
function _hitCell(v) {
    if (v === true)  return `<span class="hit-ok">✓ 對</span>`;
    if (v === false) return `<span class="hit-bad">✗ 錯</span>`;
    return `<span class="hit-na">—</span>`;
}
function _actualCell(it) {
    const d = it.actual_direction, r = it.actual_return_1d;
    const arrow = d === "up" ? "↑" : d === "down" ? "↓" : "→";
    const cls = d === "up" ? "pos" : d === "down" ? "neg" : "dim";
    const pct = r != null ? `${r > 0 ? "+" : ""}${(r * 100).toFixed(2)}%` : "—";
    return `<span class="tag ${cls}">${arrow} ${pct}</span>`;
}
function _rowQuadrantClass(it) {
    if (it.is_hit === null || it.ai_is_hit === null) return "";
    if (it.direction === "neutral" || it.ai_direction === "neutral") return "";
    if (it.is_hit && it.ai_is_hit)         return "row-consensus";
    if (!it.is_hit && !it.ai_is_hit)       return "row-both-miss";
    if (it.is_hit && !it.ai_is_hit)        return "row-math-only";
    return "row-ai-only";
}

async function loadHistory(date) {
    const dateEl = $("hist-date");
    const useDate = date || dateEl.value;
    setHTML("hist-body", `<div class="empty"><span class="spinner"></span>查詢 ${escapeHtml(useDate || "(最新)")} ...</div>`);
    try {
        const q = useDate ? `?date=${encodeURIComponent(useDate)}` : "";
        const r = await apiGet(`/api/prediction/by-date${q}`);
        if (r.error) {
            setHTML("hist-body", `<div class="empty">${escapeHtml(r.error)}</div>`);
            return;
        }
        // Update date input
        dateEl.value = r.date;
        // Update chips
        const chips = (r.available_dates || []).slice(0, 6).map(d => {
            const cls = d === r.date ? "chip active" : "chip";
            return `<button class="${cls}" data-d="${d}">${d}</button>`;
        }).join("");
        setHTML("hist-chips", chips);
        document.querySelectorAll("#hist-chips .chip").forEach(b =>
            b.addEventListener("click", () => loadHistory(b.dataset.d)));

        // Summary
        const mathSt = r.math || {}, aiSt = r.ai || {}, qd = r.quadrant || {};
        setText("hist-math-hit", mathSt.hit_rate != null
            ? `${(mathSt.hit_rate * 100).toFixed(1)}% (${mathSt.hit}/${mathSt.directional_n})`
            : `—  (${mathSt.directional_n || 0} 檔)`);
        setText("hist-ai-hit", aiSt.hit_rate != null
            ? `${(aiSt.hit_rate * 100).toFixed(1)}% (${aiSt.hit}/${aiSt.directional_n})`
            : `—  (${aiSt.directional_n || 0} 檔)`);
        setText("hist-consensus", `${qd.consensus_hit ?? 0} / ${qd.both_directional_n ?? 0}`);
        setText("hist-math-only", qd.math_only ?? 0);
        setText("hist-ai-only", qd.ai_only ?? 0);
        setText("hist-both-miss", qd.both_miss ?? 0);

        // Table
        const items = r.items || [];
        if (!items.length) {
            setHTML("hist-body", `<div class="empty">該日無預測資料</div>`);
            return;
        }
        const rows = items.map((p, idx) => {
            const cls = _rowQuadrantClass(p);
            const sigSnip = Array.isArray(p.main_signals) && p.main_signals.length
                ? p.main_signals.slice(0, 2).map(s => escapeHtml(s.rule_id || "")).join("·")
                : "—";
            const aiProb = p.ai_bullish_prob != null
                ? (Number(p.ai_bullish_prob) * 100).toFixed(0) + "%"
                : "—";
            const narr = p.ai_narrative
                ? `<tr class="narr-row hidden" data-idx="${idx}"><td colspan="9"><div class="narr-box">💬 ${escapeHtml(p.ai_narrative)}</div></td></tr>`
                : "";
            const expandBtn = p.ai_narrative
                ? `<button class="narr-toggle" data-idx="${idx}" title="展開 AI 說明">▸</button>`
                : "";
            return `
              <tr class="${cls}">
                <td class="mono"><strong>${escapeHtml(p.symbol)}</strong></td>
                <td class="name">${escapeHtml(p.symbol_name || "")}</td>
                <td>${directionTag(p.direction)}</td>
                <td>${_aiDirCell(p)}</td>
                <td class="num dim">${aiProb}</td>
                <td>${_actualCell(p)}</td>
                <td>${_hitCell(p.is_hit)}</td>
                <td>${_hitCell(p.ai_is_hit)}</td>
                <td class="dim">${expandBtn}<span class="dim" title="${escapeHtml((p.main_signals||[]).map(s=>s.rule_id).join(', '))}">${escapeHtml(p.regime_label || "—")} · ${sigSnip}</span></td>
              </tr>
              ${narr}`;
        }).join("");

        setHTML("hist-body", `<table class="data hist-table">
            <thead><tr>
                <th>代號</th><th>名稱</th>
                <th>Math</th><th>AI</th><th class="num">AI 機率</th>
                <th>實際</th><th>M 命中</th><th>AI 命中</th>
                <th>市況 / 訊號</th>
            </tr></thead><tbody>${rows}</tbody></table>`);

        // Wire narrative toggles
        document.querySelectorAll(".narr-toggle").forEach(btn => {
            btn.addEventListener("click", (e) => {
                const idx = e.target.dataset.idx;
                const row = document.querySelector(`.narr-row[data-idx="${idx}"]`);
                if (row) {
                    row.classList.toggle("hidden");
                    e.target.textContent = row.classList.contains("hidden") ? "▸" : "▾";
                }
            });
        });
    } catch (e) {
        setHTML("hist-body", `<div class="empty">讀取失敗:${escapeHtml(e.message)}</div>`);
    }
}

function openHistoryModal() {
    $("history-modal").classList.add("show");
    // 預設帶最新日期
    if (!$("hist-date").value) loadHistory();
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
    // v0.7.2 — 歷史預測 modal
    $("history-btn")?.addEventListener("click", openHistoryModal);
    $("history-close")?.addEventListener("click", () => {
        $("history-modal").classList.remove("show");
    });
    $("history-modal")?.addEventListener("click", e => {
        if (e.target.id === "history-modal") {
            $("history-modal").classList.remove("show");
        }
    });
    $("hist-query-btn")?.addEventListener("click", () => loadHistory());
    $("hist-date")?.addEventListener("keydown", e => {
        if (e.key === "Enter") loadHistory();
    });
});
