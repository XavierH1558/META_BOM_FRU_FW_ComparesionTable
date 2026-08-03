import os
import csv
import openpyxl
import re
from flask import Flask, render_template, jsonify, request
from werkzeug.utils import secure_filename

app = Flask(__name__)

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
UPLOAD_FOLDER = os.path.join(BASE_DIR, 'uploads')
DATA_DIR = os.path.join(BASE_DIR, 'data')

os.makedirs(UPLOAD_FOLDER, exist_ok=True)
os.makedirs(os.path.join(DATA_DIR, 'bkc'), exist_ok=True)
os.makedirs(os.path.join(DATA_DIR, 'fru'), exist_ok=True)
os.makedirs(os.path.join(DATA_DIR, 'matrix'), exist_ok=True)

app.config['UPLOAD_FOLDER'] = UPLOAD_FOLDER

# Initialize Google Drive Background Sync Scheduler if enabled in gdrive_config.json
try:
    from gdrive_sync import sync_all_gdrive_folders, load_config
    gcfg = load_config()
    if gcfg and gcfg.get('enabled', False):
        from apscheduler.schedulers.background import BackgroundScheduler
        scheduler = BackgroundScheduler(daemon=True)
        
        # Default to twice a day (9:00 AM and 6:00 PM)
        sync_hours = str(gcfg.get('sync_hours', '9,18'))
        scheduler.add_job(
            func=sync_all_gdrive_folders,
            trigger="cron",
            hour=sync_hours,
            minute=0,
            id='gdrive_sync_job',
            replace_existing=True
        )
        scheduler.start()
        print(f"[GDrive Sync] Background scheduler started. Syncing twice daily at hours ({sync_hours}:00).")
except Exception as g_err:
    print(f"[GDrive Sync] Background scheduler initialization skipped: {g_err}")

# Base directory roots (supports local Mac paths + repo data folder + uploads)
DIR_ROOTS = {
    'bkc': [
        '/Volumes/DATA/Projects/META/VR200-SanMiguel/BKC Table/',
        os.path.join(DATA_DIR, 'bkc'),
        UPLOAD_FOLDER
    ],
    'fru': [
        '/Volumes/DATA/Projects/META/VR200-SanMiguel/FRU Spec/DVT/',
        '/Volumes/DATA/Projects/META/VR200-SanMiguel/FRU Spec/PVT1-1/',
        os.path.join(DATA_DIR, 'fru'),
        UPLOAD_FOLDER
    ],
    'matrix': [
        '/Volumes/DATA/Projects/META/VR200-SanMiguel/Build Matrix/',
        os.path.join(DATA_DIR, 'matrix'),
        UPLOAD_FOLDER
    ]
}

def resolve_file_path(tab_key, mac_fallback_path):
    if os.path.exists(mac_fallback_path):
        return mac_fallback_path
    files = scan_files_in_dirs(tab_key)
    if files:
        return files[0]['path']
    return mac_fallback_path

DEFAULT_PATHS = {
    'bkc': '/Volumes/DATA/Projects/META/VR200-SanMiguel/BKC Table/San Miguel(VR200) FW control table - 3way.xlsx',
    'fru_dvt': '/Volumes/DATA/Projects/META/VR200-SanMiguel/FRU Spec/DVT/Maxwell_Earth_FRU table_DVT_20260708.xlsx',
    'fru_pvt': '/Volumes/DATA/Projects/META/VR200-SanMiguel/FRU Spec/PVT1-1/Maxwell_Earth_FRU table_PVT1-1_20260709-1639.xlsx',
    'matrix': '/Volumes/DATA/Projects/META/VR200-SanMiguel/Build Matrix/SanMiguel(Ingrasys) Build Matrix_DVT_Draft_260325.xlsx'
}


ACTIVE_PATHS = dict(DEFAULT_PATHS)

def scan_files_in_dirs(tab_key):
    dirs = DIR_ROOTS.get(tab_key, [])
    found = []
    seen = set()
    for d in dirs:
        if not os.path.exists(d): continue
        for root, _, files in os.walk(d):
            for f in files:
                if f.endswith(('.xlsx', '.csv')) and not f.startswith(('._', '~$')):
                    full_p = os.path.join(root, f)
                    if full_p in seen: continue
                    seen.add(full_p)
                    
                    is_upload = (d == UPLOAD_FOLDER)
                    display_name = f"[Uploaded] {f}" if is_upload else os.path.basename(f)
                    
                    mtime = os.path.getmtime(full_p) if os.path.exists(full_p) else 0
                    found.append({
                        'filename': f,
                        'display_name': display_name,
                        'path': full_p,
                        'is_excel': f.endswith(('.xlsx', '.xls')),
                        'mtime': mtime
                    })
    # Sort files by modification time descending (latest files first)
    found.sort(key=lambda x: x['mtime'], reverse=True)
    return found

def filter_valid_data_sheets(sheets):
    ignored_keywords = {'readme', 'change log', 'changelog', 'history', 'revision history', 'single source vendor', 'instructions', 'notes'}
    valid = [s for s in sheets if not any(k in s.lower() for k in ignored_keywords)]
    return valid if valid else sheets

def read_file_safe(path, sheet_name=None):
    if not path or not os.path.exists(path):
        return None, [], f"File not found: {path}"
    
    ext = os.path.splitext(path)[1].lower()
    sheet_names = []
    
    if ext in ['.xlsx', '.xls']:
        try:
            wb = openpyxl.load_workbook(path, data_only=True)
            sheet_names = wb.sheetnames
            valid_sheets = filter_valid_data_sheets(sheet_names)
            if sheet_name and sheet_name in sheet_names:
                target_sheet = sheet_name
            else:
                target_sheet = valid_sheets[0]
            ws = wb[target_sheet]
            
            rows = []
            for r in ws.iter_rows(values_only=True):
                row_str = [str(cell).strip() if cell is not None else '' for cell in r]
                rows.append(row_str)
            return rows, valid_sheets, None
        except Exception as e:
            return None, [], str(e)
    else:
        try:
            with open(path, 'r', encoding='utf-8-sig', errors='ignore') as f:
                reader = list(csv.reader(f))
                return reader, [], None
        except Exception as e:
            return None, [], str(e)

def parse_version_tuple(ver_str):
    if not ver_str or ver_str in ['-', 'NA', 'TBD']:
        return ()
    tokens = re.findall(r'[0-9]+|[a-zA-Z]+', ver_str)
    parsed = []
    for t in tokens:
        if t.isdigit():
            parsed.append((0, int(t)))
        else:
            parsed.append((1, t.lower()))
    return tuple(parsed)

def compare_versions(ver_base, ver_target):
    if ver_base == ver_target:
        return 'same'
    if not ver_base and ver_target:
        return 'added'
    if ver_base and not ver_target:
        return 'removed'
        
    t_base = parse_version_tuple(ver_base)
    t_target = parse_version_tuple(ver_target)
    
    if not t_base and t_target:
        return 'upgraded'
    if t_base and not t_target:
        return 'downgraded'
        
    if t_target > t_base:
        return 'upgraded'
    elif t_target < t_base:
        return 'downgraded'
    else:
        return 'updated'

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/api/files')
def get_files():
    tab_key = request.args.get('type', 'bkc')
    files = scan_files_in_dirs(tab_key)
    return jsonify({'success': True, 'type': tab_key, 'files': files})

@app.route('/api/upload', methods=['POST'])
def upload_file():
    if 'file' not in request.files:
        return jsonify({'success': False, 'error': 'No file uploaded'}), 400
    
    file = request.files['file']
    tab_type = request.form.get('tab_type', 'bkc')
    
    if file.filename == '':
        return jsonify({'success': False, 'error': 'No selected file'}), 400
    
    if file and file.filename.endswith(('.xlsx', '.xls', '.csv')):
        filename = secure_filename(file.filename)
        save_path = os.path.join(app.config['UPLOAD_FOLDER'], filename)
        file.save(save_path)
        
        # Set as active path for the given type
        if tab_type in ACTIVE_PATHS:
            ACTIVE_PATHS[tab_type] = save_path
        
        return jsonify({
            'success': True,
            'filename': filename,
            'saved_path': save_path,
            'tab_type': tab_type
        })
    else:
        return jsonify({'success': False, 'error': 'Unsupported file format. Please upload .xlsx or .csv'}), 400

@app.route('/api/status')
def get_status():
    status = {}
    for key, path in ACTIVE_PATHS.items():
        status[key] = {
            'path': path,
            'exists': os.path.exists(path),
            'filename': os.path.basename(path),
            'is_excel': os.path.splitext(path)[1].lower() in ['.xlsx', '.xls']
        }
    return jsonify(status)

@app.route('/api/bkc')
def get_bkc():
    req_path = request.args.get('file_path', None)
    path = req_path if (req_path and os.path.exists(req_path)) else resolve_file_path('bkc', DEFAULT_PATHS['bkc'])
    requested_sheet = request.args.get('sheet', None)

    
    rows, sheets, err = read_file_safe(path, sheet_name=requested_sheet)
    if err:
        return jsonify({'success': False, 'error': err}), 400

    items = []
    groups = set()
    categories_dict = {}
    current_category = 'General'
    current_group = ''

    headers = []
    if len(rows) > 2:
        headers = [c for c in rows[2]]

    for idx, r in enumerate(rows[3:], start=3):
        if not any(r):
            continue

        c0 = r[0].strip() if len(r) > 0 else ''
        c1 = r[1].strip() if len(r) > 1 else ''
        c5 = r[5].strip() if len(r) > 5 else ''

        if c0 and not c1 and not c5 and not any(c.strip() for c in r[2:]):
            current_category = c0
            if current_category not in categories_dict:
                categories_dict[current_category] = []
            continue

        if c0:
            current_group = c0
            groups.add(current_group)

        meta_owner = r[2].strip() if len(r) > 2 else ''
        odm_owner = r[3].strip() if len(r) > 3 else ''
        
        ver = c5
        if ver.endswith('.0') and ver.replace('.0', '').isdigit():
            ver = ver[:-2]
        
        chksum = r[6].strip() if len(r) > 6 else ''
        vrc = r[7].strip() if len(r) > 7 else ''
        if vrc.endswith('.0') and vrc.replace('.0', '').isdigit():
            vrc = vrc[:-2]
        
        sign_off = r[8].strip() if len(r) > 8 else ''
        gdrive = r[11].strip() if len(r) > 11 else ''

        item = {
            'row_id': idx,
            'category': current_category,
            'group': current_group,
            'sub_component': c1,
            'meta_owner': meta_owner,
            'odm_owner': odm_owner,
            'version': ver,
            'checksum': chksum,
            'vrc': vrc,
            'sign_off': sign_off,
            'gdrive': gdrive,
            'raw_row': r
        }

        items.append(item)
        if current_category not in categories_dict:
            categories_dict[current_category] = []
        categories_dict[current_category].append(item)

    cat_summary = []
    for cat_name, cat_items in categories_dict.items():
        cat_groups = len(set(it['group'] for it in cat_items))
        cat_fw_count = sum(1 for it in cat_items if it['version'])
        cat_summary.append({
            'name': cat_name,
            'items_count': len(cat_items),
            'groups_count': cat_groups,
            'fw_count': cat_fw_count
        })

    summary = {
        'total_items': len(items),
        'groups_count': len(groups),
        'groups_list': sorted(list(groups)),
        'items_with_version': sum(1 for item in items if item['version']),
        'sheets': sheets,
        'active_sheet': requested_sheet if (requested_sheet and requested_sheet in sheets) else (sheets[0] if sheets else None),
        'active_file': path,
        'available_files': scan_files_in_dirs('bkc'),
        'categories_summary': cat_summary
    }

    return jsonify({
        'success': True,
        'filename': os.path.basename(path),
        'summary': summary,
        'headers': headers,
        'categories': cat_summary,
        'items': items
    })

@app.route('/api/bkc-compare')
def get_bkc_compare():
    req_path = request.args.get('file_path', None)
    path = req_path if (req_path and os.path.exists(req_path)) else resolve_file_path('bkc', DEFAULT_PATHS['bkc'])

    
    base_sheet = request.args.get('base_sheet', None)
    target_sheet = request.args.get('target_sheet', None)

    rows_target, sheets, err_target = read_file_safe(path, sheet_name=target_sheet)
    if err_target or not sheets:
        return jsonify({'success': False, 'error': err_target or 'No sheets found'}), 400

    t_sheet = target_sheet if (target_sheet and target_sheet in sheets) else sheets[0]
    default_base = sheets[1] if len(sheets) > 1 else t_sheet
    b_sheet = base_sheet if (base_sheet and base_sheet in sheets) else default_base

    rows_base, _, err_base = read_file_safe(path, sheet_name=b_sheet)
    if err_base:
        return jsonify({'success': False, 'error': err_base}), 400

    def parse_items_map(rows):
        items_map = {}
        current_cat = 'General'
        current_group = ''
        for idx, r in enumerate(rows[3:], start=3):
            if not any(r): continue
            c0 = r[0].strip() if len(r) > 0 else ''
            c1 = r[1].strip() if len(r) > 1 else ''
            c5 = r[5].strip() if len(r) > 5 else ''

            if c0 and not c1 and not c5 and not any(c.strip() for c in r[2:]):
                current_cat = c0
                continue

            if c0: current_group = c0

            meta_owner = r[2].strip() if len(r) > 2 else ''
            odm_owner = r[3].strip() if len(r) > 3 else ''

            ver = c5
            if ver.endswith('.0') and ver.replace('.0', '').isdigit():
                ver = ver[:-2]

            chksum = r[6].strip() if len(r) > 6 else ''
            vrc = r[7].strip() if len(r) > 7 else ''
            if vrc.endswith('.0') and vrc.replace('.0', '').isdigit():
                vrc = vrc[:-2]

            sign_off = r[8].strip() if len(r) > 8 else ''
            gdrive = r[11].strip() if len(r) > 11 else ''

            key = (current_cat, current_group, c1)
            items_map[key] = {
                'category': current_cat,
                'group': current_group,
                'sub_component': c1,
                'meta_owner': meta_owner,
                'odm_owner': odm_owner,
                'version': ver,
                'checksum': chksum,
                'vrc': vrc,
                'sign_off': sign_off,
                'gdrive': gdrive
            }
        return items_map

    base_map = parse_items_map(rows_base)
    target_map = parse_items_map(rows_target)

    ordered_keys = []
    for k in base_map.keys():
        if k not in ordered_keys: ordered_keys.append(k)
    for k in target_map.keys():
        if k not in ordered_keys: ordered_keys.append(k)

    compared_items = []
    diff_count = 0
    upgraded_count = 0
    downgraded_count = 0
    categories_dict = {}

    for key in ordered_keys:
        b_item = base_map.get(key, {})
        t_item = target_map.get(key, {})

        cat = t_item.get('category') or b_item.get('category') or 'General'
        grp = t_item.get('group') or b_item.get('group') or ''
        sub = t_item.get('sub_component') or b_item.get('sub_component') or ''

        ver_b = b_item.get('version', '')
        ver_t = t_item.get('version', '')

        sign_b = b_item.get('sign_off', '')
        sign_t = t_item.get('sign_off', '')

        ver_status = compare_versions(ver_b, ver_t)
        is_diff = (ver_status != 'same') or (sign_b != sign_t)
        
        if ver_status == 'upgraded': upgraded_count += 1
        elif ver_status == 'downgraded': downgraded_count += 1
        
        if is_diff:
            diff_count += 1

        comp = {
            'category': cat,
            'group': grp,
            'sub_component': sub,
            'meta_owner': t_item.get('meta_owner') or b_item.get('meta_owner') or '',
            'odm_owner': t_item.get('odm_owner') or b_item.get('odm_owner') or '',
            'base_version': ver_b,
            'target_version': ver_t,
            'base_sign_off': sign_b,
            'target_sign_off': sign_t,
            'base_checksum': b_item.get('checksum', ''),
            'target_checksum': t_item.get('checksum', ''),
            'gdrive': t_item.get('gdrive') or b_item.get('gdrive') or '',
            'is_diff': is_diff,
            'status': ver_status
        }

        compared_items.append(comp)
        if cat not in categories_dict:
            categories_dict[cat] = []
        categories_dict[cat].append(comp)

    cat_summary = []
    for cat_name, cat_items in categories_dict.items():
        cat_groups = len(set(it['group'] for it in cat_items))
        cat_diffs = sum(1 for it in cat_items if it['is_diff'])
        cat_summary.append({
            'name': cat_name,
            'items_count': len(cat_items),
            'groups_count': cat_groups,
            'diff_count': cat_diffs
        })

    summary = {
        'total_items': len(compared_items),
        'diff_items_count': diff_count,
        'upgraded_count': upgraded_count,
        'downgraded_count': downgraded_count,
        'sheets': sheets,
        'base_sheet': b_sheet,
        'target_sheet': t_sheet,
        'active_file': path,
        'available_files': scan_files_in_dirs('bkc'),
        'categories_summary': cat_summary
    }

    return jsonify({
        'success': True,
        'filename': os.path.basename(path),
        'summary': summary,
        'categories': cat_summary,
        'items': compared_items
    })

KNOWN_FRU_SECTIONS = {'Chassis Info Area', 'Board Info Area', 'Product Info Area', 'MultiRecord Area', 'Organization'}

def is_fru_section_header(label):
    if not label: return False
    lbl_clean = label.strip()
    if lbl_clean in KNOWN_FRU_SECTIONS or 'Area' in lbl_clean or 'Section' in lbl_clean or 'Header' in lbl_clean:
        return True
    return False

def parse_fru_sheet_smart(rows):
    if len(rows) < 2: return [], [], {}
    header_row = rows[1]
    modules = []
    mod_map = {}
    for col_idx in range(1, len(header_row)):
        m_name = header_row[col_idx].strip()
        if m_name and 'FRU' not in m_name and m_name not in modules:
            modules.append(m_name)
            mod_map[m_name] = col_idx

    current_section = 'General'
    ordered_keys = []
    data_dict = {}

    for i in range(len(rows)):
        r = rows[i]
        col0 = (r[0] if len(r) > 0 else '').strip()
        has_data = any(c.strip() for c in r[1:])

        if is_fru_section_header(col0):
            current_section = col0
            continue

        if not col0 and has_data and ordered_keys:
            last_key = ordered_keys[-1]
            for mod_name, col_idx in mod_map.items():
                val = r[col_idx].strip() if col_idx < len(r) else ''
                if val:
                    prev_val = data_dict[last_key].get(mod_name, '')
                    data_dict[last_key][mod_name] = (prev_val + ' (' + val + ')').strip() if prev_val else val
            continue

        if not col0 and not has_data:
            continue

        key = (current_section, col0)
        if key not in data_dict:
            data_dict[key] = {}
            ordered_keys.append(key)

        for mod_name, col_idx in mod_map.items():
            val = r[col_idx].strip() if col_idx < len(r) else ''
            data_dict[key][mod_name] = val

    return modules, ordered_keys, data_dict

@app.route('/api/fru')
def get_fru():
    req_path = request.args.get('file_path', None)
    path = req_path if (req_path and os.path.exists(req_path)) else resolve_file_path('fru', DEFAULT_PATHS['fru_dvt'])
    requested_sheet = request.args.get('sheet', 'FRU-A')

    rows, sheets, err = read_file_safe(path, sheet_name=requested_sheet)
    if err:
        return jsonify({'success': False, 'error': err}), 400

    modules, keys, data_dict = parse_fru_sheet_smart(rows)

    fields = []
    total_configured_vals = 0

    for idx, (sec, f_name) in enumerate(keys):
        key = (sec, f_name)
        vals = data_dict.get(key, {})

        for mod, val in vals.items():
            if val and val != '-':
                total_configured_vals += 1

        fields.append({
            'row_id': idx,
            'section': sec,
            'field_name': f_name,
            'values': vals
        })

    summary = {
        'total_rows': len(fields),
        'modules': modules,
        'total_configured_vals': total_configured_vals,
        'filename': os.path.basename(path),
        'sheets': sheets,
        'active_sheet': requested_sheet if (requested_sheet and requested_sheet in sheets) else (sheets[0] if sheets else None),
        'active_file': path,
        'available_files': scan_files_in_dirs('fru')
    }

    return jsonify({
        'success': True,
        'summary': summary,
        'fields': fields
    })

@app.route('/api/fru-compare')
def get_fru_compare():
    req_dvt = request.args.get('dvt_file', None)
    req_pvt = request.args.get('pvt_file', None)
    
    path_dvt = req_dvt if (req_dvt and os.path.exists(req_dvt)) else resolve_file_path('fru', DEFAULT_PATHS['fru_dvt'])
    path_pvt = req_pvt if (req_pvt and os.path.exists(req_pvt)) else resolve_file_path('fru', DEFAULT_PATHS['fru_pvt'])


    requested_sheet = request.args.get('sheet', None)
    base_sheet = request.args.get('base_sheet', requested_sheet or 'FRU-A')
    target_sheet = request.args.get('target_sheet', requested_sheet or 'FRU-A')

    rows_dvt, sheets_dvt, err_dvt = read_file_safe(path_dvt, sheet_name=base_sheet)
    rows_pvt, sheets_pvt, err_pvt = read_file_safe(path_pvt, sheet_name=target_sheet)

    if err_dvt or err_pvt:
        return jsonify({
            'success': False,
            'error_dvt': err_dvt,
            'error_pvt': err_pvt
        }), 400

    mods_b, keys_b, dict_b = parse_fru_sheet_smart(rows_dvt)
    mods_t, keys_t, dict_t = parse_fru_sheet_smart(rows_pvt)

    all_modules = list(dict.fromkeys(mods_b + mods_t))
    all_keys = list(dict.fromkeys(keys_b + keys_t))

    common_modules = [m for m in mods_b if m in mods_t]
    base_only_modules = [m for m in mods_b if m not in mods_t]
    target_only_modules = [m for m in mods_t if m not in mods_b]

    fields_compare = []
    total_diff_cells = 0
    total_diff_rows = 0

    for idx, (sec, f_name) in enumerate(all_keys):

        key = (sec, f_name)
        b_vals = dict_b.get(key, {})
        t_vals = dict_t.get(key, {})

        dvt_vals = {}
        pvt_vals = {}
        diff_modules = []
        is_row_diff = False

        for mod in all_modules:
            has_in_b = mod in mods_b
            has_in_t = mod in mods_t

            val_b = b_vals.get(mod, '-' if has_in_b else 'N/A (無此模組)')
            val_t = t_vals.get(mod, '-' if has_in_t else 'N/A (無此模組)')

            dvt_vals[mod] = val_b
            pvt_vals[mod] = val_t

            # Real spec difference exists when both Base & Target have the module and values differ
            if has_in_b and has_in_t and val_b != val_t:
                diff_modules.append(mod)
                total_diff_cells += 1
                is_row_diff = True

        if is_row_diff:
            total_diff_rows += 1

        fields_compare.append({
            'row_id': idx,
            'section': sec,
            'field_name': f_name,
            'dvt_values': dvt_vals,
            'pvt_values': pvt_vals,
            'is_diff': is_row_diff,
            'diff_modules': diff_modules
        })

    summary = {
        'total_rows': len(fields_compare),
        'total_diff_rows': total_diff_rows,
        'total_diff_cells': total_diff_cells,
        'modules': all_modules,
        'common_modules': common_modules,
        'base_only_modules': base_only_modules,
        'target_only_modules': target_only_modules,
        'dvt_filename': os.path.basename(path_dvt),
        'pvt_filename': os.path.basename(path_pvt),
        'dvt_path': path_dvt,
        'pvt_path': path_pvt,
        'sheets_base': sheets_dvt,

        'sheets_target': sheets_pvt,
        'base_sheet': base_sheet if (base_sheet and base_sheet in sheets_dvt) else (sheets_dvt[0] if sheets_dvt else None),
        'target_sheet': target_sheet if (target_sheet and target_sheet in sheets_pvt) else (sheets_pvt[0] if sheets_pvt else None),
        'available_files': scan_files_in_dirs('fru')
    }





    return jsonify({
        'success': True,
        'summary': summary,
        'fields': fields_compare
    })

# ── Shared helper: parse a build matrix sheet ──────────────────────────────
def parse_matrix_sheet(rows):
    """Parse a build-matrix sheet (already loaded as list-of-str-lists).
    Returns: (configs, configs_info, descriptions, rack_qty, items_dict, items_list)
      configs      – ordered list of config names
      configs_info – list of (col_idx, cfg_name)
      descriptions – {cfg_name: description str}
      rack_qty     – {cfg_name: qty str}
      items_dict   – {(group_item, attribute): {cfg_name: val}}
      items_list   – [{row_id, group_item, attribute, values, is_diff}]
    """
    # Smart config-row search (first 6 rows)
    config_row_idx = -1
    for i in range(min(6, len(rows))):
        r = rows[i]
        if sum(1 for cell in r if 'config' in cell.lower()) >= 1:
            config_row_idx = i
            break
    if config_row_idx == -1:
        config_row_idx = 2 if len(rows) > 2 else 0

    cfg_row = rows[config_row_idx] if config_row_idx < len(rows) else []
    configs_info, configs = [], []
    for c_idx in range(2, len(cfg_row)):
        c_val = cfg_row[c_idx].strip()
        if c_val and c_val.lower() != 'none' and not any(k in c_val.lower() for k in ['note', 'comment']):
            configs_info.append((c_idx, c_val))
            configs.append(c_val)

    desc_row = rows[config_row_idx + 1] if config_row_idx + 1 < len(rows) else []
    qty_row  = rows[config_row_idx + 2] if config_row_idx + 2 < len(rows) else []

    descriptions, rack_qty = {}, {}
    for c_idx, cfg_name in configs_info:
        if c_idx < len(desc_row):
            descriptions[cfg_name] = desc_row[c_idx].strip()
        if c_idx < len(qty_row):
            q = qty_row[c_idx].strip()
            if q.endswith('.0'): q = q[:-2]
            rack_qty[cfg_name] = q

    items_dict   = {}   # {(group_item, attribute): {cfg_name: val}}
    items_list   = []
    current_group = 'General / Header'
    total_diff   = 0

    for idx in range(config_row_idx + 3, len(rows)):
        r = rows[idx]
        if not any(c.strip() for c in r): continue

        col0 = r[0].strip() if len(r) > 0 else ''
        col1 = r[1].strip() if len(r) > 1 else ''

        if col0:
            current_group = col0

        if not col1 and not any(r[c_idx].strip() for c_idx, _ in configs_info if c_idx < len(r)):
            continue

        vals, row_vals = {}, []
        for c_idx, cfg_name in configs_info:
            val = r[c_idx].strip() if c_idx < len(r) else ''
            vals[cfg_name] = val
            if val: row_vals.append(val)

        # Skip rows where all values are empty and attribute is purely metadata label
        if not row_vals and col1.lower() in ['igs', 'meta', 'note', 'comment', 'notes', '']:
            continue

        is_diff = len(set(row_vals)) > 1
        if is_diff: total_diff += 1

        key = (current_group, col1)
        items_dict[key] = vals

        items_list.append({
            'row_id': idx,
            'group_item': current_group,
            'attribute': col1,
            'values': vals,
            'is_diff': is_diff
        })

    return configs, configs_info, descriptions, rack_qty, items_dict, items_list, total_diff


def compare_two_matrix_sheets(base_rows, tgt_rows):
    b_configs, _, b_descs, b_qty, b_dict, _, _ = parse_matrix_sheet(base_rows)
    t_configs, _, t_descs, t_qty, t_dict, _, _ = parse_matrix_sheet(tgt_rows)

    seen_keys   = set()
    ordered_keys = []
    for k in b_dict:
        if k not in seen_keys:
            seen_keys.add(k)
            ordered_keys.append(k)
    for k in t_dict:
        if k not in seen_keys:
            seen_keys.add(k)
            ordered_keys.append(k)

    compare_items = []
    diff_count    = 0

    for key in ordered_keys:
        group_item, attribute = key
        b_vals = b_dict.get(key, None)
        t_vals = t_dict.get(key, None)

        if b_vals is None:
            diff_type = 'target_only'
        elif t_vals is None:
            diff_type = 'base_only'
        else:
            b_set = set(v for v in b_vals.values() if v)
            t_set = set(v for v in t_vals.values() if v)
            diff_type = 'changed' if b_set != t_set else 'same'

        is_diff = diff_type != 'same'
        if is_diff:
            diff_count += 1

        compare_items.append({
            'group_item': group_item,
            'attribute':  attribute,
            'base_values':   b_vals or {},
            'target_values': t_vals or {},
            'diff_type': diff_type,
            'is_diff':   is_diff
        })

    return {
        'base_configs': b_configs,
        'target_configs': t_configs,
        'base_descriptions': b_descs,
        'target_descriptions': t_descs,
        'base_rack_qty': b_qty,
        'target_rack_qty': t_qty,
        'diff_items_count': diff_count,
        'total_items': len(compare_items),
        'items': compare_items
    }


@app.route('/api/build-matrix')
def get_build_matrix():
    req_path = request.args.get('file_path', None)
    path = req_path if (req_path and os.path.exists(req_path)) else resolve_file_path('matrix', DEFAULT_PATHS['matrix'])
    requested_sheet = request.args.get('sheet', None)

    rows, sheets, err = read_file_safe(path, sheet_name=requested_sheet)
    if err:
        return jsonify({'success': False, 'error': err}), 400

    configs, _, descriptions, rack_qty, _, items_list, total_diff = parse_matrix_sheet(rows)
    active_sh = requested_sheet if (requested_sheet and requested_sheet in sheets) else (sheets[0] if sheets else None)

    auto_compare = None
    if len(sheets) >= 2:
        base_sh = sheets[0]
        tgt_sh = sheets[1]
        r_base, _, _ = read_file_safe(path, sheet_name=base_sh)
        r_tgt, _, _ = read_file_safe(path, sheet_name=tgt_sh)
        if r_base and r_tgt:
            res = compare_two_matrix_sheets(r_base, r_tgt)
            auto_compare = {
                'is_multi_sheet': True,
                'base_sheet': base_sh,
                'target_sheet': tgt_sh,
                'diff_count': res['diff_items_count'],
                'total_items': res['total_items'],
                'base_configs': res['base_configs'],
                'target_configs': res['target_configs'],
                'items': res['items']
            }

    return jsonify({
        'success': True,
        'summary': {
            'filename': os.path.basename(path),
            'active_file': path,
            'configs': configs,
            'descriptions': descriptions,
            'rack_qty': rack_qty,
            'total_items': len(items_list),
            'diff_items_count': total_diff,
            'sheets': sheets,
            'active_sheet': active_sh,
            'available_files': scan_files_in_dirs('matrix')
        },
        'items': items_list,
        'auto_compare': auto_compare
    })


@app.route('/api/build-matrix-compare')
def get_build_matrix_compare():
    """Compare two build-matrix sheets (can be different files or different sheets in same file)."""
    base_file  = request.args.get('base_file',  None)
    base_sheet = request.args.get('base_sheet', None)
    tgt_file   = request.args.get('target_file',  None)
    tgt_sheet  = request.args.get('target_sheet', None)

    default_path = resolve_file_path('matrix', DEFAULT_PATHS['matrix'])
    base_path = base_file if (base_file and os.path.exists(base_file)) else default_path
    tgt_path  = tgt_file  if (tgt_file  and os.path.exists(tgt_file))  else default_path

    base_rows, base_sheets, err1 = read_file_safe(base_path, sheet_name=base_sheet)
    if err1:
        return jsonify({'success': False, 'error': f'Base sheet error: {err1}'}), 400

    tgt_rows, tgt_sheets, err2 = read_file_safe(tgt_path, sheet_name=tgt_sheet)
    if err2:
        return jsonify({'success': False, 'error': f'Target sheet error: {err2}'}), 400

    b_sheet = base_sheet if (base_sheet and base_sheet in base_sheets) else base_sheets[0]
    t_sheet = tgt_sheet if (tgt_sheet and tgt_sheet in tgt_sheets) else (tgt_sheets[1] if len(tgt_sheets) > 1 else tgt_sheets[0])

    res = compare_two_matrix_sheets(base_rows, tgt_rows)

    return jsonify({
        'success': True,
        'summary': {
            'base_file':    os.path.basename(base_path),
            'base_sheet':   b_sheet,
            'target_file':  os.path.basename(tgt_path),
            'target_sheet': t_sheet,
            'base_configs':   res['base_configs'],
            'target_configs': res['target_configs'],
            'base_descriptions':   res['base_descriptions'],
            'target_descriptions': res['target_descriptions'],
            'base_rack_qty':   res['base_rack_qty'],
            'target_rack_qty': res['target_rack_qty'],
            'total_items': res['total_items'],
            'diff_items_count': res['diff_items_count'],
            'base_sheets':   base_sheets,
            'target_sheets': tgt_sheets,
            'available_files': scan_files_in_dirs('matrix')
        },
        'items': res['items']
    })


@app.route('/api/sync-gdrive', methods=['POST', 'GET'])
def api_sync_gdrive():
    """Manual trigger endpoint for Google Drive sync."""
    try:
        from gdrive_sync import sync_all_gdrive_folders
        res = sync_all_gdrive_folders()
        return jsonify({
            'success': True,
            'result': res
        })
    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


if __name__ == '__main__':
    port = int(os.environ.get('PORT', 8050))
    app.run(host='0.0.0.0', port=port, debug=False)

