import fs from 'fs';
import path from 'path';

/**
 * Reply Classification & Follow-Up Engine.
 * Parses incoming replies, suppresses opt-outs, halts sequences, and schedules follow-up steps.
 */
export class FollowUpEngine {
    constructor(storageDir = null, deduplicationEngine = null) {
        this.storageDir = storageDir || path.join(process.cwd(), 'reports', '.crm_state');
        if (!fs.existsSync(this.storageDir)) {
            fs.mkdirSync(this.storageDir, { recursive: true });
        }
        this.stateFile = path.join(this.storageDir, 'followup_schedules.json');
        this.dedup = deduplicationEngine;
        this.init();
    }

    init() {
        if (!fs.existsSync(this.stateFile)) {
            fs.writeFileSync(this.stateFile, JSON.stringify({}, null, 2), 'utf-8');
        }
    }

    loadSchedules() {
        try {
            return JSON.parse(fs.readFileSync(this.stateFile, 'utf-8'));
        } catch {
            return {};
        }
    }

    saveSchedules(data) {
        fs.writeFileSync(this.stateFile, JSON.stringify(data, null, 2), 'utf-8');
    }

    /**
     * Classifies raw reply text using high-accuracy conversational intent heuristics.
     */
    classifyReply(text) {
        if (!text) return { category: 'UNCLEAR', action: 'IGNORE' };
        const lower = text.toLowerCase().trim();

        // 1. Opt-out signals (STRICT & IMMEDIATE)
        const optOutPatterns = ['stop', 'unsubscribe', 'don\'t message', 'dont message', 'spam', 'remove my number', 'mat karo', 'block', 'report'];
        if (optOutPatterns.some(p => lower.includes(p))) {
            return {
                category: 'OPT_OUT',
                action: 'PERMANENTLY_SUPPRESS',
                reason: 'Prospect requested communication halt'
            };
        }

        // 2. Wrong Number
        if (lower.includes('wrong number') || lower.includes('galat number') || lower.includes('not owner') || lower.includes('wrong person')) {
            return {
                category: 'WRONG_NUMBER',
                action: 'HALT_AND_DISCARD',
                reason: 'Recipient is not the business decision maker'
            };
        }

        // 3. Call Request / Direct Meeting
        if (lower.includes('call me') || lower.includes('call karo') || lower.includes('phone par') || lower.includes('schedule') || lower.includes('meeting')) {
            return {
                category: 'CALL_REQUEST',
                action: 'NOTIFY_HUMAN_CALL',
                reason: 'Prospect requested a phone conversation'
            };
        }

        // 4. Pricing / Cost Inquiries
        if (lower.includes('price') || lower.includes('cost') || lower.includes('charges') || lower.includes('rate') || lower.includes('kitna') || lower.includes('package')) {
            return {
                category: 'PRICING',
                action: 'NOTIFY_HUMAN_PRICING',
                reason: 'Prospect inquiring about commercial pricing'
            };
        }

        // 5. Positive Interest
        const interestPatterns = ['interested', 'looks good', 'achha hai', 'tell me more', 'demo', 'website', 'kya karna hoga', 'how does it work', 'bataiye'];
        if (interestPatterns.some(p => lower.includes(p))) {
            return {
                category: 'INTERESTED',
                action: 'NOTIFY_HUMAN_HOT_LEAD',
                reason: 'Prospect expressed positive interest in demo concept'
            };
        }

        // 6. Not Interested
        const notInterestedPatterns = ['not interested', 'nahi chahiye', 'already have', 'no thanks', 'not now'];
        if (notInterestedPatterns.some(p => lower.includes(p))) {
            return {
                category: 'NOT_INTERESTED',
                action: 'HALT_FOLLOWUPS',
                reason: 'Prospect politely declined'
            };
        }

        return {
            category: 'QUESTION',
            action: 'NOTIFY_HUMAN_REVIEW',
            reason: 'General inquiry or response'
        };
    }

    /**
     * Handles an incoming message event.
     */
    handleIncomingReply(phone, replyText) {
        const classification = this.classifyReply(replyText);
        console.log(`[FollowUpEngine] 💬 Reply from ${phone}: "${replyText}" -> ${classification.category} (${classification.action})`);

        // STOP all pending automated follow-ups immediately
        const schedules = this.loadSchedules();
        if (schedules[phone]) {
            schedules[phone].status = 'HALTED_ON_REPLY';
            schedules[phone].reply_classification = classification.category;
            schedules[phone].last_reply = replyText;
            schedules[phone].reply_at = new Date().toISOString();
            this.saveSchedules(schedules);
        }

        // Handle Opt-Out suppression
        if (classification.category === 'OPT_OUT' && this.dedup) {
            this.dedup.addToSuppression(phone, 'USER_OPT_OUT');
        }

        return classification;
    }

    /**
     * Schedules standard multi-stage follow-up sequence (+2 days, +4 days, +7 days).
     */
    scheduleSequence(leadId, phone, businessName) {
        const schedules = this.loadSchedules();
        const now = Date.now();
        const dayMs = 24 * 60 * 60 * 1000;

        schedules[phone] = {
            lead_id: leadId,
            business_name: businessName,
            phone: phone,
            status: 'ACTIVE_SEQUENCE',
            created_at: new Date().toISOString(),
            steps: [
                { step: 1, due_at: new Date(now + 2 * dayMs).toISOString(), status: 'PENDING' },
                { step: 2, due_at: new Date(now + 4 * dayMs).toISOString(), status: 'PENDING' },
                { step: 3, due_at: new Date(now + 7 * dayMs).toISOString(), status: 'PENDING' }
            ],
            current_step: 0
        };

        this.saveSchedules(schedules);
        console.log(`[FollowUpEngine] 📅 Scheduled 3-step follow-up for: ${businessName} (${phone})`);
    }
}
