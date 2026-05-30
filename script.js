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

        // 同時抓 v0.7 overall(裡面有總樣本數,v0.8.2 endpoint 沒回 n)
        const overall = await apiGet("/api/prediction/overall").catch(() => null);
        const all_v07 = (overall && overall.windows && overall.windows.all) || {};
        const w30_v07 = (overall && overall.windows && overall.windows["30d"]) || {};

        if (v08 && v08.windows) {
            const all = v08.windows.all || {};
            const w30 = v08.windows["30d"] || {};
            setText("hero-final-all", fmtPct(all.final_hit_rate));
            setText("hero-final-30",  fmtPct(w30.final_hit_rate));
            setText("hero-dir-all",   fmtPct(all.directional_hit_rate));
            setText("hero-dir-30",    fmtPct(w30.directional_hit_rate));
            setText("hero-neu-all",   fmtPct(all.neutral_ratio));
            setText("hero-neu-hit",   fmtPct(all.neutral_hit_rate));

            // 樣本從 v0.7 算(total_predictions + neutral_observations)
            const sampN = (all_v07.total_predictions ?? 0) +
                          (all_v07.neutral_observations ?? 0);
            const samp30 = (w30_v07.total_predictions ?? 0) +
                           (w30_v07.neutral_observations ?? 0);
            setText("hero-sample-n", sampN.toLocaleString());
            setText("hero-sample-info", `已驗證 · 30d ${samp30}`);
        }

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
        // v0.9.4: title 帶下次交易日期;若 target 為 null,用 basis+1 工作日推算
        let nextDate = target;
        if (!nextDate && basis) {
            const d = new Date(basis);
            d.setDate(d.getDate() + 1);
            // 跳過週六/日
            while (d.getDay() === 0 || d.getDay() === 6) {
                d.setDate(d.getDate() + 1);
            }
            nextDate = d.toISOString().slice(0, 10);
        }
        if (nextDate) {
            const tag = target ? "" : " 預估";
            setText("predictions-title", `下次交易日預測 (${fmt.date(nextDate)})${tag}`);
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
                <td class="mono"><strong><a href="#" class="stock-link" data-symbol="${escapeHtml(p.symbol)}">${escapeHtml(p.symbol)}</a></strong></td>
                <td class="name"><a href="#" class="stock-link" data-symbol="${escapeHtml(p.symbol)}">${escapeHtml(p.symbol_name || "")}</a></td>
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
            loadMarketSnapshot(),
            loadKPIs(), loadPredictionHero(), loadTodayPredictions(),
            loadVerifications(), loadDisagreementCard(),
            loadSignals(), loadRules(), loadReport(),
            loadSignalMaturity(),    // v1.0-gamma-2
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
// v1.0-beta-2A++ — 大盤儀表板(5 區塊)
// =====================================================================
function fmtNum(v, dp = 2) {
    if (v === null || v === undefined || isNaN(v)) return "--";
    return Number(v).toLocaleString("zh-TW", { minimumFractionDigits: dp, maximumFractionDigits: dp });
}
function fmtPct(v, dp = 2) {
    if (v === null || v === undefined || isNaN(v)) return "--";
    const sign = v > 0 ? "+" : "";
    return `${sign}${Number(v).toFixed(dp)}%`;
}
function fmtSigned(v, suffix = "", dp = 1) {
    if (v === null || v === undefined || isNaN(v)) return "--";
    const sign = v > 0 ? "+" : "";
    return `${sign}${Number(v).toFixed(dp)}${suffix}`;
}
function colorClassByValue(v) {
    if (v === null || v === undefined || isNaN(v)) return "";
    return v > 0 ? "ms-up" : (v < 0 ? "ms-down" : "ms-flat");
}
function setMS(id, html, colorBy) {
    const el = document.getElementById(id);
    if (!el) return;
    el.innerHTML = html;
    el.classList.remove("ms-up", "ms-down", "ms-flat");
    if (colorBy !== undefined) {
        const c = colorClassByValue(colorBy);
        if (c) el.classList.add(c);
    }
}

// v1.0-gamma-2: 個股 modal — 點代號 / 名稱 → 開 modal 顯示 K 線 + 訊號 + 預測 + 命中率
async function openStockModal(symbol) {
    const modal = document.getElementById("stock-modal");
    const body = document.getElementById("stock-modal-body");
    const title = document.getElementById("stock-modal-title");
    if (!modal || !body) return;
    title.textContent = `${symbol} 個股分析`;
    body.innerHTML = `<div class="empty"><span class="spinner"></span>讀取中...</div>`;
    modal.style.display = "flex";
    try {
        const r = await apiGet(`/api/stock/${encodeURIComponent(symbol)}/profile?days=60`);
        renderStockModal(body, r);
        title.textContent = `${r.symbol} ${r.name} · 60 日分析`;
    } catch (e) {
        body.innerHTML = `<div class="empty">讀取失敗:${escapeHtml(e.message)}</div>`;
    }
}

function renderStockModal(container, r) {
    const ohlc = r.ohlc || [];
    const signals = r.signals || [];
    const preds = r.predictions || [];
    const hr = r.hit_rate || {};
    const strong = r.strongest_signals || [];

    // 1. SVG 簡易 K 線(close 折線 + 訊號標記)
    let chartHtml = '<div class="empty">無 OHLC 資料</div>';
    if (ohlc.length > 0) {
        const W = 800, H = 200, pad = 30;
        const closes = ohlc.map(x => +x.close);
        const lo = Math.min(...closes), hi = Math.max(...closes);
        const span = (hi - lo) || 1;
        const xs = (i) => pad + (W - 2 * pad) * (i / (ohlc.length - 1 || 1));
        const ys = (v) => H - pad - (H - 2 * pad) * ((v - lo) / span);
        const pts = ohlc.map((p, i) => `${xs(i)},${ys(+p.close)}`).join(" ");
        // 訊號標記
        const sigMarks = signals.map(s => {
            const idx = ohlc.findIndex(o => o.date === s.date);
            if (idx < 0) return "";
            const x = xs(idx), y = ys(+ohlc[idx].close);
            const color = s.direction === "bullish" ? "#ef4444" : (s.direction === "bearish" ? "#22c55e" : "#9ca3af");
            const symbol = s.direction === "bullish" ? "▲" : (s.direction === "bearish" ? "▼" : "·");
            return `<text x="${x}" y="${y - 6}" fill="${color}" font-size="10" text-anchor="middle">${symbol}</text>`;
        }).join("");
        chartHtml = `<svg viewBox="0 0 ${W} ${H}" style="width:100%;height:auto;background:#11151c;border:1px solid #2a3140;border-radius:6px">
            <polyline points="${pts}" fill="none" stroke="#e0a460" stroke-width="1.5"/>
            ${sigMarks}
            <text x="${pad}" y="${H - 8}" fill="#7f8a9a" font-size="10">${ohlc[0].date}</text>
            <text x="${W - pad}" y="${H - 8}" fill="#7f8a9a" font-size="10" text-anchor="end">${ohlc[ohlc.length - 1].date}</text>
            <text x="${pad}" y="${pad - 4}" fill="#7f8a9a" font-size="10">${hi.toFixed(1)}</text>
            <text x="${pad}" y="${H - pad + 12}" fill="#7f8a9a" font-size="10">${lo.toFixed(1)}</text>
        </svg>`;
    }

    // 2. 命中率聚合
    function pct(v) { return v == null ? "—" : (v * 100).toFixed(1) + "%"; }
    const hrHtml = `<div class="stock-rates">
        <div class="rate-cell"><span class="rate-label">M 1D</span><span class="rate-val">${pct(hr.math_1d)}</span></div>
        <div class="rate-cell"><span class="rate-label">AI 1D</span><span class="rate-val">${pct(hr.ai_1d)}</span></div>
        <div class="rate-cell"><span class="rate-label">共識 1D</span><span class="rate-val">${pct(hr.consensus_1d)}</span></div>
        <div class="rate-cell"><span class="rate-label">M 5D</span><span class="rate-val">${pct(hr.math_5d)} <span class="rate-sub">(${hr.n_5d || 0})</span></span></div>
        <div class="rate-cell"><span class="rate-label">樣本 1D</span><span class="rate-val">${hr.n_1d || 0}</span></div>
    </div>`;

    // 3. strongest signals
    let strongHtml = "<div class='empty dim'>— 資料不足</div>";
    if (strong.length > 0) {
        strongHtml = `<table class="data" style="font-size:11.5px"><thead><tr>
            <th>規則</th><th>觸發</th><th>命中</th><th>勝率</th></tr></thead><tbody>${
            strong.map(s => `<tr>
                <td><span class="tag accent">${escapeHtml(s.rule_id)}</span></td>
                <td>${s.n_trigger}</td><td>${s.n_hit}</td>
                <td>${pct(s.win_rate)}</td></tr>`).join("")
        }</tbody></table>`;
    }

    // 4. predictions 表(最近 10 筆)
    const recentPreds = preds.slice(-10).reverse();
    let predHtml = "<div class='empty dim'>無預測紀錄</div>";
    if (recentPreds.length > 0) {
        predHtml = `<table class="data" style="font-size:11.5px"><thead><tr>
            <th>日期</th><th>MATH</th><th>AI</th><th>實際</th><th>命中</th></tr></thead><tbody>${
            recentPreds.map(p => {
                const M = p.final_direction || p.direction || "—";
                const A = p.ai_direction || "—";
                const act = p.actual_direction || "—";
                const mhit = p.is_hit === true ? "✓" : (p.is_hit === false ? "✗" : "—");
                const ahit = p.ai_is_hit === true ? "✓" : (p.ai_is_hit === false ? "✗" : "—");
                return `<tr>
                    <td class="mono">${escapeHtml(p.prediction_date)}</td>
                    <td>${escapeHtml(M)}</td>
                    <td>${escapeHtml(A)}</td>
                    <td>${escapeHtml(act)}</td>
                    <td>${mhit} / ${ahit}</td></tr>`;
            }).join("")
        }</tbody></table>`;
    }

    container.innerHTML = `
        <div class="stock-section">${chartHtml}</div>
        <div class="stock-section">
            <div class="section-title">單股命中率</div>
            ${hrHtml}
        </div>
        <div class="stock-section">
            <div class="section-title">最強訊號 (觸發 ≥ 3 次)</div>
            ${strongHtml}
        </div>
        <div class="stock-section">
            <div class="section-title">最近 10 筆預測</div>
            ${predHtml}
        </div>
    `;
}

// 事件 delegation:點 .stock-link 開 modal
document.addEventListener("click", (e) => {
    const a = e.target.closest(".stock-link");
    if (a) {
        e.preventDefault();
        const sym = a.dataset.symbol;
        if (sym) openStockModal(sym);
    }
});
// 關 modal
document.addEventListener("click", (e) => {
    if (e.target.id === "stock-modal-close" ||
        (e.target.classList && e.target.classList.contains("modal-mask") &&
         e.target.id === "stock-modal")) {
        document.getElementById("stock-modal").style.display = "none";
    }
});

// v1.0-gamma-2: 訊號成熟度小卡 — 從 /api/signal-maturity 拿 5 階段狀態
async function loadSignalMaturity() {
    try {
        const r = await apiGet("/api/signal-maturity");
        const steps = [
            ["m-step-detector",     "detector_ready"],
            ["m-step-signal",       "signal_backfilled"],
            ["m-step-outcome",      "outcome_ready"],
            ["m-step-contribution", "contribution_active"],
            ["m-step-production",   "production_active"],
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
        const stage = document.getElementById("maturity-stage");
        if (stage) stage.textContent = `${r.stage_index ?? activeCount}/5`;
    } catch (e) {
        console.warn("loadSignalMaturity failed:", e);
    }
}

async function loadMarketSnapshot() {
    try {
        const r = await apiGet("/api/market/snapshot");

        // 1. 台股盤面
        const t = r.taiex || {};
        const tx = t.taiex || {};
        const otc = t.otc || {};
        setMS("ms-taiex-close", fmtNum(tx.close));
        setMS("ms-taiex-change",
              `${fmtNum(tx.change)} (${fmtPct(tx.change_pct)})`,
              tx.change_pct);
        setMS("ms-taiex-volume", tx.volume_yi ? `${fmtNum(tx.volume_yi, 0)} 億` : "--");
        setMS("ms-otc",
              otc.close != null ? `${fmtNum(otc.close)} (${fmtSigned(otc.change, "", 2)})` : "--",
              otc.change_pct);
        const adv = t.advancers, dec = t.decliners;
        setMS("ms-breadth",
              (adv != null && dec != null) ? `${adv} / ${dec}` : "--");
        setMS("ms-taiex-asof", t.as_of || "--");

        const taiexTags = document.getElementById("ms-taiex-tags");
        if (taiexTags) {
            taiexTags.innerHTML = "";
            if (t.regime_label) {
                const chip = document.createElement("span");
                chip.className = "ms-chip " + (t.regime_label.includes("多") ? "chip-bull" : (t.regime_label.includes("空") ? "chip-bear" : "chip-neu"));
                chip.textContent = t.regime_label;
                taiexTags.appendChild(chip);
            }
            if (t.foreign_futures_bias) {
                const chip = document.createElement("span");
                chip.className = "ms-chip " + (t.foreign_futures_bias === "long" ? "chip-bull" : (t.foreign_futures_bias === "short" ? "chip-bear" : "chip-neu"));
                chip.textContent = t.foreign_futures_bias === "long" ? "外資偏多" :
                                    t.foreign_futures_bias === "short" ? "外資偏空" : "中性";
                taiexTags.appendChild(chip);
            }
        }

        // 2. 國際盤勢
        const i = r.international || {};
        ["nasdaq", "sox", "sp500", "dow", "dxy"].forEach(k => {
            const v = i[k] || {};
            setMS(`ms-intl-${k}`,
                  v.close != null ? `${fmtNum(v.close)} <span class="ms-pct">${fmtPct(v.change_pct)}</span>` : "--",
                  v.change_pct);
        });
        // v1.0-gamma-1 D: 分組日期
        setMS("ms-intl-us-asof", i.us_as_of || i.as_of || "--");

        // 3. 風險指標
        const rk = r.risk || {};
        ["vix", "us10y", "dxy", "twd", "gold"].forEach(k => {
            const v = rk[k] || {};
            setMS(`ms-risk-${k}`,
                  v.close != null ? `${fmtNum(v.close)} <span class="ms-pct">${fmtPct(v.change_pct)}</span>` : "--",
                  v.change_pct);
        });
        setMS("ms-risk-us-asof",    rk.us_as_of    || rk.as_of || "--");
        setMS("ms-risk-forex-asof", rk.forex_as_of || rk.as_of || "--");

        // 4. 法人籌碼
        const ist = r.institutional || {};
        setMS("ms-inst-foreign",
              ist.foreign_yi != null ? `${fmtSigned(ist.foreign_yi, " 億", 1)}` : "--",
              ist.foreign_yi);
        setMS("ms-inst-trust",
              ist.trust_yi != null ? `${fmtSigned(ist.trust_yi, " 億", 1)}` : "--",
              ist.trust_yi);
        setMS("ms-inst-dealer",
              ist.dealer_yi != null ? `${fmtSigned(ist.dealer_yi, " 億", 1)}` : "--",
              ist.dealer_yi);
        setMS("ms-inst-total",
              ist.total_yi != null ? `${fmtSigned(ist.total_yi, " 億", 1)}` : "--",
              ist.total_yi);
        if (ist.streak_n && ist.streak_dir) {
            const word = ist.streak_dir === "buy" ? "買" : "賣";
            setMS("ms-inst-streak", `連 ${ist.streak_n} 日 ${word}`,
                  ist.streak_dir === "buy" ? 1 : -1);
        } else {
            setMS("ms-inst-streak", "--");
        }
        setMS("ms-inst-asof", ist.as_of || "--");

        // 5. 多空關鍵
        const f = r.futures || {};
        setMS("ms-fut-oi",
              f.tx_foreign_net_oi != null ?
                (f.tx_foreign_net_oi > 0 ? `淨多 ${fmtNum(Math.abs(f.tx_foreign_net_oi), 0)} 口` :
                                            `淨空 ${fmtNum(Math.abs(f.tx_foreign_net_oi), 0)} 口`) : "--",
              f.tx_foreign_net_oi);
        setMS("ms-fut-d1",
              f.change_1d != null ?
                (f.change_1d > 0 ? `多單增加 ${fmtNum(f.change_1d, 0)} 口` : `空單增加 ${fmtNum(Math.abs(f.change_1d), 0)} 口`) : "--",
              f.change_1d);
        setMS("ms-fut-d5",
              f.change_5d != null ?
                (f.change_5d > 0 ? `多單增加 ${fmtNum(f.change_5d, 0)} 口` : `空單增加 ${fmtNum(Math.abs(f.change_5d), 0)} 口`) : "--",
              f.change_5d);
        setMS("ms-fut-pcoi",
              f.pc_ratio_oi != null ?
                `${fmtNum(f.pc_ratio_oi, 2)} ${f.pc_ratio_oi > 1.2 ? "避險偏高" : f.pc_ratio_oi < 0.9 ? "看多氣氛" : ""}` : "--",
              f.pc_ratio_oi != null ? (f.pc_ratio_oi > 1.2 ? -1 : f.pc_ratio_oi < 0.9 ? 1 : 0) : null);
        setMS("ms-fut-basis",
              f.basis != null ?
                (f.basis > 0 ? `正價差 ${fmtNum(f.basis, 0)} 點` : `逆價差 ${fmtNum(Math.abs(f.basis), 0)} 點`) : "--",
              f.basis);
        setMS("ms-fut-asof", f.as_of || "--");

        const futTags = document.getElementById("ms-fut-tags");
        if (futTags && f.status_tags && f.status_tags.length) {
            futTags.innerHTML = "";
            f.status_tags.forEach(s => {
                const chip = document.createElement("span");
                chip.className = "ms-chip " + (s.includes("空") || s.includes("避險") ? "chip-bear" :
                                              s.includes("多") || s.includes("看多") ? "chip-bull" : "chip-neu");
                chip.textContent = s;
                futTags.appendChild(chip);
            });
        }
    } catch (e) {
        console.warn("market snapshot failed", e);
    }
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
