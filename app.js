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
                
                <button onclick="initiatePayment('basic
