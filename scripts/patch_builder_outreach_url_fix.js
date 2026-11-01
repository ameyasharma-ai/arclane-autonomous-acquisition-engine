import fs from 'fs';
import path from 'path';

const builderPath = path.join(process.cwd(), 'src', 'builder.js');
let content = fs.readFileSync(builderPath, 'utf8');

// Target snippet in src/builder.js
const target = `        // Extract WhatsApp message
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

const replacement = `        // Extract WhatsApp message with bulletproof URL normalization
        let waMessage = "";
        const waMatch = reportContent.match(/\\[WHATSAPP_START\\]([\\s\\S]*?)\\[WHATSAPP_END\\]/i);
        if (waMatch) {
            let msg = waMatch[1].trim();
            // Replace [website-url] and any dummy/staging URLs
            msg = msg.replace(/\\[website-url\\]/gi, deployedUrl);
            msg = msg.replace(/https?:\\/\\/[a-zA-Z0-9-.]+\\.(?:vercel\\.app|netlify\\.app|workers\\.dev|studio|app|github\\.io)[^\\s]*/gi, deployedUrl);
            // Replace any URL following the link emoji 🔗
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

if (content.includes('// Extract WhatsApp message')) {
    content = content.replace(target, replacement);
    
    // Also ensure finalWaMessage replaces any remaining URL with primaryLiveUrl
    const finalTarget = `whatsappMessage: waMessage.replace(new RegExp(deployedUrl, 'g'), primaryLiveUrl),
            callScript: callScript.replace(new RegExp(deployedUrl, 'g'), primaryLiveUrl),`;
            
    const finalReplacement = `whatsappMessage: waMessage.replace(new RegExp(deployedUrl, 'g'), primaryLiveUrl).replace(/(🔗\\s*)https?:\\/\\/[^\\s]+/gi, \`$1\${primaryLiveUrl}\`),
            callScript: callScript.replace(new RegExp(deployedUrl, 'g'), primaryLiveUrl).replace(/(🔗\\s*)https?:\\/\\/[^\\s]+/gi, \`$1\${primaryLiveUrl}\`),`;
            
    content = content.replace(finalTarget, finalReplacement);
    
    fs.writeFileSync(builderPath, content, 'utf8');
    console.log('✅ Successfully patched src/builder.js to guarantee Agency Hosted URL in all outreach pitches!');
} else {
    console.error('❌ Could not find target in src/builder.js');
}
