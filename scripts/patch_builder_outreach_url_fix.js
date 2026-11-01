import fs from 'fs';
import path from 'path';

const builderPath = path.join(process.cwd(), 'src', 'builder.js');
let raw = fs.readFileSync(builderPath, 'utf8');
const isCrlf = raw.includes('\r\n');
let content = raw.replace(/\r\n/g, '\n');

const oldRegex = `        // Extract WhatsApp message
        let waMessage = "";
        const waMatch = reportContent.match(/\\[WHATSAPP_START\\]([\\s\\S]*?)\\[WHATSAPP_END\\]/i);
        if (waMatch) {
            waMessage = waMatch[1].trim().replace(/\\[website-url\\]|https:\\/\\/[a-zA-Z0-9-.]+\\.vercel\\.app/gi, deployedUrl);
        }

        // Extract Call Script
        let callScript = "";
        const callMatch = reportContent.match(/\\[CALL_SCRIPT_START\\]([\\s\\S]*?)\\[CALL_SCRIPT_END\\]/i);
        if (callMatch) {
            callScript = callMatch[1].trim().replace(/\\[website-url\\]|https:\\/\\/[a-zA-Z0-9-.]+\\.vercel\\.app/gi, deployedUrl);
        }`;

const newRegex = `        // Extract WhatsApp message with bulletproof URL normalization
        let waMessage = "";
        const waMatch = reportContent.match(/\\[WHATSAPP_START\\]([\\s\\S]*?)\\[WHATSAPP_END\\]/i);
        if (waMatch) {
            let msg = waMatch[1].trim();
            msg = msg.replace(/\\[website-url\\]/gi, deployedUrl);
            msg = msg.replace(/https?:\\/\\/[a-zA-Z0-9-.]+\\.(?:vercel\\.app|netlify\\.app|workers\\.dev|studio|app|github\\.io)[^\\s]*/gi, deployedUrl);
            msg = msg.replace(/(🔗\\s*)https?:\\/\\/[^\\s]+/gi, \`$1\${deployedUrl}\`);
            waMessage = msg;
        }

        // Extract Call Script with bulletproof URL normalization
        let callScript = "";
        const callMatch = reportContent.match(/\\[CALL_SCRIPT_START\\]([\\s\\S]*?)\\[CALL_SCRIPT_END\\]/i);
        if (callMatch) {
            let script = callMatch[1].trim();
            script = script.replace(/\\[website-url\\]/gi, deployedUrl);
            script = script.replace(/https?:\\/\\/[a-zA-Z0-9-.]+\\.(?:vercel\\.app|netlify\\.app|workers\\.dev|studio|app|github\\.io)[^\\s]*/gi, deployedUrl);
            script = script.replace(/(🔗\\s*)https?:\\/\\/[^\\s]+/gi, \`$1\${deployedUrl}\`);
            callScript = script;
        }`;

if (!content.includes(oldRegex)) {
    console.error('Target oldRegex not found!');
    process.exit(1);
}

content = content.replace(oldRegex, newRegex);

const oldFinal = `            whatsappMessage: waMessage.replace(new RegExp(deployedUrl, 'g'), primaryLiveUrl),
            callScript: callScript.replace(new RegExp(deployedUrl, 'g'), primaryLiveUrl),`;

const newFinal = `            whatsappMessage: waMessage.replace(new RegExp(deployedUrl, 'g'), primaryLiveUrl).replace(/(🔗\\s*)https?:\\/\\/[^\\s]+/gi, \`$1\${primaryLiveUrl}\`),
            callScript: callScript.replace(new RegExp(deployedUrl, 'g'), primaryLiveUrl).replace(/(🔗\\s*)https?:\\/\\/[^\\s]+/gi, \`$1\${primaryLiveUrl}\`),`;

if (!content.includes(oldFinal)) {
    console.error('Target oldFinal not found!');
    process.exit(1);
}

content = content.replace(oldFinal, newFinal);

if (isCrlf) {
    content = content.replace(/\n/g, '\r\n');
}

fs.writeFileSync(builderPath, content, 'utf8');
console.log('✅ Real patch applied to src/builder.js successfully!');
