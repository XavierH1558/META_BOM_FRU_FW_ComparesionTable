# Google Drive Shared Folder 自動同步設定指南

本專案已整合 **Google Drive API v3 (純唯讀模式)**，可自動將客戶在 Google Drive Shared Folder (共用資料夾) 中的最新 BOM / FRU / Matrix Excel 或 CSV 檔案同步下載至本機 `data/` 目錄。

> [!IMPORTANT]
> **安全性說明**：
> 本模組在 API 認證層級強制使用 `https://www.googleapis.com/auth/drive.readonly` 權限。專案僅具備「讀取/下載」權限，**絕無可能** 變更、覆蓋或刪除客戶雲端上的原始檔案。

---

## 步驟一：在 Google Cloud Console 建立服務帳戶 (Service Account)

1. 前往 [Google Cloud Console](https://console.cloud.google.com/)。
2. 建立新專案（例如 `BOM-Sync-Service`）。
3. 在左側選單選擇 **「API 和服務」 $\rightarrow$「程式庫」**，搜尋 **`Google Drive API`** 並點擊 **「啟用」**。
4. 在左側選單選擇 **「API 和服務」 $\rightarrow$「憑證」**。
5. 點擊頂部的 **「+ 建立憑證」 $\rightarrow$「服務帳戶」 (Service Account)**：
   - 服務帳戶名稱：例如 `gdrive-sync-bot`
   - 建立後，頁面會顯示該服務帳戶的 Email（格式如：`gdrive-sync-bot@your-project.iam.gserviceaccount.com`）。**請複製此 Email！**
6. 點擊剛剛建立的服務帳戶 $\rightarrow$ 切換到 **「金鑰」 (Keys)** 頁籤 $\rightarrow$ 點擊 **「新增金鑰」 $\rightarrow$「建立金鑰」** $\rightarrow$ 選擇 **JSON**。
7. 系統會自動下載一個 JSON 檔案。將該檔案重新命名為 **`service_account.json`**，並放到本專案的根目錄中：
   `c:\Users\XavierHuang(黃任德)\Python_Project\META_BOM_FRU_FW_ComparesionTable\service_account.json`

---

## 步驟二：將客戶的 Google Shared Folder 共享給服務帳戶

1. 開啟網頁版 [Google Drive](https://drive.google.com/)。
2. 進入客戶共享給您的共用資料夾（或包含 BKC / FRU / Matrix 的資料夾）。
3. 點擊資料夾頂部的 **「共用」 (Share)**。
4. 貼上步驟一複製的服務帳戶 Email (`gdrive-sync-bot@...`)。
5. 角色請選擇 **「檢視者」 (Viewer)**。
6. 取消勾選「傳送通知」，點擊 **「共用」**。

---

## 步驟三：取得資料夾 ID 並設定 `gdrive_config.json`

1. 在網頁版 Google Drive 點進要同步的資料夾，觀察網址列 URL：
   例如：`https://drive.google.com/drive/folders/1A2b3C4d5E6f7G8h9I0j`
   網址最後一串字元 `1A2b3C4d5E6f7G8h9I0j` 即為 **資料夾 ID (Folder ID)**。

2. 在本專案根目錄建立（或複製 `gdrive_config.json.template`）名為 **`gdrive_config.json`** 的檔案：

```json
{
  "enabled": true,
  "credentials_file": "service_account.json",
  "sync_interval_minutes": 30,
  "folders": {
    "bkc": "您的_BKC_資料夾_ID",
    "fru": "您的_FRU_資料夾_ID",
    "matrix": "您的_Matrix_資料夾_ID"
  }
}
```

> **提示**：如果有某個類別暫時不需要同步，資料夾 ID 留空 `""` 即可。

---

## 步驟四：啟動與測試

### 1. 手動測試同步
在終端機中執行：
```bash
python gdrive_sync.py
```
若設定正確，終端機會顯示掃描與下載檔案的紀錄，最新檔案會自動出現在 `data/bkc/`, `data/fru/`, `data/matrix/` 資料夾中。

### 2. 隨 Flask 服務自動定時同步
當您啟動 Flask (`python app.py` 或 `gunicorn app:app`) 時：
- 系統會自動在背景啟動定時器，每隔 `sync_interval_minutes` (預設 30 分鐘) 自動拉取最新檔案。
- 網頁介面也可呼叫 API Endpoint `/api/sync-gdrive` 立即觸發同步。
