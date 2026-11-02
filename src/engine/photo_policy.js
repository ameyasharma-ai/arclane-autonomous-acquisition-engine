/**
 * ArcLane Persistent Photo Policy Manager
 * 
 * Controls photo asset resolution strategy across the entire engine:
 * 1. "auto" (Default): Crawl Google Maps, verify via Gemini Vision (score >= 7-8).
 *    If quality authentic photos are found, use them. Otherwise, seamlessly fall back
 *    to our verified curated stock library.
 * 2. "stock_only": Always use verified high-resolution commercial stock photos.
 * 3. "maps_only": Strictly use authentic Google Maps photos.
 * 
 * Persists settings in data/photo_settings.json across process restarts.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { getVerifiedNicheAssets } from './verified_asset_catalog.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SETTINGS_FILE = path.join(__dirname, '../../data/photo_settings.json');

export class PhotoPolicyManager {
    constructor() {
        this.currentMode = 'auto'; // 'auto' | 'stock_only' | 'maps_only'
        this.leadOverrides = {}; // { [clientId]: 'stock' | 'maps' }
        this.loadSettings();
    }

    loadSettings() {
        try {
            if (fs.existsSync(SETTINGS_FILE)) {
                const data = JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf8'));
                if (['auto', 'stock_only', 'maps_only'].includes(data.mode)) {
                    this.currentMode = data.mode;
                }
                if (data.leadOverrides && typeof data.leadOverrides === 'object') {
                    this.leadOverrides = data.leadOverrides;
                }
            } else {
                this.saveSettings();
            }
        } catch (e) {
            console.warn('[PhotoPolicyManager] Failed to load settings, using defaults:', e.message);
        }
    }

    saveSettings() {
        try {
            const dir = path.dirname(SETTINGS_FILE);
            if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
            const data = {
                mode: this.currentMode,
                leadOverrides: this.leadOverrides,
                lastUpdated: new Date().toISOString()
            };
            fs.writeFileSync(SETTINGS_FILE, JSON.stringify(data, null, 2), 'utf8');
        } catch (e) {
            console.error('[PhotoPolicyManager] Failed to save settings:', e.message);
        }
    }

    getMode() {
        return this.currentMode;
    }

    setMode(newMode) {
        if (!['auto', 'stock_only', 'maps_only'].includes(newMode)) {
            throw new Error(`Invalid photo mode: ${newMode}. Allowed: auto, stock_only, maps_only`);
        }
        this.currentMode = newMode;
        this.saveSettings();
        console.log(`[PhotoPolicyManager] 📸 Persistent photo policy set to: "${newMode}"`);
        return this.currentMode;
    }

    getLeadPhotoSource(clientId) {
        if (this.leadOverrides[clientId]) {
            return this.leadOverrides[clientId];
        }
        return this.currentMode === 'stock_only' ? 'stock' : 'maps';
    }

    setLeadPhotoOverride(clientId, source) {
        if (!['stock', 'maps'].includes(source)) {
            throw new Error(`Invalid lead photo source: ${source}. Allowed: stock, maps`);
        }
        this.leadOverrides[clientId] = source;
        this.saveSettings();
        console.log(`[PhotoPolicyManager] 📸 Lead #${clientId} photo source set to: "${source}"`);
        return source;
    }

    clearLeadOverride(clientId) {
        delete this.leadOverrides[clientId];
        this.saveSettings();
    }
}

export const photoPolicy = new PhotoPolicyManager();

