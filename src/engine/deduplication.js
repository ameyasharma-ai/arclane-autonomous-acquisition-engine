import fs from 'fs';
import path from 'path';
import { normalizePhone, normalizeDomain } from './models.js';

export class DeduplicationEngine {
    constructor(storageDir = null) {
        this.storageDir = storageDir || path.join(process.cwd(), 'reports', '.crm_state');
        if (!fs.existsSync(this.storageDir)) {
            fs.mkdirSync(this.storageDir, { recursive: true });
        }
        this.suppressionFile = path.join(this.storageDir, 'suppression_list.json');
        this.clientsFile = path.join(this.storageDir, 'active_clients.json');
        this.contactHistoryFile = path.join(this.storageDir, 'contact_history.json');
        this.cooldownDays = 60; // 60 days cooldown window

        this.initFiles();
    }

    initFiles() {
        if (!fs.existsSync(this.suppressionFile)) {
            fs.writeFileSync(this.suppressionFile, JSON.stringify([], null, 2), 'utf-8');
        }
        if (!fs.existsSync(this.clientsFile)) {
            fs.writeFileSync(this.clientsFile, JSON.stringify([], null, 2), 'utf-8');
        }
        if (!fs.existsSync(this.contactHistoryFile)) {
            fs.writeFileSync(this.contactHistoryFile, JSON.stringify({}, null, 2), 'utf-8');
        }
    }

    loadSuppressionList() {
        try {
            return JSON.parse(fs.readFileSync(this.suppressionFile, 'utf-8'));
        } catch {
            return [];
        }
    }

    loadActiveClients() {
        try {
            return JSON.parse(fs.readFileSync(this.clientsFile, 'utf-8'));
        } catch {
            return [];
        }
    }

    loadContactHistory() {
        try {
            return JSON.parse(fs.readFileSync(this.contactHistoryFile, 'utf-8'));
        } catch {
            return {};
        }
    }

    addToSuppression(phoneOrDomain, reason = 'OPT_OUT') {
        const list = this.loadSuppressionList();
        const entry = {
            target: String(phoneOrDomain).trim().toLowerCase(),
            reason,
            added_at: new Date().toISOString()
        };
        list.push(entry);
        fs.writeFileSync(this.suppressionFile, JSON.stringify(list, null, 2), 'utf-8');
        console.log(`[Deduplication] Added to suppression list: ${phoneOrDomain} (${reason})`);
    }

    recordContact(leadId, phone, domain = null) {
        const history = this.loadContactHistory();
        const now = new Date().toISOString();
        const normPhone = normalizePhone(phone);
        const normDom = normalizeDomain(domain);

        const record = { leadId, contactedAt: now, phone: normPhone, domain: normDom };
        if (normPhone) history[normPhone] = record;
        if (normDom) history[normDom] = record;
        history[leadId] = record;

        fs.writeFileSync(this.contactHistoryFile, JSON.stringify(history, null, 2), 'utf-8');
    }

    /**
     * Deduplicates a lead across Phone, Email, Domain, Google Maps URL, and Business Name.
     * Returns outcome: 'NEW' | 'DUPLICATE' | 'ALREADY_CONTACTED' | 'ALREADY_CLIENT' | 'SUPPRESSED'
     */
    checkLead(lead) {
        const phone = normalizePhone(lead.phone);
        const domain = normalizeDomain(lead.website);
        const businessName = String(lead.business_name || '').toLowerCase().trim();

        // 1. Check Suppression List (Opt-outs / Do Not Contact)
        const suppression = this.loadSuppressionList();
        const isSuppressed = suppression.some(s => {
            const t = s.target;
            return (phone && t === phone) || (domain && t === domain) || (businessName && t === businessName);
        });
        if (isSuppressed) {
            return {
                outcome: 'SUPPRESSED',
                canContact: false,
                reason: 'Lead or contact number is on permanent suppression/opt-out list.'
            };
        }

        // 2. Check Existing Clients List
        const clients = this.loadActiveClients();
        const isClient = clients.some(c => {
            const cp = normalizePhone(c.phone);
            const cd = normalizeDomain(c.website);
            return (phone && cp === phone) || (domain && cd === domain);
        });
        if (isClient) {
            return {
                outcome: 'ALREADY_CLIENT',
                canContact: false,
                reason: 'Business is an active paying client.'
            };
        }

        // 3. Check Cooldown / Already Contacted
        const history = this.loadContactHistory();
        const contactRecord = (phone && history[phone]) || (domain && history[domain]) || history[lead.lead_id];
        if (contactRecord && contactRecord.contactedAt) {
            const contactedDate = new Date(contactRecord.contactedAt);
            const diffDays = Math.floor((new Date() - contactedDate) / (1000 * 60 * 60 * 24));
            if (diffDays < this.cooldownDays) {
                return {
                    outcome: 'ALREADY_CONTACTED',
                    canContact: false,
                    reason: `Contacted ${diffDays} days ago. Cooldown period is ${this.cooldownDays} days.`
                };
            }
        }

        return {
            outcome: 'NEW',
            canContact: true,
            reason: 'Fresh lead verified for qualification.'
        };
    }
}
