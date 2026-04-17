// ENKOMOS-Field - Offline Field Data Collection
// Data stored in IndexedDB for offline capability

// Database configuration
const DB_NAME = 'ENKOMOS_Field_DB';
const DB_VERSION = 1;
const STORE_NAME = 'field_entries';

let db = null;
let currentTab = 'entry';

// Initialize IndexedDB
function initDB() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);
        
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
            db = request.result;
            resolve(db);
        };
        
        request.onupgradeneeded = (event) => {
            const db = event.target.result;
            if (!db.objectStoreNames.contains(STORE_NAME)) {
                const store = db.createObjectStore(STORE_NAME, { keyPath: 'id', autoIncrement: true });
                store.createIndex('synced', 'synced');
                store.createIndex('date', 'date');
            }
        };
    });
}

// Save entry to IndexedDB (offline)
async function saveEntry(entry) {
    if (!db) await initDB();
    
    entry.id = Date.now();
    entry.date = new Date().toISOString();
    entry.synced = false;
    
    return new Promise((resolve, reject) => {
        const transaction = db.transaction([STORE_NAME], 'readwrite');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.add(entry);
        request.onsuccess = () => resolve(entry);
        request.onerror = () => reject(request.error);
    });
}

// Get all entries
async function getAllEntries() {
    if (!db) await initDB();
    
    return new Promise((resolve, reject) => {
        const transaction = db.transaction([STORE_NAME], 'readonly');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.getAll();
        request.onsuccess = () => resolve(request.result || []);
        request.onerror = () => reject(request.error);
    });
}

// Delete entry
async function deleteEntry(id) {
    if (!db) await initDB();
    
    return new Promise((resolve, reject) => {
        const transaction = db.transaction([STORE_NAME], 'readwrite');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.delete(id);
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
    });
}

// Clear all entries
async function clearAllEntries() {
    if (!db) await initDB();
    
    return new Promise((resolve, reject) => {
        const transaction = db.transaction([STORE_NAME], 'readwrite');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.clear();
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
    });
}

// Mark entry as synced
async function markSynced(id) {
    if (!db) await initDB();
    
    return new Promise((resolve, reject) => {
        const transaction = db.transaction([STORE_NAME], 'readwrite');
        const store = transaction.objectStore(STORE_NAME);
        const getRequest = store.get(id);
        getRequest.onsuccess = () => {
            const entry = getRequest.result;
            if (entry) {
                entry.synced = true;
                store.put(entry);
            }
            resolve();
        };
        getRequest.onerror = () => reject(getRequest.error);
    });
}

// Sync to cloud (GitHub or server)
async function syncToCloud() {
    const entries = await getAllEntries();
    const pending = entries.filter(e => !e.synced);
    
    if (pending.length === 0) {
        updateSyncStatus(true, 'Nothing to sync');
        return;
    }
    
    updateSyncStatus(true, 'Syncing...');
    
    // Create export data
    const exportData = {
        device: 'ENKOMOS-Field',
        sync_date: new Date().toISOString(),
        entries: pending
    };
    
    // Option 1: Download as JSON file (works offline)
    const dataStr = JSON.stringify(exportData, null, 2);
    const dataBlob = new Blob([dataStr], {type: 'application/json'});
    const url = URL.createObjectURL(dataBlob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `enkomos_sync_${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
    
    // Mark as synced
    for (const entry of pending) {
        await markSynced(entry.id);
    }
    
    updateSyncStatus(true, `Synced ${pending.length} entries`);
    refreshUI();
    
    setTimeout(() => {
        updateSyncStatus(true, 'Offline');
    }, 3000);
}

// Update sync status display
function updateSyncStatus(isOnline, message) {
    const syncText = document.getElementById('syncText');
    const syncDot = document.querySelector('.sync-dot');
    
    if (isOnline && navigator.onLine) {
        syncDot.className = 'sync-dot online';
        syncText.textContent = message || 'Online';
    } else {
        syncDot.className = 'sync-dot offline';
        syncText.textContent = message || 'Offline';
    }
}

// Check internet connection
function checkConnection() {
    if (navigator.onLine) {
        updateSyncStatus(true, 'Online');
    } else {
        updateSyncStatus(false, 'Offline');
    }
}

// Refresh UI (update counts and history)
async function refreshUI() {
    const entries = await getAllEntries();
    const pending = entries.filter(e => !e.synced);
    const synced = entries.filter(e => e.synced);
    
    document.getElementById('pendingCount').innerText = pending.length;
    document.getElementById('syncedCount').innerText = synced.length;
    
    displayHistory(entries);
    displayRecommendations(entries);
}

// Display history
function displayHistory(entries) {
    const container = document.getElementById('historyList');
    
    if (entries.length === 0) {
        container.innerHTML = '<div class="empty-state">No entries yet. Add your first field data.</div>';
        return;
    }
    
    // Sort by date descending (newest first)
    const sorted = [...entries].reverse();
    
    let html = '';
    for (const entry of sorted) {
        const date = new Date(entry.date).toLocaleString();
        const issues = entry.issues || [];
        const issuesText = issues.join(', ');
        
        html += `
            <div class="history-item">
                <div class="history-header">
                    <span>📍 ${entry.location || 'Unknown location'}</span>
                    <span>${date}</span>
                </div>
                <div class="history-data">
                    <span>🌾 ${entry.crop}</span>
                    <span>🧪 pH: ${entry.soil_ph || '—'}</span>
                    <span>🌡️ ${entry.temp || '—'}°C</span>
                    <span>💧 ${entry.humidity || '—'}%</span>
                </div>
                ${issuesText ? `<div class="history-issues">⚠️ ${issuesText}</div>` : ''}
                <div style="margin-top: 8px;">
                    ${!entry.synced ? '<span class="pending-badge">Pending sync</span>' : '<span class="synced-badge">Synced</span>'}
                    <button onclick="deleteEntryUI(${entry.id})" style="float: right; background: none; border: none; color: #e74c3c; font-size: 0.7em;">Delete</button>
                </div>
            </div>
        `;
    }
    container.innerHTML = html;
}

// Delete entry UI
async function deleteEntryUI(id) {
    if (confirm('Delete this entry?')) {
        await deleteEntry(id);
        refreshUI();
    }
}

// Display recommendations based on data
function displayRecommendations(entries) {
    const container = document.getElementById('recommendationsList');
    const synced = entries.filter(e => e.synced);
    
    if (synced.length === 0) {
        container.innerHTML = '<div class="empty-state">Sync data to get AI recommendations.</div>';
        return;
    }
    
    // Analyze patterns
    const issues = {};
    for (const entry of synced) {
        if (entry.issues) {
            for (const issue of entry.issues) {
                issues[issue] = (issues[issue] || 0) + 1;
            }
        }
    }
    
    let html = '';
    
    // General recommendations based on common issues
    if (issues.yellow_leaves && issues.yellow_leaves > 0) {
        html += `
            <div class="rec-item">
                <div class="rec-title">💡 Nitrogen Deficiency Suspected</div>
                <div class="rec-text">Yellow lower leaves indicate possible nitrogen deficiency. Apply composted manure or nitrogen-rich fertilizer. Consider planting legumes as cover crop.</div>
            </div>
        `;
    }
    
    if (issues.purple_stems && issues.purple_stems > 0) {
        html += `
            <div class="rec-item">
                <div class="rec-title">💡 Phosphorus Deficiency Suspected</div>
                <div class="rec-text">Purple stems suggest phosphorus deficiency, especially in cold soil. Add rock phosphate or bone meal. Ensure soil temperature is adequate.</div>
            </div>
        `;
    }
    
    if (issues.leaf_scorch && issues.leaf_scorch > 0) {
        html += `
            <div class="rec-item">
                <div class="rec-title">💡 Potassium Deficiency Suspected</div>
                <div class="rec-text">Leaf edge burn indicates potassium deficiency. Apply wood ash, kelp meal, or potassium sulfate. Ensure adequate soil moisture.</div>
            </div>
        `;
    }
    
    if (issues.wilting && issues.wilting > 0) {
        html += `
            <div class="rec-item">
                <div class="rec-title">💡 Water Stress Detected</div>
                <div class="rec-text">Wilting suggests either under-watering or root issues. Check soil moisture. If soil is wet, check for root rot or pests.</div>
            </div>
        `;
    }
    
    if (issues.pest_damage && issues.pest_damage > 0) {
        html += `
            <div class="rec-item">
                <div class="rec-title">💡 Pest Damage Detected</div>
                <div class="rec-text">Inspect plants regularly. Consider neem oil or insecticidal soap. Encourage beneficial insects.</div>
            </div>
        `;
    }
    
    if (issues.fungus && issues.fungus > 0) {
        html += `
            <div class="rec-item">
                <div class="rec-title">💡 Fungal Issue Detected</div>
                <div class="rec-text">Improve air circulation. Reduce humidity. Apply copper fungicide or sulfur if severe.</div>
            </div>
        `;
    }
    
    if (html === '') {
        html = '<div class="empty-state">No specific recommendations. Keep up the good work!</div>';
    }
    
    // Add general advice
    html += `
        <div class="rec-item">
            <div class="rec-title">🌱 General Advice</div>
            <div class="rec-text">• Regular soil testing helps prevent deficiencies<br>
            • Mulch conserves water and suppresses weeds<br>
            • Crop rotation prevents pest buildup<br>
            • Record keeping helps track patterns over time</div>
        </div>
    `;
    
    container.innerHTML = html;
}

// Handle form submission
document.getElementById('dataForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    
    // Collect issues
    const issues = [];
    document.querySelectorAll('#tab-entry input[type="checkbox"]:checked').forEach(cb => {
        if (cb.value !== 'other_issue') {
            issues.push(cb.value);
        }
    });
    
    const otherIssueCheckbox = document.querySelector('#tab-entry input[value="other_issue"]');
    if (otherIssueCheckbox && otherIssueCheckbox.checked) {
        const otherText = document.getElementById('otherIssueText').value;
        if (otherText) issues.push(otherText);
    }
    
    // Collect photo (simplified - just store that photo exists)
    const photoFile = document.getElementById('photo').files[0];
    let photoData = null;
    if (photoFile) {
        photoData = photoFile.name;
    }
    
    const entry = {
        location: document.getElementById('location').value,
        crop: document.getElementById('crop').value,
        soil_ph: document.getElementById('soil_ph').value,
        soil_n: document.getElementById('soil_n').value,
        soil_p: document.getElementById('soil_p').value,
        soil_k: document.getElementById('soil_k').value,
        temp: document.getElementById('temp').value,
        humidity: document.getElementById('humidity').value,
        issues: issues,
        notes: document.getElementById('notes').value,
        has_photo: !!photoData,
        photo_name: photoData
    };
    
    if (!entry.location) {
        alert('Please enter a location/field name');
        return;
    }
    
    await saveEntry(entry);
    
    // Clear form
    document.getElementById('dataForm').reset();
    document.getElementById('otherIssueDiv').style.display = 'none';
    
    refreshUI();
    
    // Switch to history tab to show new entry
    document.querySelector('.tab[data-tab="history"]').click();
    
    alert('Entry saved offline!');
});

// Show/hide other issue textbox
document.querySelector('#tab-entry input[value="other_issue"]')?.addEventListener('change', (e) => {
    document.getElementById('otherIssueDiv').style.display = e.target.checked ? 'block' : 'none';
});

// Tab switching
document.querySelectorAll('.tab').forEach(tab => {
    tab.addEventListener('click', () => {
        const targetTab = tab.dataset.tab;
        
        // Update active tab
        document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        
        // Update content
        document.querySelectorAll('.tab-content').forEach(content => content.classList.remove('active'));
        document.getElementById(`tab-${targetTab}`).classList.add('active');
        
        currentTab = targetTab;
    });
});

// Sync button
document.getElementById('syncBtn').addEventListener('click', async () => {
    if (!navigator.onLine) {
        alert('You are offline. Data will be saved as JSON file for later upload to Estela.');
    }
    await syncToCloud();
});

// Clear history button
document.getElementById('clearHistoryBtn').addEventListener('click', async () => {
    if (confirm('WARNING: This will delete ALL field data. Are you sure?')) {
        await clearAllEntries();
        refreshUI();
        alert('All data cleared.');
    }
});

// Monitor online/offline status
window.addEventListener('online', () => updateSyncStatus(true, 'Online'));
window.addEventListener('offline', () => updateSyncStatus(false, 'Offline'));

// Initialize
async function init() {
    await initDB();
    checkConnection();
    refreshUI();
    
    // Check for other issue checkbox existence
    const otherCheckbox = document.querySelector('#tab-entry input[value="other_issue"]');
    if (otherCheckbox) {
        otherCheckbox.addEventListener('change', (e) => {
            document.getElementById('otherIssueDiv').style.display = e.target.checked ? 'block' : 'none';
        });
    }
}

init();
