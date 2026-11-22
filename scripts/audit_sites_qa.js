#!/usr/bin/env node
import { SiteQAAuditor } from '../src/qa_auditor.js';

const args = process.argv.slice(2);
let start = 1;
let end = 600;
let autoFix = false;

for (const arg of args) {
    if (arg === '--fix' || arg === '-f') {
        autoFix = true;
    } else if (!isNaN(parseInt(arg, 10))) {
        if (!process.env.ARG_START) {
            process.env.ARG_START = arg;
            start = parseInt(arg, 10);
        } else {
            end = parseInt(arg, 10);
        }
    }
}

if (start > end) {
    const tmp = start;
    start = end;
    end = tmp;
}

console.log(`=======================================================`);
console.log(` 🔍 ARCLANE CLIENT WEBSITE QA & ASSET AUDITOR`);
console.log(` Target Range: Leads #${start} to #${end}`);
console.log(` Auto-Fix Mode: ${autoFix ? 'ENABLED 🛠️' : 'DISABLED (Read-Only) 👁️'}`);
console.log(`=======================================================\n`);

const auditor = new SiteQAAuditor();

(async () => {
    const startTime = Date.now();
    const result = await auditor.auditRange(start, end, {
        autoFix,
        onProgress: (p) => {
            if (p.completed % 10 === 0 || p.completed === p.total) {
                console.log(`[QA Progress] ${p.completed}/${p.total} (${p.percent}%) - Audited #${p.currentId}: ${p.latestResult.status}`);
            }
        }
    });

    const duration = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`\n=======================================================`);
    console.log(auditor.formatSummaryMarkdown(result));
    console.log(`⏱️ Audit finished in ${duration}s`);
    console.log(`=======================================================`);
})();
