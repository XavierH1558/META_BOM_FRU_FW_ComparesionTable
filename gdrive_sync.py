import os
import json
import io
import datetime
from google.oauth2.service_account import Credentials
from google.oauth2.credentials import Credentials as UserCredentials
from google_auth_oauthlib.flow import InstalledAppFlow
from google.auth.transport.requests import Request
from googleapiclient.discovery import build
from googleapiclient.http import MediaIoBaseDownload

# Strict READ-ONLY scope to prevent any modification or deletion on Google Drive
SCOPES = ['https://www.googleapis.com/auth/drive.readonly']

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
CONFIG_PATH = os.path.join(BASE_DIR, 'gdrive_config.json')
TEMPLATE_PATH = os.path.join(BASE_DIR, 'gdrive_config.json.template')
DATA_DIR = os.path.join(BASE_DIR, 'data')



def load_config():
    """Load configuration from gdrive_config.json or template."""
    target_path = CONFIG_PATH if os.path.exists(CONFIG_PATH) else TEMPLATE_PATH
    if not os.path.exists(target_path):
        return None
    try:
        with open(target_path, 'r', encoding='utf-8') as f:
            return json.load(f)
    except Exception as e:
        print(f"[GDrive Sync Error] Failed to read config: {e}")
        return None

def get_drive_service(config):
    """
    Build Google Drive API service using OAuth User Credentials or Service Account.
    Prioritizes OAuth User Authentication (credentials.json) for shared client folders.
    Uses strict READ-ONLY scope for safety.
    """
    auth_mode = config.get('auth_mode', 'oauth').lower()
    creds_file_setting = config.get('credentials_file', 'credentials.json')
    
    # 1. If auth_mode is OAuth or credentials_file is credentials.json, run OAuth User Flow
    if auth_mode == 'oauth' or creds_file_setting == 'credentials.json':
        oauth_path = os.path.join(BASE_DIR, 'credentials.json')
        if not os.path.exists(oauth_path):
            oauth_path = os.path.join(BASE_DIR, creds_file_setting)
            
        if not os.path.exists(oauth_path):
            raise FileNotFoundError(f"OAuth Client Credentials not found at {oauth_path}. Please place credentials.json in root directory.")

        token_path = os.path.join(BASE_DIR, 'token.json')
        creds = None
        if os.path.exists(token_path):
            try:
                creds = UserCredentials.from_authorized_user_file(token_path, SCOPES)
            except Exception as token_err:
                print(f"[GDrive Sync Warning] Existing token invalid, re-authenticating: {token_err}")
                creds = None

        if not creds or not creds.valid:
            if creds and creds.expired and creds.refresh_token:
                try:
                    creds.refresh(Request())
                except Exception as refresh_err:
                    print(f"[GDrive Sync Warning] Refresh token failed: {refresh_err}. Starting browser OAuth flow...")
                    creds = None

            if not creds:
                if os.environ.get('RENDER') or os.environ.get('NON_INTERACTIVE'):
                    raise RuntimeError("GDrive OAuth token missing/expired. Interactive authentication is disabled in server mode.")
                import webbrowser
                flow = InstalledAppFlow.from_client_secrets_file(oauth_path, SCOPES)
                print("\n" + "="*70)
                print("🔗 [Google Drive OAuth 2.0 個人帳號一次性授權]")
                print("請在下方出現的連結上按住 [Ctrl + 左鍵點擊]，或複製網址至瀏覽器開啟：")
                print("="*70 + "\n")
                try:
                    creds = flow.run_local_server(port=0, prompt='consent', open_browser=True, timeout_seconds=15)
                except Exception as auth_err:
                    raise RuntimeError(f"Google Drive OAuth login timeout or error: {auth_err}")

            with open(token_path, 'w', encoding='utf-8') as token:
                token.write(creds.to_json())

        return build('drive', 'v3', credentials=creds)

    # 2. Service Account Flow (Fallback)
    creds_path = os.path.join(BASE_DIR, creds_file_setting)
    if os.path.exists(creds_path):
        try:
            with open(creds_path, 'r', encoding='utf-8') as f:
                data = json.load(f)
                if data.get('type') == 'service_account':
                    creds = Credentials.from_service_account_file(creds_path, scopes=SCOPES)
                    return build('drive', 'v3', credentials=creds)
        except Exception:
            pass

    raise FileNotFoundError(f"No valid Google credentials found (OAuth credentials.json or service_account.json).")

def parse_iso_time(iso_str):
    """Parse Google Drive ISO modifiedTime string to unix timestamp."""
    try:
        if iso_str.endswith('Z'):
            iso_str = iso_str[:-1] + '+00:00'
        dt = datetime.datetime.fromisoformat(iso_str)
        return dt.timestamp()
    except Exception:
        return 0

def download_file(service, file_id, target_path, is_google_sheet=False):
    """
    Download Google Drive file safely using atomic write (.tmp -> final path).
    If is_google_sheet is True, exports Google Spreadsheet to .xlsx format.
    """
    if is_google_sheet:
        request = service.files().export_media(
            fileId=file_id,
            mimeType='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        )
    else:
        request = service.files().get_media(fileId=file_id)

    tmp_path = target_path + '.tmp'
    with open(tmp_path, 'wb') as fh:
        downloader = MediaIoBaseDownload(fh, request)
        done = False
        while not done:
            status, done = downloader.next_chunk()
    if os.path.exists(target_path):
        os.remove(target_path)
    os.rename(tmp_path, target_path)

def fetch_all_files_recursive(service, parent_folder_id):
    """
    Recursively list all files in parent_folder_id and any subfolders (e.g. PVT, DVT, EVT).
    Returns (files_list, error_message).
    """
    all_files = []
    folders_to_scan = [parent_folder_id]
    error_msg = None

    while folders_to_scan:
        current_id = folders_to_scan.pop(0)
        query = f"'{current_id}' in parents and trashed = false"
        try:
            results = service.files().list(
                q=query,
                supportsAllDrives=True,
                includeItemsFromAllDrives=True,
                fields="files(id, name, modifiedTime, size, mimeType)"
            ).execute()
            items = results.get('files', [])
            for item in items:
                if item.get('mimeType') == 'application/vnd.google-apps.folder':
                    folders_to_scan.append(item['id'])
                else:
                    all_files.append(item)
        except Exception as e:
            err_str = str(e)
            if '404' in err_str or 'notFound' in err_str:
                error_msg = f"HTTP 404 Folder Not Found (權限不足)。請在 Google Drive 將資料夾共用給機器帳號: gdrive-sync-bot@bom-sync-service.iam.gserviceaccount.com"
            else:
                error_msg = f"Scan folder failed: {err_str}"
            print(f"[GDrive Sync Warning] Failed scanning folder {current_id}: {error_msg}")

    return all_files, error_msg

def sync_folder(service, folder_id, local_dir, tab_key='bkc'):
    """
    Sync files from a Google Shared Folder ID (and its subfolders) to local_dir.
    Only downloads new or updated .xlsx, .xls, .csv, or .yaml files (or Google Sheets).
    """
    if not folder_id or str(folder_id).strip().startswith(('YOUR_', '請在此填寫')):
        return {'status': 'skipped', 'reason': 'Folder ID not configured', 'downloaded': []}

    os.makedirs(local_dir, exist_ok=True)
    
    files, err_msg = fetch_all_files_recursive(service, folder_id)
    if err_msg and not files:
        return {'status': 'error', 'reason': err_msg, 'downloaded': [], 'total_scanned': 0}

    downloaded = []

    valid_exts = ('.xlsx', '.xls', '.csv', '.yaml', '.yml') if tab_key == 'yaml' else ('.xlsx', '.xls', '.csv')

    for f in files:
        file_name = f['name']
        mime_type = f.get('mimeType', '')
        is_g_sheet = (mime_type == 'application/vnd.google-apps.spreadsheet')

        # Filter for allowed file extensions or Google Sheets
        if not is_g_sheet:
            if not file_name.lower().endswith(valid_exts) or file_name.startswith(('._', '~$')):
                continue

        # If it's a Google Sheet without .xlsx extension, append .xlsx locally
        target_name = file_name if file_name.lower().endswith(valid_exts) else f"{file_name}.xlsx"

        file_id = f['id']
        remote_mtime = parse_iso_time(f.get('modifiedTime', ''))
        local_file_path = os.path.join(local_dir, target_name)

        # Check if local file needs update
        need_download = False
        if not os.path.exists(local_file_path):
            need_download = True
        else:
            local_mtime = os.path.getmtime(local_file_path)
            # Download if remote is newer by more than 2 seconds
            if remote_mtime > (local_mtime + 2):
                need_download = True

        if need_download:
            try:
                download_file(service, file_id, local_file_path, is_google_sheet=is_g_sheet)
                # Preserve mtime locally
                if remote_mtime > 0:
                    os.utime(local_file_path, (remote_mtime, remote_mtime))
                downloaded.append(target_name)
                print(f"[GDrive Sync] Downloaded updated file: {target_name} -> {local_dir}")
            except Exception as download_err:
                print(f"[GDrive Sync Error] Failed downloading {target_name}: {download_err}")

    return {'status': 'success', 'downloaded': downloaded, 'total_scanned': len(files)}

def sync_all_gdrive_folders():
    """
    Master sync function called by Flask or CLI.
    Iterates over all configured folders across projects and downloads latest files.
    """
    config = load_config()
    if not config:
        return {'status': 'error', 'message': 'Configuration file missing'}

    if not config.get('enabled', False):
        return {'status': 'disabled', 'message': 'Google Drive sync is disabled in config'}

    try:
        service = get_drive_service(config)
    except Exception as e:
        print(f"[GDrive Sync Error] Auth failed: {e}")
        return {'status': 'auth_error', 'message': str(e)}

    summary = {}

    # Multi-project synchronization
    projects_config = config.get('projects', {})
    if projects_config and isinstance(projects_config, dict):
        for proj_id, proj_info in projects_config.items():
            if not isinstance(proj_info, dict):
                continue
            for tab_key in ['bkc', 'fru', 'matrix', 'yaml']:
                folder_id = str(proj_info.get(tab_key, '') or '').strip()
                if folder_id and not folder_id.startswith(('YOUR_', '請在此填寫')):
                    local_dir = os.path.join(DATA_DIR, proj_id, tab_key)
                    res = sync_folder(service, folder_id, local_dir, tab_key=tab_key)
                    summary[f"{proj_id}_{tab_key}"] = res

    return {'status': 'complete', 'summary': summary}

if __name__ == '__main__':
    print("Testing Google Drive Sync...")
    res = sync_all_gdrive_folders()
    print(json.dumps(res, indent=2, ensure_ascii=False))
