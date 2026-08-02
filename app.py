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
            for f in sorted(files):
                if f.endswith(('.xlsx', '.csv')) and not f.startswith(('._', '~$')):
                    full_p = os.path.join(root, f)
                    if full_p in seen: continue
                    seen.add(full_p)
                    
                    is_upload = (d == UPLOAD_FOLDER)
                    display_name = f"[Uploaded] {f}" if is_upload else os.path.basename(f)
                    
                    found.append({
                        'filename': f,
                        'display_name': display_name,
                        'path': full_p,
                        'is_excel': f.endswith(('.xlsx', '.xls'))
                    })
    return found

def read_file_safe(path, sheet_name=None):
    if not path or not os.path.exists(path):
        return None, [], f"File not found: {path}"
    
    ext = os.path.splitext(path)[1].lower()
    sheet_names = []
    
    if ext in ['.xlsx', '.xls']:
        try:
            wb = openpyxl.load_workbook(path, data_only=True)
            sheet_names = wb.sheetnames
            target_sheet = sheet_name if (sheet_name and sheet_name in sheet_names) else sheet_names[0]
            ws = wb[target_sheet]
            
            rows = []
            for r in ws.iter_rows(values_only=True):
                row_str = [str(cell).strip() if cell is not None else '' for cell in r]
                rows.append(row_str)
            return rows, sheet_names, None
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

@app.route('/api/build-matrix')
def get_build_matrix():
    req_path = request.args.get('file_path', None)
    path = req_path if (req_path and os.path.exists(req_path)) else resolve_file_path('matrix', DEFAULT_PATHS['matrix'])
    requested_sheet = request.args.get('sheet', 'DVT - L10 Build Matrix')

    rows, sheets, err = read_file_safe(path, sheet_name=requested_sheet)
    if err:
        return jsonify({'success': False, 'error': err}), 400

    configs = []
    if len(rows) > 2:
        configs = [c for c in rows[2][2:] if c]

    descriptions = {}
    if len(rows) > 3:
        desc_row = rows[3]
        for idx, cfg in enumerate(configs):
            if idx + 2 < len(desc_row):
                descriptions[cfg] = desc_row[idx + 2]

    rack_qty = {}
    if len(rows) > 4:
        qty_row = rows[4]
        for idx, cfg in enumerate(configs):
            if idx + 2 < len(qty_row):
                q = qty_row[idx + 2]
                if q.endswith('.0'): q = q[:-2]
                rack_qty[cfg] = q

    items = []
    total_diff_items = 0

    for idx, r in enumerate(rows[5:], start=5):
        if not any(r): continue

        grp_item = r[0].strip() if len(r) > 0 else ''
        attr = r[1].strip() if len(r) > 1 else ''

        if not grp_item and not attr: continue

        vals = {}
        row_vals = []
        for c_idx, cfg in enumerate(configs):
            val = r[c_idx + 2].strip() if c_idx + 2 < len(r) else ''
            vals[cfg] = val
            if val: row_vals.append(val)

        unique_vals = set(row_vals)
        is_diff = len(unique_vals) > 1

        if is_diff:
            total_diff_items += 1

        items.append({
            'row_id': idx,
            'group_item': grp_item,
            'attribute': attr,
            'values': vals,
            'is_diff': is_diff
        })

    summary = {
        'filename': os.path.basename(path),
        'active_file': path,
        'configs': configs,
        'descriptions': descriptions,
        'rack_qty': rack_qty,
        'total_items': len(items),
        'diff_items_count': total_diff_items,
        'sheets': sheets,
        'active_sheet': requested_sheet if (requested_sheet and requested_sheet in sheets) else (sheets[0] if sheets else None),
        'available_files': scan_files_in_dirs('matrix')
    }

    return jsonify({
        'success': True,
        'summary': summary,
        'items': items
    })

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 8050))
    app.run(host='0.0.0.0', port=port, debug=False)
