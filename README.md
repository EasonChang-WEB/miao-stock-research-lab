# 喵掌櫃股票研究所 — 前台 (GitHub Pages)

純靜態網站,部署到 GitHub Pages 即可,負責顯示後台狀態與管理者控制。

## 1. 部署步驟

1. 在 GitHub 建一個新 repo,例如 `miao-stock-research-frontend`。
2. 把這個 `github/` 資料夾裡的檔案全部丟到 repo **根目錄**(不要再多一層 `github/`)。
3. 進 repo **Settings → Pages**:
   - Source: `Deploy from a branch`
   - Branch: `main`,Folder: `/ (root)`
4. 等 1~2 分鐘,GitHub 會給你 `https://<your-name>.github.io/<repo-name>/`。
5. 編輯 **`config.js`**,把 `API_BASE` 改成你的 Replit Deployment URL,
   例如 `https://miao-stock-research-lab.username.replit.app`。
6. Commit 後重新整理頁面即可。

> 如果 GitHub Pages 渲染怪怪的,確認根目錄有 `.nojekyll`(本 repo 已附)。

## 2. 檔案說明

```
github/
├── index.html       # 狀態查詢頁
├── admin.html       # 管理者控制頁
├── style.css        # 共用樣式
├── script.js        # index 的 JS
├── admin.js         # admin 的 JS
├── config.js        # API_BASE 等設定(部署後請手動修改)
├── .nojekyll        # 告訴 GitHub Pages 不要用 Jekyll
└── README.md
```

## 3. 與後台的關係

- `index.html` 只呼叫公開的 `GET /api/*`,任何人都能看。
- `admin.html` 會把使用者輸入的 token 暫存在 sessionStorage,
  所有 POST 都會帶 `Authorization: Bearer <ADMIN_TOKEN>`。
- Replit 後端必須:
  - 設定 `ADMIN_TOKEN` Secret
  - 允許 CORS(後端預設 `ALLOWED_ORIGIN=*`;
    若要鎖白名單,把它改成你的 GitHub Pages URL)。

## 4. 安全建議

- Token 不要寫死在 JS 裡。本前台靠手動輸入或 sessionStorage。
- `admin.html` 已加上 `<meta name="robots" content="noindex,nofollow">`,避免被搜尋引擎索引。
- 想更進階,可在 Cloudflare 前面加 IP 白名單。

## 5. 免責聲明

本系統所有顯示僅為研究與風險辨識用,不構成投資建議。
