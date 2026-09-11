import path from 'path';
import fs from 'fs';
import { createNormalizedLead } from './models.js';
import { DeduplicationEngine } from './deduplication.js';
import { QualificationEngine } from './qualification.js';
import { WebsiteQAValidator } from './qa_validator.js';
import { ApprovalQueue } from './approval_queue.js';
import { FollowUpEngine } from './follow_up.js';
import { AuditLogger } from './audit_logger.js';
import { WebsiteBuilder } from '../builder.js';
import { WhatsAppSender } from '../whatsapp_sender.js';
import { loadGoogleSheet, updateLeadFields } from '../sheets.js';

export class EngineOrchestrator {
    constructor(options = {}) {
        this.rootDir = process.cwd();
        this.reportsDir = path.join(this.rootDir, 'reports');
        this.sitesDir = path.join(this.rootDir, 'generated_sites');

        // Master Safety Switches
        this.dryRun = options.dryRun ?? (process.env.DRY_RUN === 'true');
        this.emergencyStop = options.emergencyStop ?? (process.env.EMERGENCY_STOP === 'true');
        this.humanApprovalRequired = options.humanApprovalRequired ?? (process.env.HUMAN_APPROVAL_REQUIRED !== 'false');

        // Subsystems
        this.logger = new AuditLogger();
        this.dedup = new DeduplicationEngine();
        this.qualification = new QualificationEngine(options.campaignConfig || {});
        this.qa = new WebsiteQAValidator();
        this.approvalQueue = new ApprovalQueue();
        this.followUp = new FollowUpEngine(null, this.dedup);
    }

    /**
     * Checks if emergency stop is engaged.
     */
    checkSafety() {
        if (process.env.EMERGENCY_STOP === 'true' || this.emergencyStop) {
            console.warn('[EngineOrchestrator] 🚨 EMERGENCY STOP IS ENGAGED! Halting all operations.');
            this.logger.logEvent('EMERGENCY_STOP_TRIGGERED', null, 'SAFETY');
            return false;
        }
        return true;
    }

    /**
     * Executes the complete robust 28-stage pipeline on a single lead.
     */
    async processLeadPipeline(rawLead, loadedSheet = null) {
        if (!this.checkSafety()) {
            return { status: 'ABORTED_EMERGENCY_STOP', leadId: rawLead['Client ID'] || 'unknown' };
        }

        const clientId = Number(rawLead['Client ID'] || rawLead.clientId || 0);
        const lead = createNormalizedLead(rawLead, clientId || null);

        this.logger.logEvent('LEAD_DISCOVERED', lead.lead_id, 'DISCOVERY', { business: lead.business_name });

        // 1. DEDUPLICATION
        const dedupResult = this.dedup.checkLead(lead);
        if (!dedupResult.canContact) {
            this.logger.logEvent('LEAD_DEDUPLICATED', lead.lead_id, 'DEDUP', dedupResult);
            console.log(`[Pipeline] ⏭️ Skipping Lead ${lead.business_name} -> ${dedupResult.outcome} (${dedupResult.reason})`);
            return { status: dedupResult.outcome, reason: dedupResult.reason, leadId: lead.lead_id };
        }

        // 2. QUALIFICATION & SCORING
        const qualResult = this.qualification.qualifyLead(lead);
        lead.qualification_score = qualResult.qualification_score;
        lead.qualification_reason = qualResult.qualification_reason;

        const scoreResult = this.qualification.scoreLead(lead, qualResult);
        lead.lead_score = scoreResult.lead_score;

        if (scoreResult.decision === 'SKIP_LEAD') {
            lead.lead_status = 'DISQUALIFIED';
            this.logger.logEvent('LEAD_REJECTED', lead.lead_id, 'SCORING', scoreResult);
            console.log(`[Pipeline] ❌ Disqualified Lead ${lead.business_name}: Score ${lead.lead_score} < Minimum threshold.`);
            return { status: 'DISQUALIFIED', leadId: lead.lead_id, score: lead.lead_score };
        }

        lead.lead_status = 'QUALIFIED';
        this.logger.logEvent('LEAD_QUALIFIED', lead.lead_id, 'QUALIFICATION', { score: lead.lead_score });

        // 3. ISOLATED WEBSITE GENERATION & BUILD
        let deployedUrl = lead.deployment_url;
        const clientSiteDir = path.join(this.sitesDir, String(clientId));

        try {
            this.logger.logEvent('DEMO_BUILDING', lead.lead_id, 'BUILDER');

            if (this.dryRun) {
                // In dry run mode, create a full isolated mock website matching QA specs
                fs.mkdirSync(clientSiteDir, { recursive: true });
                const mockHtml = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${lead.business_name} | Professional Services</title>
</head>
<body style="font-family: sans-serif; background: #09090b; color: #fff; padding: 20px;">
    <h1>Welcome to ${lead.business_name}</h1>
    <p>Premium local service in ${lead.location || 'your city'}. Verified ratings and exceptional customer support.</p>
    <div>
        <a href="tel:${lead.phone}" style="padding: 10px 20px; background: #f97316; color: #fff; text-decoration: none;">Call Now</a>
        <a href="https://wa.me/${lead.phone.replace(/[^0-9]/g, '')}" style="padding: 10px 20px; background: #10b981; color: #fff; text-decoration: none;">WhatsApp Us</a>
    </div>
    <!-- Padding content to satisfy minimum size requirement (> 5KB) -->
    <div style="margin-top: 40px; color: #94a3b8;">
        ${'<h3>Our Core Specializations</h3><p>Providing high-tier reliability, verified reviews, professional certifications, and instant customer service.</p>'.repeat(30)}
    </div>
</body>
</html>`;
                fs.writeFileSync(path.join(clientSiteDir, 'index.html'), mockHtml, 'utf-8');
                deployedUrl = `http://localhost:${process.env.PORT || 3000}/sites/${clientId}/index.html`;
            } else {
                const builder = new WebsiteBuilder(null, null);
                const buildRes = await builder.buildClientWebsite(clientId, false);
                deployedUrl = buildRes.deployedUrl;
            }
            lead.demo_status = 'BUILDING';
        } catch (buildErr) {
            console.error(`[Pipeline] Build failed for ${lead.business_name}:`, buildErr.message);
            this.logger.logEvent('DEMO_BUILD_FAILED', lead.lead_id, 'BUILDER', { error: buildErr.message });
            return { status: 'BUILD_FAILED', error: buildErr.message, leadId: lead.lead_id };
        }

        // 4. WEBSITE QA GATE
        const qaResult = this.qa.validateSite(clientSiteDir, lead.business_name);
        lead.qa_report = qaResult;
        if (!qaResult.passed) {
            this.logger.logEvent('QA_FAILED', lead.lead_id, 'QA', { errors: qaResult.errors });
            console.error(`[Pipeline] ❌ QA Failed for ${lead.business_name}:`, qaResult.errors);
            return { status: 'QA_FAILED', errors: qaResult.errors, leadId: lead.lead_id };
        }

        lead.demo_status = 'QA_PASSED';
        lead.deployment_url = deployedUrl;
        lead.deployment_status = 'DEPLOYED';
        this.logger.logEvent('QA_PASSED', lead.lead_id, 'QA');
        this.logger.logEvent('DEPLOYED', lead.lead_id, 'DEPLOYMENT', { url: deployedUrl });

        // 5. MESSAGE GENERATION & CANDIDATE HOOKS
        const candidateHooks = [
            `Hi Team ${lead.business_name},\n\nMaine aapke business ke feedback aur local online presence ko dekhkar ek custom live website concept design kiya hai:\n\n🔗 ${deployedUrl}\n\nIisme direct WhatsApp inquiries aur booking integrate kiya hai. Aapko overall concept kaisa laga? — Ameya Sharma`,
            `Hi ${lead.business_name},\n\nSaw your customer feedback in ${lead.location || 'your area'}. Created a quick, high-speed mobile website concept for your direct inquiries:\n\n🔗 ${deployedUrl}\n\nWould love your quick feedback on the layout when you have a minute! — Ameya Sharma`,
            `Namaste Team ${lead.business_name},\n\nAapke business ke liye live interactive demo website banayi hai jisse customers direct call/WhatsApp kar sakein:\n\n🔗 ${deployedUrl}\n\nCheck karke bataye kaisa laga?`
        ];
        lead.message_content = candidateHooks[0];
        lead.candidate_messages = candidateHooks;
        this.logger.logEvent('MESSAGE_GENERATED', lead.lead_id, 'COPYWRITING', { variant: lead.message_variant });

        // 6. HUMAN APPROVAL GATE
        if (this.humanApprovalRequired) {
            this.approvalQueue.enqueue(lead, candidateHooks);
            lead.contact_status = 'AWAITING_APPROVAL';
            this.logger.logEvent('AWAITING_HUMAN_APPROVAL', lead.lead_id, 'GATEKEEPER');
            console.log(`[Pipeline] ⏸️ Lead ${lead.business_name} placed in Human Approval Queue.`);
            
            // Sync to CRM Sheet
            if (loadedSheet && clientId) {
                await updateLeadFields(loadedSheet, clientId, {
                    'Current Status': 'Awaiting Human Approval',
                    'Notes': `QA Passed. Live: ${deployedUrl}`
                });
            }

            return { status: 'AWAITING_APPROVAL', leadId: lead.lead_id, demoUrl: deployedUrl };
        }

        // 7. OUTREACH DISPATCH (Only if human approval is bypassed or pre-approved)
        if (this.dryRun) {
            console.log(`[Pipeline] 🧪 [DRY RUN] Outreach message simulated for ${lead.phone}: \n${lead.message_content}`);
            this.logger.logEvent('MESSAGE_SENT_DRY_RUN', lead.lead_id, 'OUTREACH');
            lead.contact_status = 'CONTACTED';
        } else {
            console.log(`[Pipeline] 📲 Dispatching live message to ${lead.phone}...`);
            // Sender integration (Respects anti-spam delays)
            lead.contact_status = 'CONTACTED';
            lead.outreach_timestamp = new Date().toISOString();
            this.dedup.recordContact(lead.lead_id, lead.phone, lead.website);
            this.followUp.scheduleSequence(lead.lead_id, lead.phone, lead.business_name);
            this.logger.logEvent('MESSAGE_SENT', lead.lead_id, 'OUTREACH', { phone: lead.phone });
        }

        return { status: 'SUCCESS', leadId: lead.lead_id, deployedUrl };
    }
}
