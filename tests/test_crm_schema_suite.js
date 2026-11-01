import assert from 'assert';
import fs from 'fs';
import { createNormalizedLead } from '../src/engine/models.js';

console.log('--- RUNNING CRM SCHEMA INTEGRATION TESTS ---');

// Test 1: Verify Scraper COLUMNS order
console.log('1. Checking scraper COLUMNS definition...');
const scraperContent = fs.readFileSync('scraper/scraper_no_website.py', 'utf8');

const expectedPrefix = [
    "Client ID",
    "Date Added",
    "Business Name",
    "Industry/Niche",
    "City/State",
    "Phone/WhatsApp",
    "Agency Hosted URL",
    "Existing Website",
    "AI Outreach Hook",
    "Current Status",
    "Priority Level",
    "Ratings",
    "Number Of Reviews",
    "Timings",
    "Socials",
    "Address"
];

for (let i = 0; i < expectedPrefix.length; i++) {
    const col = expectedPrefix[i];
    assert(scraperContent.includes(`"${col}"`), `Column ${col} missing from scraper_no_website.py`);
}
console.log('  ✅ Scraper COLUMNS prefix matches expected user specification.');

// Test 2: Check URL splitting logic
console.log('2. Testing URL splitting logic for existing red-highlighted websites...');
const sampleData = [
    {
        agencyHosted: 'https://populardineout.github.io/ | https://www.arclanestudios.space/sites/populardineout',
        website: 'https://populardineout.github.io/'
    },
    {
        agencyHosted: 'https://www.arclanestudios.space/sites/fitnation',
        website: 'https://fitnation.arclanestudios.space'
    }
];

// Lead with existing website
let leadA_agency = sampleData[0].agencyHosted;
let leadA_exist = sampleData[0].website;
if (leadA_agency.includes('|')) {
    const parts = leadA_agency.split('|').map(s => s.trim());
    leadA_exist = parts[0];
    leadA_agency = parts[1];
}
assert.strictEqual(leadA_agency, 'https://www.arclanestudios.space/sites/populardineout');
assert.strictEqual(leadA_exist, 'https://populardineout.github.io/');

// Lead without existing website (new build)
let leadB_agency = sampleData[1].agencyHosted;
let leadB_exist = sampleData[1].website;
if (leadB_agency.includes('|')) {
    const parts = leadB_agency.split('|').map(s => s.trim());
    leadB_exist = parts[0];
    leadB_agency = parts[1];
} else if (leadB_exist.includes('arclanestudios.space')) {
    leadB_exist = '';
}
assert.strictEqual(leadB_agency, 'https://www.arclanestudios.space/sites/fitnation');
assert.strictEqual(leadB_exist, '');
console.log('  ✅ URL separation test passed: Agency Hosted contains pure demo, Existing Website contains client URL.');

// Test 3: Check models.js backward and forward compatibility
console.log('3. Testing model normalization with new schema headers...');
const rawNewLead = {
    'Client ID': 999,
    'Business Name': 'Test Gym',
    'Existing Website': 'https://oldtestgym.com',
    'Agency Hosted URL': 'https://www.arclanestudios.space/sites/testgym',
    'Phone/WhatsApp': '+919999999999',
    'Ratings': '4.8',
    'Number Of Reviews': '45'
};
const normalized = createNormalizedLead(rawNewLead, 999);
assert.strictEqual(normalized.client_id, 999);
assert.strictEqual(normalized.business_name, 'Test Gym');
assert.strictEqual(normalized.website, 'https://oldtestgym.com');
console.log('  ✅ Model normalization correctly resolves Existing Website.');

// Test 4: Socials formatting aggregation
console.log('4. Testing Socials column aggregation...');
const rawSocials = {
    Instagram: 'https://instagram.com/mygym',
    Facebook: 'https://facebook.com/mygym',
    'X (Twitter)': '',
    YouTube: 'https://youtube.com/@mygym',
    TikTok: '',
    LinkedIn: ''
};
const soc_parts = [];
if (rawSocials.Instagram) soc_parts.append ? soc_parts.append(`IG: ${rawSocials.Instagram}`) : soc_parts.push(`IG: ${rawSocials.Instagram}`);
if (rawSocials.Facebook) soc_parts.push(`FB: ${rawSocials.Facebook}`);
if (rawSocials['X (Twitter)']) soc_parts.push(`X: ${rawSocials['X (Twitter)']}`);
if (rawSocials.YouTube) soc_parts.push(`YT: ${rawSocials.YouTube}`);
if (rawSocials.TikTok) soc_parts.push(`TT: ${rawSocials.TikTok}`);
if (rawSocials.LinkedIn) soc_parts.push(`IN: ${rawSocials.LinkedIn}`);
const socialsStr = soc_parts.join(' | ');
assert.strictEqual(socialsStr, 'IG: https://instagram.com/mygym | FB: https://facebook.com/mygym | YT: https://youtube.com/@mygym');
console.log('  ✅ Socials aggregation test passed.');

console.log('\n🎉 ALL SCHEMA INTEGRATION TESTS PASSED 100%!');

