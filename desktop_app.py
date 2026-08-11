import os
import sys
import socket
import threading
import webview
from app import app

def find_free_port(default_port=8055):
    """Find a free port starting from default_port."""
    try:
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
            s.bind(('127.0.0.1', default_port))
            return default_port
    except OSError:
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
            s.bind(('127.0.0.1', 0))
            return s.getsockname()[1]

def run_flask_server(port):
    """Run Flask server in thread."""
    # Suppress verbose Flask development server logging in desktop mode
    import logging
    log = logging.getLogger('werkzeug')
    log.setLevel(logging.ERROR)
    
    app.run(host='127.0.0.1', port=port, debug=False, use_reloader=False)

def main():
    port = find_free_port(8055)
    
    # Start Flask in background daemon thread
    server_thread = threading.Thread(target=run_flask_server, args=(port,), daemon=True)
    server_thread.start()
    
    url = f'http://127.0.0.1:{port}'
    print(f"[Desktop App] Local server started at {url}")
    
    # Create native desktop window
    window = webview.create_window(
        title='META BOM & FRU FW Comparison System',
        url=url,
        width=1366,
        height=868,
        min_size=(900, 600),
        resizable=True
    )
    
    # Start pywebview event loop
    webview.start()

if __name__ == '__main__':
    main()
