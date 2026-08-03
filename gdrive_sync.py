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

FOLDER_TARGET_MAP = {
    'bkc': os.path.join(DATA_DIR, 'bkc'),
    'fru': os.path.join(DATA_DIR, 'fru'),
    'matrix': os.path.join(DATA_DIR, 'matrix')
}

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
    Build Google Drive API service using Service Account or OAuth Client.
    Uses strict READ-ONLY scope for safety.
    """
    creds_file_setting = config.get('credentials_file', 'service_account.json')
    creds_path = os.path.join(BASE_DIR, creds_file_setting)
    
    if not os.path.exists(creds_path):
        # Fallback check if credentials.json or service_account.json exists in BASE_DIR
        possible_paths = [
            os.path.join(BASE_DIR, 'service_account.json'),
            os.path.join(BASE_DIR, 'credentials.json')
        ]
        creds_path = next((p for p in possible_paths if os.path.exists(p)), None)

    if not creds_path or not os.path.exists(creds_path):
        raise FileNotFoundError(f"Credentials file not found at {creds_path}. Please place service_account.json in root directory.")

    # Try Service Account Credentials first
    try:
        with open(creds_path, 'r', encoding='utf-8') as f:
            data = json.load(f)
            if data.get('type') == 'service_account':
                creds = Credentials.from_service_account_file(creds_path, scopes=SCOPES)
                return build('drive', 'v3', credentials=creds)
    except Exception:
        pass

    # Try OAuth 2.0 User Credentials
    token_path = os.path.join(BASE_DIR, 'token.json')
    creds = None
    if os.path.exists(token_path):
        try:
            creds = UserCredentials.from_authorized_user_file(token_path, SCOPES)
        except Exception:
            creds = None

    if not creds or not creds.valid:
        if creds and creds.expired and creds.refresh_token:
            creds.refresh(Request())
        else:
            flow = InstalledAppFlow.from_client_secrets_file(creds_path, SCOPES)
            creds = flow.run_local_server(port=0)
        with open(token_path, 'w', encoding='utf-8') as token:
            token.write(creds.to_json())

    return build('drive', 'v3', credentials=creds)

def parse_iso_time(iso_str):
    """Parse Google Drive ISO modifiedTime string to unix timestamp."""
    try:
        if iso_str.endswith('Z'):
            iso_str = iso_str[:-1] + '+00:00'
        dt = datetime.datetime.fromisoformat(iso_str)
        return dt.timestamp()
    except Exception:
        return 0

def download_file(service, file_id, target_path):
    """Download Google Drive file safely using atomic write (.tmp -> final path)."""
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

def sync_folder(service, folder_id, local_dir):
    """
    Sync files from a Google Shared Folder ID to local_dir.
    Only downloads new or updated .xlsx, .xls, .csv files.
    """
    if not folder_id or folder_id.startswith('YOUR_'):
        return {'status': 'skipped', 'reason': 'Folder ID not configured', 'downloaded': []}

    os.makedirs(local_dir, exist_ok=True)
    
    # Query files inside shared folder
    query = f"'{folder_id}' in parents and trashed = false"
    try:
        results = service.files().list(
            q=query,
            supportsAllDrives=True,
            includeItemsFromAllDrives=True,
            fields="files(id, name, modifiedTime, size, mimeType)"
        ).execute()
    except Exception as e:
        return {'status': 'error', 'reason': f"Failed to list folder {folder_id}: {str(e)}", 'downloaded': []}

    files = results.get('files', [])
    downloaded = []

    for f in files:
        file_name = f['name']
        # Filter for Excel / CSV files
        if not file_name.lower().endswith(('.xlsx', '.xls', '.csv')) or file_name.startswith(('._', '~$')):
            continue

        file_id = f['id']
        remote_mtime = parse_iso_time(f.get('modifiedTime', ''))
        local_file_path = os.path.join(local_dir, file_name)

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
                download_file(service, file_id, local_file_path)
                # Preserve mtime locally
                if remote_mtime > 0:
                    os.utime(local_file_path, (remote_mtime, remote_mtime))
                downloaded.append(file_name)
                print(f"[GDrive Sync] Downloaded updated file: {file_name} -> {local_dir}")
            except Exception as download_err:
                print(f"[GDrive Sync Error] Failed downloading {file_name}: {download_err}")

    return {'status': 'success', 'downloaded': downloaded, 'total_scanned': len(files)}

def sync_all_gdrive_folders():
    """
    Master sync function called by Flask or CLI.
    Iterates over all configured folders and downloads latest files.
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

    folders_config = config.get('folders', {})
    summary = {}

    for tab_key, local_dir in FOLDER_TARGET_MAP.items():
        folder_id = folders_config.get(tab_key, '').strip()
        if folder_id:
            res = sync_folder(service, folder_id, local_dir)
            summary[tab_key] = res
        else:
            summary[tab_key] = {'status': 'skipped', 'reason': 'No folder ID configured'}

    return {'status': 'complete', 'summary': summary}

if __name__ == '__main__':
    print("Testing Google Drive Sync...")
    res = sync_all_gdrive_folders()
    print(json.dumps(res, indent=2, ensure_ascii=False))
