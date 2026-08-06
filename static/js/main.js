// Global Application State
const appState = {
    bkc: null,
    bkcCompare: null,
    fruSingle: null,
    fruCompare: null,
    matrix: null,
    matrixCompare: null,
    yamlCompare: null,
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
        matrix: null,
        yaml_1: null,
        yaml_2: null,
        yaml_3: null
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
        overlay.style.display = 'none';
    }
}




// Initialize Application on DOM Content Loaded
document.addEventListener('DOMContentLoaded', () => {
    initTabs();
    initEventListeners();
    initUploadModal();
    initYamlDragAndDrop();
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

            // Lazy-load YAML data on first visit to YAML tab
            if (targetTab === 'tab-yaml' && !appState.yamlCompare) {
                fetchYamlData();
            }
        });
    });
}

// Event Listeners for Filters & Controls
function initEventListeners() {
    document.getElementById('btn-refresh').addEventListener('click', async () => {
        showLoading('正在連線 Google Drive 同步最新檔案...', 'Connecting to Google Drive & downloading updated files');
        try {
            await fetch('/api/sync-gdrive');
        } catch (err) {
            console.warn('GDrive sync trigger warning:', err);
        } finally {
            await fetchAllData();
            hideLoading();
        }
    });

    // Export Excel Button
    document.getElementById('btn-export-excel').addEventListener('click', () => {
        let tabType = 'fru';
        if (appState.activeTab === 'tab-bkc') tabType = 'bkc';
        else if (appState.activeTab === 'tab-matrix') tabType = 'matrix';
        else if (appState.activeTab === 'tab-yaml') tabType = 'yaml';

        let url = `/api/export-excel?type=${tabType}`;
        if (tabType === 'matrix' && appState.matrixMode === 'compare') {
            const bFile = document.getElementById('matrix-base-file-select')?.value;
            const tFile = document.getElementById('matrix-target-file-select')?.value;
            const bSheet = document.getElementById('matrix-base-sheet-select')?.value;
            const tSheet = document.getElementById('matrix-target-sheet-select')?.value;
            if (bFile) url += `&base_file=${encodeURIComponent(bFile)}`;
            if (tFile) url += `&target_file=${encodeURIComponent(tFile)}`;
            if (bSheet) url += `&base_sheet=${encodeURIComponent(bSheet)}`;
            if (tSheet) url += `&target_sheet=${encodeURIComponent(tSheet)}`;
        } else if (tabType === 'yaml') {
            const y1 = document.getElementById('yaml-file-select-1')?.value;
            const y2 = document.getElementById('yaml-file-select-2')?.value;
            const y3 = document.getElementById('yaml-file-select-3')?.value;
            const bkcF = document.getElementById('yaml-bkc-file-select')?.value;
            const bkcS = document.getElementById('yaml-bkc-sheet-select')?.value;
            if (y1) url += `&yaml_1=${encodeURIComponent(y1)}`;
            if (y2) url += `&yaml_2=${encodeURIComponent(y2)}`;
            if (y3) url += `&yaml_3=${encodeURIComponent(y3)}`;
            if (bkcF) url += `&bkc_file=${encodeURIComponent(bkcF)}`;
            if (bkcS) url += `&bkc_sheet=${encodeURIComponent(bkcS)}`;
        }
        window.open(url, '_blank');
    });

    // YAML Controls Change Listeners
    const y1Sel = document.getElementById('yaml-file-select-1');
    const y2Sel = document.getElementById('yaml-file-select-2');
    const y3Sel = document.getElementById('yaml-file-select-3');
    const yBkcFSel = document.getElementById('yaml-bkc-file-select');
    const yBkcSSel = document.getElementById('yaml-bkc-sheet-select');
    const yStationF = document.getElementById('yaml-station-filter');
    const yStatusF = document.getElementById('yaml-status-filter');
    const ySearchI = document.getElementById('yaml-search-input');

    [y1Sel, y2Sel, y3Sel, yBkcFSel, yBkcSSel].forEach(el => {
        if (el) el.addEventListener('change', () => fetchYamlData());
    });

    if (yStationF) yStationF.addEventListener('change', () => renderYamlTable());
    if (yStatusF) yStatusF.addEventListener('change', () => renderYamlTable());
    if (ySearchI) ySearchI.addEventListener('input', () => renderYamlTable());

function getSummaryApiUrl(targetTab) {
    let url = `/api/release-summary?tab=${targetTab}`;

    const bkcFile = document.getElementById('bkc-file-select')?.value;
    if (bkcFile) url += `&bkc_file=${encodeURIComponent(bkcFile)}`;

    const fruDvtFile = document.getElementById('fru-dvt-file-select')?.value || document.getElementById('fru-single-file-select')?.value;
    const fruPvtFile = document.getElementById('fru-pvt-file-select')?.value || document.getElementById('fru-single-file-select')?.value;
    const fruBaseSheet = document.getElementById('fru-base-sheet-select')?.value || document.getElementById('fru-single-sheet-select')?.value;
    const fruTargetSheet = document.getElementById('fru-target-sheet-select')?.value || document.getElementById('fru-single-sheet-select')?.value;

    if (fruDvtFile) url += `&fru_dvt_file=${encodeURIComponent(fruDvtFile)}`;
    if (fruPvtFile) url += `&fru_pvt_file=${encodeURIComponent(fruPvtFile)}`;
    if (fruBaseSheet) url += `&fru_base_sheet=${encodeURIComponent(fruBaseSheet)}`;
    if (fruTargetSheet) url += `&fru_target_sheet=${encodeURIComponent(fruTargetSheet)}`;

    const matBaseFile = document.getElementById('matrix-base-file-select')?.value || document.getElementById('matrix-file-select')?.value;
    const matTargetFile = document.getElementById('matrix-target-file-select')?.value || document.getElementById('matrix-file-select')?.value;
    const matBaseSheet = document.getElementById('matrix-base-sheet-select')?.value || document.getElementById('matrix-sheet-select')?.value;
    const matTargetSheet = document.getElementById('matrix-target-sheet-select')?.value || document.getElementById('matrix-sheet-select')?.value;

    if (matBaseFile) url += `&matrix_base_file=${encodeURIComponent(matBaseFile)}`;
    if (matTargetFile) url += `&matrix_target_file=${encodeURIComponent(matTargetFile)}`;
    if (matBaseSheet) url += `&matrix_base_sheet=${encodeURIComponent(matBaseSheet)}`;
    if (matTargetSheet) url += `&matrix_target_sheet=${encodeURIComponent(matTargetSheet)}`;

    const y1 = document.getElementById('yaml-file-select-1')?.value;
    const y2 = document.getElementById('yaml-file-select-2')?.value;
    const y3 = document.getElementById('yaml-file-select-3')?.value;
    const yamlBkcFile = document.getElementById('yaml-bkc-file-select')?.value;
    const yamlBkcSheet = document.getElementById('yaml-bkc-sheet-select')?.value;

    if (y1) url += `&yaml_1=${encodeURIComponent(y1)}`;
    if (y2) url += `&yaml_2=${encodeURIComponent(y2)}`;
    if (y3) url += `&yaml_3=${encodeURIComponent(y3)}`;
    if (targetTab === 'yaml') {
        if (yamlBkcFile) url += `&bkc_file=${encodeURIComponent(yamlBkcFile)}`;
        if (yamlBkcSheet) url += `&bkc_sheet=${encodeURIComponent(yamlBkcSheet)}`;
    }

    return url;
}

function getLoadingTitle(targetTab) {
    if (targetTab === 'bkc') {
        return {
            title: '正在生成 BKC 韌體對照摘要報告...',
            subtitle: 'Parsing BKC Firmware Control Table & compiling version summary'
        };
    } else if (targetTab === 'fru') {
        return {
            title: '正在生成 FRU 規格變更摘要報告...',
            subtitle: 'Comparing Base & Target FRU Specification Fields'
        };
    } else if (targetTab === 'matrix') {
        return {
            title: '正在生成 Build Matrix 架構變更摘要報告...',
            subtitle: 'Analyzing Build Matrix Configuration Diffs across Racks'
        };
    } else if (targetTab === 'yaml') {
        return {
            title: '正在生成 Test Suite (YAML) 合規摘要報告...',
            subtitle: 'Comparing Test Suite YAML files against BKC Table Standard'
        };
    } else {
        return {
            title: '正在生成 全平台綜合發版摘要報告...',
            subtitle: 'Analyzing BKC, FRU Spec, Build Matrix, and YAML test suite differences'
        };
    }
}

    // Release Summary Modal
    const summaryModal = document.getElementById('release-summary-modal');
    document.getElementById('btn-release-summary').addEventListener('click', async () => {
        let defaultTab = 'all';
        if (appState.activeTab === 'tab-bkc') defaultTab = 'bkc';
        else if (appState.activeTab === 'tab-fru') defaultTab = 'fru';
        else if (appState.activeTab === 'tab-matrix') defaultTab = 'matrix';
        else if (appState.activeTab === 'tab-yaml') defaultTab = 'yaml';


        // Update modal tab active & greyed-out disabled styling
        document.querySelectorAll('.summary-tab-btn').forEach(b => {
            const tabName = b.getAttribute('data-sumtab');
            b.classList.remove('btn-primary', 'active');
            b.classList.add('btn-secondary');

            if (tabName === defaultTab) {
                b.classList.remove('btn-secondary');
                b.classList.add('btn-primary', 'active');
                b.disabled = false;
                b.style.opacity = '1';
                b.style.pointerEvents = 'auto';
                b.style.cursor = 'pointer';
                b.style.filter = 'none';
                b.title = '當前檢視頁面摘要';
            } else if (tabName === 'all') {
                b.disabled = false;
                b.style.opacity = '0.9';
                b.style.pointerEvents = 'auto';
                b.style.cursor = 'pointer';
                b.style.filter = 'none';
                b.title = '全平台綜合摘要';
            } else {
                b.disabled = true;
                b.style.opacity = '0.35';
                b.style.pointerEvents = 'none';
                b.style.cursor = 'not-allowed';
                b.style.filter = 'grayscale(1)';
                b.title = '非當前頁面 (已反灰停用)';
            }
        });

        const loadingInfo = getLoadingTitle(defaultTab);
        showLoading(loadingInfo.title, loadingInfo.subtitle);
        try {
            const url = getSummaryApiUrl(defaultTab);
            const res = await fetch(url);
            const data = await res.json();
            if (data.success) {
                document.getElementById('summary-content-area').value = data.markdown;
                summaryModal.style.display = 'flex';
                appState.currentSummaryData = data;
            }
        } catch (err) {
            console.error('Failed to load Release Summary:', err);
        } finally {
            hideLoading();
        }
    });

    document.getElementById('btn-close-summary').addEventListener('click', () => {
        summaryModal.style.display = 'none';
    });

    document.getElementById('btn-copy-summary-markdown').addEventListener('click', () => {
        const area = document.getElementById('summary-content-area');
        navigator.clipboard.writeText(area.value);
        alert('Markdown 摘要已成功複製至剪貼簿！');
    });

    document.getElementById('btn-copy-summary-text').addEventListener('click', () => {
        if (appState.currentSummaryData?.text) {
            navigator.clipboard.writeText(appState.currentSummaryData.text);
            alert('純文字 摘要已成功複製至剪貼簿！');
        }
    });

    // Summary Modal Tab Switchers
    document.querySelectorAll('.summary-tab-btn').forEach(btn => {
        btn.addEventListener('click', async () => {
            document.querySelectorAll('.summary-tab-btn').forEach(b => {
                b.classList.remove('btn-primary', 'active');
                b.classList.add('btn-secondary');
            });
            btn.classList.remove('btn-secondary');
            btn.classList.add('btn-primary', 'active');
            const targetTab = btn.getAttribute('data-sumtab');

            const loadingInfo = getLoadingTitle(targetTab);
            showLoading(loadingInfo.title, loadingInfo.subtitle);
            try {
                const url = getSummaryApiUrl(targetTab);
                const res = await fetch(url);
                const data = await res.json();
                if (data.success) {
                    document.getElementById('summary-content-area').value = data.markdown;
                    appState.currentSummaryData = data;
                }
            } catch (e) {
                console.error(e);
            } finally {
                hideLoading();
            }
        });
    });

    // Watchlist Modal Handlers
    const watchlistModal = document.getElementById('watchlist-modal');
    document.getElementById('btn-open-watchlist').addEventListener('click', async () => {
        await loadAndRenderWatchlist();
        watchlistModal.style.display = 'flex';
    });
    document.getElementById('btn-close-watchlist').addEventListener('click', () => {
        watchlistModal.style.display = 'none';
    });
    document.getElementById('btn-add-watchlist-keyword').addEventListener('click', async () => {
        const input = document.getElementById('watchlist-new-keyword');
        const kw = input.value.trim();
        if (!kw) return;
        const currentKws = appState.watchlistKeywords || [];
        if (!currentKws.includes(kw)) {
            currentKws.push(kw);
            await updateWatchlistKeywords(currentKws);
            input.value = '';
        }
    });

    // Global Search
    const searchModal = document.getElementById('global-search-modal');
    const globalInput = document.getElementById('global-search-input');

    document.getElementById('btn-close-search').addEventListener('click', () => {
        searchModal.style.display = 'none';
    });

    globalInput.addEventListener('keypress', async (e) => {
        if (e.key === 'Enter') {
            const rawVal = globalInput.value || '';
            const q = rawVal.replace(/^[\s\xa0\u00a0\u200b\t\r\n]+|[\s\xa0\u00a0\u200b\t\r\n]+$/g, '').trim();
            if (!q) return;
            showLoading(`全域搜尋中: "${q}"...`, 'Scanning BKC, FRU Spec, and Build Matrix datasets');
            try {
                const res = await fetch(`/api/global-search?q=${encodeURIComponent(q)}`);
                const data = await res.json();
                if (data.success) {
                    renderGlobalSearchResults(data.results, q);
                    searchModal.style.display = 'flex';
                }
            } catch (err) {
                console.error('Global search failed:', err);
            } finally {
                hideLoading();
            }
        }
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

    // YAML View Mode Toggle Buttons
    const btnYamlViewBkc = document.getElementById('btn-yaml-view-bkc');
    const btnYamlViewMatrix = document.getElementById('btn-yaml-view-matrix');
    const btnYamlViewDiff = document.getElementById('btn-yaml-view-diff');

    const containerBkc = document.getElementById('yaml-view-bkc-container');
    const containerMatrix = document.getElementById('yaml-view-matrix-container');
    const containerDiff = document.getElementById('yaml-view-diff-container');

    const controlsBkc = document.getElementById('yaml-bkc-controls');
    const controlsDiff = document.getElementById('yaml-diff-controls');

    if (btnYamlViewBkc) {
        btnYamlViewBkc.addEventListener('click', () => {
            btnYamlViewBkc.classList.add('active');
            btnYamlViewMatrix.classList.remove('active');
            btnYamlViewDiff.classList.remove('active');

            if (containerBkc) containerBkc.style.display = 'block';
            if (containerMatrix) containerMatrix.style.display = 'none';
            if (containerDiff) containerDiff.style.display = 'none';

            if (controlsBkc) controlsBkc.style.display = 'flex';
            if (controlsDiff) controlsDiff.style.display = 'none';
        });
    }

    if (btnYamlViewMatrix) {
        btnYamlViewMatrix.addEventListener('click', () => {
            btnYamlViewMatrix.classList.add('active');
            btnYamlViewBkc.classList.remove('active');
            btnYamlViewDiff.classList.remove('active');

            if (containerBkc) containerBkc.style.display = 'none';
            if (containerMatrix) containerMatrix.style.display = 'block';
            if (containerDiff) containerDiff.style.display = 'none';

            if (controlsBkc) controlsBkc.style.display = 'flex';
            if (controlsDiff) controlsDiff.style.display = 'none';
        });
    }

    if (btnYamlViewDiff) {
        btnYamlViewDiff.addEventListener('click', () => {
            btnYamlViewDiff.classList.add('active');
            btnYamlViewBkc.classList.remove('active');
            btnYamlViewMatrix.classList.remove('active');

            if (containerBkc) containerBkc.style.display = 'none';
            if (containerMatrix) containerMatrix.style.display = 'none';
            if (containerDiff) containerDiff.style.display = 'block';

            if (controlsBkc) controlsBkc.style.display = 'none';
            if (controlsDiff) controlsDiff.style.display = 'flex';

            fetchYamlVersionDiff();
        });
    }

    const btnRunDiff = document.getElementById('btn-run-yaml-diff');
    if (btnRunDiff) {
        btnRunDiff.addEventListener('click', fetchYamlVersionDiff);
    }

    // YAML Patch Modal Listeners
    const modalPatch = document.getElementById('yaml-patch-modal');
    const btnClosePatch = document.getElementById('btn-close-yaml-patch');
    if (btnClosePatch) {
        btnClosePatch.addEventListener('click', () => {
            if (modalPatch) modalPatch.style.display = 'none';
        });
    }

    const btnCopyPatch = document.getElementById('btn-copy-yaml-patch');
    if (btnCopyPatch) {
        btnCopyPatch.addEventListener('click', () => {
            const patchText = document.getElementById('yaml-patch-text-area')?.value;
            if (patchText) {
                navigator.clipboard.writeText(patchText);
                btnCopyPatch.innerHTML = '<i class="fa-solid fa-check"></i> 已複製 Diff Patch';
                setTimeout(() => btnCopyPatch.innerHTML = '<i class="fa-solid fa-copy"></i> 複製 Git Patch', 2000);
            }
        });
    }

    const btnCopySnippet = document.getElementById('btn-copy-yaml-snippet');
    if (btnCopySnippet) {
        btnCopySnippet.addEventListener('click', () => {
            const snippetText = document.getElementById('yaml-snippet-area')?.value;
            if (snippetText) {
                navigator.clipboard.writeText(snippetText);
                btnCopySnippet.innerHTML = '<i class="fa-solid fa-check"></i> 已複製 Snippet';
                setTimeout(() => btnCopySnippet.innerHTML = '<i class="fa-solid fa-code"></i> 複製 YAML Snippet', 2000);
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
                setTimeout(async () => {
                    modal.style.display = 'none';
                    statusText.style.display = 'none';

                    if (tabType === 'yaml' || file.name.endsWith('.yaml') || file.name.endsWith('.yml')) {
                        const s1 = document.getElementById('yaml-file-select-1');
                        const s2 = document.getElementById('yaml-file-select-2');
                        const s3 = document.getElementById('yaml-file-select-3');

                        const btnYamlTab = document.querySelector('.tab-btn[data-tab="tab-yaml"]');
                        if (btnYamlTab) btnYamlTab.click();

                        await fetchYamlData();

                        const uploadedPath = data.path || data.filename;
                        if (s1 && !s1.value) s1.value = uploadedPath;
                        else if (s2 && !s2.value) s2.value = uploadedPath;
                        else if (s3 && !s3.value) s3.value = uploadedPath;
                        else if (s1) s1.value = uploadedPath;

                        fetchYamlData();
                    } else {
                        fetchAllData();
                    }
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

function initYamlDragAndDrop() {
    const tabYaml = document.getElementById('tab-yaml');
    if (!tabYaml) return;

    ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
        tabYaml.addEventListener(eventName, (e) => {
            e.preventDefault();
            e.stopPropagation();
        });
    });

    const slots = [1, 2, 3].map(id => document.getElementById(`slot-card-${id}`)).filter(Boolean);
    slots.forEach((slot) => {
        ['dragenter', 'dragover'].forEach(evt => {
            slot.addEventListener(evt, (e) => {
                e.preventDefault();
                e.stopPropagation();
                slot.classList.add('dragover');
            });
        });
        ['dragleave', 'drop'].forEach(evt => {
            slot.addEventListener(evt, (e) => {
                e.preventDefault();
                e.stopPropagation();
                slot.classList.remove('dragover');
            });
        });
    });

    tabYaml.addEventListener('drop', async (e) => {
        const files = Array.from(e.dataTransfer.files).filter(f => f.name.endsWith('.yaml') || f.name.endsWith('.yml'));
        if (files.length === 0) return;

        showLoading(`正在上傳 ${files.length} 個 YAML 測試腳本檔...`, 'Uploading dragged YAML test suite files');

        try {
            const uploadedPaths = [];
            for (const file of files.slice(0, 3)) {
                const formData = new FormData();
                formData.append('file', file);
                formData.append('tab_type', 'yaml');
                const res = await fetch('/api/upload', { method: 'POST', body: formData });
                const data = await res.json();
                if (data.success) {
                    uploadedPaths.push(data.path || data.filename);
                }
            }

            await fetchYamlData();

            const s1 = document.getElementById('yaml-file-select-1');
            const s2 = document.getElementById('yaml-file-select-2');
            const s3 = document.getElementById('yaml-file-select-3');

            const targetSlotCard = e.target.closest('.station-slot-card');
            if (targetSlotCard && targetSlotCard.dataset.slot) {
                const slotNum = targetSlotCard.dataset.slot;
                const targetSelect = document.getElementById(`yaml-file-select-${slotNum}`);
                if (targetSelect && uploadedPaths[0]) {
                    targetSelect.value = uploadedPaths[0];
                }
            } else {
                if (uploadedPaths[0] && s1) s1.value = uploadedPaths[0];
                if (uploadedPaths[1] && s2) s2.value = uploadedPaths[1];
                if (uploadedPaths[2] && s3) s3.value = uploadedPaths[2];
            }

            await fetchYamlData();
        } catch (err) {
            console.error('YAML drag drop upload error:', err);
        } finally {
            hideLoading();
        }
    });
}



// Fetch Data from Backend APIs
async function fetchAllData() {
    const statusText = document.querySelector('.status-text');
    if (statusText) statusText.textContent = 'Loading data...';

    try {
        const bkcPromise = appState.bkcMode === 'compare' ? fetchBkcCompareData() : fetchBkcData();
        const fruPromise = appState.fruMode === 'compare' ? fetchFruCompareData() : fetchFruSingleData();
        await Promise.all([
            bkcPromise,
            fruPromise,
            fetchMatrixData(),
            fetchAndPopulateTimelines(),
            checkCriticalWatchlistAlerts()
        ]);
        if (statusText) statusText.textContent = 'Connected';
    } catch (err) {
        console.error('Error fetching application data:', err);
        if (statusText) statusText.textContent = 'Data Error';
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
        <th style="width: 170px;">Group / Components</th>
        <th style="width: 250px;">Sub-Component</th>
        <th style="width: 110px;">Meta Owner</th>
        <th style="width: 110px;">ODM Owner</th>
        <th style="width: 150px;">Validation Version</th>
        <th style="width: 110px;">CheckSum</th>
        <th style="width: 80px;">VRC</th>
        <th style="width: 95px;">Sign Off</th>
        <th>GDrive / File Link</th>
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
        <th style="width: 170px;">Group / Components</th>
        <th style="width: 250px;">Sub-Component</th>
        <th style="width: 110px;">Owner</th>
        <th style="min-width: 180px;">Base Version (${escapeHtml(baseName)})</th>
        <th style="min-width: 180px;">Target Version (${escapeHtml(targetName)})</th>
        <th style="width: 160px;">Sign Off (Base ➔ Target)</th>
        <th style="width: 95px;">Status</th>
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
        if (!searchVal) return true;

        const cleanSearchVal = searchVal.replace(/[^a-z0-9]/g, '');
        const matchText = (val) => {
            if (!val) return false;
            const str = String(val).toLowerCase();
            if (str.includes(searchVal)) return true;
            if (cleanSearchVal.length >= 3 && str.replace(/[^a-z0-9]/g, '').includes(cleanSearchVal)) return true;
            return false;
        };

        const matchGroup = matchText(item.group_item);
        const matchAttr = matchText(item.attribute);
        const matchVals = item.values && Object.values(item.values).some(v => matchText(v));

        return matchGroup || matchAttr || matchVals;
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
        if (!searchVal) return true;
        
        const cleanSearchVal = searchVal.replace(/[^a-z0-9]/g, '');
        const matchText = (val) => {
            if (!val) return false;
            const str = String(val).toLowerCase();
            if (str.includes(searchVal)) return true;
            if (cleanSearchVal.length >= 3 && str.replace(/[^a-z0-9]/g, '').includes(cleanSearchVal)) return true;
            return false;
        };

        const matchGroup = matchText(item.group_item);
        const matchAttr = matchText(item.attribute);
        const matchBase = item.base_values && Object.values(item.base_values).some(v => matchText(v));
        const matchTgt = item.target_values && Object.values(item.target_values).some(v => matchText(v));

        return matchGroup || matchAttr || matchBase || matchTgt;
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

function renderGlobalSearchResults(results, q) {
    const container = document.getElementById('global-search-results-container');
    if (!container) return;

    let html = `<div style="margin-bottom: 1rem; color: var(--text-muted);">搜尋關鍵字: <strong style="color: var(--accent-cyan);">${escapeHtml(q)}</strong></div>`;

    let totalMatches = (results.bkc?.length || 0) + (results.fru?.length || 0) + (results.matrix?.length || 0);

    if (totalMatches === 0) {
        container.innerHTML = html + `<div class="text-center py-4 text-muted">未找到符合 "${escapeHtml(q)}" 的關聯項目</div>`;
        return;
    }

    if (results.bkc?.length > 0) {
        html += `<h4 style="color: var(--primary-blue); margin-top: 1rem; margin-bottom: 0.5rem;"><i class="fa-solid fa-list-check"></i> BKC Firmware Table Matches (${results.bkc.length})</h4><ul style="list-style: none; padding-left: 0;">`;
        results.bkc.forEach(m => {
            html += `<li style="padding: 0.6rem 0.8rem; border-bottom: 1px solid var(--border-color); background: rgba(30, 41, 59, 0.5); margin-bottom: 0.4rem; border-radius: 8px;">
                <strong>${escapeHtml(m.category)}</strong> ➔ <span>${escapeHtml(m.group)}</span> / <span style="color: var(--accent-cyan); font-weight: 600;">${escapeHtml(m.sub_component)}</span>
                <div style="font-size: 0.82rem; color: var(--text-muted); margin-top: 0.3rem;">DVT FW: ${escapeHtml(m.dvt_version)} | PVT FW: ${escapeHtml(m.pvt_version)}</div>
            </li>`;
        });
        html += `</ul>`;
    }

    if (results.fru?.length > 0) {
        html += `<h4 style="color: var(--warning-amber); margin-top: 1.5rem; margin-bottom: 0.5rem;"><i class="fa-solid fa-code-compare"></i> FRU Spec Matches (${results.fru.length})</h4><ul style="list-style: none; padding-left: 0;">`;
        results.fru.forEach(m => {
            html += `<li style="padding: 0.6rem 0.8rem; border-bottom: 1px solid var(--border-color); background: rgba(30, 41, 59, 0.5); margin-bottom: 0.4rem; border-radius: 8px;">
                <strong>[${escapeHtml(m.module)}]</strong> <span>${escapeHtml(m.section)}</span> ➔ <span style="color: var(--warning-amber); font-weight: 600;">${escapeHtml(m.field_name)}</span>
                <div style="font-size: 0.82rem; color: var(--text-muted); margin-top: 0.3rem;">DVT: ${escapeHtml(m.dvt_value)} ➔ PVT: ${escapeHtml(m.pvt_value)}</div>
            </li>`;
        });
        html += `</ul>`;
    }

    if (results.matrix?.length > 0) {
        html += `<h4 style="color: #a78bfa; margin-top: 1.5rem; margin-bottom: 0.5rem;"><i class="fa-solid fa-table-cells"></i> Build Matrix Matches (${results.matrix.length})</h4><ul style="list-style: none; padding-left: 0;">`;
        results.matrix.forEach(m => {
            const fileBadge = m.file ? `<span class="badge" style="background:rgba(139,92,246,0.2); color:#c4b5fd; font-size:0.75rem; margin-right:0.4rem;"><i class="fa-regular fa-file-excel"></i> ${escapeHtml(m.file)} (${escapeHtml(m.sheet || 'Default')})</span>` : '';
            const cfgSummary = m.configs ? Object.entries(m.configs).map(([k, v]) => `<strong>${escapeHtml(k)}:</strong> ${escapeHtml(v)}`).join(' | ') : '';
            html += `<li style="padding: 0.75rem 0.9rem; border-bottom: 1px solid var(--border-color); background: rgba(30, 41, 59, 0.5); margin-bottom: 0.5rem; border-radius: 8px;">
                <div style="margin-bottom: 0.3rem;">${fileBadge} <strong style="color: #a78bfa; font-size: 0.95rem;">${escapeHtml(m.group_item)}</strong> ➔ <span style="font-weight:600; color:#f8fafc;">${escapeHtml(m.description)}</span></div>
                <div style="font-size: 0.82rem; color: #94a3b8; line-height: 1.4; background: rgba(15,23,42,0.4); padding: 0.4rem 0.6rem; border-radius: 6px; word-break: break-all;">${cfgSummary}</div>
            </li>`;
        });
        html += `</ul>`;
    }

    container.innerHTML = html;
}

async function loadAndRenderWatchlist() {
    try {
        const res = await fetch('/api/watchlist');
        const data = await res.json();
        if (data.success) {
            appState.watchlistKeywords = data.keywords || [];
            renderWatchlistTags(data.keywords || []);
        }
    } catch (err) {
        console.error('Failed to load watchlist:', err);
    }
}

function renderWatchlistTags(keywords) {
    const container = document.getElementById('watchlist-tags-container');
    if (!container) return;
    if (keywords.length === 0) {
        container.innerHTML = '<span style="color: var(--text-muted); font-size: 0.85rem;">尚未設定關鍵字</span>';
        return;
    }
    let html = '';
    keywords.forEach(kw => {
        html += `<span class="badge" style="background: rgba(239, 68, 68, 0.2); color: #fca5a5; border: 1px solid rgba(239, 68, 68, 0.4); padding: 0.4rem 0.7rem; font-size: 0.85rem; border-radius: 20px; display: inline-flex; align-items: center; gap: 0.4rem;">
            ${escapeHtml(kw)}
            <i class="fa-solid fa-xmark" style="cursor: pointer;" onclick="removeWatchlistKeyword('${escapeHtml(kw)}')"></i>
        </span>`;
    });
    container.innerHTML = html;
}

async function removeWatchlistKeyword(kw) {
    const updated = (appState.watchlistKeywords || []).filter(k => k !== kw);
    await updateWatchlistKeywords(updated);
}

async function updateWatchlistKeywords(keywords) {
    try {
        const res = await fetch('/api/watchlist', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({keywords})
        });
        const data = await res.json();
        if (data.success) {
            appState.watchlistKeywords = data.keywords;
            renderWatchlistTags(data.keywords);
            checkCriticalWatchlistAlerts();
        }
    } catch (err) {
        console.error('Failed to save watchlist:', err);
    }
}

async function checkCriticalWatchlistAlerts() {
    try {
        const res = await fetch('/api/release-summary');
        const data = await res.json();
        const banner = document.getElementById('critical-alert-banner');
        const text = document.getElementById('critical-alert-text');
        if (data.success && data.watchlist_impacts_count > 0) {
            if (banner && text) {
                text.textContent = `偵測到 ${data.watchlist_impacts_count} 項關鍵組件/韌體異動！請點擊 [摘要報告] 檢視詳細清單。`;
                banner.style.display = 'flex';
            }
        } else if (banner) {
            banner.style.display = 'none';
        }
    } catch (e) {
        console.warn(e);
    }
}

function populateTimelineDropdown(selectId, files) {
    const select = document.getElementById(selectId);
    if (!select || !files || files.length === 0) return;
    select.innerHTML = '';
    files.forEach((f, idx) => {
        const opt = document.createElement('option');
        opt.value = f.path || '';
        opt.textContent = f.display_name || f.filename || `File ${idx + 1}`;
        select.appendChild(opt);
    });
}

async function fetchAndPopulateTimelines() {
    try {
        const res = await fetch('/api/history');
        const data = await res.json();
        if (data.success) {
            populateTimelineDropdown('bkc-timeline-select', data.history.bkc || []);
            populateTimelineDropdown('fru-timeline-select', data.history.fru || []);
            populateTimelineDropdown('matrix-timeline-select', data.history.matrix || []);
        }
    } catch (err) {
        console.error('Failed to populate timelines:', err);
    }
}

// -------------------------------------------------------------
// Test Suite (YAML) Comparison & Enhancements (1, 2, 3, 5)
// -------------------------------------------------------------
async function fetchYamlData() {
    try {
        const y1Select = document.getElementById('yaml-file-select-1');
        const y2Select = document.getElementById('yaml-file-select-2');
        const y3Select = document.getElementById('yaml-file-select-3');
        const bkcFileSelect = document.getElementById('yaml-bkc-file-select');
        const bkcSheetSelect = document.getElementById('yaml-bkc-sheet-select');

        const y1 = y1Select ? y1Select.value : '';
        const y2 = y2Select ? y2Select.value : '';
        const y3 = y3Select ? y3Select.value : '';
        const bkcFile = bkcFileSelect ? bkcFileSelect.value : '';
        const bkcSheet = bkcSheetSelect ? bkcSheetSelect.value : '';

        let url = `/api/yaml-compare?`;
        const queryParts = [];
        if (y1) queryParts.push(`yaml_1=${encodeURIComponent(y1)}`);
        if (y2) queryParts.push(`yaml_2=${encodeURIComponent(y2)}`);
        if (y3) queryParts.push(`yaml_3=${encodeURIComponent(y3)}`);
        if (bkcFile) queryParts.push(`bkc_file=${encodeURIComponent(bkcFile)}`);
        if (bkcSheet) queryParts.push(`bkc_sheet=${encodeURIComponent(bkcSheet)}`);
        url += queryParts.join('&');

        const res = await fetch(url);
        const data = await res.json();

        if (data.success) {
            appState.yamlCompare = data;
            
            // Update Summary Cards & Badge
            const summary = data.summary || {};
            const val1 = document.getElementById('yaml-stat-val-1');
            const val2 = document.getElementById('yaml-stat-val-2');
            const val3 = document.getElementById('yaml-stat-val-3');
            const val4 = document.getElementById('yaml-stat-val-4');
            const badgeDiff = document.getElementById('yaml-badge-diff');

            if (val1) val1.textContent = summary.total_yaml_checks || 0;
            if (val2) val2.textContent = summary.matched_count || 0;
            if (val3) val3.textContent = summary.mismatch_count || 0;
            if (val4) val4.textContent = `${summary.compliance_rate || 0}%`;
            if (badgeDiff) badgeDiff.textContent = `${summary.mismatch_count || 0} Diffs`;

            // Populate File Selectors
            const availYaml = summary.available_yaml_files || [];
            const availBkc = summary.available_bkc_files || [];
            const availSheets = summary.bkc_sheets || [];

            if (availYaml.length > 0) {
                populateYamlFileSelect('yaml-file-select-1', availYaml, y1 || '', "(無 / None)");
                populateYamlFileSelect('yaml-file-select-2', availYaml, y2 || '', "(無 / None)");
                populateYamlFileSelect('yaml-file-select-3', availYaml, y3 || '', "(無 / None)");
                
                // Populate Diff Base and Target selects
                populateYamlFileSelect('yaml-diff-base-select', availYaml, availYaml[0]?.path);
                populateYamlFileSelect('yaml-diff-target-select', availYaml, availYaml.length > 1 ? availYaml[1]?.path : availYaml[0]?.path);
            }
            if (availBkc.length > 0) {
                populateFileSelect('yaml-bkc-file-select', availBkc, summary.bkc_file);
            }
            if (availSheets.length > 0) {
                populateSheetSelect(null, 'yaml-bkc-sheet-select', availSheets, summary.bkc_sheet);
            }

            // Populate Station Filter Dropdown
            populateYamlStationFilter(data.items || []);

            // Render Views
            renderYamlTable();
            if (data.coverage_matrix) {
                renderYamlCoverageMatrix(data.coverage_matrix);
            }
        }
    } catch (err) {
        console.error('Error fetching YAML compare data:', err);
    }
}

function populateYamlFileSelect(selectId, files, activePath, emptyOptionLabel = null) {
    const select = document.getElementById(selectId);
    if (!select || !files) return;
    
    select.innerHTML = '';
    let selectedSet = false;

    if (emptyOptionLabel) {
        const emptyOpt = document.createElement('option');
        emptyOpt.value = '';
        emptyOpt.textContent = emptyOptionLabel;
        if (!activePath) {
            emptyOpt.selected = true;
            selectedSet = true;
        }
        select.appendChild(emptyOpt);
    }

    files.forEach((f) => {
        const opt = document.createElement('option');
        opt.value = f.path;
        opt.textContent = f.display_name;
        if (activePath && (f.path === activePath || f.filename === activePath || f.display_name === activePath)) {
            opt.selected = true;
            selectedSet = true;
        }
        select.appendChild(opt);
    });

    if (!selectedSet && emptyOptionLabel && select.options.length > 0) {
        select.options[0].selected = true;
    }
}


function populateYamlStationFilter(items) {
    const select = document.getElementById('yaml-station-filter');
    if (!select) return;
    
    const stations = new Set();
    items.forEach(it => {
        if (it.station && it.station !== 'None') stations.add(it.station);
    });
    
    const currentVal = select.value || 'ALL';
    select.innerHTML = '<option value="ALL">全部工站 (All Stations)</option>';
    
    Array.from(stations).sort().forEach(st => {
        const opt = document.createElement('option');
        opt.value = st;
        opt.textContent = st;
        if (st === currentVal) opt.selected = true;
        select.appendChild(opt);
    });
}

async function saveYamlDisposition(itemKey, status, owner, note) {
    try {
        await fetch('/api/yaml-dispositions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                key: itemKey,
                disposition_status: status,
                owner: owner,
                note: note
            })
        });
    } catch (err) {
        console.error('Failed to save disposition:', err);
    }
}

function renderYamlTable(page) {
    const tbody = document.getElementById('yaml-tbody');
    if (!tbody || !appState.yamlCompare || !appState.yamlCompare.items) return;

    const PAGE_SIZE = 50;
    if (page !== undefined && page !== null) appState.yamlPage = page;
    if (appState.yamlPage === undefined) appState.yamlPage = 0;

    const items = appState.yamlCompare.items;
    const stationFilter = document.getElementById('yaml-station-filter')?.value || 'ALL';
    const statusFilter = document.getElementById('yaml-status-filter')?.value || 'ALL';
    const searchInput = document.getElementById('yaml-search-input')?.value || '';
    const q = searchInput.trim().toLowerCase();

    const y1 = document.getElementById('yaml-file-select-1')?.value;
    const y2 = document.getElementById('yaml-file-select-2')?.value;
    const y3 = document.getElementById('yaml-file-select-3')?.value;

    const filtered = items.filter(it => {
        if (stationFilter !== 'ALL' && it.station !== stationFilter) return false;
        if (statusFilter !== 'ALL' && it.status !== statusFilter) return false;
        if (q) {
            const searchable = `${it.station} ${it.file_name} ${it.step_location} ${it.component} ${it.sub_component} ${it.yaml_version} ${it.bkc_version} ${it.discussion_note} ${it.command}`.toLowerCase();
            if (!searchable.includes(q)) return false;
        }
        return true;
    });

    if (filtered.length === 0) {
        const msg = (!y1 && !y2 && !y3) 
            ? '💡 請在上方選單選擇 1 ~ 3 個 Test Suite (YAML) 測試腳本進行 BKC 合規比對' 
            : '無符合條件的 Test Suite (YAML) 比對資料';
        tbody.innerHTML = `<tr><td colspan="8" class="text-center py-5 text-muted" style="font-size:1.05rem;">${msg}</td></tr>`;
        renderYamlPagination(0, 0, PAGE_SIZE);
        return;
    }

    const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
    if (appState.yamlPage >= totalPages) appState.yamlPage = totalPages - 1;
    if (appState.yamlPage < 0) appState.yamlPage = 0;
    const pageStart = appState.yamlPage * PAGE_SIZE;
    const pageItems = filtered.slice(pageStart, pageStart + PAGE_SIZE);

    tbody.innerHTML = '';
    const fragment = document.createDocumentFragment();

    pageItems.forEach(it => {
        const tr = document.createElement('tr');
        if (it.status === 'MISMATCH') tr.classList.add('tr-yaml-mismatch');

        let badgeClass = 'yaml-match';
        if (it.status === 'MISMATCH') badgeClass = 'yaml-mismatch';
        else if (it.status === 'MISSING_IN_BKC') badgeClass = 'yaml-missing-bkc';
        else if (it.status === 'UNCHECKED_IN_YAML') badgeClass = 'yaml-unchecked';

        const stationDisplay = (it.station && it.station !== 'None')
            ? `<span class="badge-station"><i class="fa-solid fa-vial"></i> ${escapeHtml(it.station)}</span>`
            : `<span class="text-muted" style="font-size:0.8rem;">-</span>`;

        const stepDisplay = (it.step_location && it.step_location !== 'N/A (未涵蓋)')
            ? `<span class="step-location-pill" title="${escapeHtml(it.command || '')}"><i class="fa-solid fa-code-branch"></i> ${escapeHtml(it.step_location)}</span>`
            : `<span class="text-muted" style="font-size:0.8rem;">${escapeHtml(it.step_location)}</span>`;

        const dispStatus = it.disposition_status || 'Pending';
        const dispOwner = it.disposition_owner || '';
        let selectClass = 'status-pending';
        if (dispStatus === 'To Update') selectClass = 'status-to-update';
        else if (dispStatus === 'Waived') selectClass = 'status-waived';
        else if (dispStatus === 'BKC Error') selectClass = 'status-bkc-error';

        const dispCol = `<div><select class="yaml-disp-select ${selectClass}" data-key="${escapeHtml(it.item_key)}"><option value="Pending" ${dispStatus==='Pending'?'selected':''}>⏳ 待與客戶確認</option><option value="To Update" ${dispStatus==='To Update'?'selected':''}>🛠️ 確認更新腳本</option><option value="Waived" ${dispStatus==='Waived'?'selected':''}>🤝 客戶同意特採</option><option value="BKC Error" ${dispStatus==='BKC Error'?'selected':''}>⚠️ BKC需更正</option></select><input type="text" class="yaml-owner-input" placeholder="指派 Owner" value="${escapeHtml(dispOwner)}" data-key="${escapeHtml(it.item_key)}" /></div>`;

        const patchBtn = (it.status === 'MISMATCH')
            ? `<br><button class="btn-patch-modal"><i class="fa-solid fa-wand-magic-sparkles"></i> 修復 Patch</button>`
            : '';

        tr.innerHTML = `<td>${stationDisplay}</td><td>${stepDisplay}</td><td><div style="font-weight:600;color:var(--text-main);">${escapeHtml(it.sub_component||it.component)}</div><div style="font-size:0.76rem;color:var(--text-muted);">${escapeHtml(it.bkc_group!=='N/A'?`${it.bkc_category} > ${it.bkc_group}`:'YAML Test Check')}</div></td><td class="font-mono text-cyan">${escapeHtml(it.yaml_version||'-')}</td><td class="font-mono" style="color:#fbbf24;font-weight:600;">${escapeHtml(it.bkc_version||'-')}</td><td><span class="badge-yaml-status ${badgeClass}">${escapeHtml(it.status_label)}</span></td><td>${dispCol}</td><td style="font-size:0.83rem;color:#cbd5e1;line-height:1.4;">${escapeHtml(it.discussion_note)}${it.command?`<div style="font-family:var(--font-mono);font-size:0.75rem;color:var(--text-muted);margin-top:2px;">Cmd:<code>${escapeHtml(it.command)}</code></div>`:''}${patchBtn}</td>`;

        const selectElem = tr.querySelector('.yaml-disp-select');
        const ownerElem = tr.querySelector('.yaml-owner-input');

        if (selectElem) {
            selectElem.addEventListener('change', (e) => {
                const newStatus = e.target.value;
                const key = e.target.getAttribute('data-key');
                saveYamlDisposition(key, newStatus, ownerElem?.value || '', '');
                renderYamlTable();
            });
        }
        if (ownerElem) {
            ownerElem.addEventListener('change', (e) => {
                const newOwner = e.target.value;
                const key = e.target.getAttribute('data-key');
                saveYamlDisposition(key, selectElem?.value || 'Pending', newOwner, '');
            });
        }

        const btnPatch = tr.querySelector('.btn-patch-modal');
        if (btnPatch) {
            btnPatch.addEventListener('click', () => {
                openYamlPatchModal(it);
            });
        }

        fragment.appendChild(tr);
    });

    tbody.appendChild(fragment);
    renderYamlPagination(filtered.length, appState.yamlPage, PAGE_SIZE);
}

function renderYamlPagination(totalItems, currentPage, pageSize) {
    let container = document.getElementById('yaml-pagination');
    if (!container) {
        const tableCard = document.getElementById('yaml-view-bkc-container');
        if (!tableCard) return;
        container = document.createElement('div');
        container.id = 'yaml-pagination';
        container.className = 'd-flex justify-content-between align-items-center mt-3 px-3 py-2';
        container.style.cssText = 'border-top: 1px solid var(--border-color); font-size: 0.85rem; color: var(--text-muted);';
        tableCard.appendChild(container);
    }

    if (totalItems === 0) {
        container.innerHTML = '';
        return;
    }

    const totalPages = Math.ceil(totalItems / pageSize);
    const startIdx = currentPage * pageSize + 1;
    const endIdx = Math.min((currentPage + 1) * pageSize, totalItems);

    let pagesHtml = '';
    for (let p = 0; p < totalPages; p++) {
        const activeBtnClass = p === currentPage ? 'btn-primary' : 'btn-secondary';
        pagesHtml += `<button class="btn btn-sm ${activeBtnClass} py-1 px-2 mx-1 yaml-page-btn" data-page="${p}">${p + 1}</button>`;
    }

    container.innerHTML = `
        <div>顯示 <strong>${startIdx}</strong> - <strong>${endIdx}</strong> 項，共 <strong>${totalItems}</strong> 項</div>
        <div class="d-flex align-items-center gap-1">
            <button class="btn btn-secondary btn-sm py-1 px-2" id="yaml-prev-page" ${currentPage === 0 ? 'disabled' : ''}><i class="fa-solid fa-chevron-left"></i> 上一頁</button>
            <div class="d-flex" style="flex-wrap: wrap; gap: 2px;">${pagesHtml}</div>
            <button class="btn btn-secondary btn-sm py-1 px-2" id="yaml-next-page" ${currentPage >= totalPages - 1 ? 'disabled' : ''}>下一頁 <i class="fa-solid fa-chevron-right"></i></button>
        </div>
    `;

    document.getElementById('yaml-prev-page')?.addEventListener('click', () => {
        if (currentPage > 0) renderYamlTable(currentPage - 1);
    });
    document.getElementById('yaml-next-page')?.addEventListener('click', () => {
        if (currentPage < totalPages - 1) renderYamlTable(currentPage + 1);
    });
    container.querySelectorAll('.yaml-page-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const page = parseInt(e.target.getAttribute('data-page'), 10);
            renderYamlTable(page);
        });
    });
}


function renderYamlCoverageMatrix(matrixData) {
    const thead = document.getElementById('yaml-coverage-thead');
    const tbody = document.getElementById('yaml-coverage-tbody');
    if (!thead || !tbody || !matrixData) return;

    const stations = matrixData.stations || [];
    const grid = matrixData.grid || [];

    let thHtml = `<tr><th>組件與項目 (Component)</th><th>BKC 標準版本</th>`;
    stations.forEach(st => {
        thHtml += `<th class="text-center" style="min-width: 140px;">${escapeHtml(st)}</th>`;
    });
    thHtml += `</tr>`;
    thead.innerHTML = thHtml;

    if (grid.length === 0) {
        tbody.innerHTML = `<tr><td colspan="${stations.length + 2}" class="text-center py-4 text-muted">無覆蓋矩陣資料</td></tr>`;
        return;
    }

    tbody.innerHTML = '';
    grid.forEach(row => {
        const tr = document.createElement('tr');
        let tdHtml = `
            <td>
                <div style="font-weight:600; color:var(--text-main);">${escapeHtml(row.component)}</div>
                <div style="font-size:0.76rem; color:var(--text-muted);">${escapeHtml(row.category)} > ${escapeHtml(row.group)}</div>
            </td>
            <td class="font-mono" style="color:#fbbf24; font-weight:600;">${escapeHtml(row.bkc_version)}</td>
        `;

        stations.forEach(st => {
            const cellData = row.stations ? row.stations[st] : null;
            if (cellData) {
                let cellClass = 'match';
                if (cellData.status === 'MISMATCH') cellClass = 'mismatch';
                else if (cellData.status === 'MISSING_IN_BKC') cellClass = 'missing';

                tdHtml += `
                    <td>
                        <div class="heatmap-cell ${cellClass}">
                            <div>${escapeHtml(cellData.status_label)}</div>
                            <div class="font-mono" style="font-size:0.75rem; margin-top:2px;">Ver: ${escapeHtml(cellData.yaml_version)}</div>
                        </div>
                    </td>
                `;
            } else {
                tdHtml += `
                    <td>
                        <div class="heatmap-cell unchecked">
                            <div>⚪ 未測試</div>
                        </div>
                    </td>
                `;
            }
        });

        tr.innerHTML = tdHtml;
        tbody.appendChild(tr);
    });
}

async function openYamlPatchModal(item) {
    const modal = document.getElementById('yaml-patch-modal');
    if (!modal) return;

    try {
        const res = await fetch('/api/yaml-patch', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(item)
        });
        const data = await res.json();
        if (data.success) {
            document.getElementById('yaml-patch-text-area').value = data.patch_text;
            document.getElementById('yaml-snippet-area').value = data.snippet_yaml;
            modal.style.display = 'flex';
        }
    } catch (err) {
        console.error('Error fetching patch snippet:', err);
    }
}

async function fetchYamlVersionDiff() {
    const baseSel = document.getElementById('yaml-diff-base-select')?.value;
    const targetSel = document.getElementById('yaml-diff-target-select')?.value;
    const tbody = document.getElementById('yaml-version-diff-tbody');

    if (!tbody) return;
    tbody.innerHTML = `<tr><td colspan="5" class="text-center py-4">正在分析 YAML 腳本演進異動中...</td></tr>`;

    try {
        const url = `/api/yaml-version-diff?base_yaml=${encodeURIComponent(baseSel || '')}&target_yaml=${encodeURIComponent(targetSel || '')}`;
        const res = await fetch(url);
        const data = await res.json();

        if (data.success) {
            renderYamlVersionDiffTable(data.items || []);
        }
    } catch (err) {
        console.error('Error fetching version diff:', err);
    }
}

function renderYamlVersionDiffTable(items) {
    const tbody = document.getElementById('yaml-version-diff-tbody');
    if (!tbody) return;

    if (items.length === 0) {
        tbody.innerHTML = `<tr><td colspan="5" class="text-center py-4 text-muted">所選兩個 YAML 腳本完全一致，無演進異動。</td></tr>`;
        return;
    }

    tbody.innerHTML = '';
    items.forEach(it => {
        const tr = document.createElement('tr');
        let badgeClass = 'yaml-match';
        if (it.status === 'ADDED') badgeClass = 'yaml-match';
        else if (it.status === 'REMOVED') badgeClass = 'yaml-mismatch';
        else if (it.status === 'MODIFIED') badgeClass = 'yaml-missing-bkc';
        else if (it.status === 'UNCHANGED') badgeClass = 'yaml-unchecked';

        tr.innerHTML = `
            <td><span class="step-location-pill"><i class="fa-solid fa-code-branch"></i> ${escapeHtml(it.step_location)}</span></td>
            <td style="font-weight: 600; color: var(--text-main);">${escapeHtml(it.sub_component || it.component)}</td>
            <td class="font-mono">${escapeHtml(it.base_version || '-')}</td>
            <td class="font-mono text-cyan" style="font-weight:600;">${escapeHtml(it.target_version || '-')}</td>
            <td><span class="badge-yaml-status ${badgeClass}">${escapeHtml(it.status_label)}</span></td>
        `;
        tbody.appendChild(tr);
    });
}



