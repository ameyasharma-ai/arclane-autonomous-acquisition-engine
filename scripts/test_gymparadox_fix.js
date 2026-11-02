import fs from 'fs';
import { WebsiteBuilder } from '../src/builder.js';
import { visualQualityGate } from '../src/engine/visual_quality_gate.js';

async function testFix() {
    const rawHtml = fs.readFileSync('web-dev-agency/public/sites/gymparadox/index.html', 'utf8');
    const builder = new WebsiteBuilder();
    
    console.log('1. Testing enforceDesignQualityStandards...');
    let html = builder.enforceDesignQualityStandards(rawHtml, 'gymparadox', 'The Gym Paradox');

    console.log('2. Testing visualQualityGate.auditAndFix...');
    const result = await visualQualityGate.auditAndFix(html, 'gymparadox', 'The Gym Paradox');
    console.log('Visual gate result:', result.passed ? 'PASSED' : 'FAILED');
    console.log('Issues fixed count:', result.issuesFixed.length);
    result.issuesFixed.forEach(iss => console.log('  -', iss));

    await visualQualityGate.close();

    fs.writeFileSync('web-dev-agency/public/sites/gymparadox/index.html', result.cleanHtml, 'utf8');
    console.log('Successfully wrote cleaned HTML to gymparadox/index.html!');
}

testFix().catch(console.error);
