import os
import json
from gdrive_sync import load_config, get_drive_service

try:
    config = load_config()
    print("Loading drive service with config:", config)
    service = get_drive_service(config)
    
    # 1. Search for folders containing 'FRU' or 'PVT' in name
    print("\n--- Searching for FRU / PVT folders on your Google Drive ---")
    results = service.files().list(
        q="mimeType = 'application/vnd.google-apps.folder' and (name contains 'FRU' or name contains 'PVT' or name contains 'BKC' or name contains 'Matrix') and trashed = false",
        supportsAllDrives=True,
        includeItemsFromAllDrives=True,
        fields="files(id, name, parents)"
    ).execute()
    
    folders = results.get('files', [])
    for f in folders:
        print(f"Folder Name: '{f['name']}' | Folder ID: {f['id']}")
        
    # 2. Search directly for the file Maxwell_Earth_FRU table_PVT1-1_20260805-1137.xlsx
    print("\n--- Searching directly for the latest file '20260805-1137' ---")
    file_res = service.files().list(
        q="name contains '20260805' and trashed = false",
        supportsAllDrives=True,
        includeItemsFromAllDrives=True,
        fields="files(id, name, parents, modifiedTime)"
    ).execute()
    
    found_files = file_res.get('files', [])
    for ff in found_files:
        print(f"File Name: '{ff['name']}' | File ID: {ff['id']} | Parent Folder ID: {ff.get('parents')} | Modified: {ff.get('modifiedTime')}")

except Exception as e:
    print("\n[ERROR Diagnosis]:", e)
