import path from 'path';
import fs from 'fs';
import { EngineOrchestrator } from './engine/orchestrator.js';
import { DeduplicationEngine } from './engine/deduplication.js';
import { QualificationEngine } from './engine/qualification.js';
import { WebsiteQAValidator } from './engine/qa_validator.js';
import { ApprovalQueue } from './engine/approval_queue.js';
import { FollowUpEngine } from './engine/follow_up.js';
import { AuditLogger } from './engine/audit_logger.js';
import { normalizePhone, normalizeDomain, createNormalizedLead } from './engine/models.js';

let passed = 0;
let failed = 0;

function assert(condition, testName) {
    if (condition) {
        console.log(`  ✅ PASS: ${testName}`);
        passed++;
    } else {
        console.error(`  ❌ FAIL: ${testName}`);
        failed++;
    }
}

console.log("=================================================");
console.log("🚀 EXECUTING ARCLANE PRODUCTION ENGINE TEST SUITE");
console.log("=================================================\n");

// 1. Test Phone Normalization
console.log("[Suite 1] Data Model & Phone Normalization");
assert(normalizePhone('9876543210') === '+919876543210', 'Convert 10-digit to E.164 +91');
assert(normalizePhone('09876543210') === '+919876543210', 'Strip leading 0 and format E.164');
assert(normalizePhone('+91 98765-43210') === '+919876543210', 'Strip spaces and dashes');
assert(normalizeDomain('https://www.examplegym.in/about') === 'examplegym.in', 'Canonical domain extraction');

// 2. Test Deduplication & Suppression
console.log("\n[Suite 2] Deduplication & Suppression Engine");
const testStateDir = path.join(process.cwd(), 'reports', '.test_state');
if (fs.existsSync(testStateDir)) {
    fs.rmSync(testStateDir, { recursive: true, force: true });
}
const dedup = new DeduplicationEngine(testStateDir);
const testLead = createNormalizedLead({
    businessName: 'Apex Fitness Club',
    phone: '9876500001',
    website: 'https://apexfitness.com'
});
const firstCheck = dedup.checkLead(testLead);
assert(firstCheck.outcome === 'NEW' && firstCheck.canContact === true, 'Fresh lead identified as NEW');

dedup.addToSuppression(testLead.phone, 'USER_OPT_OUT');
const suppressedCheck = dedup.checkLead(testLead);
assert(suppressedCheck.outcome === 'SUPPRESSED' && suppressedCheck.canContact === false, 'Opted-out lead identified as SUPPRESSED');

// 3. Test Lead Qualification & Scoring
console.log("\n[Suite 3] Lead Qualification & Scoring Engine");
const qualEngine = new QualificationEngine({ minimum_lead_score: 65 });
const highValueLead = {
    phone: '+919876500002',
    website: '', // No website = high opportunity
    category: 'Gyms & Fitness Centre',
    rating: 4.8,
    reviews: 120
};
const qualRes = qualEngine.qualifyLead(highValueLead);
assert(qualRes.qualified === true, 'High-opportunity SMB qualifies');
assert(qualRes.qualification_score >= 70, 'Qualification score calculated properly');

const scoreRes = qualEngine.scoreLead(highValueLead, qualRes);
assert(scoreRes.decision === 'PROCEED_RESEARCH', 'Score meets minimum campaign threshold');

// 4. Test Website QA Validator
console.log("\n[Suite 4] Website QA Gatekeeper");
const qa = new WebsiteQAValidator();
// Test with an existing generated site (e.g. site #2)
const site2Dir = path.join(process.cwd(), 'generated_sites', '2');
if (fs.existsSync(site2Dir)) {
    const qaRes = qa.validateSite(site2Dir, "Indian's The Gym");
    assert(qaRes.status === 'QA_PASSED', 'Existing generated site passes all QA checks');
    assert(qaRes.passed === true, 'Zero security or broken CTA flags');
} else {
    console.log('  ⚠️ Skipping live site QA test (site 2 not found)');
}

// 5. Test Human Approval Queue
console.log("\n[Suite 5] Human Approval Gate");
const approvalQueue = new ApprovalQueue(path.join(process.cwd(), 'reports', '.test_state'));
const queued = approvalQueue.enqueue(testLead, ['Hook 1', 'Hook 2']);
assert(queued.status === 'AWAITING_APPROVAL', 'Lead safely queued in AWAITING_APPROVAL');

const approved = approvalQueue.approve(testLead.lead_id, 'LeadArchitect');
assert(approved.status === 'APPROVED', 'Human operator approves lead successfully');

// 6. Test Reply Detection & Opt-Out Handling
console.log("\n[Suite 6] Reply Detection & Classification");
const followUp = new FollowUpEngine(path.join(process.cwd(), 'reports', '.test_state'), dedup);

const optOutReply = followUp.classifyReply('Please stop messaging me');
assert(optOutReply.category === 'OPT_OUT', 'Accurately classified OPT_OUT reply');

const priceReply = followUp.classifyReply('What is the package price?');
assert(priceReply.category === 'PRICING', 'Accurately classified PRICING inquiry');

const callReply = followUp.classifyReply('Can you call me at 5 PM?');
assert(callReply.category === 'CALL_REQUEST', 'Accurately classified CALL_REQUEST');

// 7. Test Emergency Stop & Dry Run via Orchestrator
console.log("\n[Suite 7] Global Kill Switch & Dry Run Simulation");
const orchestrator = new EngineOrchestrator({
    dryRun: true,
    emergencyStop: false,
    humanApprovalRequired: true
});

const simResult = await orchestrator.processLeadPipeline({
    'Client ID': 9999,
    'Business Name': 'Zenith Yoga Studio',
    'Phone': '9876543999',
    'Category': 'Yoga & Wellness',
    'Ratings': '4.9',
    'Number Of Reviews': '85'
});

assert(simResult.status === 'AWAITING_APPROVAL', 'Dry-run pipeline executed cleanly and stopped at Human Approval Gate');

// Test Kill Switch
orchestrator.emergencyStop = true;
const stoppedResult = await orchestrator.processLeadPipeline({
    'Client ID': 10000,
    'Business Name': 'KillSwitch Test Gym',
    'Phone': '9876543000'
});
assert(stoppedResult.status === 'ABORTED_EMERGENCY_STOP', 'Emergency stop successfully halts pipeline');

// Summary
console.log("\n=================================================");
console.log(`TEST RESULTS: ${passed} PASSED, ${failed} FAILED`);
if (failed === 0) {
    console.log("🎉 ALL PRODUCTION SYSTEM TEST SUITES PASSED CLEANLY!");
} else {
    console.error("⚠️ SOME TESTS FAILED. Review output above.");
    process.exit(1);
}
console.log("=================================================\n");
