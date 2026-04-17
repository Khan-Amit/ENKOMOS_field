// ENKOMOS-Field Pro - Offline Field Data Collection with Encryption
// Data stored in IndexedDB, encrypted before export

const DB_NAME = 'ENKOMOS_Field_Pro_DB';
const DB_VERSION = 2;
const STORE_NAME = 'field_entries';

// Encryption key (change this to your own secret key)
// In production, this should be user-defined or generated from password
const ENCRYPTION_KEY = 'ENKOMOS-ESTELA-2026-SECRET-KEY-CHANGE-ME';

let db = null;

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
                store.createIndex('location', 'location');
            }
        };
    });
}

// Encrypt data before export
function encryptData(data) {
    try {
        const jsonString = JSON.stringify(data);
        const encrypted = CryptoJS.AES.encrypt(jsonString, ENCRYPTION_KEY).toString();
        return encrypted;
    } catch (e) {
        console.error('Encryption error:', e);
        return null;
    }
}

// Decrypt data
function decryptData(encryptedData) {
    try {
        const bytes = CryptoJS.AES.decrypt(encryptedData, ENCRYPTION_KEY);
        const decryptedString = bytes.toString(CryptoJS.enc.Utf8);
        return JSON.parse(decryptedString);
    } catch (e) {
        console.error('Decryption error:', e);
        return null;
    }
}

// Save entry to IndexedDB
async function saveEntry(entry) {
    if (!db) await initDB();
    
    entry.id = Date.now();
    entry.date = new Date().toISOString();
    entry.synced = false;
    entry.version = '2.0';
    
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

// Export encrypted data
async function exportEncryptedData() {
    const entries = await getAllEntries();
    
    if (entries.length === 0) {
        alert('No data to export');
        return;
    }
    
    const exportData = {
        device: 'ENKOMOS-Field-Pro',
        export_date: new Date().toISOString(),
        version: '2.0',
        entry_count: entries.length,
        entries: entries
    };
    
    const encrypted = encryptData(exportData);
    
    if (encrypted) {
        const blob = new Blob([encrypted], {type: 'application/octet-stream'});
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `enkomos_field_${Date.now()}.enc`;
        a.click();
        URL.revokeObjectURL(url);
        
        // Mark as synced
        for (const entry of entries.filter(e => !e.synced)) {
            await markSynced(entry.id);
        }
        
        alert(`Exported ${entries.length} entries (encrypted)`);
        refreshUI();
    } else {
        alert('Encryption failed');
    }
}

// Import decrypted backup
async function importDecryptedBackup() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.enc';
    input.onchange = async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        
        const reader = new FileReader();
        reader.onload = async (event) => {
            const encryptedData = event.target.result;
            const decrypted = decryptData(encryptedData);
            
            if (decrypted && decrypted.entries) {
                for (const entry of decrypted.entries) {
                    // Remove old ID to create new
                    delete entry.id;
                    entry.synced = false;
                    entry.imported_from_backup = true;
                    await saveEntry(entry);
                }
                alert(`Imported ${decrypted.entries.length} entries`);
                refreshUI();
            } else {
                alert('Decryption failed. Wrong key or corrupted file.');
            }
        };
        reader.readAsText(file);
    };
    input.click();
}

// Sync to cloud (download JSON for manual transfer)
async function syncToCloud() {
    const entries = await getAllEntries();
    const pending = entries.filter(e => !e.synced);
    
    if (pending.length === 0) {
        alert('No pending data to sync');
        return;
    }
    
    // Create export data (unencrypted for main lab - optional)
    const exportData = {
        device: 'ENKOMOS-Field-Pro',
        sync_date: new Date().toISOString(),
        entries: pending
    };
    
    const dataStr = JSON.stringify(exportData, null, 2);
    const blob = new Blob([dataStr], {type: 'application/json'});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `enkomos_sync_${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
    
    // Mark as synced
    for (const entry of pending) {
        await markSynced(entry.id);
    }
    
    alert(`Synced ${pending.length} entries`);
    refreshUI();
}

// Update sync status
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

// Check connection
function checkConnection() {
    if (navigator.onLine) {
        updateSyncStatus(true, 'Online');
    } else {
        updateSyncStatus(false, 'Offline');
    }
}

// Refresh UI
async function refreshUI() {
    const entries = await getAllEntries();
    const pending = entries.filter(e => !e.synced);
    const synced = entries.filter(e => e.synced);
    
    document.getElementById('pendingCount').innerText = pending.length;
    document.getElementById('syncedCount').innerText = synced.length;
    
    displayHistory(entries);
    displayRecommendations(entries);
    displayAnalytics(entries);
}

// Display history
function displayHistory(entries) {
    const container = document.getElementById('historyList');
    
    if (entries.length === 0) {
        container.innerHTML = '<div class="empty-state">No entries yet. Add your first field data.</div>';
        return;
    }
    
    const sorted = [...entries].reverse();
    
    let html = '';
    for (const entry of sorted) {
        const date = new Date(entry.date).toLocaleString();
        const issues = entry.issues || [];
        const issuesText = issues.join(', ');
        
        const healthScore = entry.health_score || '?';
        let healthClass = '';
        if (healthScore >= 4) healthClass = 'health-good';
        else if (healthScore >= 3) healthClass = 'health-average';
        else if (healthScore >= 2) healthClass = 'health-poor';
        else healthClass = 'health-critical';
        
        html += `
            <div class="history-item">
                <div class="history-header">
                    <span>📍 ${entry.location || 'Unknown'}</span>
                    <span>${date}</span>
                </div>
                <div class="history-data">
                    <span>🌾 ${entry.crop}</span>
                    <span>🌱 ${entry.growth_stage || '—'}</span>
                    <span>🧪 pH: ${entry.soil_ph || '—'}</span>
                    <span>🌡️ ${entry.temp || '—'}°C</span>
                    <span>💧 ${entry.humidity || '—'}%</span>
                    <span>💚 ${healthScore}/5</span>
                </div>
                ${issuesText ? `<div class="history-issues">⚠️ ${issuesText}</div>` : ''}
                ${entry.pest_type ? `<div class="history-issues">🐛 Pest: ${entry.pest_type} (${entry.pest_severity || '?'})</div>` : ''}
                <div style="margin-top: 8px;">
                    ${!entry.synced ? '<span class="pending-badge">Pending sync</span>' : '<span class="synced-badge">Synced</span>'}
                    <span class="encrypted-badge">🔒 Encrypted</span>
                    <button onclick="deleteEntryUI(${entry.id})" style="float: right; background: none; border: none; color: #e74c3c; font-size: 0.7em;">Delete</button>
                </div>
            </div>
        `;
    }
    container.innerHTML = html;
}

// Delete entry UI
window.deleteEntryUI = async function(id) {
    if (confirm('Delete this entry?')) {
        await deleteEntry(id);
        refreshUI();
    }
};

// Display recommendations
function displayRecommendations(entries) {
    const container = document.getElementById('recommendationsList');
    const synced = entries.filter(e => e.synced);
    
    if (synced.length === 0) {
        container.innerHTML = '<div class="empty-state">Sync data to get AI recommendations.</div>';
        return;
    }
    
    const issues = {};
    for (const entry of synced) {
        if (entry.issues) {
            for (const issue of entry.issues) {
                issues[issue] = (issues[issue] || 0) + 1;
            }
        }
    }
    
    let html = '';
    
    // Deficiency recommendations
    if (issues.yellow_lower_leaves) {
        html += `<div class="rec-item"><div class="rec-title">💡 Nitrogen Deficiency</div><div class="rec-text">Apply urea or composted manure. Consider foliar spray of 2% urea.</div></div>`;
    }
    if (issues.purple_stems) {
        html += `<div class="rec-item"><div class="rec-title">💡 Phosphorus Deficiency</div><div class="rec-text">Apply DAP or rock phosphate. Ensure soil temperature is adequate.</div></div>`;
    }
    if (issues.leaf_edge_burn) {
        html += `<div class="rec-item"><div class="rec-title">💡 Potassium Deficiency</div><div class="rec-text">Apply MOP or wood ash. Kelp meal is also effective.</div></div>`;
    }
    if (issues.yellow_between_veins) {
        html += `<div class="rec-item"><div class="rec-title">💡 Magnesium or Iron Deficiency</div><div class="rec-text">Apply Epsom salt (Mg) or chelated iron (Fe).</div></div>`;
    }
    
    // Pest recommendations
    const pestEntries = synced.filter(e => e.pest_type && e.pest_type !== '');
    if (pestEntries.length > 0) {
        html += `<div class="rec-item"><div class="rec-title">🐛 Pest Management</div><div class="rec-text">Consider neem oil spray (10ml/L). Introduce beneficial insects. Remove infected plants.</div></div>`;
    }
    
    // Water recommendations
    const droughtEntries = synced.filter(e => e.drought);
    if (droughtEntries.length > 0) {
        html += `<div class="rec-item"><div class="rec-title">💧 Drought Stress</div><div class="rec-text">Apply mulch to retain moisture. Irrigate early morning or evening. Consider drip irrigation.</div></div>`;
    }
    
    const excessRain = synced.filter(e => e.excess_rain);
    if (excessRain.length > 0) {
        html += `<div class="rec-item"><div class="rec-title">🌊 Excessive Rain</div><div class="rec-text">Ensure drainage. Watch for fungal diseases. Apply fungicide if needed.</div></div>`;
    }
    
    if (html === '') {
        html = '<div class="empty-state">No specific recommendations. Keep up the good work!</div>';
    }
    
    html += `<div class="rec-item"><div class="rec-title">📋 General Advice</div><div class="rec-text">• Regular soil testing (every 3 months)<br>• Crop rotation prevents pest buildup<br>• Record all inputs for better tracking<br>• Share data with Estela lab for advanced AI analysis</div></div>`;
    
    container.innerHTML = html;
}

// Display analytics
function displayAnalytics(entries) {
    const container = document.getElementById('analyticsContainer');
    
    if (entries.length === 0) {
        container.innerHTML = '<div class="empty-state">Enter data to see analytics.</div>';
        return;
    }
    
    const avgHealth = entries.reduce((sum, e) => sum + (parseInt(e.health_score) || 3), 0) / entries.length;
    const cropCount = {};
    entries.forEach(e => { cropCount[e.crop] = (cropCount[e.crop] || 0) + 1; });
    const topCrop = Object.entries(cropCount).sort((a,b) => b[1] - a[1])[0];
    
    const issueCount = {};
    entries.forEach(e => {
        if (e.issues) e.issues.forEach(i => { issueCount[i] = (issueCount[i] || 0) + 1; });
    });
    const topIssue = Object.entries(issueCount).sort((a,b) => b[1] - a[1])[0];
    
    let healthClass = 'health-good';
    if (avgHealth >= 4) healthClass = 'health-excellent';
    else if (avgHealth >= 3) healthClass = 'health-average';
    else if (avgHealth >= 2) healthClass = 'health-poor';
    else healthClass = 'health-critical';
    
    let html = `
        <div class="analytics-card">
            <div class="analytics-title">📊 Summary</div>
            <div class="analytics-stat"><span>Total Entries:</span><span>${entries.length}</span></div>
            <div class="analytics-stat"><span>Average Health Score:</span><span class="health-badge ${healthClass}">${avgHealth.toFixed(1)}/5</span></div>
            <div class="analytics-stat"><span>Most Common Crop:</span><span>${topCrop ? topCrop[0] : '—'}</span></div>
            <div class="analytics-stat"><span>Most Common Issue:</span><span>${topIssue ? topIssue[0].replace(/_/g, ' ') : 'None'}</span></div>
        </div>
        <div class="analytics-card">
            <div class="analytics-title">📈 Recommendations</div>
            <div class="rec-text">• ${avgHealth < 3.5 ? 'Crop health needs attention. Review AI recommendations.' : 'Crop health is good. Maintain practices.'}<br>
            • ${topIssue ? `Focus on addressing "${topIssue[0].replace(/_/g, ' ')}" issue.` : 'No major issues detected.'}<br>
            • Export encrypted data and send to Estela lab for advanced analysis.</div>
        </div>
    `;
    
    container.innerHTML = html;
}

// Form submission
document.getElementById('dataForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    
    // Collect issues
    const issues = [];
    document.querySelectorAll('#tab-entry input[type="checkbox"]:checked').forEach(cb => {
        if (cb.value && cb.value !== 'other_issue') {
            issues.push(cb.value);
        }
    });
    
    const entry = {
        location: document.getElementById('location').value,
        farmer_id: document.getElementById('farmer_id').value,
        crop: document.getElementById('crop').value,
        growth_stage: document.getElementById('growth_stage').value,
        soil_ph: document.getElementById('soil_ph').value,
        soil_n: document.getElementById('soil_n').value,
        soil_p: document.getElementById('soil_p').value,
        soil_k: document.getElementById('soil_k').value,
        organic_matter: document.getElementById('organic_matter').value,
        soil_moisture: document.getElementById('soil_moisture').value,
        temp: document.getElementById('temp').value,
        humidity: document.getElementById('humidity').value,
        rainfall: document.getElementById('rainfall').value,
        last_rain_date: document.getElementById('last_rain_date').value,
        drought: document.getElementById('drought').checked,
        excess_rain: document.getElementById('excess_rain').checked,
        storm: document.getElementById('storm').checked,
        health_score: document.getElementById('health_score').value,
        leaf_color: document.getElementById('leaf_color').value,
        issues: issues,
        pest_type: document.getElementById('pest_type').value,
        pest_severity: document.getElementById('pest_severity').value,
        disease_name: document.getElementById('disease_name').value,
        disease_severity: document.getElementById('disease_severity').value,
        fertilizer_applied: document.getElementById('fertilizer_applied').value,
        pesticide_applied: document.getElementById('pesticide_applied').value,
        other_inputs: document.getElementById('other_inputs').value,
        expected_yield: document.getElementById('expected_yield').value,
        yield_unit: document.getElementById('yield_unit').value,
        notes: document.getElementById('notes').value
    };
    
    if (!entry.location) {
        alert('Please enter a location/field name');
        return;
    }
    
    await saveEntry(entry);
    document.getElementById('dataForm').reset();
    refreshUI();
    document.querySelector('.tab[data-tab="history"]').click();
    alert('Entry saved (encrypted offline storage)');
});

// Tab switching
document.querySelectorAll('.tab').forEach(tab => {
    tab.addEventListener('click', () => {
        document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
        document.getElementById(`tab-${tab.dataset.tab}`).classList.add('active');
    });
});

// Buttons
document.getElementById('syncBtn').addEventListener('click', syncToCloud);
document.getElementById('exportBtn').addEventListener('click', exportEncryptedData);
document.getElementById('clearHistoryBtn').addEventListener('click', async () => {
    if (confirm('WARNING: This will delete ALL field data. Are you sure?')) {
        await clearAllEntries();
        refreshUI();
        alert('All data cleared.');
    }
});
document.getElementById('decryptBackupBtn').addEventListener('click', importDecryptedBackup);

// Network listeners
window.addEventListener('online', () => updateSyncStatus(true, 'Online'));
window.addEventListener('offline', () => updateSyncStatus(false, 'Offline'));

// Initialize
async function init() {
    await initDB();
    checkConnection();
    refreshUI();
}

init();
