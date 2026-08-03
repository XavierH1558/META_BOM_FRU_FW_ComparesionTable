// Global Application State
const appState = {
    bkc: null,
    bkcCompare: null,
    fruSingle: null,
    fruCompare: null,
    matrix: null,
    matrixCompare: null,
    activeTab: 'tab-bkc',
    bkcMode: 'single',    // 'single' or 'compare'
    fruMode: 'single',    // 'single' or 'compare'
    matrixMode: 'single', // 'single' or 'compare'
    matrixSelectedGroup: 'ALL', // selected group_item filter
    bkcSelectedCategory: 'ALL',
    bkcSelectedGroup: 'ALL',
    fruSelectedModule: 'ALL',
    fruSelectedSection: 'ALL',
    fruSelectedFieldName: 'ALL',
    bkcCollapsedCategories: new Set(),
    fruCollapsedSections: new Set(),
    selectedFiles: {
        bkc: null,
        fru_single: null,
        fru_dvt: null,
        fru_pvt: null,
        matrix: null
    }
};

// Global Loading Animation Controls
function showLoading(title = '正在讀取並解析 Excel 表單...', subtitle = 'Parsing workbook data & generating comparison table') {
    const overlay = document.getElementById('global-loading-overlay');
    const titleEl = document.getElementById('loading-title');
    const subEl = document.getElementById('loading-subtitle');
    if (titleEl) titleEl.textContent = title;
    if (subEl) subEl.textContent = subtitle;
    if (overlay) {
        overlay.style.display = 'flex';
        setTimeout(() => overlay.classList.add('active'), 10);
    }
}

function hideLoading() {
    const overlay = document.getElementById('global-loading-overlay');
    if (overlay) {
        overlay.classList.remove('active');
        setTimeout(() => {
            overlay.style.display = 'none';
        }, 250);
    }
}




// Initialize Application on DOM Content Loaded
document.addEventListener('DOMContentLoaded', () => {
    initTabs();
    initEventListeners();
    initUploadModal();
    fetchAllData();
});

// Tab Switching System
function initTabs() {
    const tabButtons = document.querySelectorAll('.nav-tab');
    const tabContents = document.querySelectorAll('.tab-content');

    tabButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            const targetTab = btn.getAttribute('data-tab');
            appState.activeTab = targetTab;

            tabButtons.forEach(b => b.classList.remove('active'));
            tabContents.forEach(c => c.classList.remove('active'));

            btn.classList.add('active');
            document.getElementById(targetTab).classList.add('active');
        });
    });
}

// Event Listeners for Filters & Controls
function initEventListeners() {
    document.getElementById('btn-refresh').addEventListener('click', () => {
        fetchAllData();
    });

    // BKC Mode Switching (Single vs Compare)
    const btnSingleMode = document.getElementById('bkc-mode-single');
    const btnCompareMode = document.getElementById('bkc-mode-compare');

    btnSingleMode.addEventListener('click', () => {
        appState.bkcMode = 'single';
        btnSingleMode.classList.add('active');
        btnCompareMode.classList.remove('active');
        document.getElementById('bkc-sheet-box').style.display = 'block';
        document.getElementById('bkc-compare-select-box').style.display = 'none';
        document.getElementById('bkc-diff-toggle-box').style.display = 'none';
        fetchBkcData();
    });

    btnCompareMode.addEventListener('click', () => {
        appState.bkcMode = 'compare';
        btnCompareMode.classList.add('active');
        btnSingleMode.classList.remove('active');
        document.getElementById('bkc-sheet-box').style.display = 'none';
        document.getElementById('bkc-compare-select-box').style.display = 'flex';
        document.getElementById('bkc-diff-toggle-box').style.display = 'flex';
        fetchBkcCompareData();
    });

    // File Selector listeners
    document.getElementById('bkc-file-select').addEventListener('change', (e) => {
        appState.selectedFiles.bkc = e.target.value;
        if (appState.bkcMode === 'compare') {
            fetchBkcCompareData();
        } else {
            fetchBkcData();
        }
    });

    document.getElementById('fru-dvt-file-select').addEventListener('change', (e) => {
        appState.selectedFiles.fru_dvt = e.target.value;
        fetchFruData();
    });

    document.getElementById('fru-pvt-file-select').addEventListener('change', (e) => {
        appState.selectedFiles.fru_pvt = e.target.value;
        fetchFruData();
    });

    document.getElementById('matrix-file-select').addEventListener('change', (e) => {
        appState.selectedFiles.matrix = e.target.value;
        fetchMatrixData();
    });

    // BKC Search, Sheet, Category Filter, and Expand/Collapse All
    const bkcSearch = document.getElementById('bkc-search-input');
    const bkcCategorySelect = document.getElementById('bkc-category-select');
    const bkcSheet = document.getElementById('bkc-sheet-select');
    const bkcBaseSheet = document.getElementById('bkc-base-sheet-select');
    const bkcTargetSheet = document.getElementById('bkc-target-sheet-select');
    const bkcClear = document.getElementById('bkc-clear-search');

    bkcSearch.addEventListener('input', () => {
        bkcClear.style.display = bkcSearch.value ? 'block' : 'none';
        renderBkcTable();
    });

    bkcClear.addEventListener('click', () => {
        bkcSearch.value = '';
        bkcClear.style.display = 'none';
        renderBkcTable();
    });

    bkcCategorySelect.addEventListener('change', (e) => {
        const val = e.target.value;
        if (!val || val === 'cat:ALL') {
            appState.bkcSelectedCategory = 'ALL';
            appState.bkcSelectedGroup = 'ALL';
        } else if (val.startsWith('cat:')) {
            appState.bkcSelectedCategory = val.replace('cat:', '');
            appState.bkcSelectedGroup = 'ALL';
        } else if (val.startsWith('grp:')) {
            const parts = val.replace('grp:', '').split('|');
            appState.bkcSelectedCategory = parts[0];
            appState.bkcSelectedGroup = parts[1];
        }
        updateCategoryPillsActiveState();
        renderBkcTable();
    });


    bkcSheet.addEventListener('change', () => fetchBkcData(bkcSheet.value));
    
    bkcBaseSheet.addEventListener('change', () => fetchBkcCompareData(bkcBaseSheet.value, bkcTargetSheet.value));
    bkcTargetSheet.addEventListener('change', () => fetchBkcCompareData(bkcBaseSheet.value, bkcTargetSheet.value));


    document.getElementById('bkc-only-diff-toggle').addEventListener('change', renderBkcTable);

    document.getElementById('bkc-btn-expand-all').addEventListener('click', () => {
        appState.bkcCollapsedCategories.clear();
        renderBkcTable();
    });

    document.getElementById('bkc-btn-collapse-all').addEventListener('click', () => {
        const catData = appState.bkcMode === 'compare' ? appState.bkcCompare : appState.bkc;
        if (catData && catData.categories) {
            catData.categories.forEach(cat => appState.bkcCollapsedCategories.add(cat.name));
        }
        renderBkcTable();
    });

    // FRU Mode Switching (Single vs Compare View)
    const btnFruSingle = document.getElementById('fru-mode-single');
    const btnFruCompare = document.getElementById('fru-mode-compare');

    btnFruSingle.addEventListener('click', () => {
        appState.fruMode = 'single';
        btnFruSingle.classList.add('active');
        btnFruCompare.classList.remove('active');
        document.getElementById('fru-single-controls').style.display = 'flex';
        document.getElementById('fru-compare-controls').style.display = 'none';
        fetchFruSingleData();
    });

    btnFruCompare.addEventListener('click', () => {
        appState.fruMode = 'compare';
        btnFruCompare.classList.add('active');
        btnFruSingle.classList.remove('active');
        document.getElementById('fru-single-controls').style.display = 'none';
        document.getElementById('fru-compare-controls').style.display = 'flex';
        fetchFruCompareData();
    });

    document.getElementById('fru-single-file-select').addEventListener('change', (e) => {
        appState.selectedFiles.fru_single = e.target.value;
        fetchFruSingleData();
    });

    document.getElementById('fru-single-sheet-select').addEventListener('change', (e) => {
        fetchFruSingleData(e.target.value);
    });

    const fruSectionSelect = document.getElementById('fru-section-select');
    if (fruSectionSelect) {
        fruSectionSelect.addEventListener('change', (e) => {
            const val = e.target.value;
            if (!val || val === 'sec:ALL') {
                appState.fruSelectedSection = 'ALL';
                appState.fruSelectedFieldName = 'ALL';
            } else if (val.startsWith('sec:')) {
                appState.fruSelectedSection = val.replace('sec:', '');
                appState.fruSelectedFieldName = 'ALL';
            } else if (val.startsWith('fld:')) {
                const parts = val.replace('fld:', '').split('|');
                appState.fruSelectedSection = parts[0];
                appState.fruSelectedFieldName = parts[1];
            }
            updateFruModulePillsActiveState();
            renderFruTable();
        });
    }

    const fruDvtFileSelect = document.getElementById('fru-dvt-file-select');
    const fruPvtFileSelect = document.getElementById('fru-pvt-file-select');
    const fruBaseSheetSelect = document.getElementById('fru-base-sheet-select');
    const fruTargetSheetSelect = document.getElementById('fru-target-sheet-select');

    if (fruDvtFileSelect) {
        fruDvtFileSelect.addEventListener('change', (e) => {
            appState.selectedFiles.fru_dvt = e.target.value;
            fetchFruCompareData();
        });
    }

    if (fruPvtFileSelect) {
        fruPvtFileSelect.addEventListener('change', (e) => {
            appState.selectedFiles.fru_pvt = e.target.value;
            fetchFruCompareData();
        });
    }

    if (fruBaseSheetSelect) {
        fruBaseSheetSelect.addEventListener('change', () => {
            fetchFruCompareData(fruBaseSheetSelect.value, fruTargetSheetSelect ? fruTargetSheetSelect.value : null);
        });
    }

    if (fruTargetSheetSelect) {
        fruTargetSheetSelect.addEventListener('change', () => {
            fetchFruCompareData(fruBaseSheetSelect ? fruBaseSheetSelect.value : null, fruTargetSheetSelect.value);
        });
    }

    document.getElementById('fru-search-input').addEventListener('input', renderFruTable);
    document.getElementById('fru-only-diff-toggle').addEventListener('change', renderFruTable);



    document.getElementById('fru-btn-expand-all').addEventListener('click', () => {
        appState.fruCollapsedSections.clear();
        renderFruTable();
    });

    document.getElementById('fru-btn-collapse-all').addEventListener('click', () => {
        const currentData = appState.fruMode === 'compare' ? appState.fruCompare : appState.fruSingle;
        if (currentData && currentData.fields) {
            currentData.fields.forEach(f => appState.fruCollapsedSections.add(f.section));
        }
        renderFruTable();
    });


    // Matrix Mode Toggle
    const btnMatrixSingle  = document.getElementById('matrix-mode-single');
    const btnMatrixCompare = document.getElementById('matrix-mode-compare');

    btnMatrixSingle.addEventListener('click', () => {
        appState.matrixMode = 'single';
        btnMatrixSingle.classList.add('active');
        btnMatrixCompare.classList.remove('active');
        const singleFileBox = document.getElementById('matrix-single-file-box');
        if (singleFileBox) singleFileBox.style.display = 'flex';
        document.getElementById('matrix-single-controls').style.display = 'flex';
        document.getElementById('matrix-compare-controls').style.display = 'none';
        document.getElementById('matrix-only-diff-toggle').checked = false;
        fetchMatrixData();
    });

    btnMatrixCompare.addEventListener('click', () => {
        appState.matrixMode = 'compare';
        btnMatrixCompare.classList.add('active');
        btnMatrixSingle.classList.remove('active');
        const singleFileBox = document.getElementById('matrix-single-file-box');
        if (singleFileBox) singleFileBox.style.display = 'none';
        document.getElementById('matrix-single-controls').style.display = 'none';
        document.getElementById('matrix-compare-controls').style.display = 'flex';
        document.getElementById('matrix-only-diff-toggle').checked = true;
        fetchMatrixCompareData();
    });

    // Matrix Search, Sheet & Diff Toggle
    document.getElementById('matrix-search-input').addEventListener('input', () => {
        if (appState.matrixMode === 'compare') renderMatrixCompareTable();
        else renderMatrixTable();
    });
    document.getElementById('matrix-only-diff-toggle').addEventListener('change', () => {
        if (appState.matrixMode === 'compare') renderMatrixCompareTable();
        else renderMatrixTable();
    });
    document.getElementById('matrix-sheet-select').addEventListener('change', (e) => {
        fetchMatrixData(e.target.value);
    });

    const matrixBaseFileSelect = document.getElementById('matrix-base-file-select');
    const matrixTargetFileSelect = document.getElementById('matrix-target-file-select');
    const matrixBaseSheetSelect = document.getElementById('matrix-base-sheet-select');
    const matrixTargetSheetSelect = document.getElementById('matrix-target-sheet-select');

    if (matrixBaseFileSelect) {
        matrixBaseFileSelect.addEventListener('change', () => {
            fetchMatrixCompareData();
        });
    }
    if (matrixTargetFileSelect) {
        matrixTargetFileSelect.addEventListener('change', () => {
            fetchMatrixCompareData();
        });
    }
    if (matrixBaseSheetSelect) {
        matrixBaseSheetSelect.addEventListener('change', () => {
            fetchMatrixCompareData();
        });
    }
    if (matrixTargetSheetSelect) {
        matrixTargetSheetSelect.addEventListener('change', () => {
            fetchMatrixCompareData();
        });
    }

    const matrixPillsToggle = document.getElementById('matrix-pills-toggle');
    if (matrixPillsToggle) {
        matrixPillsToggle.addEventListener('click', () => {
            const list = document.getElementById('matrix-group-pills');
            const chevron = document.getElementById('matrix-pills-chevron');
            const toggleText = document.getElementById('matrix-pills-toggle-text');
            if (list) {
                if (list.style.display === 'none') {
                    list.style.display = 'flex';
                    if (chevron) chevron.style.transform = 'rotate(180deg)';
                    if (toggleText) toggleText.textContent = '點擊折疊標籤 (Click to Collapse)';
                } else {
                    list.style.display = 'none';
                    if (chevron) chevron.style.transform = 'rotate(0deg)';
                    if (toggleText) toggleText.textContent = '點擊展開標籤 (Click to Expand)';
                }
            }
        });
    }
}

// Upload Modal & Drag-and-Drop Setup
function initUploadModal() {
    const modal = document.getElementById('upload-modal');
    const btnOpen = document.getElementById('btn-open-upload');
    const btnClose = document.getElementById('btn-close-upload');
    const dropzone = document.getElementById('dropzone');
    const fileInput = document.getElementById('file-input');
    const statusText = document.getElementById('upload-status-text');

    btnOpen.addEventListener('click', () => modal.style.display = 'flex');
    btnClose.addEventListener('click', () => modal.style.display = 'none');
    modal.addEventListener('click', (e) => {
        if (e.target === modal) modal.style.display = 'none';
    });

    ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
        dropzone.addEventListener(eventName, (e) => {
            e.preventDefault();
            e.stopPropagation();
        });
    });

    ['dragenter', 'dragover'].forEach(eventName => {
        dropzone.addEventListener(eventName, () => dropzone.classList.add('dragover'));
    });

    ['dragleave', 'drop'].forEach(eventName => {
        dropzone.addEventListener(eventName, () => dropzone.classList.remove('dragover'));
    });

    dropzone.addEventListener('drop', (e) => {
        const files = e.dataTransfer.files;
        if (files.length > 0) handleFileUpload(files[0]);
    });

    fileInput.addEventListener('change', (e) => {
        if (e.target.files.length > 0) handleFileUpload(e.target.files[0]);
    });

    async function handleFileUpload(file) {
        const tabType = document.getElementById('upload-tab-type').value;
        statusText.style.display = 'block';
        statusText.textContent = `Uploading ${file.name}...`;
        statusText.style.background = 'rgba(59, 130, 246, 0.2)';
        statusText.style.color = 'var(--primary-blue)';

        const formData = new FormData();
        formData.append('file', file);
        formData.append('tab_type', tabType);

        try {
            const res = await fetch('/api/upload', {
                method: 'POST',
                body: formData
            });
            const data = await res.json();
            if (data.success) {
                statusText.textContent = `Successfully uploaded ${data.filename}!`;
                statusText.style.background = 'var(--success-bg)';
                statusText.style.color = 'var(--success-green)';
                setTimeout(() => {
                    modal.style.display = 'none';
                    statusText.style.display = 'none';
                    fetchAllData();
                }, 1200);
            } else {
                throw new Error(data.error);
            }
        } catch (err) {
            statusText.textContent = `Upload failed: ${err.message}`;
            statusText.style.background = 'var(--danger-bg)';
            statusText.style.color = 'var(--danger-red)';
        }
    }
}

// Fetch Data from Backend APIs
async function fetchAllData() {
    const statusText = document.querySelector('.status-text');
    statusText.textContent = 'Loading data...';

    try {
        const bkcPromise = appState.bkcMode === 'compare' ? fetchBkcCompareData() : fetchBkcData();
        const fruPromise = appState.fruMode === 'compare' ? fetchFruCompareData() : fetchFruSingleData();
        await Promise.all([
            bkcPromise,
            fruPromise,
            fetchMatrixData()
        ]);
        statusText.textContent = 'Connected';
    } catch (err) {
        console.error('Error fetching application data:', err);
        statusText.textContent = 'Data Error';
    }
}


function populateFileSelect(selectId, files, activePath) {
    const select = document.getElementById(selectId);
    if (!select || !files) return;
    
    select.innerHTML = '';
    files.forEach((f, idx) => {
        const opt = document.createElement('option');
        opt.value = f.path;
        opt.textContent = f.display_name;
        if (f.path === activePath || f.filename === activePath || f.display_name === activePath || (!activePath && idx === 0)) {
            opt.selected = true;
        }
        select.appendChild(opt);
    });
}


function populateSheetSelect(boxId, selectId, sheets, activeSheet) {
    const box = boxId ? document.getElementById(boxId) : null;
    const select = document.getElementById(selectId);

    if (!sheets || sheets.length === 0) {
        if (box) box.style.display = 'none';
        if (select) select.innerHTML = '';
        return;
    }

    if (box) box.style.display = 'block';
    if (select) {
        select.innerHTML = '';
        sheets.forEach(s => {
            const opt = document.createElement('option');
            opt.value = s;
            opt.textContent = `Sheet: ${s}`;
            if (s === activeSheet) opt.selected = true;
            select.appendChild(opt);
        });
    }
}



// ==================== TAB 1: BKC TABLE ====================
async function fetchBkcData(sheet = null) {
    showLoading('正在讀取並解析 BKC Table...', 'Parsing BKC Firmware Control Table');
    try {
        let url = '/api/bkc';
        const params = [];
        if (appState.selectedFiles.bkc) params.push(`file_path=${encodeURIComponent(appState.selectedFiles.bkc)}`);
        if (sheet) params.push(`sheet=${encodeURIComponent(sheet)}`);
        if (params.length > 0) url += '?' + params.join('&');

        const res = await fetch(url);
        const data = await res.json();
        if (data.success) {
            appState.bkc = data;
            appState.selectedFiles.bkc = data.summary.active_file;
            populateFileSelect('bkc-file-select', data.summary.available_files, data.summary.active_file);
            populateSheetSelect('bkc-sheet-box', 'bkc-sheet-select', data.summary.sheets, data.summary.active_sheet);
            renderBkcCategoryPills(data.categories, data.summary.total_items);
            updateBkcStats(data.summary);

            renderBkcTable();
        }
    } catch (err) {
        console.error('Failed to fetch BKC table:', err);
    } finally {
        hideLoading();
    }
}

async function fetchBkcCompareData(baseSheet = null, targetSheet = null) {
    showLoading('正在比對 BKC Table...', 'Comparing BKC Base vs Target Worksheets');
    try {
        let url = '/api/bkc-compare';
        const params = [];
        if (appState.selectedFiles.bkc) params.push(`file_path=${encodeURIComponent(appState.selectedFiles.bkc)}`);
        if (baseSheet) params.push(`base_sheet=${encodeURIComponent(baseSheet)}`);
        if (targetSheet) params.push(`target_sheet=${encodeURIComponent(targetSheet)}`);
        if (params.length > 0) url += '?' + params.join('&');

        const res = await fetch(url);
        const data = await res.json();
        if (data.success) {
            appState.bkcCompare = data;
            appState.selectedFiles.bkc = data.summary.active_file;
            populateFileSelect('bkc-file-select', data.summary.available_files, data.summary.active_file);
            populateBkcCompareSelects(data.summary.sheets, data.summary.base_sheet, data.summary.target_sheet);
            renderBkcCategoryPills(data.categories, data.summary.total_items);
            updateBkcCompareStats(data.summary);
            renderBkcTable();
        }
    } catch (err) {
        console.error('Failed to fetch BKC compare data:', err);
    } finally {
        hideLoading();
    }
}

function populateBkcCompareSelects(sheets, activeBase, activeTarget) {
    const baseSel = document.getElementById('bkc-base-sheet-select');
    const targetSel = document.getElementById('bkc-target-sheet-select');

    baseSel.innerHTML = '';
    targetSel.innerHTML = '';

    sheets.forEach(s => {
        const optB = document.createElement('option');
        optB.value = s;
        optB.textContent = s;
        if (s === activeBase) optB.selected = true;
        baseSel.appendChild(optB);

        const optT = document.createElement('option');
        optT.value = s;
        optT.textContent = s;
        if (s === activeTarget) optT.selected = true;
        targetSel.appendChild(optT);
    });
}

function populateSheetSelect(boxId, selectId, sheets, activeSheet, forceShow = true) {
    const box = document.getElementById(boxId);
    const select = document.getElementById(selectId);

    if (!sheets || sheets.length === 0) {
        if (box) box.style.display = 'none';
        return;
    }

    // Only show the parent box if forceShow is true (not used for compare controls)
    if (box && forceShow) box.style.display = 'block';
    if (select) {
        select.innerHTML = '';
        sheets.forEach(s => {
            const opt = document.createElement('option');
            opt.value = s;
            opt.textContent = `Sheet: ${s}`;
            if (s === activeSheet) opt.selected = true;
            select.appendChild(opt);
        });
    }
}

function populateBkcCategorySelect(categories) {
    const select = document.getElementById('bkc-category-select');
    if (!select) return;

    let html = '<option value="cat:ALL">所有區塊 (All Categories & Groups)</option>';

    const currentData = appState.bkcMode === 'compare' ? appState.bkcCompare : appState.bkc;
    if (!currentData || !currentData.items) {
        select.innerHTML = html;
        return;
    }

    const catGroupCounts = {};
    currentData.items.forEach(item => {
        const cat = item.category || 'General';
        const grp = item.group || 'Other';
        if (!catGroupCounts[cat]) catGroupCounts[cat] = {};
        if (!catGroupCounts[cat][grp]) catGroupCounts[cat][grp] = 0;
        catGroupCounts[cat][grp]++;
    });

    categories.forEach(cat => {
        const catName = cat.name;
        const grpMap = catGroupCounts[catName] || {};
        
        html += `<optgroup label="── ${escapeHtml(catName)} (${cat.items_count} 個組件) ──">`;
        html += `<option value="cat:${escapeHtml(catName)}">📁 ${escapeHtml(catName)} (全部組件)</option>`;
        
        Object.keys(grpMap).forEach(grpName => {
            const count = grpMap[grpName];
            html += `<option value="grp:${escapeHtml(catName)}|${escapeHtml(grpName)}">└─ ${escapeHtml(grpName)} (${count})</option>`;
        });
        
        html += `</optgroup>`;
    });

    select.innerHTML = html;

    if (appState.bkcSelectedCategory === 'ALL') {
        select.value = 'cat:ALL';
    } else if (appState.bkcSelectedGroup !== 'ALL') {
        select.value = `grp:${appState.bkcSelectedCategory}|${appState.bkcSelectedGroup}`;
    } else {
        select.value = `cat:${appState.bkcSelectedCategory}`;
    }
}

function renderBkcSubGroupPills() {
    const container = document.getElementById('bkc-subgroup-pills-container');
    const pillsList = document.getElementById('bkc-subgroup-pills');
    if (!container || !pillsList) return;

    const catName = appState.bkcSelectedCategory;
    const currentData = appState.bkcMode === 'compare' ? appState.bkcCompare : appState.bkc;

    if (!currentData || !currentData.items || catName === 'ALL') {
        container.style.display = 'none';
        return;
    }

    const catItems = currentData.items.filter(it => it.category === catName);
    if (catItems.length === 0) {
        container.style.display = 'none';
        return;
    }

    const grpCounts = {};
    catItems.forEach(it => {
        const grp = it.group || 'Other';
        grpCounts[grp] = (grpCounts[grp] || 0) + 1;
    });

    container.style.display = 'flex';
    
    let html = `
        <button class="sub-pill ${appState.bkcSelectedGroup === 'ALL' ? 'active' : ''}" data-grp="ALL">
            全部 ${escapeHtml(catName)} <span class="pill-badge">${catItems.length}</span>
        </button>
    `;

    Object.keys(grpCounts).forEach(grpName => {
        const isActive = appState.bkcSelectedGroup === grpName;
        const count = grpCounts[grpName];
        html += `
            <button class="sub-pill ${isActive ? 'active' : ''}" data-grp="${escapeHtml(grpName)}">
                ${escapeHtml(grpName)} <span class="pill-badge">${count}</span>
            </button>
        `;
    });

    pillsList.innerHTML = html;

    pillsList.querySelectorAll('.sub-pill').forEach(pill => {
        pill.addEventListener('click', () => {
            appState.bkcSelectedGroup = pill.getAttribute('data-grp');
            updateCategoryPillsActiveState();
            renderBkcTable();
        });
    });
}

function updateCategoryPillsActiveState() {
    const container = document.getElementById('bkc-category-pills');
    if (container) {
        const catVal = appState.bkcSelectedCategory;
        container.querySelectorAll('.cat-pill').forEach(p => {
            if (p.getAttribute('data-cat') === catVal) {
                p.classList.add('active');
            } else {
                p.classList.remove('active');
            }
        });
    }

    renderBkcSubGroupPills();

    const select = document.getElementById('bkc-category-select');
    if (select) {
        if (appState.bkcSelectedCategory === 'ALL') {
            select.value = 'cat:ALL';
        } else if (appState.bkcSelectedGroup !== 'ALL') {
            select.value = `grp:${appState.bkcSelectedCategory}|${appState.bkcSelectedGroup}`;
        } else {
            select.value = `cat:${appState.bkcSelectedCategory}`;
        }
    }
}

function renderBkcCategoryPills(categories, totalCount) {
    const container = document.getElementById('bkc-category-pills');
    if (!categories || categories.length === 0) {
        container.innerHTML = '';
        return;
    }

    populateBkcCategorySelect(categories);

    let html = `
        <button class="cat-pill ${appState.bkcSelectedCategory === 'ALL' ? 'active' : ''}" data-cat="ALL">
            全部大區塊 (All) <span class="pill-badge">${totalCount}</span>
        </button>
    `;

    categories.forEach(cat => {
        const isActive = appState.bkcSelectedCategory === cat.name;
        const count = cat.items_count;
        html += `
            <button class="cat-pill ${isActive ? 'active' : ''}" data-cat="${escapeHtml(cat.name)}">
                ${escapeHtml(cat.name)} <span class="pill-badge">${count}</span>
            </button>
        `;
    });

    container.innerHTML = html;

    container.querySelectorAll('.cat-pill').forEach(pill => {
        pill.addEventListener('click', () => {
            appState.bkcSelectedCategory = pill.getAttribute('data-cat');
            appState.bkcSelectedGroup = 'ALL';
            updateCategoryPillsActiveState();
            renderBkcTable();
        });
    });

    renderBkcSubGroupPills();
}



function updateBkcStats(summary) {
    // Card 1: Total Components
    document.getElementById('bkc-stat-icon-1').className = 'stat-icon bg-blue';
    document.getElementById('bkc-stat-icon-1').innerHTML = '<i class="fa-solid fa-microchip"></i>';
    document.getElementById('bkc-stat-val-1').textContent = summary.total_items;
    document.getElementById('bkc-stat-lbl-1').textContent = 'Total Components (組件總數)';

    // Card 2: System Groups
    document.getElementById('bkc-stat-icon-2').className = 'stat-icon bg-purple';
    document.getElementById('bkc-stat-icon-2').innerHTML = '<i class="fa-solid fa-layer-group"></i>';
    document.getElementById('bkc-stat-val-2').textContent = summary.groups_count;
    document.getElementById('bkc-stat-lbl-2').textContent = 'System Groups (小區塊/組群數)';

    // Card 3: Active FW Versions
    document.getElementById('bkc-stat-icon-3').className = 'stat-icon bg-green';
    document.getElementById('bkc-stat-icon-3').innerHTML = '<i class="fa-solid fa-circle-check"></i>';
    document.getElementById('bkc-stat-val-3').textContent = summary.items_with_version;
    document.getElementById('bkc-stat-lbl-3').textContent = 'Active FW Versions (具備版本數)';

    document.getElementById('bkc-badge-count').textContent = `${summary.total_items} Items`;
}

function updateBkcCompareStats(summary) {
    // Card 1: Total Differences
    document.getElementById('bkc-stat-icon-1').className = 'stat-icon bg-amber';
    document.getElementById('bkc-stat-icon-1').innerHTML = '<i class="fa-solid fa-code-compare"></i>';
    document.getElementById('bkc-stat-val-1').textContent = summary.diff_items_count;
    document.getElementById('bkc-stat-lbl-1').textContent = 'Total Differences (異動項目數)';

    // Card 2: Upgraded FW Count
    document.getElementById('bkc-stat-icon-2').className = 'stat-icon bg-green';
    document.getElementById('bkc-stat-icon-2').innerHTML = '<i class="fa-solid fa-arrow-trend-up"></i>';
    document.getElementById('bkc-stat-val-2').textContent = summary.upgraded_count;
    document.getElementById('bkc-stat-lbl-2').textContent = 'Upgraded FW (升版數量 ↑)';

    // Card 3: Downgraded FW Count
    document.getElementById('bkc-stat-icon-3').className = 'stat-icon bg-red';
    document.getElementById('bkc-stat-icon-3').innerHTML = '<i class="fa-solid fa-arrow-trend-down"></i>';
    document.getElementById('bkc-stat-val-3').textContent = summary.downgraded_count;
    document.getElementById('bkc-stat-lbl-3').textContent = 'Downgraded FW (降版數量 ↓)';

    document.getElementById('bkc-badge-count').textContent = `${summary.diff_items_count} Diffs`;
}


function getInputValue(id, defaultVal = '') {
    const el = document.getElementById(id);
    return el ? el.value.toLowerCase().trim() : defaultVal;
}

function getCheckboxChecked(id, defaultVal = false) {
    const el = document.getElementById(id);
    return el ? el.checked : defaultVal;
}

function renderBkcTable() {
    if (appState.bkcMode === 'compare') {
        renderBkcCompareTable();
    } else {
        renderBkcSingleTable();
    }
}

// Single Sheet Table Render
function renderBkcSingleTable() {
    if (!appState.bkc) return;

    const tbody = document.getElementById('bkc-tbody');
    const tableHeader = document.querySelector('#bkc-table thead tr');
    tableHeader.innerHTML = `
        <th style="width: 220px;">Group / Components</th>
        <th>Sub-Component</th>
        <th style="width: 120px;">Meta Owner</th>
        <th style="width: 120px;">ODM Owner</th>
        <th style="width: 160px;">Validation Version</th>
        <th style="width: 120px;">CheckSum</th>
        <th style="width: 100px;">VRC</th>
        <th style="width: 110px;">Sign Off</th>
        <th style="width: 180px;">GDrive / File Link</th>
    `;

    const searchVal = getInputValue('bkc-search-input');
    const catVal = appState.bkcSelectedCategory;
    const grpVal = appState.bkcSelectedGroup;

    const filtered = appState.bkc.items.filter(item => {
        const matchCategory = (catVal === 'ALL' || item.category === catVal);
        const matchGroup = (grpVal === 'ALL' || item.group === grpVal);
        const matchSearch = !searchVal || 
            item.category.toLowerCase().includes(searchVal) ||
            item.group.toLowerCase().includes(searchVal) ||
            item.sub_component.toLowerCase().includes(searchVal) ||
            item.meta_owner.toLowerCase().includes(searchVal) ||
            item.odm_owner.toLowerCase().includes(searchVal) ||
            item.version.toLowerCase().includes(searchVal) ||
            item.checksum.toLowerCase().includes(searchVal) ||
            item.gdrive.toLowerCase().includes(searchVal);
        return matchCategory && matchGroup && matchSearch;
    });



    if (filtered.length === 0) {
        tbody.innerHTML = `<tr><td colspan="9" class="text-center py-4 text-muted">無符合條件的組件資料</td></tr>`;
        return;
    }

    const groupedData = {};
    filtered.forEach(item => {
        if (!groupedData[item.category]) groupedData[item.category] = {};
        if (!groupedData[item.category][item.group]) groupedData[item.category][item.group] = [];
        groupedData[item.category][item.group].push(item);
    });

    let html = '';

    Object.keys(groupedData).forEach(catName => {
        const isCollapsed = appState.bkcCollapsedCategories.has(catName);
        const catGroups = groupedData[catName];

        let catTotalItems = 0;
        Object.values(catGroups).forEach(arr => catTotalItems += arr.length);

        html += `
            <tr class="tr-category-header ${isCollapsed ? 'collapsed' : ''}" data-cat-name="${escapeHtml(catName)}">
                <td colspan="9">
                    <div class="cat-header-content">
                        <div class="cat-header-left">
                            <i class="fa-solid fa-chevron-down cat-chevron"></i>
                            <span class="cat-title">${escapeHtml(catName)}</span>
                            <span class="cat-badge">${catTotalItems} 組件</span>
                        </div>
                        <div class="text-muted text-sm">
                            ${isCollapsed ? '點擊展開細項 (Click to Expand)' : '點擊折疊區塊 (Click to Collapse)'}
                        </div>
                    </div>
                </td>
            </tr>
        `;

        if (!isCollapsed) {
            Object.keys(catGroups).forEach(groupName => {
                const groupItems = catGroups[groupName];
                const rowSpan = groupItems.length;

                groupItems.forEach((item, index) => {
                    const signOffClass = item.sign_off ? 'signoff-pass' : 'signoff-pending';
                    const signOffText = item.sign_off || 'Pending';

                    let gdriveHtml = item.gdrive ? `<span class="font-mono">${escapeHtml(item.gdrive)}</span>` : '-';
                    if (item.gdrive.startsWith('http')) {
                        gdriveHtml = `<a href="${escapeHtml(item.gdrive)}" target="_blank" class="link-gdrive"><i class="fa-solid fa-arrow-up-right-from-square"></i> Link</a>`;
                    }

                    html += `<tr class="tr-cat-item">`;

                    if (index === 0) {
                        html += `<td rowspan="${rowSpan}" class="cell-merged-group">${escapeHtml(groupName)}</td>`;
                    }

                    html += `
                        <td class="cell-sub">${escapeHtml(item.sub_component)}</td>
                        <td>${escapeHtml(item.meta_owner || '-')}</td>
                        <td>${escapeHtml(item.odm_owner || '-')}</td>
                        <td class="font-mono text-cyan">${escapeHtml(item.version || '-')}</td>
                        <td class="font-mono">${escapeHtml(item.checksum || '-')}</td>
                        <td class="font-mono">${escapeHtml(item.vrc || '-')}</td>
                        <td><span class="badge-signoff ${signOffClass}">${escapeHtml(signOffText)}</span></td>
                        <td>${gdriveHtml}</td>
                    </tr>`;
                });
            });
        }
    });

    tbody.innerHTML = html;
    attachCategoryHeaderListeners(tbody);
}

// BKC Compare Table Render (2 Sheets)
function renderBkcCompareTable() {
    if (!appState.bkcCompare) return;

    const tbody = document.getElementById('bkc-tbody');
    const tableHeader = document.querySelector('#bkc-table thead tr');
    
    const baseName = appState.bkcCompare.summary.base_sheet;
    const targetName = appState.bkcCompare.summary.target_sheet;

    tableHeader.innerHTML = `
        <th>Group / Components</th>
        <th>Sub-Component</th>
        <th>Owner</th>
        <th>Base Version (${escapeHtml(baseName)})</th>
        <th>Target Version (${escapeHtml(targetName)})</th>
        <th>Sign Off (Base ➔ Target)</th>
        <th>Status</th>
    `;


    const searchVal = getInputValue('bkc-search-input');
    const catVal = appState.bkcSelectedCategory;
    const grpVal = appState.bkcSelectedGroup;
    const onlyDiff = getCheckboxChecked('bkc-only-diff-toggle');


    const filtered = appState.bkcCompare.items.filter(item => {
        if (onlyDiff && !item.is_diff) return false;

        const matchCategory = (catVal === 'ALL' || item.category === catVal);
        const matchGroup = (grpVal === 'ALL' || item.group === grpVal);
        const matchSearch = !searchVal || 
            item.category.toLowerCase().includes(searchVal) ||
            item.group.toLowerCase().includes(searchVal) ||
            item.sub_component.toLowerCase().includes(searchVal) ||
            item.base_version.toLowerCase().includes(searchVal) ||
            item.target_version.toLowerCase().includes(searchVal);
        return matchCategory && matchGroup && matchSearch;
    });



    if (filtered.length === 0) {
        tbody.innerHTML = `<tr><td colspan="7" class="text-center py-4 text-muted">無符合條件的版本比對資料</td></tr>`;
        return;
    }

    const groupedData = {};
    filtered.forEach(item => {
        if (!groupedData[item.category]) groupedData[item.category] = {};
        if (!groupedData[item.category][item.group]) groupedData[item.category][item.group] = [];
        groupedData[item.category][item.group].push(item);
    });

    let html = '';

    Object.keys(groupedData).forEach(catName => {
        const isCollapsed = appState.bkcCollapsedCategories.has(catName);
        const catGroups = groupedData[catName];

        let catTotalItems = 0;
        let catDiffItems = 0;
        Object.values(catGroups).forEach(arr => {
            catTotalItems += arr.length;
            catDiffItems += arr.filter(it => it.is_diff).length;
        });

        html += `
            <tr class="tr-category-header ${isCollapsed ? 'collapsed' : ''}" data-cat-name="${escapeHtml(catName)}">
                <td colspan="7">
                    <div class="cat-header-content">
                        <div class="cat-header-left">
                            <i class="fa-solid fa-chevron-down cat-chevron"></i>
                            <span class="cat-title">${escapeHtml(catName)}</span>
                            <span class="cat-badge">${catTotalItems} 組件</span>
                            <span class="badge badge-warning">${catDiffItems} 異動</span>
                        </div>
                        <div class="text-muted text-sm">
                            ${isCollapsed ? '點擊展開細項 (Click to Expand)' : '點擊折疊區塊 (Click to Collapse)'}
                        </div>
                    </div>
                </td>
            </tr>
        `;

        if (!isCollapsed) {
            Object.keys(catGroups).forEach(groupName => {
                const groupItems = catGroups[groupName];
                const rowSpan = groupItems.length;

                groupItems.forEach((item, index) => {
                    const trClass = item.is_diff ? 'tr-diff' : '';
                    html += `<tr class="${trClass}">`;

                    if (index === 0) {
                        html += `<td rowspan="${rowSpan}" class="cell-merged-group">${escapeHtml(groupName)}</td>`;
                    }

                    const signOffText = `${item.base_sign_off || '-'} ➔ ${item.target_sign_off || '-'}`;
                    let statusBadge = '<span class="badge" style="background: var(--border-light); color: var(--text-muted);">Same</span>';

                    if (item.status === 'upgraded') {
                        statusBadge = '<span class="badge badge-success" style="background: var(--success-bg); color: var(--success-green); border: 1px solid rgba(16, 185, 129, 0.4);"><i class="fa-solid fa-arrow-trend-up"></i> 升版 Upgraded</span>';
                    } else if (item.status === 'downgraded') {
                        statusBadge = '<span class="badge badge-danger" style="background: var(--danger-bg); color: var(--danger-red); border: 1px solid rgba(239, 68, 68, 0.4);"><i class="fa-solid fa-arrow-trend-down"></i> 降版 Downgraded</span>';
                    } else if (item.status === 'added') {
                        statusBadge = '<span class="badge badge-info"><i class="fa-solid fa-plus"></i> 新增 Added</span>';
                    } else if (item.status === 'removed') {
                        statusBadge = '<span class="badge badge-warning"><i class="fa-solid fa-minus"></i> 移除 Removed</span>';
                    } else if (item.is_diff) {
                        statusBadge = '<span class="badge badge-warning">變更 Changed</span>';
                    }

                    html += `
                        <td class="cell-sub">${escapeHtml(item.sub_component)}</td>
                        <td>${escapeHtml(item.odm_owner || item.meta_owner || '-')}</td>
                        <td class="font-mono text-muted">${escapeHtml(item.base_version || '-')}</td>
                        <td class="font-mono text-cyan" style="font-weight: 600;">${escapeHtml(item.target_version || '-')}</td>
                        <td><span class="badge-signoff signoff-pending">${escapeHtml(signOffText)}</span></td>
                        <td>${statusBadge}</td>
                    </tr>`;
                });
            });
        }
    });

    tbody.innerHTML = html;
    attachCategoryHeaderListeners(tbody);
}

function attachCategoryHeaderListeners(tbody) {
    tbody.querySelectorAll('.tr-category-header').forEach(headerRow => {
        headerRow.addEventListener('click', () => {
            const catName = headerRow.getAttribute('data-cat-name');
            if (appState.bkcCollapsedCategories.has(catName)) {
                appState.bkcCollapsedCategories.delete(catName);
            } else {
                appState.bkcCollapsedCategories.add(catName);
            }
            renderBkcTable();
        });
    });
}

// ==================== TAB 2: FRU TABLE COMPARISON ====================
async function fetchFruSingleData(sheet = null) {
    showLoading('正在讀取並解析 FRU Spec...', 'Parsing FRU specification workbook');
    try {
        let url = '/api/fru';
        const params = [];
        if (appState.selectedFiles.fru_single) params.push(`file_path=${encodeURIComponent(appState.selectedFiles.fru_single)}`);
        if (sheet) params.push(`sheet=${encodeURIComponent(sheet)}`);
        if (params.length > 0) url += '?' + params.join('&');

        const res = await fetch(url);
        const data = await res.json();
        if (data.success) {
            appState.fruSingle = data;
            appState.selectedFiles.fru_single = data.summary.active_file;
            populateFileSelect('fru-single-file-select', data.summary.available_files, data.summary.active_file);
            populateSheetSelect('fru-single-sheet-box', 'fru-single-sheet-select', data.summary.sheets, data.summary.active_sheet);
            renderFruModulePills(data.summary.modules);
            populateFruSectionSelect();
            updateFruSingleStats(data.summary);
            renderFruTable();
        }
    } catch (err) {
        console.error('Failed to fetch single FRU table:', err);
    } finally {
        hideLoading();
    }
}

async function fetchFruCompareData(bSheet = null, tSheet = null) {
    showLoading('正在比對 FRU Specifications...', 'Comparing FRU Base vs Target workbooks');
    try {
        let url = '/api/fru-compare';
        const params = [];
        if (appState.selectedFiles.fru_dvt) params.push(`dvt_file=${encodeURIComponent(appState.selectedFiles.fru_dvt)}`);
        if (appState.selectedFiles.fru_pvt) params.push(`pvt_file=${encodeURIComponent(appState.selectedFiles.fru_pvt)}`);
        if (bSheet) params.push(`base_sheet=${encodeURIComponent(bSheet)}`);
        if (tSheet) params.push(`target_sheet=${encodeURIComponent(tSheet)}`);
        if (params.length > 0) url += '?' + params.join('&');

        const res = await fetch(url);
        const data = await res.json();
        if (data.success) {
            appState.fruCompare = data;
            appState.selectedFiles.fru_dvt = data.summary.dvt_path || data.summary.dvt_filename;
            appState.selectedFiles.fru_pvt = data.summary.pvt_path || data.summary.pvt_filename;

            populateFileSelect('fru-dvt-file-select', data.summary.available_files, appState.selectedFiles.fru_dvt);
            populateFileSelect('fru-pvt-file-select', data.summary.available_files, appState.selectedFiles.fru_pvt);

            
            populateSheetSelect(null, 'fru-base-sheet-select', data.summary.sheets_base, data.summary.base_sheet);
            populateSheetSelect(null, 'fru-target-sheet-select', data.summary.sheets_target, data.summary.target_sheet);

            
            renderFruModulePills(data.summary.modules);
            populateFruSectionSelect();
            updateFruCompareStats(data.summary);
            renderFruTable();
        }
    } catch (err) {
        console.error('Failed to fetch FRU comparison:', err);
    } finally {
        hideLoading();
    }
}


function populateFruSectionSelect() {
    const select = document.getElementById('fru-section-select');
    if (!select) return;

    let html = '<option value="sec:ALL">所有 FRU 項目與分類 (All Sections & Fields)</option>';
    const currentData = appState.fruMode === 'compare' ? appState.fruCompare : appState.fruSingle;

    if (!currentData || !currentData.fields) {
        select.innerHTML = html;
        return;
    }

    const secMap = {};
    currentData.fields.forEach(f => {
        const sec = f.section || 'General';
        const name = f.field_name || 'Field';
        if (!secMap[sec]) secMap[sec] = [];
        if (!secMap[sec].includes(name)) secMap[sec].push(name);
    });

    Object.keys(secMap).forEach(secName => {
        const fieldNames = secMap[secName];
        html += `<optgroup label="── ${escapeHtml(secName)} (${fieldNames.length} 欄位) ──">`;
        html += `<option value="sec:${escapeHtml(secName)}">📁 ${escapeHtml(secName)} (全部欄位)</option>`;
        
        fieldNames.forEach(fName => {
            html += `<option value="fld:${escapeHtml(secName)}|${escapeHtml(fName)}">└─ ${escapeHtml(fName)}</option>`;
        });

        html += `</optgroup>`;
    });

    select.innerHTML = html;

    if (appState.fruSelectedSection === 'ALL') {
        select.value = 'sec:ALL';
    } else if (appState.fruSelectedFieldName !== 'ALL') {
        select.value = `fld:${appState.fruSelectedSection}|${appState.fruSelectedFieldName}`;
    } else {
        select.value = `sec:${appState.fruSelectedSection}`;
    }
}

function renderFruSubFieldPills() {
    const container = document.getElementById('fru-subfield-pills-container');
    const pillsList = document.getElementById('fru-subfield-pills');
    if (!container || !pillsList) return;

    const secName = appState.fruSelectedSection;
    const currentData = appState.fruMode === 'compare' ? appState.fruCompare : appState.fruSingle;

    if (!currentData || !currentData.fields || secName === 'ALL') {
        container.style.display = 'none';
        return;
    }

    const secFields = currentData.fields.filter(f => f.section === secName);
    if (secFields.length === 0) {
        container.style.display = 'none';
        return;
    }

    container.style.display = 'flex';

    let html = `
        <button class="sub-pill ${appState.fruSelectedFieldName === 'ALL' ? 'active' : ''}" data-fld="ALL">
            全部 ${escapeHtml(secName)} <span class="pill-badge">${secFields.length}</span>
        </button>
    `;

    secFields.forEach(f => {
        const fName = f.field_name || 'Field';
        const isActive = appState.fruSelectedFieldName === fName;
        html += `
            <button class="sub-pill ${isActive ? 'active' : ''}" data-fld="${escapeHtml(fName)}">
                ${escapeHtml(fName)}
            </button>
        `;
    });

    pillsList.innerHTML = html;

    pillsList.querySelectorAll('.sub-pill').forEach(pill => {
        pill.addEventListener('click', () => {
            appState.fruSelectedFieldName = pill.getAttribute('data-fld');
            updateFruModulePillsActiveState();
            renderFruTable();
        });
    });
}

function updateFruModulePillsActiveState() {
    renderFruSubFieldPills();

    const select = document.getElementById('fru-section-select');
    if (select) {
        if (appState.fruSelectedSection === 'ALL') {
            select.value = 'sec:ALL';
        } else if (appState.fruSelectedFieldName !== 'ALL') {
            select.value = `fld:${appState.fruSelectedSection}|${appState.fruSelectedFieldName}`;
        } else {
            select.value = `sec:${appState.fruSelectedSection}`;
        }
    }
}

function renderFruModulePills(modules) {
    const container = document.getElementById('fru-module-pills');
    if (!container || !modules) return;

    const isCompare = appState.fruMode === 'compare' && appState.fruCompare && appState.fruCompare.summary;
    const commonMods = isCompare ? (appState.fruCompare.summary.common_modules || []) : [];
    const baseOnlyMods = isCompare ? (appState.fruCompare.summary.base_only_modules || []) : [];
    const targetOnlyMods = isCompare ? (appState.fruCompare.summary.target_only_modules || []) : [];

    let html = `
        <button class="cat-pill ${appState.fruSelectedModule === 'ALL' ? 'active' : ''}" data-mod="ALL">
            全部模組 (All Modules) <span class="pill-badge">${modules.length}</span>
        </button>
    `;

    modules.forEach(m => {
        const isActive = appState.fruSelectedModule === m;
        let badgeHtml = '';

        if (isCompare) {
            if (commonMods.includes(m)) {
                badgeHtml = `<span class="pill-badge badge-common">共同對比</span>`;
            } else if (baseOnlyMods.includes(m)) {
                badgeHtml = `<span class="pill-badge text-muted">僅 Base</span>`;
            } else if (targetOnlyMods.includes(m)) {
                badgeHtml = `<span class="pill-badge text-muted">僅 Target</span>`;
            }
        }

        html += `
            <button class="cat-pill ${isActive ? 'active' : ''}" data-mod="${escapeHtml(m)}">
                ${escapeHtml(m)} ${badgeHtml}
            </button>
        `;
    });

    container.innerHTML = html;

    container.querySelectorAll('.cat-pill').forEach(pill => {
        pill.addEventListener('click', () => {
            appState.fruSelectedModule = pill.getAttribute('data-mod');
            container.querySelectorAll('.cat-pill').forEach(p => p.classList.remove('active'));
            pill.classList.add('active');
            renderFruTable();
        });
    });
}


function updateFruSingleStats(summary) {
    document.getElementById('fru-stat-icon-1').className = 'stat-icon bg-blue';
    document.getElementById('fru-stat-icon-1').innerHTML = '<i class="fa-solid fa-list-check"></i>';
    document.getElementById('fru-stat-val-1').textContent = summary.total_rows;
    document.getElementById('fru-stat-lbl-1').textContent = 'Total Spec Fields (總規格欄位)';

    document.getElementById('fru-stat-icon-2').className = 'stat-icon bg-purple';
    document.getElementById('fru-stat-icon-2').innerHTML = '<i class="fa-solid fa-cubes"></i>';
    document.getElementById('fru-stat-val-2').textContent = summary.modules.length;
    document.getElementById('fru-stat-lbl-2').textContent = 'FRU Modules (模組數量)';

    document.getElementById('fru-stat-icon-3').className = 'stat-icon bg-green';
    document.getElementById('fru-stat-icon-3').innerHTML = '<i class="fa-solid fa-sliders"></i>';
    document.getElementById('fru-stat-val-3').textContent = summary.total_configured_vals;
    document.getElementById('fru-stat-lbl-3').textContent = 'Configured Values (已設定參數)';

    document.getElementById('fru-badge-diff').textContent = `${summary.total_rows} Fields`;
}

function updateFruCompareStats(summary) {
    document.getElementById('fru-stat-icon-1').className = 'stat-icon bg-amber';
    document.getElementById('fru-stat-icon-1').innerHTML = '<i class="fa-solid fa-triangle-exclamation"></i>';
    document.getElementById('fru-stat-val-1').textContent = summary.total_diff_rows;
    document.getElementById('fru-stat-lbl-1').textContent = 'Diff Rows (相異規格行數)';

    document.getElementById('fru-stat-icon-2').className = 'stat-icon bg-red';
    document.getElementById('fru-stat-icon-2').innerHTML = '<i class="fa-solid fa-square-poll-vertical"></i>';
    document.getElementById('fru-stat-val-2').textContent = summary.total_diff_cells;
    document.getElementById('fru-stat-lbl-2').textContent = 'Total Field Diffs (相異欄位數)';

    document.getElementById('fru-stat-icon-3').className = 'stat-icon bg-teal';
    document.getElementById('fru-stat-icon-3').innerHTML = '<i class="fa-solid fa-cubes"></i>';
    document.getElementById('fru-stat-val-3').textContent = summary.modules.length;
    document.getElementById('fru-stat-lbl-3').textContent = 'FRU Modules (模組數量)';

    document.getElementById('fru-badge-diff').textContent = `${summary.total_diff_rows} Diffs`;
}

function renderFruTable() {
    if (appState.fruMode === 'compare') {
        renderFruCompareTable();
    } else {
        renderFruSingleTable();
    }
}

// Single FRU Spec Table Render
function renderFruSingleTable() {
    if (!appState.fruSingle) return;

    const tbody = document.getElementById('fru-tbody');
    const theadRow = document.getElementById('fru-thead-row');
    const searchVal = getInputValue('fru-search-input');

    const moduleVal = appState.fruSelectedModule;
    const secVal = appState.fruSelectedSection;
    const fldVal = appState.fruSelectedFieldName;

    const allModules = appState.fruSingle.summary.modules;
    const activeModules = (moduleVal && moduleVal !== 'ALL') ? [moduleVal] : allModules;

    let headerHtml = `<th>Section Header</th><th>Field Name</th>`;
    activeModules.forEach(mod => {
        headerHtml += `<th>${escapeHtml(mod)}</th>`;
    });
    theadRow.innerHTML = headerHtml;


    const filtered = appState.fruSingle.fields.filter(field => {
        const matchSection = (secVal === 'ALL' || field.section === secVal);
        const matchField = (fldVal === 'ALL' || field.field_name === fldVal);
        const matchSearch = !searchVal || 
            field.section.toLowerCase().includes(searchVal) ||
            field.field_name.toLowerCase().includes(searchVal);
        return matchSection && matchField && matchSearch;
    });

    if (filtered.length === 0) {
        tbody.innerHTML = `<tr><td colspan="${activeModules.length + 2}" class="text-center py-4 text-muted">無符合條件的 FRU 規格項目</td></tr>`;
        return;
    }

    const groupedData = {};
    filtered.forEach(field => {
        const sec = field.section || 'General';
        if (!groupedData[sec]) groupedData[sec] = [];
        groupedData[sec].push(field);
    });

    let html = '';
    Object.keys(groupedData).forEach(secName => {
        const isCollapsed = appState.fruCollapsedSections.has(secName);
        const secFields = groupedData[secName];

        html += `
            <tr class="tr-category-header ${isCollapsed ? 'collapsed' : ''}" data-sec-name="${escapeHtml(secName)}">
                <td colspan="${activeModules.length + 2}">
                    <div class="cat-header-content">
                        <div class="cat-header-left">
                            <i class="fa-solid fa-chevron-down cat-chevron"></i>
                            <span class="cat-title">${escapeHtml(secName)}</span>
                            <span class="cat-badge">${secFields.length} 欄位</span>
                        </div>
                        <div class="text-muted text-sm">
                            ${isCollapsed ? '點擊展開細項 (Click to Expand)' : '點擊折疊區塊 (Click to Collapse)'}
                        </div>
                    </div>
                </td>
            </tr>
        `;

        if (!isCollapsed) {
            secFields.forEach(field => {
                html += `<tr>`;
                html += `<td class="cell-group">${escapeHtml(secName)}</td>`;
                html += `<td class="cell-sub">${escapeHtml(field.field_name || '-')}</td>`;

                activeModules.forEach(mod => {
                    const val = field.values[mod] || '';
                    html += `
                        <td class="font-mono">
                            <div class="diff-val-same">${escapeHtml(val || '-')}</div>
                        </td>
                    `;
                });

                html += `</tr>`;
            });
        }
    });

    tbody.innerHTML = html;
    attachFruSectionHeaderListeners(tbody);
}

// Compare FRU Table Render (Base vs Target)
function renderFruCompareTable() {
    if (!appState.fruCompare) return;

    const tbody = document.getElementById('fru-tbody');
    const theadRow = document.getElementById('fru-thead-row');
    const searchVal = getInputValue('fru-search-input');
    const moduleVal = appState.fruSelectedModule;
    const secVal = appState.fruSelectedSection;
    const fldVal = appState.fruSelectedFieldName;
    const onlyDiff = getCheckboxChecked('fru-only-diff-toggle');


    const baseSheet = appState.fruCompare.summary.base_sheet || 'Base';
    const targetSheet = appState.fruCompare.summary.target_sheet || 'Target';
    const isSameFile = appState.fruCompare.summary.dvt_filename === appState.fruCompare.summary.pvt_filename;

    const allModules = appState.fruCompare.summary.modules;
    const activeModules = (moduleVal && moduleVal !== 'ALL') ? [moduleVal] : allModules;

    let headerHtml = `<th>Section Header</th><th>Field Name</th>`;
    activeModules.forEach(mod => {
        const compareLabel = isSameFile ? `${baseSheet} ➔ ${targetSheet}` : `Base (${baseSheet}) vs Target (${targetSheet})`;
        headerHtml += `<th>${escapeHtml(mod)} (${escapeHtml(compareLabel)})</th>`;
    });
    theadRow.innerHTML = headerHtml;


    const filtered = appState.fruCompare.fields.filter(field => {
        if (onlyDiff && !field.is_diff) return false;

        const matchSection = (secVal === 'ALL' || field.section === secVal);
        const matchField = (fldVal === 'ALL' || field.field_name === fldVal);
        const matchSearch = !searchVal || 
            field.section.toLowerCase().includes(searchVal) ||
            field.field_name.toLowerCase().includes(searchVal);

        if (!matchSection || !matchField || !matchSearch) return false;

        if (moduleVal && moduleVal !== 'ALL') {
            if (onlyDiff && !field.diff_modules.includes(moduleVal)) {
                return false;
            }
        }
        return true;
    });

    if (filtered.length === 0) {
        tbody.innerHTML = `<tr><td colspan="${activeModules.length + 2}" class="text-center py-4 text-muted">無符合條件的比對項目</td></tr>`;
        return;
    }

    const groupedData = {};
    filtered.forEach(field => {
        const sec = field.section || 'General';
        if (!groupedData[sec]) groupedData[sec] = [];
        groupedData[sec].push(field);
    });

    let html = '';
    Object.keys(groupedData).forEach(secName => {
        const isCollapsed = appState.fruCollapsedSections.has(secName);
        const secFields = groupedData[secName];

        let secDiffs = secFields.filter(f => f.is_diff).length;

        html += `
            <tr class="tr-category-header ${isCollapsed ? 'collapsed' : ''}" data-sec-name="${escapeHtml(secName)}">
                <td colspan="${activeModules.length + 2}">
                    <div class="cat-header-content">
                        <div class="cat-header-left">
                            <i class="fa-solid fa-chevron-down cat-chevron"></i>
                            <span class="cat-title">${escapeHtml(secName)}</span>
                            <span class="cat-badge">${secFields.length} 欄位</span>
                            <span class="badge badge-warning">${secDiffs} 異動</span>
                        </div>
                        <div class="text-muted text-sm">
                            ${isCollapsed ? '點擊展開細項 (Click to Expand)' : '點擊折疊區塊 (Click to Collapse)'}
                        </div>
                    </div>
                </td>
            </tr>
        `;

        if (!isCollapsed) {
            secFields.forEach(field => {
                const rowClass = field.is_diff ? 'tr-diff' : '';
                html += `<tr class="${rowClass}">`;
                html += `<td class="cell-group">${escapeHtml(secName)}</td>`;
                html += `<td class="cell-sub">${escapeHtml(field.field_name || '-')}</td>`;

                activeModules.forEach(mod => {
                    const dvtVal = field.dvt_values[mod] || '';
                    const pvtVal = field.pvt_values[mod] || '';

                    const isMissingBase = dvtVal === 'N/A (無此模組)';
                    const isMissingTarget = pvtVal === 'N/A (無此模組)';
                    const isMissing = isMissingBase || isMissingTarget;

                    const isRealDiff = dvtVal !== pvtVal && !isMissing;

                    const labelBase = isSameFile ? baseSheet : 'Base';
                    const labelTarget = isSameFile ? targetSheet : 'Target';

                    if (isRealDiff) {
                        html += `
                            <td>
                                <div class="cell-diff-box has-diff">
                                    <div class="diff-val-dvt"><span class="val-label">${escapeHtml(labelBase)}:</span>${escapeHtml(dvtVal || '(empty)')}</div>
                                    <div class="diff-val-pvt"><span class="val-label">${escapeHtml(labelTarget)}:</span>${escapeHtml(pvtVal || '(empty)')}</div>
                                </div>
                            </td>
                        `;
                    } else if (isMissing) {
                        html += `
                            <td>
                                <div class="cell-diff-box is-missing-mod">
                                    <div class="diff-val-missing"><span class="val-label">${escapeHtml(labelBase)}:</span>${escapeHtml(dvtVal || '(empty)')}</div>
                                    <div class="diff-val-missing"><span class="val-label">${escapeHtml(labelTarget)}:</span>${escapeHtml(pvtVal || '(empty)')}</div>
                                </div>
                            </td>
                        `;
                    } else {
                        html += `
                            <td>
                                <div class="cell-diff-box">
                                    <div class="diff-val-same">${escapeHtml(dvtVal || '-')}</div>
                                </div>
                            </td>
                        `;
                    }
                });


                html += `</tr>`;
            });
        }
    });

    tbody.innerHTML = html;
    attachFruSectionHeaderListeners(tbody);
}



function attachFruSectionHeaderListeners(tbody) {
    tbody.querySelectorAll('.tr-category-header').forEach(headerRow => {
        headerRow.addEventListener('click', () => {
            const secName = headerRow.getAttribute('data-sec-name');
            if (appState.fruCollapsedSections.has(secName)) {
                appState.fruCollapsedSections.delete(secName);
            } else {
                appState.fruCollapsedSections.add(secName);
            }
            renderFruTable();
        });
    });
}


// ==================== TAB 3: BUILD MATRIX ====================
async function fetchMatrixData(sheet = null) {
    showLoading('正在讀取並解析 Build Matrix...', 'Parsing Excel workbook & rendering matrix table');
    try {
        let url = '/api/build-matrix';
        const params = [];
        if (appState.selectedFiles.matrix) params.push(`file_path=${encodeURIComponent(appState.selectedFiles.matrix)}`);
        if (sheet) params.push(`sheet=${encodeURIComponent(sheet)}`);
        if (params.length > 0) url += '?' + params.join('&');

        const res = await fetch(url);
        const data = await res.json();
        if (data.success) {
            appState.matrix = data;
            appState.selectedFiles.matrix = data.summary.active_file;

            populateFileSelect('matrix-file-select', data.summary.available_files, data.summary.active_file);
            populateSheetSelect('matrix-single-controls', 'matrix-sheet-select', data.summary.sheets, data.summary.active_sheet, true);

            // Populate Compare Mode file and sheet selects
            const baseFileSelect = document.getElementById('matrix-base-file-select');
            const targetFileSelect = document.getElementById('matrix-target-file-select');
            if (baseFileSelect && (!baseFileSelect.options || baseFileSelect.options.length === 0)) {
                populateFileSelect('matrix-base-file-select', data.summary.available_files, data.summary.active_file);
            }
            if (targetFileSelect && (!targetFileSelect.options || targetFileSelect.options.length === 0)) {
                const targetDefault = data.summary.available_files.length > 1 ? data.summary.available_files[1].path : data.summary.active_file;
                populateFileSelect('matrix-target-file-select', data.summary.available_files, targetDefault);
            }

            renderMatrixConfigCards(data.summary);
            renderMatrixTable();
        }

    } catch (err) {
        console.error('Failed to fetch Build Matrix:', err);
    } finally {
        hideLoading();
    }
}

async function fetchMatrixCompareData() {
    showLoading('正在進行 Build Matrix 兩檔對比...', 'Cross-referencing base and target matrix workbooks');
    try {
        const baseFile    = document.getElementById('matrix-base-file-select')?.value || appState.selectedFiles.matrix;
        const targetFile  = document.getElementById('matrix-target-file-select')?.value || appState.selectedFiles.matrix;
        const baseSheet   = document.getElementById('matrix-base-sheet-select')?.value;
        const targetSheet = document.getElementById('matrix-target-sheet-select')?.value;

        let url = '/api/build-matrix-compare';
        const params = [];
        if (baseFile) params.push(`base_file=${encodeURIComponent(baseFile)}`);
        if (targetFile) params.push(`target_file=${encodeURIComponent(targetFile)}`);
        if (baseSheet)   params.push(`base_sheet=${encodeURIComponent(baseSheet)}`);
        if (targetSheet) params.push(`target_sheet=${encodeURIComponent(targetSheet)}`);
        if (params.length > 0) url += '?' + params.join('&');

        const tbody = document.getElementById('matrix-tbody');
        tbody.innerHTML = `<tr><td colspan="6" class="text-center py-4">比對 Build Matrix 中...</td></tr>`;

        const res = await fetch(url);
        const data = await res.json();
        if (data.success) {
            appState.matrixCompare = data;

            populateFileSelect('matrix-base-file-select', data.summary.available_files, data.summary.base_path || baseFile);
            populateFileSelect('matrix-target-file-select', data.summary.available_files, data.summary.target_path || targetFile);

            populateSheetSelect(null, 'matrix-base-sheet-select', data.summary.base_sheets, data.summary.base_sheet);
            populateSheetSelect(null, 'matrix-target-sheet-select', data.summary.target_sheets, data.summary.target_sheet);

            renderMatrixCompareCards(data.summary);
            renderMatrixCompareTable();
        } else {
            tbody.innerHTML = `<tr><td colspan="6" class="text-center py-4 text-muted">載入失敗: ${escapeHtml(data.error || '未知錯誤')}</td></tr>`;
        }
    } catch (err) {
        console.error('Failed to fetch Build Matrix Compare:', err);
    } finally {
        hideLoading();
    }
}
function renderMatrixGroupPills(items) {
    const container = document.getElementById('matrix-group-pills');
    if (!container || !items) return;

    // Collect unique group_item names and count items and diff items per group
    const groupMap = {}; // { groupName: { total, diffs } }
    items.forEach(item => {
        const g = item.group_item || 'General / Header';
        if (!groupMap[g]) groupMap[g] = { total: 0, diffs: 0 };
        groupMap[g].total++;
        // For single mode: is_diff; for compare mode: is_diff
        if (item.is_diff) groupMap[g].diffs++;
    });

    const totalItems = items.length;
    const totalDiffs = items.filter(i => i.is_diff).length;

    let html = `
        <button class="cat-pill ${appState.matrixSelectedGroup === 'ALL' ? 'active' : ''}" data-group="ALL">
            全部 (All) <span class="pill-badge">${totalItems}</span>
            ${totalDiffs > 0 ? `<span class="pill-badge badge-common">${totalDiffs} 差異</span>` : ''}
        </button>
    `;

    Object.entries(groupMap).forEach(([groupName, counts]) => {
        const isActive = appState.matrixSelectedGroup === groupName;
        html += `
            <button class="cat-pill ${isActive ? 'active' : ''}" data-group="${escapeHtml(groupName)}">
                ${escapeHtml(groupName)}
                <span class="pill-badge">${counts.total}</span>
                ${counts.diffs > 0 ? `<span class="pill-badge badge-common">${counts.diffs} 差異</span>` : ''}
            </button>
        `;
    });

    container.innerHTML = html;

    const countBadge = document.getElementById('matrix-pills-count-badge');
    if (countBadge) countBadge.textContent = `${Object.keys(groupMap).length} 個群組`;

    const updateSelectedLabel = () => {
        const selectedLabel = document.getElementById('matrix-pills-selected-label');
        if (selectedLabel) {
            if (appState.matrixSelectedGroup && appState.matrixSelectedGroup !== 'ALL') {
                selectedLabel.textContent = `| 目前選擇: ${appState.matrixSelectedGroup}`;
                selectedLabel.style.display = 'inline';
            } else {
                selectedLabel.style.display = 'none';
            }
        }
    };
    updateSelectedLabel();

    container.querySelectorAll('.cat-pill').forEach(pill => {
        pill.addEventListener('click', () => {
            appState.matrixSelectedGroup = pill.getAttribute('data-group');
            updateSelectedLabel();
            container.querySelectorAll('.cat-pill').forEach(p =>
                p.classList.toggle('active', p.getAttribute('data-group') === appState.matrixSelectedGroup)
            );
            if (appState.matrixMode === 'compare') renderMatrixCompareTable();
            else renderMatrixTable();
        });
    });
}


function renderMatrixConfigCards(summary) {
    const container = document.getElementById('matrix-config-cards');
    if (!container) return;

    const configs = summary.configs || [];
    const desc = summary.descriptions || {};
    const rackQty = summary.rack_qty || {};

    const badgeEl = document.getElementById('matrix-badge-configs');
    if (badgeEl) badgeEl.textContent = `${configs.length} Configs`;

    let html = `
        <div class="matrix-overview-card">
            <div class="overview-title"><i class="fa-solid fa-layer-group"></i> Build Matrix 對比概覽</div>
            <div class="overview-subtitle">已載入 ${configs.length} 種 Build Configs（規格差異項目 ${summary.diff_items_count || 0} 項）</div>
            <div class="overview-sheet-tag"><i class="fa-solid fa-file-excel"></i> 工作表: ${escapeHtml(summary.active_sheet)}</div>
        </div>
    `;

    const colorClasses = ['cfg-a', 'cfg-b', 'cfg-c', 'cfg-d'];

    configs.forEach((cfg, idx) => {
        const colorCls = colorClasses[idx % colorClasses.length];
        const cfgDesc = desc[cfg] || 'N/A';
        const qty = rackQty[cfg] || '1';

        html += `
            <div class="config-card ${colorCls}">
                <div class="config-card-header">
                    <span class="config-card-title">${escapeHtml(cfg)}</span>
                    <span class="badge badge-info">Rack Qty: ${escapeHtml(qty)}</span>
                </div>
                <div class="config-card-desc">${escapeHtml(cfgDesc)}</div>
            </div>
        `;
    });

    container.innerHTML = html;
}


function renderMatrixTable() {
    if (!appState.matrix) return;

    // Clean up any leftover compare subheader row
    const existingSubHeader = document.getElementById('matrix-subheader');
    if (existingSubHeader) existingSubHeader.remove();

    // Render group pills
    renderMatrixGroupPills(appState.matrix.items);

    const tbody = document.getElementById('matrix-tbody');
    const theadRow = document.getElementById('matrix-thead-row');
    const searchVal = getInputValue('matrix-search-input');
    const onlyDiff = getCheckboxChecked('matrix-only-diff-toggle');
    const selectedGroup = appState.matrixSelectedGroup;

    const configs = appState.matrix.summary.configs;

    let headerHtml = `<th style="min-width: 240px;">Assembly / Group Item</th><th style="min-width: 130px;">Attribute</th>`;
    configs.forEach(cfg => {
        headerHtml += `<th style="min-width: 220px;">${escapeHtml(cfg)}</th>`;
    });
    theadRow.innerHTML = headerHtml;

    const filtered = appState.matrix.items.filter(item => {
        if (onlyDiff && !item.is_diff) return false;
        if (selectedGroup !== 'ALL' && item.group_item !== selectedGroup) return false;
        const matchSearch = !searchVal ||
            item.group_item.toLowerCase().includes(searchVal) ||
            item.attribute.toLowerCase().includes(searchVal) ||
            Object.values(item.values).some(v => v.toLowerCase().includes(searchVal));
        return matchSearch;
    });

    if (filtered.length === 0) {
        tbody.innerHTML = `<tr><td colspan="${configs.length + 2}" class="text-center py-4 text-muted">無符合條件的 Matrix 項目</td></tr>`;
        return;
    }

    let html = '';
    filtered.forEach(item => {
        const rowClass = item.is_diff ? 'tr-diff' : '';
        html += `<tr class="${rowClass}">`;
        html += `<td class="cell-group">${escapeHtml(item.group_item)}</td>`;
        html += `<td class="cell-sub">${escapeHtml(item.attribute)}</td>`;
        configs.forEach(cfg => {
            const val = item.values[cfg] || '-';
            const cellClass = item.is_diff ? 'matrix-val-cell cell-diff' : 'matrix-val-cell';
            html += `<td class="${cellClass}">${escapeHtml(val)}</td>`;
        });
        html += `</tr>`;
    });

    tbody.innerHTML = html;
}

function renderMatrixCompareCards(summary) {
    const container = document.getElementById('matrix-config-cards');
    if (!container) return;

    const bCfgs = summary.base_configs || [];
    const tCfgs = summary.target_configs || [];

    let html = `
        <div class="matrix-overview-card">
            <div class="overview-title"><i class="fa-solid fa-code-compare"></i> Build Matrix 跨 Sheet 比對</div>
            <div class="overview-subtitle">差異項目共 ${summary.diff_items_count || 0} 筆（總計 ${summary.total_items || 0} 筆）</div>
            <div class="overview-sheet-tag" style="margin-top:0.3rem;">
                <span style="color:#f59e0b;"><i class="fa-solid fa-circle"></i> Base: ${escapeHtml(summary.base_sheet)}</span>
                &nbsp;→&nbsp;
                <span style="color:#22d3ee;"><i class="fa-solid fa-circle"></i> Target: ${escapeHtml(summary.target_sheet)}</span>
            </div>
        </div>
    `;

    html += `<div class="config-card cfg-a" style="flex:0 0 260px;min-width:240px;">`;
    html += `<div class="config-card-header"><span class="config-card-title" style="color:#f59e0b;">Base: ${escapeHtml(summary.base_sheet)}</span></div>`;
    html += `<div class="config-card-desc">${bCfgs.length} 個 Configs: ${escapeHtml(bCfgs.join(', '))}</div></div>`;

    html += `<div class="config-card cfg-c" style="flex:0 0 260px;min-width:240px;">`;
    html += `<div class="config-card-header"><span class="config-card-title" style="color:#22d3ee;">Target: ${escapeHtml(summary.target_sheet)}</span></div>`;
    html += `<div class="config-card-desc">${tCfgs.length} 個 Configs: ${escapeHtml(tCfgs.join(', '))}</div></div>`;

    container.innerHTML = html;
}

function renderMatrixCompareTable() {
    if (!appState.matrixCompare) return;

    // Render group pills using compare items
    renderMatrixGroupPills(appState.matrixCompare.items);

    const tbody = document.getElementById('matrix-tbody');
    const theadRow = document.getElementById('matrix-thead-row');
    const searchVal = getInputValue('matrix-search-input');
    const onlyDiff = getCheckboxChecked('matrix-only-diff-toggle');
    const selectedGroup = appState.matrixSelectedGroup;

    const summary = appState.matrixCompare.summary;
    const bCfgs = summary.base_configs || [];
    const tCfgs = summary.target_configs || [];

    // Build header
    let headerHtml = `<th style="min-width:220px;">Assembly / Group Item</th><th style="min-width:120px;">Attribute</th>`;
    headerHtml += `<th colspan="${bCfgs.length}" style="background:rgba(245,158,11,0.15);min-width:${bCfgs.length*180}px;text-align:center;">Base: ${escapeHtml(summary.base_sheet)}</th>`;
    headerHtml += `<th style="min-width:60px;text-align:center;background:rgba(30,41,59,0.8);">▶</th>`;
    headerHtml += `<th colspan="${tCfgs.length}" style="background:rgba(34,211,238,0.1);min-width:${tCfgs.length*180}px;text-align:center;">Target: ${escapeHtml(summary.target_sheet)}</th>`;
    theadRow.innerHTML = headerHtml;

    // Sub-header row
    let subHeaderHtml = `<tr class="matrix-subheader-row"><th></th><th></th>`;
    bCfgs.forEach(cfg => { subHeaderHtml += `<th style="background:rgba(245,158,11,0.08);min-width:180px;font-weight:600;">${escapeHtml(cfg)}</th>`; });
    subHeaderHtml += `<th style="background:rgba(30,41,59,0.8);"></th>`;
    tCfgs.forEach(cfg => { subHeaderHtml += `<th style="background:rgba(34,211,238,0.06);min-width:180px;font-weight:600;">${escapeHtml(cfg)}</th>`; });
    subHeaderHtml += `</tr>`;

    const existingSubHeader = document.getElementById('matrix-subheader');
    if (existingSubHeader) existingSubHeader.remove();
    const subHeaderEl = document.createElement('tbody');
    subHeaderEl.id = 'matrix-subheader';
    subHeaderEl.innerHTML = subHeaderHtml;
    theadRow.parentElement.after(subHeaderEl);

    // Filter items
    const filtered = appState.matrixCompare.items.filter(item => {
        if (onlyDiff && !item.is_diff) return false;
        if (selectedGroup !== 'ALL' && item.group_item !== selectedGroup) return false;
        const matchSearch = !searchVal ||
            item.group_item.toLowerCase().includes(searchVal) ||
            item.attribute.toLowerCase().includes(searchVal);
        return matchSearch;
    });

    if (filtered.length === 0) {
        tbody.innerHTML = `<tr><td colspan="${bCfgs.length + tCfgs.length + 3}" class="text-center py-4 text-muted">無符合條件的比對項目</td></tr>`;
        return;
    }

    const DIFF_TYPE_LABELS = {
        'base_only':   { label: 'Base Only',   rowCls: 'tr-base-only'   },
        'target_only': { label: 'Target Only', rowCls: 'tr-target-only' },
        'changed':     { label: 'Changed',     rowCls: 'tr-diff'        },
        'same':        { label: '',             rowCls: ''               }
    };

    let html = '';
    filtered.forEach(item => {
        const dt = DIFF_TYPE_LABELS[item.diff_type] || DIFF_TYPE_LABELS['same'];
        html += `<tr class="${dt.rowCls}">`;
        html += `<td class="cell-group">${escapeHtml(item.group_item)}</td>`;
        html += `<td class="cell-sub">${escapeHtml(item.attribute)}`;
        if (dt.label) html += ` <span class="badge badge-diff-${item.diff_type}">${dt.label}</span>`;
        html += `</td>`;

        bCfgs.forEach(cfg => {
            const val = item.base_values?.[cfg] || '-';
            html += `<td class="matrix-val-cell" style="background:rgba(245,158,11,0.04);">${escapeHtml(val)}</td>`;
        });

        html += `<td style="text-align:center;color:#64748b;background:rgba(30,41,59,0.5);">→</td>`;

        tCfgs.forEach(cfg => {
            const val = item.target_values?.[cfg] || '-';
            const isCellDiff = item.diff_type === 'changed' &&
                               (item.base_values && Object.values(item.base_values).some(bv => bv) &&
                                item.target_values && Object.values(item.target_values).some(tv =>
                                    tv && !Object.values(item.base_values).includes(tv)));
            const cellCls = isCellDiff ? 'matrix-val-cell cell-diff' : 'matrix-val-cell';
            html += `<td class="${cellCls}" style="background:rgba(34,211,238,0.04);">${escapeHtml(val)}</td>`;
        });

        html += `</tr>`;
    });

    tbody.innerHTML = html;
}

// Utility: HTML Escaping for Security
function escapeHtml(str) {
    if (str === null || str === undefined) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}
