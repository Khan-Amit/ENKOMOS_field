// ==================== ENKOMOS-Field Pro ====================
// Complete app with membership system, offline storage, encryption, and live API data

// ==================== CONFIGURATION ====================
const ENCRYPTION_KEY = 'ENKOMOS-ESTELA-2026-SECRET-KEY-CHANGE-ME';
const DB_NAME = 'ENKOMOS_Field_Pro_DB';
const DB_VERSION = 2;
const STORE_NAME = 'field_entries';

// Membership configuration
const MEMBERSHIP_API = 'https://api.enkomos.com/v1';
const MEMBERSHIP_STORAGE_KEY = 'enkomos_membership';

// ==================== GLOBAL STATE ====================
let db = null;
let membership = {
    tier: 'free',
    expires_at: null,
    token: null,
    last_checked: null
};

// ==================== ENCRYPTION ====================
function encryptData(data) {
    try {
        const jsonString = JSON.stringify(data);
        return CryptoJS.AES.encrypt(jsonString, ENCRYPTION_KEY).toString();
    } catch(e) { console.error('Encryption error:', e); return null; }
}

function decryptData(encryptedData) {
    try {
        const bytes = CryptoJS.AES.decrypt(encryptedData, ENCRYPTION_KEY);
        return JSON.parse(bytes.toString(CryptoJS.enc.Utf8));
    } catch(e) { console.error('Decryption error:', e); return null; }
}

// ==================== INDEXEDDB ====================
function initDB() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);
        request.onerror = () => reject(request.error);
        request.onsuccess = () => { db = request.result; resolve(db); };
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

async function markSynced(id) {
    if (!db) await initDB();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction([STORE_NAME], 'readwrite');
        const store = transaction.objectStore(STORE_NAME);
        const getRequest = store.get(id);
        getRequest.onsuccess = () => {
            const entry = getRequest.result;
            if (entry) { entry.synced = true; store.put(entry); }
            resolve();
        };
        getRequest.onerror = () => reject(getRequest.error);
    });
}

// ==================== MEMBERSHIP SYSTEM ====================
function loadMembership() {
    const stored = localStorage.getItem(MEMBERSHIP_STORAGE_KEY);
    if (stored) {
        try {
            const data = JSON.parse(stored);
            membership = { ...membership, ...data };
        } catch(e) { console.error('Failed to load membership', e); }
    }
    checkMembershipValidity();
    return membership;
}

function saveMembership() {
    localStorage.setItem(MEMBERSHIP_STORAGE_KEY, JSON.stringify({
        tier: membership.tier,
        expires_at: membership.expires_at,
        token: membership.token,
        last_checked: membership.last_checked
    }));
}

function checkMembershipValidity() {
    if (membership.tier === 'free') return true;
    
    if (!membership.expires_at) return false;
    
    const now = new Date();
    const expiry = new Date(membership.expires_at);
    
    if (now > expiry) {
        membership.tier = 'free';
        membership.token = null;
        saveMembership();
        showExpiryWarning();
        return false;
    }
    return true;
}

function showExpiryWarning() {
    const warning = document.getElementById('expiryWarning');
    if (warning) warning.style.display = 'block';
}

function hideExpiryWarning() {
    const warning = document.getElementById('expiryWarning');
    if (warning) warning.style.display = 'none';
}

function canUseFeature(feature) {
    if (membership.tier === 'free') return false;
    
    const graceDays = getGraceDays();
    
    switch(feature) {
        case 'cloud_sync':
            return membership.tier !== 'free' && graceDays <= 7;
        case 'live_data':
            return membership.tier !== 'free' && graceDays <= 7;
        case 'lab_submission':
            return ['pro', 'enterprise'].includes(membership.tier) && graceDays <= 7;
        case 'consultation':
            return membership.tier === 'enterprise' && graceDays <= 7;
        case 'advanced_ai':
            return ['pro', 'enterprise'].includes(membership.tier) && graceDays <= 7;
        case 'central_updates':
            return membership.tier !== 'free' && graceDays <= 30;
        default:
            return false;
    }
}

function getGraceDays() {
    if (membership.tier === 'free' || !membership.expires_at) return 0;
    const expiry = new Date(membership.expires_at);
    const now = new Date();
    return Math.max(0, (now - expiry) / (1000 * 60 * 60 * 24));
}

function updateUIForMembership() {
    const isMember = membership.tier !== 'free';
    const badge = document.getElementById('membershipBadge');
    const cloudFeatures = document.querySelectorAll('.cloud-feature');
    
    if (isMember) {
        badge.className = 'membership-badge paid';
        badge.innerHTML = `⭐ ${membership.tier.toUpperCase()} MEMBER | Click to manage`;
        cloudFeatures.forEach(el => el.style.display = 'block');
        hideExpiryWarning();
    } else {
        badge.className = 'membership-badge free';
        badge.innerHTML = '🔓 FREE TIER | Upgrade';
        cloudFeatures.forEach(el => el.style.display = 'none');
    }
}

async function verifyMembershipWithServer() {
    if (!navigator.onLine) return;
    
    try {
        const response = await fetch(`${MEMBERSHIP_API}/verify`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                device_id: getDeviceId(),
                token: membership.token
            })
        });
        
        const result = await response.json();
        
        if (result.valid) {
            membership.tier = result.tier;
            membership.expires_at = result.expires_at;
            membership.token = result.token;
        } else {
            membership.tier = 'free';
            membership.token = null;
        }
        
        membership.last_checked = Date.now();
        saveMembership();
        updateUIForMembership();
        
    } catch(e) {
        console.error('Membership verification failed', e);
    }
}

function getDeviceId() {
    let deviceId = localStorage.getItem('enkomos_device_id');
    if (!deviceId) {
        deviceId = 'dev_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
        localStorage.setItem('enkomos_device_id', deviceId);
    }
    return deviceId;
}

function showMembershipModal() {
    const modalHtml = `
        <div id="membershipModal" style="position:fixed; top:0; left:0; right:0; bottom:0; background:rgba(0,0,0,0.95); z-index:1000; display:flex; align-items:center; justify-content:center; padding:20px;">
            <div style="background:#1a5c3a; max-width:400px; width:100%; border-radius:20px; padding:20px;">
                <h2 style="color:#ffd700; margin-bottom:10px;">Upgrade ENKOMOS</h2>
                <p style="margin-bottom:20px;">Get cloud sync, live satellite data, lab analysis, and expert advice.</p>
                
                <div style="margin:10px 0; padding:12px; background:rgba(0,0,0,0.3); border-radius:12px;">
                    <strong>🌟 Basic - $5/month</strong><br>
                    Cloud sync, live data, quarterly updates
                </div>
                
                <div style="margin:10px 0; padding:12px; background:rgba(0,0,0,0.3); border-radius:12px;">
                    <strong>⚡ Pro - $20/month</strong><br>
                    Everything + lab analysis (5 samples/year) + advanced AI
                </div>
                
                <div style="margin:10px 0; padding:12px; background:rgba(0,0,0,0.3); border-radius:12px;">
                    <strong>🏢 Enterprise - $50/month</strong><br>
                    Everything + 50 samples + expert consultation
                </div>
                
                <button onclick="initiatePayment('basic')" style="width:100%; background:#ffd700; color:#0a3e2a; padding:12px; border:none; border-radius:30px; margin-top:10px; font-weight:bold;">Upgrade Now</button>
                <button onclick="closeMembershipModal()" style="width:100%; background:rgba(255,255,255,0.2); color:white; padding:12px; border:none; border-radius:30px; margin-top:10px;">Cancel</button>
                
                <p style="font-size:0.7em; text-align:center; margin-top:15px; opacity:0.6;">Contact us for NGO/Government pricing</p>
            </div>
        </div>
    `;
    document.body.insertAdjacentHTML('beforeend', modalHtml);
}

function closeMembershipModal() {
    const modal = document.getElementById('membershipModal');
    if (modal) modal.remove();
}

window.initiatePayment = function(tier) {
    alert(`To upgrade to ${tier} tier:\n\nWhatsApp: +[Your Number]\nEmail: sales@enkomos.com\n\nOr visit our website to pay online.`);
    closeMembershipModal();
};

// ==================== LIVE DATA API INTEGRATION ====================
// Free APIs: SoilGrids, Open-Meteo, NASA POWER
// No API keys required for basic usage

function getLocation() {
    return new Promise((resolve, reject) => {
        if (!navigator.geolocation) {
            reject(new Error("Geolocation not supported by your browser"));
            return;
        }
        navigator.geolocation.getCurrentPosition(resolve, reject, {
            enableHighAccuracy: true,
            timeout: 10000
        });
    });
}

async function fetchSoilData(lat, lon) {
    try {
        const url = `https://rest.isric.org/soilgrids/v2.0/properties/query?lon=${lon}&lat=${lat}&property=phh2o&depth=0-5cm&value=mean`;
        const response = await fetch(url);
        const data = await response.json();
        
        if (data.properties && data.properties.phh2o && data.properties.phh2o.mean) {
            const ph = data.properties.phh2o.mean;
            return { ph: ph.toFixed(1) };
        }
        return null;
    } catch (e) {
        console.error('Soil data fetch error:', e);
        return null;
    }
}

async function fetchWeatherData(lat, lon) {
    try {
        const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current_weather=true&hourly=temperature_2m,relativehumidity_2m,precipitation`;
        const response = await fetch(url);
        const data = await response.json();
        
        let result = {};
        
        if (data.current_weather) {
            result.temp = data.current_weather.temperature;
            result.humidity = data.current_weather.humidity || '';
        }
        
        if (data.hourly && data.hourly.precipitation) {
            const last7days = data.hourly.precipitation.slice(-168);
            const totalRain = last7days.reduce((a, b) => a + b, 0);
            result.rainfall = totalRain.toFixed(1);
        }
        
        return result;
    } catch (e) {
        console.error('Weather data fetch error:', e);
        return null;
    }
}

async function fetchSoilMoisture(lat, lon) {
    try {
        const url = `https://power.larc.nasa.gov/api/temporal/daily/point?parameters=GWETROOT,GWETPROF&community=AG&longitude=${lon}&latitude=${lat}&format=JSON`;
        const response = await fetch(url);
        const data = await response.json();
        
        if (data.properties && data.properties.parameter && data.properties.parameter.GWETROOT) {
            const moistureData = data.properties.parameter.GWETROOT;
            const values = Object.values(moistureData);
            if (values.length > 0) {
                const avgMoisture = values.slice(-7).reduce((a, b) => a + b, 0) / Math.min(7, values.length);
                
                let moistureText = 'moist';
                if (avgMoisture < 0.2) moistureText = 'very_dry';
                else if (avgMoisture < 0.4) moistureText = 'dry';
                else if (avgMoisture < 0.6) moistureText = 'moist';
                else if (avgMoisture < 0.8) moistureText = 'wet';
                else moistureText = 'wet';
                
                return { moisture: moistureText, moisture_value: avgMoisture };
            }
        }
        return null;
    } catch (e) {
        console.error('Soil moisture fetch error:', e);
        return null;
    }
}

async function fetchAllLiveData() {
    const btn = document.getElementById('getLiveDataBtn');
    if (!btn) return;
    
    // Check membership - if free, show upgrade modal
    if (!canUseFeature('live_data')) {
        alert('Live satellite data is a Pro feature.\n\nUpgrade to Basic ($5/mo) or Pro ($20/mo) to unlock:\n\n• Automatic soil pH from satellites\n• Live weather and rainfall data\n• NASA soil moisture readings\n• Cloud backup and sync\n• Advanced AI recommendations\n\nContact us for NGO/Government pricing.');
        showMembershipModal();
        return;
    }
    
    const originalText = btn.innerText;
    
    try {
        btn.innerText = '📍 Getting location...';
        btn.disabled = true;
        
        const position = await getLocation();
        const { latitude, longitude } = position.coords;
        
        btn.innerText = '🌍 Fetching soil pH from satellites...';
        const soilData = await fetchSoilData(latitude, longitude);
        
        btn.innerText = '🌤️ Fetching weather data...';
        const weatherData = await fetchWeatherData(latitude, longitude);
        
        btn.innerText = '💧 Fetching soil moisture from NASA...';
        const moistureData = await fetchSoilMoisture(latitude, longitude);
        
        // Populate form fields
        if (soilData && soilData.ph) {
            const phField = document.getElementById('soil_ph');
            if (phField) phField.value = soilData.ph;
        }
        
        if (weatherData) {
            const tempField = document.getElementById('temp');
            const humidityField = document.getElementById('humidity');
            const rainfallField = document.getElementById('rainfall');
            
            if (tempField && weatherData.temp) tempField.value = weatherData.temp;
            if (humidityField && weatherData.humidity) humidityField.value = weatherData.humidity;
            if (rainfallField && weatherData.rainfall) rainfallField.value = weatherData.rainfall;
        }
        
        if (moistureData && moistureData.moisture) {
            const moistureField = document.getElementById('soil_moisture');
            if (moistureField) moistureField.value = moistureData.moisture;
        }
        
        btn.innerText = '✅ Data loaded!';
        setTimeout(() => {
            btn.innerText = originalText;
            btn.disabled = false;
        }, 2000);
        
        let summary = 'Live satellite data loaded successfully!\n\n';
        if (soilData) summary += `🌱 Soil pH: ${soilData.ph}\n`;
        if (weatherData && weatherData.temp) summary += `🌡️ Temperature: ${weatherData.temp}°C\n`;
        if (weatherData && weatherData.rainfall) summary += `☔ Rainfall (7 days): ${weatherData.rainfall} mm\n`;
        if (moistureData) summary += `💧 Soil moisture: ${moistureData.moisture.replace('_', ' ')}\n\n`;
        summary += 'Review and adjust if needed, then save your entry.';
        
        alert(summary);
        
    } catch (error) {
        console.error('Live data error:', error);
        let errorMsg = 'Could not get live data.\n\n';
        if (error.code === 1) errorMsg += 'Please allow location access to use this feature.';
        else if (error.code === 2) errorMsg += 'Location unavailable. Check your GPS.';
        else if (error.code === 3) errorMsg += 'Location request timed out. Try again.';
        else errorMsg += 'Network error. Check your connection.';
        
        alert(errorMsg);
        btn.innerText = originalText;
        btn.disabled = false;
    }
}

// ==================== SYNC & EXPORT ====================
async function syncToCloud() {
    if (!canUseFeature('cloud_sync')) {
        alert('Cloud sync requires a membership. Please upgrade to Basic, Pro, or Enterprise tier.');
        showMembershipModal();
        return;
    }
    
    const entries = await getAllEntries();
    const pending = entries.filter(e => !e.synced);
    
    if (pending.length === 0) {
        alert('No pending data to sync');
        return;
    }
    
    const exportData = {
        device_id: getDeviceId(),
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
    
    for (const entry of pending) {
        await markSynced(entry.id);
    }
    
    alert(`Synced ${pending.length} entries`);
    refreshUI();
}

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
        alert(`Exported ${entries.length} entries (encrypted)`);
    } else {
        alert('Encryption failed');
    }
}

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

// ==================== UI RENDERING ====================
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
        
        html += `
            <div class="history-item">
                <div class="history-header"><span>📍 ${entry.location || 'Unknown'}</span><span>${date}</span></div>
                <div class="history-data">
                    <span>🌾 ${entry.crop}</span>
                    <span>🌱 ${entry.growth_stage || '—'}</span>
                    <span>🧪 pH: ${entry.soil_ph || '—'}</span>
                    <span>🌡️ ${entry.temp || '—'}°C</span>
                    <span>💧 ${entry.humidity || '—'}%</span>
                    <span>💚 ${healthScore}/5</span>
                </div>
                ${issuesText ? `<div class="history-issues">⚠️ ${issuesText}</div>` : ''}
                ${entry.pest_type && entry.pest_type !== '' ? `<div class="history-issues">🐛 Pest: ${entry.pest_type} (${entry.pest_severity || '?'})</div>` : ''}
                <div style="margin-top: 8px;">
                    ${!entry.synced ? '<span class="pending-badge">Pending sync</span>' : '<span class="synced-badge">Synced</span>'}
                    <span class="encrypted-badge">🔒 Encrypted</span>
                    <button onclick="window.deleteEntry(${entry.id})" style="float: right; background: none; border: none; color: #e74c3c; font-size: 0.7em;">Delete</button>
                </div>
            </div>
        `;
    }
    container.innerHTML = html;
}

window.deleteEntry = async function(id) {
    if (confirm('Delete this entry?')) {
        await deleteEntry(id);
        refreshUI();
    }
};

function displayRecommendations(entries) {
    const container = document.getElementById('recommendationsList');
    if (entries.length === 0) {
        container.innerHTML = '<div class="empty-state">Add entries to get AI recommendations.</div>';
        return;
    }
    
    const issues = {};
    for (const entry of entries) {
        if (entry.issues) {
            for (const issue of entry.issues) {
                issues[issue] = (issues[issue] || 0) + 1;
            }
        }
    }
    
    let html = '';
    if (issues.yellow_lower_leaves) html += `<div class="rec-item"><div class="rec-title">💡 Nitrogen Deficiency</div><div class="rec-text">Apply urea or composted manure. Consider foliar spray of 2% urea.</div></div>`;
    if (issues.purple_stems) html += `<div class="rec-item"><div class="rec-title">💡 Phosphorus Deficiency</div><div class="rec-text">Apply DAP or rock phosphate. Ensure soil temperature is adequate.</div></div>`;
    if (issues.leaf_edge_burn) html += `<div class="rec-item"><div class="rec-title">💡 Potassium Deficiency</div><div class="rec-text">Apply MOP or wood ash. Kelp meal is also effective.</div></div>`;
    if (issues.yellow_between_veins) html += `<div class="rec-item"><div class="rec-title">💡 Magnesium or Iron Deficiency</div><div class="rec-text">Apply Epsom salt (Mg) or chelated iron (Fe).</div></div>`;
    
    if (html === '') html = '<div class="empty-state">No specific deficiencies detected. Keep up the good work!</div>';
    
    html += `<div class="rec-item"><div class="rec-title">📋 General Advice</div><div class="rec-text">• Regular soil testing (every 3 months)<br>• Crop rotation prevents pest buildup<br>• Record all inputs for better tracking</div></div>`;
    container.innerHTML = html;
}

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
        </div>
        <div class="analytics-card">
            <div class="analytics-title">📈 Recommendations</div>
            <div class="rec-text">• ${avgHealth < 3.5 ? 'Crop health needs attention. Review AI recommendations.' : 'Crop health is good. Maintain practices.'}<br>
            • ${entries.length < 10 ? 'Add more data points for better analytics.' : 'Data set is robust. Continue regular monitoring.'}<br>
            • Upgrade to Pro for live satellite data.</div>
        </div>
    `;
    container.innerHTML = html;
}

// ==================== FORM SUBMISSION ====================
document.getElementById('dataForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const issues = [];
    document.querySelectorAll('#tab-entry input[type="checkbox"]:checked').forEach(cb => {
        if (cb.value && cb.value !== 'other_issue') issues.push(cb.value);
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

// ==================== TAB SWITCHING ====================
document.querySelectorAll('.tab').forEach(tab => {
    tab.addEventListener('click', () => {
        document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
        document.getElementById(`tab-${tab.dataset.tab}`).classList.add('active');
    });
});

// ==================== BUTTON HANDLERS ====================
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

// Live data button
const liveDataBtn = document.getElementById('getLiveDataBtn');
if (liveDataBtn) {
    liveDataBtn.addEventListener('click', fetchAllLiveData);
}

// Network status
window.addEventListener('online', () => {
    const syncDot = document.querySelector('.sync-dot');
    const syncText = document.getElementById('syncText');
    syncDot.className = 'sync-dot online';
    syncText.textContent = 'Online';
    verifyMembershipWithServer();
});
window.addEventListener('offline', () => {
    const syncDot = document.querySelector('.sync-dot');
    const syncText = document.getElementById('syncText');
    syncDot.className = 'sync-dot offline';
    syncText.textContent = 'Offline';
});

// ==================== INITIALIZATION ====================
async function init() {
    await initDB();
    loadMembership();
    updateUIForMembership();
    
    if (navigator.onLine) {
        const syncDot = document.querySelector('.sync-dot');
        const syncText = document.getElementById('syncText');
        syncDot.className = 'sync-dot online';
        syncText.textContent = 'Online';
        await verifyMembershipWithServer();
    }
    
    refreshUI();
    
    setInterval(() => {
        checkMembershipValidity();
        if (navigator.onLine) verifyMembershipWithServer();
    }, 24 * 60 * 60 * 1000);
}

init();
