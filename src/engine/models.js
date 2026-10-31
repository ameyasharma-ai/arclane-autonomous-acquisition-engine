import crypto from 'crypto';

/**
 * Normalizes phone numbers to standard E.164-like clean format.
 * Primarily handles Indian numbers (+91, 0, 10-digit).
 */
export function normalizePhone(rawPhone) {
    if (!rawPhone) return '';
    let cleaned = String(rawPhone).replace(/[^\d+]/g, '');
    if (cleaned.startsWith('00')) cleaned = '+' + cleaned.slice(2);
    if (cleaned.startsWith('+')) {
        return cleaned.replace(/[^\d+]/g, '');
    }
    // Remove leading 0 for Indian 10-digit mobile
    if (cleaned.startsWith('0') && cleaned.length === 11) {
        cleaned = cleaned.slice(1);
    }
    if (cleaned.length === 10) {
        return `+91${cleaned}`;
    }
    if (cleaned.length === 12 && cleaned.startsWith('91')) {
        return `+${cleaned}`;
    }
    return cleaned.length > 0 ? `+${cleaned}` : '';
}

/**
 * Normalizes URLs to hostname/domain for canonical deduplication.
 */
export function normalizeDomain(rawUrl) {
    if (!rawUrl) return '';
    try {
        let str = String(rawUrl).trim();
        if (!str.startsWith('http://') && !str.startsWith('https://')) {
            str = 'https://' + str;
        }
        const parsed = new URL(str);
        return parsed.hostname.replace(/^www\./i, '').toLowerCase();
    } catch {
        return String(rawUrl).trim().toLowerCase().replace(/^https?:\/\//i, '').replace(/^www\./i, '').split('/')[0];
    }
}

/**
 * Normalizes email address to lowercase stripped format.
 */
export function normalizeEmail(rawEmail) {
    if (!rawEmail) return null;
    const str = String(rawEmail).trim().toLowerCase();
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(str) ? str : null;
}

/**
 * Generates a deterministic unique Lead ID based on primary keys.
 */
export function generateLeadId(businessName, phone, location = '') {
    const normPhone = normalizePhone(phone);
    const normName = String(businessName || '').toLowerCase().replace(/[^a-z0-9]/g, '');
    const normLoc = String(location || '').toLowerCase().replace(/[^a-z0-9]/g, '');
    
    // If phone exists, it forms the strongest primary key
    const seed = normPhone ? `${normPhone}_${normName}` : `${normName}_${normLoc}`;
    const hash = crypto.createHash('sha256').update(seed).digest('hex').slice(0, 12);
    return `lead_${hash}`;
}

/**
 * Factory creating a fully normalized Lead record matching the 28-Stage architecture.
 */
export function createNormalizedLead(rawData = {}, existingClientId = null) {
    const businessName = rawData.businessName || rawData['Business Name'] || 'Unknown Business';
    const rawPhone = rawData.phone || rawData['Phone'] || rawData['Phone/WhatsApp'] || rawData.whatsapp || rawData['WhatsApp'] || '';
    const location = rawData.address || rawData.location || rawData['Address'] || rawData['Full Address'] || '';
    const phone = normalizePhone(rawPhone);
    const email = normalizeEmail(rawData.email || rawData['Email']);
    const website = rawData.existingWebsite || rawData['Existing Website'] || rawData.website || rawData['Website URL'] || rawData['Website'] || null;
    const googleMapsUrl = rawData.googleMapsUrl || rawData['Google Maps URL'] || rawData['Maps URL'] || '';
    const category = rawData.category || rawData['Category'] || rawData['Industry'] || 'Local Business';
    const now = new Date().toISOString();

    const leadId = existingClientId ? `lead_c${existingClientId}` : generateLeadId(businessName, phone, location);

    return {
        lead_id: leadId,
        client_id: existingClientId || null,
        business_name: businessName,
        category: category,
        location: location,
        phone: phone,
        email: email,
        website: website,
        google_maps_url: googleMapsUrl,
        source: rawData.source || 'google_maps',
        
        // Qualification & Scoring
        qualification_score: 0,
        qualification_reason: 'Pending qualification audit',
        lead_score: 0,
        lead_status: 'NEW', // 'NEW' | 'QUALIFIED' | 'DISQUALIFIED' | 'SUPPRESSED'
        contact_status: 'UNCONTACTED', // 'UNCONTACTED' | 'AWAITING_APPROVAL' | 'APPROVED' | 'CONTACTED' | 'OPTED_OUT'
        
        // Research Data
        research_data: {
            facts: [],
            opportunities: [],
            personalization_points: [],
            website_opportunities: [],
            confidence: 0
        },

        // Message & Creative
        message_variant: 'standard_curiosity_hook',
        message_content: '',
        candidate_messages: [],
        call_script: '',

        // Demo Website & Vercel Deployment
        demo_status: 'NOT_BUILT', // 'NOT_BUILT' | 'BUILDING' | 'QA_PASSED' | 'QA_FAILED'
        demo_url: null,
        deployment_status: 'PENDING', // 'PENDING' | 'DEPLOYED' | 'DEPLOYMENT_FAILED'
        deployment_url: null,
        qa_report: null,

        // Outbound & Follow-Up State
        outreach_channel: 'whatsapp',
        outreach_timestamp: null,
        last_contact_timestamp: null,
        next_followup_at: null,
        followup_count: 0,
        reply_status: 'NO_REPLY', // 'NO_REPLY' | 'REPLIED' | 'HANDOFF_TO_HUMAN'
        reply_classification: null,
        meeting_status: 'NOT_SCHEDULED',
        proposal_status: 'NONE',
        client_status: 'PROSPECT', // 'PROSPECT' | 'ACTIVE_CLIENT' | 'CHURNED'

        // Timestamps & Diagnostics
        created_at: now,
        updated_at: now,
        error_state: null
    };
}
