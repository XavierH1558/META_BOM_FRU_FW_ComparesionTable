# Google Drive Shared Folder 自動同步設定指南

本專案已整合 **Google Drive API v3 (純唯讀模式)**，可自動將客戶在 Google Drive Shared Folder (共用資料夾) 中的最新 BOM / FRU / Matrix Excel 或 CSV 檔案同步下載至本機 `data/` 目錄。

> [!IMPORTANT]
> **安全性說明**：
> 本模組在 API 認證層級強制使用 `https://www.googleapis.com/auth/drive.readonly` 權限。專案僅具備「讀取/下載」權限，**絕無可能** 變更、覆蓋或刪除客戶雲端上的原始檔案。

---

## ❓ 常見疑慮與最佳實踐說明

### 1. 客人看得見 shared 帳號嗎？如果不想讓客人看到該怎麼做？
- **如果使用服務帳戶 (Service Account)**：客戶點開資料夾「共用人員名單」時，**會看到** 該服務帳戶 Email (`gdrive-sync-bot@...`)。
- **💡 隱形解法 (最推薦)**：改用 **OAuth 2.0 人員權限認證**！
  - 您使用您原本就已經有客戶資料夾權限的 **個人/公司 Google 帳號** 進行授權。
  - 這樣程式會直接以**您的帳號身份**去拉取檔案，**客戶端完全看不見任何額外的機器人或外部帳號**！

---

### 2. BKC / FRU / Build Matrix 在不同資料夾，不想共享最大根目錄該怎麼辦？
- **無需共享最大根目錄**！
- 專案支援 **獨立子資料夾指定 (Subfolder ID Filtering)**。
- 您只需要分別進入各個專屬的子資料夾（如 `BKC資料夾`、`FRU Spec資料夾`、`Build Matrix資料夾`），複製各自的資料夾 ID 填入 `gdrive_config.json` 即可。
- 程式只會精準去這三個特定子資料夾抓取 Excel，完全不會被父目錄其他無關的雜亂檔案干擾！

---

## 步驟一：選擇認證方式 (Service Account 或 OAuth 2.0 隱形認證)

### 方案 A：使用 Service Account (適用於團隊共用服務)
1. 前往 [Google Cloud Console](https://console.cloud.google.com/) 建立專案並啟用 `Google Drive API`。
2. 在「憑證」中建立 **服務帳戶 (Service Account)**，複製其 Email (`gdrive-sync-bot@your-project.iam.gserviceaccount.com`)。
3. 下載金鑰 JSON 檔案，重新命名為 `service_account.json` 並放置於本專案根目錄。
4. 在客戶的特定子資料夾中將該 Email 加入為「檢視者 (Viewer)」。

### 方案 B：使用 OAuth 2.0 隱形認證 (客戶端 100% 看不到機器人帳號)
1. 前往 Google Cloud Console 建立 **OAuth 2.0 用戶端 ID (桌面應用程式)**。
2. 下載 JSON 憑證重新命名為 `credentials.json` 並放置於本專案根目錄。
3. 執行 `python gdrive_sync.py` 時會跳出瀏覽器，用您自己的 Google 帳號完成一次性登入，系統會產生 `token.json`。
4. 此後程式將完全以您的個人權限自動背景抓取，客戶端無任何額外帳號顯示！

---

## 步驟二：取得各子資料夾 ID 並設定 `gdrive_config.json`

1. 在網頁版 Google Drive 點進要同步的各個**專屬子資料夾**，觀察網址列 URL：
   例如：`https://drive.google.com/drive/folders/1A2b3C4d5E6f7G8h9I0j`
   網址最後一串字元 `1A2b3C4d5E6f7G8h9I0j` 即為該資料夾的 **ID**。

2. 在本專案根目錄建立（或複製 `gdrive_config.json.template`）名為 **`gdrive_config.json`** 的檔案：

```json
{
  "enabled": true,
  "credentials_file": "service_account.json",
  "sync_interval_minutes": 30,
  "folders": {
    "bkc": "BKC專屬子資料夾ID",
    "fru": "FRU_Spec專屬子資料夾ID",
    "matrix": "Build_Matrix專屬子資料夾ID"
  }
}
```

> **提示**：若某個類別不需要自動同步，將 ID 留空 `""` 即可。

---

## 步驟三：啟動與測試

### 1. 手動測試同步
在終端機中執行：
```bash
python gdrive_sync.py
```
若設定正確，終端機會顯示各子資料夾掃描與下載檔案的紀錄，最新檔案會自動出現在 `data/bkc/`, `data/fru/`, `data/matrix/` 目錄中。

### 2. 隨 Flask 服務自動定時同步
當您啟動 Flask (`python app.py` 或 `gunicorn app:app`) 時：
- 系統會自動在背景啟動定時器，每隔 `sync_interval_minutes` (預設 30 分鐘) 自動拉取最新檔案。
- 網頁介面也可呼叫 API Endpoint `/api/sync-gdrive` 立即觸發同步。
