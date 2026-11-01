/**
 * Comprehensive Deep Sheet Audit & Anomaly Detection Script
 * Analyzes the freshly downloaded Google Sheet, compares against the prior snapshot,
 * and detects every data anomaly, schema change, and statistical distribution.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const latestPath = path.join(__dirname, '..', 'data_exports', 'crm_leads_latest.json');
const beforeEditsPath = path.join(__dirname, '..', 'data_exports', 'crm_leads_before_user_edits.json');

const currentLeads = JSON.parse(fs.readFileSync(latestPath, 'utf8'));
const previousLeads = fs.existsSync(beforeEditsPath) 
    ? JSON.parse(fs.readFileSync(beforeEditsPath, 'utf8')) 
    : [];

console.log(`[Audit] Analyzing ${currentLeads.length} leads in current sheet snapshot...`);

// 1. Schema & Headers Analysis
const currentHeaders = Object.keys(currentLeads[0] || {});
const prevHeaders = Object.keys(previousLeads[0] || {});

const addedColumns = currentHeaders.filter(h => !prevHeaders.includes(h));
const removedColumns = prevHeaders.filter(h => !currentHeaders.includes(h));

// Expected standard schema
const expectedSchema = [
    'Client ID', 'Date Added', 'Business Name', 'Industry/Niche', 'City/State',
    'Phone/WhatsApp', 'Agency Hosted URL', 'Existing Website', 'AI Outreach Hook',
    'Current Status', 'Priority Level', 'Ratings', 'Number Of Reviews', 'Timings',
    'Socials', 'Address'
];

const schemaOrderCheck = expectedSchema.map((expected, idx) => ({
    expected,
    actual: currentHeaders[idx] || null,
    isMatch: currentHeaders[idx] === expected
}));

// 2. Diffing vs Previous Snapshot (What did user change?)
const diffSummary = {
    totalRowsCompared: Math.min(currentLeads.length, previousLeads.length),
    modifiedRowsCount: 0,
    fieldChangeCounts: {},
    sampleModifications: []
};

const prevMap = new Map();
previousLeads.forEach(r => prevMap.set(String(r['Client ID']), r));

for (const curr of currentLeads) {
    const id = String(curr['Client ID']);
    const prev = prevMap.get(id);
    if (!prev) continue;

    let hasChange = false;
    const rowChanges = {};

    for (const key of currentHeaders) {
        const currVal = String(curr[key] ?? '').trim();
        const prevVal = String(prev[key] ?? '').trim();

        if (currVal !== prevVal) {
            hasChange = true;
            diffSummary.fieldChangeCounts[key] = (diffSummary.fieldChangeCounts[key] || 0) + 1;
            rowChanges[key] = { from: prevVal, to: currVal };
        }
    }

    if (hasChange) {
        diffSummary.modifiedRowsCount++;
        if (diffSummary.sampleModifications.length < 15) {
            diffSummary.sampleModifications.push({
                clientId: id,
                businessName: curr['Business Name'],
                changes: rowChanges
            });
        }
    }
}

// 3. Deep Anomaly & Data Quality Audit
const anomalies = {
    duplicateClientIds: [],
    duplicateBusinessNames: [],
    duplicatePhones: [],
    missingCriticalFields: [],
    malformedPhones: [],
    malformedUrls: [],
    ratingsAnomalies: [],
    priorityAnomalies: [],
    missingHooks: [],
    emptyAddresses: [],
    industryDistribution: {},
    priorityDistribution: {},
    statusDistribution: {},
    ratingsStats: {
        totalReviewsCounted: 0,
        averageRating: 0,
        perfect5Count: 0,
        ratingBuckets: { '5.0': 0, '4.5-4.9': 0, '4.0-4.4': 0, '<4.0': 0, 'No Rating': 0 }
    },
    contactCoverage: {
        withPhone: 0,
        withExistingWebsite: 0,
        pureNoWebsite: 0,
        withAgencyDemo: 0
    }
};

const seenIds = new Map();
const seenNames = new Map();
const seenPhones = new Map();

let sumRatings = 0;
let ratedCount = 0;

currentLeads.forEach((row, idx) => {
    const id = String(row['Client ID'] || '').trim();
    const name = String(row['Business Name'] || '').trim();
    const phone = String(row['Phone/WhatsApp'] || '').trim();
    const agencyUrl = String(row['Agency Hosted URL'] || '').trim();
    const existingWeb = String(row['Existing Website'] || '').trim();
    const hook = String(row['AI Outreach Hook'] || '').trim();
    const priority = String(row['Priority Level'] || '').trim();
    const ratingStr = String(row['Ratings'] || '').trim();
    const reviewsStr = String(row['Number Of Reviews'] || '').trim();
    const industry = String(row['Industry/Niche'] || 'Unspecified').trim();
    const status = String(row['Current Status'] || 'Unspecified').trim();
    const address = String(row['Address'] || '').trim();

    // ID Checks
    if (!id) {
        anomalies.missingCriticalFields.push({ row: idx + 2, field: 'Client ID' });
    } else {
        if (seenIds.has(id)) {
            anomalies.duplicateClientIds.push({ id, firstRow: seenIds.get(id), duplicateRow: idx + 2 });
        } else {
            seenIds.set(id, idx + 2);
        }
    }

    // Name Checks
    if (!name) {
        anomalies.missingCriticalFields.push({ row: idx + 2, field: 'Business Name', id });
    } else {
        const normName = name.toLowerCase().replace(/[^a-z0-9]/g, '');
        if (seenNames.has(normName)) {
            anomalies.duplicateBusinessNames.push({ name, firstRow: seenNames.get(normName), duplicateRow: idx + 2, id });
        } else {
            seenNames.set(normName, idx + 2);
        }
    }

    // Phone Checks
    if (phone) {
        anomalies.contactCoverage.withPhone++;
        const digits = phone.replace(/\D/g, '');
        if (digits.length < 10) {
            anomalies.malformedPhones.push({ id, name, phone, reason: `Too short (${digits.length} digits)` });
        } else if (digits.length > 13) {
            anomalies.malformedPhones.push({ id, name, phone, reason: `Too long (${digits.length} digits)` });
        }
        
        // Track duplicate phone numbers (shared chains or scraped duplicates)
        if (digits.length >= 10) {
            const stdPhone = digits.slice(-10);
            if (seenPhones.has(stdPhone)) {
                anomalies.duplicatePhones.push({ phone, firstId: seenPhones.get(stdPhone), duplicateId: id, name });
            } else {
                seenPhones.set(stdPhone, id);
            }
        }
    } else {
        anomalies.missingCriticalFields.push({ row: idx + 2, field: 'Phone/WhatsApp', id, name });
    }

    // Agency URL Check
    if (agencyUrl) {
        anomalies.contactCoverage.withAgencyDemo++;
        if (!agencyUrl.startsWith('http')) {
            anomalies.malformedUrls.push({ id, name, url: agencyUrl, type: 'Agency Hosted URL', reason: 'Missing protocol' });
        }
    } else {
        anomalies.missingCriticalFields.push({ row: idx + 2, field: 'Agency Hosted URL', id, name });
    }

    // Existing Website Check
    if (existingWeb && existingWeb.toLowerCase() !== 'none') {
        anomalies.contactCoverage.withExistingWebsite++;
        if (!existingWeb.startsWith('http') && !existingWeb.includes('.')) {
            anomalies.malformedUrls.push({ id, name, url: existingWeb, type: 'Existing Website', reason: 'Invalid URL structure' });
        }
    } else {
        anomalies.contactCoverage.pureNoWebsite++;
    }

    // Rating & Reviews Stats
    const ratingNum = parseFloat(ratingStr);
    if (!isNaN(ratingNum)) {
        if (ratingNum < 1.0 || ratingNum > 5.0) {
            anomalies.ratingsAnomalies.push({ id, name, rating: ratingStr, reason: 'Out of 1.0 - 5.0 scale' });
        } else {
            sumRatings += ratingNum;
            ratedCount++;
            if (ratingNum === 5.0) {
                anomalies.ratingsStats.perfect5Count++;
                anomalies.ratingsStats.ratingBuckets['5.0']++;
            } else if (ratingNum >= 4.5) {
                anomalies.ratingsStats.ratingBuckets['4.5-4.9']++;
            } else if (ratingNum >= 4.0) {
                anomalies.ratingsStats.ratingBuckets['4.0-4.4']++;
            } else {
                anomalies.ratingsStats.ratingBuckets['<4.0']++;
            }
        }
    } else {
        anomalies.ratingsStats.ratingBuckets['No Rating']++;
    }

    const reviewNum = parseInt(reviewsStr.replace(/[^0-9]/g, ''), 10);
    if (!isNaN(reviewNum)) {
        anomalies.ratingsStats.totalReviewsCounted += reviewNum;
    }

    // Priority Distribution
    const normPriority = priority.toUpperCase() || 'UNASSIGNED';
    anomalies.priorityDistribution[normPriority] = (anomalies.priorityDistribution[normPriority] || 0) + 1;
    if (!['HIGH', 'MEDIUM', 'LOW'].includes(normPriority)) {
        anomalies.priorityAnomalies.push({ id, name, priority });
    }

    // AI Hook Check
    if (!hook || hook.toLowerCase() === 'none' || hook.length < 15) {
        anomalies.missingHooks.push({ id, name, hookSnippet: hook });
    }

    // Address Check
    if (!address) {
        anomalies.emptyAddresses.push({ id, name });
    }

    // Industry Distribution
    anomalies.industryDistribution[industry] = (anomalies.industryDistribution[industry] || 0) + 1;

    // Status Distribution
    anomalies.statusDistribution[status] = (anomalies.statusDistribution[status] || 0) + 1;
});

anomalies.ratingsStats.averageRating = ratedCount > 0 ? Number((sumRatings / ratedCount).toFixed(2)) : 0;

const auditOutput = {
    timestamp: new Date().toISOString(),
    totalRows: currentLeads.length,
    schema: {
        currentHeaders,
        addedColumns,
        removedColumns,
        orderAlignment: schemaOrderCheck
    },
    userDiff: diffSummary,
    hygieneAudit: anomalies
};

fs.writeFileSync(
    path.join(__dirname, '..', 'data_exports', 'sheet_audit_and_anomalies.json'),
    JSON.stringify(auditOutput, null, 2),
    'utf8'
);

console.log('\n===========================================================');
console.log('📊 SHEET AUDIT SUMMARY');
console.log('===========================================================');
console.log(`Total Leads: ${currentLeads.length}`);
console.log(`Modified Rows Detected: ${diffSummary.modifiedRowsCount}/${currentLeads.length}`);
console.log('\nFields Changed by User:');
for (const [f, count] of Object.entries(diffSummary.fieldChangeCounts)) {
    console.log(`  - ${f}: ${count} rows modified`);
}
console.log('\nContact Coverage:');
console.log(`  - Phone/WhatsApp Available: ${anomalies.contactCoverage.withPhone}/500 (${(anomalies.contactCoverage.withPhone/5).toFixed(1)}%)`);
console.log(`  - Agency Demo URLs: ${anomalies.contactCoverage.withAgencyDemo}/500 (100%)`);
console.log(`  - Pure Leads Without Existing Website: ${anomalies.contactCoverage.pureNoWebsite}/500 (${(anomalies.contactCoverage.pureNoWebsite/5).toFixed(1)}%)`);
console.log(`  - Leads with Existing Old Website: ${anomalies.contactCoverage.withExistingWebsite}/500 (${(anomalies.contactCoverage.withExistingWebsite/5).toFixed(1)}%)`);
console.log('\nRatings Overview:');
console.log(`  - Average Rating: ${anomalies.ratingsStats.averageRating}★`);
console.log(`  - Total Google Reviews: ${anomalies.ratingsStats.totalReviewsCounted.toLocaleString()}`);
console.log(`  - Perfect 5.0★ Businesses: ${anomalies.ratingsStats.perfect5Count}`);
console.log('\nPriority Breakdown:');
for (const [p, c] of Object.entries(anomalies.priorityDistribution)) {
    console.log(`  - ${p}: ${c}`);
}
console.log('\nIndustry Top Breakdown:');
const sortedIndustries = Object.entries(anomalies.industryDistribution).sort((a,b) => b[1] - a[1]);
sortedIndustries.slice(0, 8).forEach(([ind, c]) => console.log(`  - ${ind}: ${c}`));

console.log('\nAnomalies & Hygiene Flags:');
console.log(`  - Duplicate Client IDs: ${anomalies.duplicateClientIds.length}`);
console.log(`  - Duplicate Business Names: ${anomalies.duplicateBusinessNames.length}`);
console.log(`  - Duplicate Phone Numbers: ${anomalies.duplicatePhones.length}`);
console.log(`  - Malformed / Short Phones: ${anomalies.malformedPhones.length}`);
console.log(`  - Priority Inconsistencies: ${anomalies.priorityAnomalies.length}`);
console.log(`  - Missing AI Hooks: ${anomalies.missingHooks.length}`);
console.log(`  - Empty Addresses: ${anomalies.emptyAddresses.length}`);
console.log('===========================================================');

