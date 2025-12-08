// ==UserScript==
// @name         PoE2 Trade Import
// @namespace    http://tampermonkey.net/
// @version      1.0
// @description  Full port of the PoE2 Trade Extension. Adds an "Import Item" button to the trade site. Fixes duplicates and missing stats.
// @author       MIYANKO
// @match        *://*.pathofexile.com/trade2/*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=pathofexile.com
// @grant        none
// ==/UserScript==

(function() {
    'use strict';

    // =========================================================================
    // 1. STYLES (Button & Modal)
    // =========================================================================
    const styles = document.createElement('style');
    styles.textContent = `
        /* Request Button Styles */
        .poe-import-btn {
            background-color: #0f304d;
            color: #ffffff;
            padding: 4px 8px;
            font-family: 'Fontin', sans-serif;
            border: none;
            cursor: pointer;
            margin-left: 10px;
            font-size: 14px;
            transition: background-color 0.2s;
            display: flex;
            align-items: center;
            justify-content: center;
            height: 30px;
        }

        .poe-import-btn:hover {
            background-color: #133d62;
        }

        /* Modal Overlay */
        .poe-modal-overlay {
            position: fixed;
            top: 0; left: 0; width: 100%; height: 100%;
            background: rgba(0, 0, 0, 0.7);
            z-index: 99999;
            display: flex;
            align-items: center;
            justify-content: center;
            font-family: 'Fontin', sans-serif;
        }

        /* Modal Window */
        .poe-modal-content {
            background: #191f24;
            color: #ccc;
            padding: 20px;
            width: 350px;
            border: 1px solid #333;
            box-shadow: 0 4px 15px rgba(0,0,0,0.5);
            display: flex;
            flex-direction: column;
            gap: 10px;
        }

        .poe-modal-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 10px;
        }

        .poe-modal-header h2 {
            margin: 0;
            color: #fff;
            font-size: 18px;
            font-weight: normal;
        }

        .poe-close-btn {
            background: none;
            border: none;
            color: #888;
            font-size: 20px;
            cursor: pointer;
        }

        .poe-close-btn:hover { color: #fff; }

        /* Form Elements */
        .poe-textarea {
            width: 100%;
            height: 120px;
            background: #000;
            color: #eee;
            border: 1px solid #444;
            padding: 5px;
            font-family: monospace;
            resize: vertical;
            box-sizing: border-box;
        }

        .poe-checkbox-group {
            display: flex;
            align-items: center;
            gap: 8px;
            margin-bottom: 5px;
        }

        /* Sliders / Range Section */
        .poe-fieldset {
            border: 1px solid #444;
            padding: 10px;
            margin-top: 10px;
        }

        .poe-fieldset legend {
            padding: 0 5px;
            color: #aaa;
        }

        .poe-range-row {
            display: flex;
            flex-direction: column;
            margin-bottom: 10px;
        }

        .poe-range-row label { font-size: 12px; margin-bottom: 4px; }

        .poe-range-inputs {
            display: flex;
            align-items: center;
            gap: 5px;
        }

        .poe-range-inputs input[type="range"] { flex-grow: 1; }
        .poe-range-inputs input[type="number"] { width: 50px; background: #000; color: #fff; border: 1px solid #444; }

        .poe-actions {
            display: flex;
            justify-content: flex-end;
            gap: 10px;
            margin-top: 15px;
        }

        .poe-submit-btn {
            background-color: #0f304d;
            color: white;
            border: none;
            padding: 8px 16px;
            cursor: pointer;
            font-family: 'Fontin', sans-serif;
        }
        .poe-submit-btn:hover { background-color: #133d62; }

        .poe-status {
            font-size: 12px;
            margin-top: 5px;
            min-height: 1.2em;
        }
        .text-red { color: #ff6b6b; }
        .text-green { color: #51cf66; }
    `;
    document.head.appendChild(styles);


    // =========================================================================
    // 2. INJECT PAGE CONTEXT SCRIPT (inject.js logic)
    // =========================================================================
    function pageContextScript() {
        const MAX_RETRIES = 100;
        let retryCount = 0;
        const DEBUG = false;

        // Prevent Duplicate Listeners
        if (window.poeImportAttached) {
            console.log("[PoE Import] Listener already attached.");
            return;
        }
        window.poeImportAttached = true;

        function waitForApp() {
            try {
                // Access the Vue app data
                if (window.app?.$data?.static_) {
                    const staticData = window.app.$data.static_;

                    // 1. Build Stats Map (Iterate ALL categories to find Implicits/Pseudo/etc)
                    const knownStatsArray = staticData.knownStats || [];
                    const statsMap = {};

                    knownStatsArray.forEach(category => {
                        // Iterate through each category (Explicit, Implicit, Crafted, etc.)
                        if (category.entries) {
                            category.entries.forEach(stat => {
                                if (statsMap[stat.text]) {
                                    // Avoid duplicates if ID is already there
                                    if (!statsMap[stat.text].includes(stat.id)) {
                                        statsMap[stat.text].push(stat.id);
                                    }
                                } else {
                                    statsMap[stat.text] = [stat.id];
                                }
                            });
                        }
                    });

                    window.statsMap = statsMap;
                    if(DEBUG) console.log("[PoE Import] Stats Map built with " + Object.keys(statsMap).length + " entries.");

                    // 2. Build Item Class Map
                    const propertyFilters = staticData.propertyFilters || [];
                    const itemClassFilter = propertyFilters.find(filter => filter.id === 'type_filters')?.filters;

                    if (itemClassFilter) {
                        const itemClassOptions = itemClassFilter[0].option?.options || [];
                        const itemClassMap = itemClassOptions.reduce((map, entry) => {
                            map[entry.text] = [entry.id];
                            return map;
                        }, {});
                        window.itemClassMap = itemClassMap;
                    }

                    // 3. Setup Message Listener
                    window.addEventListener("message", (event) => {
                        if (event.source !== window) return;

                        const commit = (type, payload) => {
                            if (window.app && window.app.$store) {
                                window.app.$store.commit(type, payload);
                            }
                        };

                        if (event.data.type === "CLEAR_SEARCH_FORM") {
                            commit("clearSearchForm");
                        }

                        if (event.data.type === "SET_STAT_FILTER_FROM_TEXT") {
                            const { humanText, min, max } = event.data;
                            const cleanText = humanText.replace(/\s*\((desecrated|fractured)\)$/, '');

                            // Try to find IDs
                            const statIds = [];

                            // Exact match
                            if (statsMap[cleanText]) statIds.push(...statsMap[cleanText]);

                            // Variant matches (Local, Global, Jewel)
                            ['Local', 'Global', 'Jewel'].forEach(variant => {
                                const variantText = `${cleanText} (${variant})`;
                                if (statsMap[variantText]) statIds.push(...statsMap[variantText]);
                            });

                            if (statIds.length > 0) {
                                // If we have multiple IDs (e.g. Implicit AND Explicit), usually we just want one filter.
                                // The original extension logic creates a "Count" group if duplicates exist.
                                // However, for simple imports, taking the first valid ID (often Explicit) is usually cleaner.
                                // Let's stick to original logic: if > 1 ID, use COUNT group.

                                // Unique IDs only
                                const uniqueIds = [...new Set(statIds)];

                                if (uniqueIds.length > 1) {
                                    const currentStats = window.app.$store.state.persistent.stats;
                                    const newGroupIndex = currentStats.length;
                                    commit("pushStatGroup", {
                                        filters: uniqueIds.map((id) => ({ id, value: { min, max } })),
                                        type: "count",
                                    });
                                    commit("setStatGroupValue", { group: newGroupIndex, value: { min: 1 } });
                                } else {
                                    commit("setStatFilter", {
                                        group: 0,
                                        value: { id: uniqueIds[0], value: { min, max } },
                                    });
                                }
                            } else {
                                console.warn("[PoE Import] Stat not found:", cleanText);
                            }
                        }

                        if (event.data.type === "SET_EXPANDED_STAT_FILTER") {
                            const { humanText, min, max } = event.data;
                            const statIds = [];

                            ["Dexterity", "Intelligence", "Strength"].forEach(attr => {
                                const expanded = humanText.replace("ATTRIBUTES", attr);
                                if (statsMap[expanded]) statIds.push(...statsMap[expanded]);
                            });

                            ["Lightning", "Cold", "Fire"].forEach(el => {
                                const expanded = humanText.replace("ELEMENTAL_RESIST", el);
                                if (statsMap[expanded]) statIds.push(...statsMap[expanded]);
                            });

                            if (statIds.length > 0) {
                                const uniqueIds = [...new Set(statIds)];
                                const currentStats = window.app.$store.state.persistent.stats;
                                const newGroupIndex = currentStats.length;
                                commit("pushStatGroup", {
                                    filters: uniqueIds.map((id) => ({ id })),
                                    type: "weight",
                                });
                                commit("setStatGroupValue", { group: newGroupIndex, value: { min, max } });
                            }
                        }

                        if (event.data.type === "SET_ITEM_CLASS_FILTER") {
                            const { itemClass } = event.data;
                            if (window.itemClassMap && window.itemClassMap[itemClass]) {
                                commit("setPropertyFilter", {
                                    group: "type_filters",
                                    index: "category",
                                    value: { option: window.itemClassMap[itemClass][0] },
                                });
                            }
                        }
                    });

                    console.log("[PoE Import] Script initialized successfully.");

                } else if (retryCount < MAX_RETRIES) {
                    retryCount++;
                    setTimeout(waitForApp, 100);
                }
            } catch (e) {
                console.error("[PoE Import] Injection Error:", e);
            }
        }
        setTimeout(waitForApp, 200);
    }

    // Inject the script
    const scriptTag = document.createElement('script');
    scriptTag.textContent = `(${pageContextScript.toString()})();`;
    (document.head || document.documentElement).appendChild(scriptTag);
    scriptTag.remove();


    // =========================================================================
    // 3. UI LOGIC & PARSING
    // =========================================================================

    function createModal() {
        if (document.getElementById('poe-import-modal')) return;

        const overlay = document.createElement('div');
        overlay.id = 'poe-import-modal';
        overlay.className = 'poe-modal-overlay';
        overlay.innerHTML = `
            <div class="poe-modal-content">
                <div class="poe-modal-header">
                    <h2>Import Item Stats</h2>
                    <button class="poe-close-btn" id="poe-close">&times;</button>
                </div>
                <textarea id="poe-item-text" class="poe-textarea" placeholder="Paste item text here..."></textarea>

                <div class="poe-checkbox-group">
                    <input type="checkbox" id="poe-check-attr">
                    <label for="poe-check-attr">Generic Attributes</label>
                </div>
                <div class="poe-checkbox-group">
                    <input type="checkbox" id="poe-check-res">
                    <label for="poe-check-res">Generic Elemental Resists</label>
                </div>

                <fieldset class="poe-fieldset">
                    <legend>Search Variance</legend>
                    <div class="poe-range-row">
                        <label>Min Variance (-%)</label>
                        <div class="poe-range-inputs">
                            <input type="range" id="poe-min-range" min="0" max="50" value="0">
                            <input type="number" id="poe-min-input" min="0" max="50" value="0">
                        </div>
                    </div>
                    <div class="poe-range-row">
                        <label>Max Variance (+%)</label>
                        <div class="poe-range-inputs">
                            <input type="range" id="poe-max-range" min="0" max="50" value="0">
                            <input type="number" id="poe-max-input" min="0" max="50" value="0">
                        </div>
                    </div>
                </fieldset>

                <div class="poe-status" id="poe-status"></div>

                <div class="poe-actions">
                    <div class="poe-checkbox-group">
                        <input type="checkbox" id="poe-check-clear" checked>
                        <label for="poe-check-clear">Clear Existing</label>
                    </div>
                    <button class="poe-submit-btn" id="poe-submit">Import</button>
                </div>
            </div>
        `;

        document.body.appendChild(overlay);

        const close = () => overlay.remove();
        document.getElementById('poe-close').onclick = close;
        overlay.addEventListener('click', (e) => { if(e.target === overlay) close(); });

        const sync = (rangeId, inputId) => {
            const range = document.getElementById(rangeId);
            const input = document.getElementById(inputId);
            range.oninput = () => input.value = range.value;
            input.oninput = () => range.value = input.value;
        };
        sync('poe-min-range', 'poe-min-input');
        sync('poe-max-range', 'poe-max-input');

        // Load Settings
        const loadBool = (id, key) => document.getElementById(id).checked = (localStorage.getItem(key) === 'true');
        const loadVal = (id, key) => {
            const val = localStorage.getItem(key) || 0;
            document.getElementById(id).value = val;
            if(id.includes('range')) document.getElementById(id.replace('range','input')).value = val;
        };

        loadBool('poe-check-attr', 'poe_import_attr');
        loadBool('poe-check-res', 'poe_import_res');
        loadBool('poe-check-clear', 'poe_import_clear');
        loadVal('poe-min-range', 'poe_import_min');
        loadVal('poe-max-range', 'poe_import_max');

        document.getElementById('poe-submit').onclick = handleImport;
    }

    function handleImport() {
        const text = document.getElementById('poe-item-text').value;
        const status = document.getElementById('poe-status');

        localStorage.setItem('poe_import_attr', document.getElementById('poe-check-attr').checked);
        localStorage.setItem('poe_import_res', document.getElementById('poe-check-res').checked);
        localStorage.setItem('poe_import_clear', document.getElementById('poe-check-clear').checked);
        localStorage.setItem('poe_import_min', document.getElementById('poe-min-range').value);
        localStorage.setItem('poe_import_max', document.getElementById('poe-max-range').value);

        if (!text.trim()) {
            status.textContent = "Please paste item text.";
            status.className = "poe-status text-red";
            return;
        }

        try {
            processItemText(text);
            status.textContent = "Filters applied!";
            status.className = "poe-status text-green";
            setTimeout(() => {
                if(document.getElementById('poe-import-modal')) document.getElementById('poe-import-modal').remove();
            }, 800);
        } catch (e) {
            console.error(e);
            status.textContent = "Error parsing item.";
            status.className = "poe-status text-red";
        }
    }

    function processItemText(fullText) {
        const config = {
            genericAttributes: document.getElementById('poe-check-attr').checked,
            genericResists: document.getElementById('poe-check-res').checked,
            clear: document.getElementById('poe-check-clear').checked,
            minBuffer: parseFloat(document.getElementById('poe-min-range').value) || 0,
            maxBuffer: parseFloat(document.getElementById('poe-max-range').value) || 0
        };

        const lines = fullText.split("\n");
        let itemClass = null;

        // Header Parsing
        if (lines[0].startsWith("Item Class:")) {
            itemClass = lines[0].replace("Item Class:", "").trim();
            if (itemClass === "Quarterstaves") itemClass = "Quarterstaff";
            if (itemClass.endsWith("s")) itemClass = itemClass.slice(0, -1);
        }

        // Filter Header/Separator Lines
        let filteredLines = lines.slice(1).filter(line => !line.includes(":"));

        const cleanLine = (line) => line.replace(/\[[^\]|]+\|([^\]]+)\]/g, "$1").replace(/[\[\]]/g, "");

        let parsedStats = filteredLines.map(line => {
            const cleaned = cleanLine(line);

            // 1. Ranges "10 to 20"
            let match = cleaned.match(/(\d+)\s+to\s+(\d+)/);
            if (match) {
                const minVal = parseFloat(match[1]);
                const maxVal = parseFloat(match[2]);
                const avg = Math.floor((minVal + maxVal) / 2);
                return { humanText: cleaned.replace(/(\d+)\s+to\s+(\d+)/g, "# to #"), min: avg };
            }

            // 2. Percentage starts "48% faster start..."
            if (/^[+-]?\d+(?:\.\d+)?%?/.test(cleaned)) {
                 match = cleaned.match(/[+-]?\d+(?:\.\d+)?/);
                 // Replace the number AND the optional % immediately following it with #% or #
                 // If the text is "35% reduced...", we want "#% reduced..."
                 // If the text is "35 reduced...", we want "# reduced..."

                 // Smart replacement:
                 // Regex to capture Number + Optional Percent
                 const replaceRegex = /^[+-]?(\d+(?:\.\d+)?)(%?)/;
                 const parts = cleaned.match(replaceRegex);

                 let humanText = cleaned;
                 if (parts) {
                     // parts[1] is number, parts[2] is % or empty
                     const replacement = "#" + parts[2]; // e.g. "#%" or "#"
                     humanText = cleaned.replace(replaceRegex, replacement).trim();
                 }

                 return { humanText: humanText, min: parseFloat(match[0]) };
            }

            // 3. Number anywhere "Gain 3 Mana..."
            match = cleaned.match(/[+-]?\d+(?:\.\d+)?/);
            if (match) {
                return { humanText: cleaned.replace(/[+-]?\d+(?:\.\d+)?/g, "#").trim(), min: parseFloat(match[0]) };
            }

            return { humanText: cleaned.trim(), min: null };
        }).filter(s => s.humanText);

        // Attributes Bucket
        if (config.genericAttributes) {
            const others = [];
            let attributes = {};
            parsedStats.forEach(stat => {
                if (/Dexterity|Strength|Intelligence/.test(stat.humanText)) {
                    const key = stat.humanText.replace(/Dexterity|Strength|Intelligence/g, "ATTRIBUTES");
                    if (!attributes[key]) attributes[key] = { humanText: key, min: 0 };
                    attributes[key].min += stat.min;
                } else {
                    others.push(stat);
                }
            });
            // Add summarized attributes back to queue (as a special message later)
            // Actually, we process them separately below.
            parsedStats = others;
            // We need to store 'attributes' for later sending
            config.foundAttributes = attributes;
        }

        // Resists Bucket
        if (config.genericResists) {
            const others = [];
            let resists = {};
            parsedStats.forEach(stat => {
                if (/Lightning Resistance|Cold Resistance|Fire Resistance/.test(stat.humanText)) {
                    const key = stat.humanText.replace(/Lightning|Cold|Fire/g, "ELEMENTAL_RESIST");
                    if (!resists[key]) resists[key] = { humanText: key, min: 0 };
                    resists[key].min += stat.min;
                } else {
                    others.push(stat);
                }
            });
            parsedStats = others;
            config.foundResists = resists;
        }

        // Variance Calculation
        const minMult = 1 - (config.minBuffer / 100);
        const maxMult = 1 + (config.maxBuffer / 100);

        const adjust = (val) => {
            if (val === null) return { min: null, max: null };
            const minV = Math.floor(val * minMult);
            const maxV = config.maxBuffer > 0 ? Math.ceil(val * maxMult) : null;
            return { min: minV, max: maxV };
        };

        // --- POST MESSAGES ---

        if (config.clear) {
            window.postMessage({ type: "CLEAR_SEARCH_FORM" }, "*");
        }

        parsedStats.forEach(stat => {
            const vals = adjust(stat.min);
            window.postMessage({
                type: "SET_STAT_FILTER_FROM_TEXT",
                humanText: stat.humanText,
                min: vals.min,
                max: vals.max
            }, "*");
        });

        if (config.foundAttributes) {
            Object.values(config.foundAttributes).forEach(stat => {
                const vals = adjust(stat.min);
                window.postMessage({ type: "SET_EXPANDED_STAT_FILTER", humanText: stat.humanText, min: vals.min, max: vals.max }, "*");
            });
        }

        if (config.foundResists) {
            Object.values(config.foundResists).forEach(stat => {
                const vals = adjust(stat.min);
                window.postMessage({ type: "SET_EXPANDED_STAT_FILTER", humanText: stat.humanText, min: vals.min, max: vals.max }, "*");
            });
        }

        if (itemClass) {
            window.postMessage({ type: "SET_ITEM_CLASS_FILTER", itemClass }, "*");
        }
    }

    function insertButton() {
        if (document.getElementById('poe-import-trigger')) return;
        const target = document.querySelector('.controls') || document.querySelector('.search-bar');

        if (target) {
            const btn = document.createElement('button');
            btn.id = 'poe-import-trigger';
            btn.innerText = "Import Item";
            btn.className = "poe-import-btn";
            btn.onclick = (e) => { e.preventDefault(); createModal(); };
            target.appendChild(btn);
        }
    }

    const observer = new MutationObserver(() => insertButton());
    observer.observe(document.body, { childList: true, subtree: true });
    setTimeout(insertButton, 1000);

})();