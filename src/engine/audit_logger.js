import fs from 'fs';
import path from 'path';

/**
 * Immutable Audit Logger & Operational Metrics Collector.
 * Logs all meaningful pipeline lifecycle events without leaking secrets.
 */
export class AuditLogger {
    constructor(storageDir = null) {
        this.storageDir = storageDir || path.join(process.cwd(), 'reports', '.crm_state');
        if (!fs.existsSync(this.storageDir)) {
            fs.mkdirSync(this.storageDir, { recursive: true });
        }
        this.auditLogPath = path.join(this.storageDir, 'audit_event_log.jsonl');
        this.metricsPath = path.join(this.storageDir, 'funnel_analytics.json');
        this.initMetrics();
    }

    initMetrics() {
        if (!fs.existsSync(this.metricsPath)) {
            const initialMetrics = {
                leads_discovered: 0,
                leads_qualified: 0,
                leads_rejected: 0,
                demos_generated: 0,
                demos_qa_passed: 0,
                demos_qa_failed: 0,
                demos_deployed: 0,
                messages_generated: 0,
                messages_approved: 0,
                messages_sent: 0,
                replies_total: 0,
                replies_positive: 0,
                calls_booked: 0,
                clients_won: 0,
                revenue_inr: 0,
                updated_at: new Date().toISOString()
            };
            fs.writeFileSync(this.metricsPath, JSON.stringify(initialMetrics, null, 2), 'utf-8');
        }
    }

    /**
     * Sanitizes data objects to strictly redact tokens, secrets, and private keys.
     */
    sanitizePayload(data) {
        if (!data || typeof data !== 'object') return data;
        const sanitized = Array.isArray(data) ? [...data] : { ...data };
        const sensitiveKeys = ['token', 'password', 'key', 'secret', 'auth', 'cookie', 'authorization'];

        for (const [k, v] of Object.entries(sanitized)) {
            if (sensitiveKeys.some(sk => k.toLowerCase().includes(sk))) {
                sanitized[k] = '[REDACTED_SECRET]';
            } else if (typeof v === 'object' && v !== null) {
                sanitized[k] = this.sanitizePayload(v);
            }
        }
        return sanitized;
    }

    /**
     * Appends an immutable structured event to the audit log.
     */
    logEvent(eventName, leadId, component, metadata = {}) {
        const entry = {
            timestamp: new Date().toISOString(),
            event: eventName,
            lead_id: leadId || 'SYSTEM',
            component: component || 'ENGINE',
            data: this.sanitizePayload(metadata)
        };

        fs.appendFileSync(this.auditLogPath, JSON.stringify(entry) + '\n', 'utf-8');
        this.updateFunnelMetrics(eventName);
        console.log(`[AuditLog] 📝 [${entry.timestamp.slice(11, 19)}] ${eventName} (${leadId || 'GLOBAL'}) via ${component}`);
    }

    updateFunnelMetrics(eventName) {
        try {
            const metrics = JSON.parse(fs.readFileSync(this.metricsPath, 'utf-8'));
            const mapping = {
                'LEAD_DISCOVERED': 'leads_discovered',
                'LEAD_QUALIFIED': 'leads_qualified',
                'LEAD_REJECTED': 'leads_rejected',
                'DEMO_GENERATED': 'demos_generated',
                'QA_PASSED': 'demos_qa_passed',
                'QA_FAILED': 'demos_qa_failed',
                'DEPLOYED': 'demos_deployed',
                'MESSAGE_GENERATED': 'messages_generated',
                'MESSAGE_APPROVED': 'messages_approved',
                'MESSAGE_SENT': 'messages_sent',
                'REPLY_RECEIVED': 'replies_total',
                'MEETING_BOOKED': 'calls_booked',
                'DEAL_WON': 'clients_won'
            };

            if (mapping[eventName] && metrics[mapping[eventName]] !== undefined) {
                metrics[mapping[eventName]]++;
                metrics.updated_at = new Date().toISOString();
                fs.writeFileSync(this.metricsPath, JSON.stringify(metrics, null, 2), 'utf-8');
            }
        } catch (e) {
            console.warn('[AuditLog] Metrics update notice:', e.message);
        }
    }

    getAnalytics() {
        try {
            return JSON.parse(fs.readFileSync(this.metricsPath, 'utf-8'));
        } catch {
            return {};
        }
    }
}
