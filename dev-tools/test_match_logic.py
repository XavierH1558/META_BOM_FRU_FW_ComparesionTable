import os
import re
from app import resolve_file_path, read_file_safe, parse_bkc_items, parse_single_yaml_file, PROJECT_CONFIGS

default_bkc = PROJECT_CONFIGS['sanmiguel']['default_paths']['bkc']
bkc_p = resolve_file_path('bkc', default_bkc, 'sanmiguel')
b_rows, _, _ = read_file_safe(bkc_p)
bkc_items = parse_bkc_items(b_rows) if b_rows else []

yaml_p = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'data', 'yaml', 'clemente_ct_maxq_mp_fro.yaml')
yaml_items, st_label, err = parse_single_yaml_file(yaml_p)

def normalize_str(s):
    if not s: return ""
    return re.sub(r'[^a-zA-Z0-9]', '', str(s)).lower()

def calculate_match_score(yaml_item, b_item):
    step = y_item['step_location']
    comp = y_item['component']
    sub = y_item['sub_component']
    ver = y_item['yaml_version']
    
    y_norm = normalize_str(comp)
    sub_norm = normalize_str(sub)
    step_norm = normalize_str(step)
    
    cat_norm = normalize_str(b_item.get('category', ''))
    grp_norm = normalize_str(b_item.get('group', ''))
    b_sub_norm = normalize_str(b_item.get('sub_component', ''))

    # Exact string equality
    if sub_norm and sub_norm == b_sub_norm:
        return 100
    if y_norm and y_norm == b_sub_norm:
        return 95

    score = 0

    # 1. BMC Component Matching
    if 'bmc' in sub_norm or 'bmc' in y_norm or 'bmc' in step_norm:
        if 'openbmc' in b_sub_norm:
            if 'ct' in sub_norm or 'ct' in step_norm or 'computetray' in cat_norm:
                score += 85
            else:
                score += 70
        elif 'bmc' in b_sub_norm:
            if 'nvswitch' in grp_norm or 'nv' in grp_norm:
                if 'nv' in step_norm or 'nv' in sub_norm:
                    score += 90
                else:
                    score += 40  # Penalty if step does not mention NV switch
            else:
                score += 65

    # 2. CPLD Component Matching
    elif 'cpld' in sub_norm or 'cpld' in y_norm or 'cpld' in step_norm:
        if 'cpld' in b_sub_norm or 'cpld' in grp_norm or 'fpga' in b_sub_norm:
            loc_tokens = ['interposer', 'scm', 'hdd', 'hmc', 'rmc', 'fio', 'nvswitch', 'cff']
            y_locs = [loc for loc in loc_tokens if loc in step_norm or loc in sub_norm or loc in y_norm]
            b_locs = [loc for loc in loc_tokens if loc in b_sub_norm or loc in grp_norm or loc in cat_norm]
            
            if y_locs:
                common_locs = set(y_locs).intersection(set(b_locs))
                if common_locs:
                    score += 85
                else:
                    score = 0  # Location mismatch for CPLD -> Reject match!
            else:
                score += 50

    # 3. SBIOS / BIOS Matching
    elif any(k in sub_norm or k in step_norm for k in ['sbios', 'bios']):
        if any(k in b_sub_norm or k in grp_norm for k in ['sbios', 'bios']):
            score += 80

    # 4. OS / Kernel Matching
    elif 'os' in sub_norm or 'kernel' in sub_norm:
        if 'os' in b_sub_norm or 'kernel' in b_sub_norm:
            score += 80

    # 5. Generic substring containment
    else:
        if len(sub_norm) >= 3 and (sub_norm in b_sub_norm or b_sub_norm in sub_norm):
            score += 60
        elif len(y_norm) >= 3 and (y_norm in b_sub_norm or b_sub_norm in y_norm):
            score += 55

    return score

print("=== SCORING MATCH RESULTS ===")
matched_cnt = 0
unmatched_cnt = 0

for y_item in yaml_items:
    step = y_item['step_location']
    comp = y_item['component']
    sub = y_item['sub_component']
    ver = y_item['yaml_version']
    
    best_score = 0
    best_bkc = None
    
    for b_item in bkc_items:
        score = calculate_match_score(y_item, b_item)
        if score > best_score:
            best_score = score
            best_bkc = b_item
            
    if best_score >= 50 and best_bkc:
        matched_cnt += 1
        print(f"[MATCH] Step: {step:<35} | YAML: {comp:<20} ({ver:<15}) -> BKC: [{best_bkc['group']}] {best_bkc['sub_component']} ({best_bkc['version']}) [Score: {best_score}]")
    else:
        unmatched_cnt += 1
        print(f"[MISSING] Step: {step:<35} | YAML: {comp:<20} ({ver:<15}) -> BKC: MISSING IN BKC [Best Score: {best_score}]")

print(f"\nSummary: {matched_cnt} matched, {unmatched_cnt} unmatched (Missing in BKC)")
