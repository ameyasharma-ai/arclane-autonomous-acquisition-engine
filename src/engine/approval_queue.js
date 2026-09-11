import fs from 'fs';
import path from 'path';

/**
 * Human Approval Gatekeeper & Outbound Queue.
 * Guarantees that no first-contact sales messages are dispatched without review when enabled.
 */
export class ApprovalQueue {
    constructor(storageDir = null) {
        this.storageDir = storageDir || path.join(process.cwd(), 'reports', '.crm_state');
        if (!fs.existsSync(this.storageDir)) {
            fs.mkdirSync(this.storageDir, { recursive: true });
        }
        this.queueFile = path.join(this.storageDir, 'approval_queue.json');
        this.initQueue();
    }

    initQueue() {
        if (!fs.existsSync(this.queueFile)) {
            fs.writeFileSync(this.queueFile, JSON.stringify([], null, 2), 'utf-8');
        }
    }

    loadQueue() {
        try {
            return JSON.parse(fs.readFileSync(this.queueFile, 'utf-8'));
        } catch {
            return [];
        }
    }

    saveQueue(items) {
        fs.writeFileSync(this.queueFile, JSON.stringify(items, null, 2), 'utf-8');
    }

    /**
     * Enqueues a message draft for human approval.
     */
    enqueue(lead, candidateVariants = []) {
        const queue = this.loadQueue();
        const existingIdx = queue.findIndex(q => q.lead_id === lead.lead_id);
        
        const entry = {
            lead_id: lead.lead_id,
            client_id: lead.client_id,
            business_name: lead.business_name,
            phone: lead.phone,
            demo_url: lead.deployment_url || lead.demo_url,
            message_content: lead.message_content,
            candidate_variants: candidateVariants,
            status: 'AWAITING_APPROVAL', // 'AWAITING_APPROVAL' | 'APPROVED' | 'EDITED' | 'REJECTED' | 'SKIPPED'
            created_at: new Date().toISOString(),
            approved_by: null,
            approved_at: null
        };

        if (existingIdx >= 0) {
            queue[existingIdx] = entry;
        } else {
            queue.push(entry);
        }

        this.saveQueue(queue);
        console.log(`[ApprovalQueue] 📥 Enqueued message for human review: ${lead.business_name} (${lead.lead_id})`);
        return entry;
    }

    approve(leadId, approver = 'Operator', editedMessage = null) {
        const queue = this.loadQueue();
        const item = queue.find(q => q.lead_id === leadId || String(q.client_id) === String(leadId));
        if (!item) return null;

        item.status = editedMessage ? 'EDITED' : 'APPROVED';
        if (editedMessage) item.message_content = editedMessage;
        item.approved_by = approver;
        item.approved_at = new Date().toISOString();

        this.saveQueue(queue);
        console.log(`[ApprovalQueue] ✅ Approved message for: ${item.business_name}`);
        return item;
    }

    reject(leadId, reason = 'Operator rejected') {
        const queue = this.loadQueue();
        const item = queue.find(q => q.lead_id === leadId || String(q.client_id) === String(leadId));
        if (!item) return null;

        item.status = 'REJECTED';
        item.rejection_reason = reason;
        this.saveQueue(queue);
        console.log(`[ApprovalQueue] ❌ Rejected message for: ${item.business_name}`);
        return item;
    }

    getPending() {
        return this.loadQueue().filter(q => q.status === 'AWAITING_APPROVAL');
    }
}
