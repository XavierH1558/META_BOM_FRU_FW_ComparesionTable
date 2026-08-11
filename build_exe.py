import os
import sys
import subprocess

def build():
    print("[Build] Checking PyInstaller installation...")
    try:
        import PyInstaller
    except ImportError:
        print("[Build] Installing PyInstaller...")
        subprocess.check_call([sys.executable, "-m", "pip", "install", "pyinstaller", "pywebview"])

    print("[Build] Building standalone executable...")
    
    # Path separator for PyInstaller --add-data (';' for Windows, ':' for Linux/macOS)
    sep = ';' if sys.platform == 'win32' else ':'

    cmd = [
        sys.executable, "-m", "PyInstaller",
        "--noconfirm",
        "--onedir",
        "--windowed",
        "--name=META_BOM_Comparison_App",
        f"--add-data=templates{sep}templates",
        f"--add-data=static{sep}static",
        "desktop_app.py"
    ]

    print(f"[Build] Command: {' '.join(cmd)}")
    result = subprocess.run(cmd)
    
    if result.returncode == 0:
        print("\n========================================================")
        print(" SUCCESS! Desktop App build finished successfully.")
        print(f" Executable path: {os.path.abspath('dist/META_BOM_Comparison_App/META_BOM_Comparison_App.exe')}")
        print("========================================================\n")
    else:
        print("\n[Build Failed] PyInstaller exited with an error.")

if __name__ == '__main__':
    build()
