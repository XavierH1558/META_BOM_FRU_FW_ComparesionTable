import json
import os
import sys
import re

# Add project root to sys.path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)) + '/..')

from app import app, scan_files_in_dirs, read_file_safe, parse_matrix_sheet

output_data = {}

output_data['matrix_files'] = []
for f in scan_files_in_dirs('matrix'):
    output_data['matrix_files'].append({
        'display_name': f['display_name'],
        'path': f['path']
    })

with app.test_client() as client:
    res = client.get('/api/global-search?q=15-106079')
    output_data['api_response'] = res.get_json()

with open('scratch/search_debug_result.json', 'w', encoding='utf-8') as out_f:
    json.dump(output_data, out_f, indent=2, ensure_ascii=False)

print("SUCCESSFULLY_SAVED_DEBUG_FILE")
