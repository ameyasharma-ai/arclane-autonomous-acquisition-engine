import fs from 'fs';
import path from 'path';

const htmlPath = path.join(process.cwd(), 'public', 'index.html');
let content = fs.readFileSync(htmlPath, 'utf8');

const target = `<h3 class="text-sm font-bold text-white uppercase tracking-wider mb-4">⚡ Quick Triggers</h3>
                        <div class="grid grid-cols-2 gap-3">`;

const replacement = `<h3 class="text-sm font-bold text-white uppercase tracking-wider mb-4">⚡ Quick Triggers</h3>
                        <div class="grid grid-cols-2 gap-3">
                            <button onclick="openVisionModal()" class="p-3.5 bg-gradient-to-br from-indigo-950/70 via-slate-950 to-purple-950/70 hover:from-indigo-900/80 hover:to-purple-900/80 border border-indigo-500/40 hover:border-indigo-400 rounded-xl text-left transition col-span-2 shadow-sm group">
                                <div class="flex items-center justify-between">
                                    <span class="text-xs text-indigo-300 font-extrabold flex items-center gap-1.5 group-hover:text-white">📸 Vision AI Scrape & Build (Google Maps Photos)</span>
                                    <span class="text-[10px] bg-indigo-500/30 text-indigo-200 border border-indigo-400/40 px-2 py-0.5 rounded-full font-mono font-bold">New Pipeline</span>
                                </div>
                                <span class="text-[11px] text-slate-400 block mt-1">Extracts real Google Maps photos, runs Gemini Vision AI classification, downloads HD assets locally, and builds custom prototype</span>
                            </button>`;

if (content.includes(target) && !content.includes('Vision AI Scrape & Build (Google Maps Photos)')) {
    content = content.replace(target, replacement);
    fs.writeFileSync(htmlPath, content, 'utf8');
    console.log('✅ Added Vision AI quick trigger card to Overview tab');
} else if (content.includes('\r\n')) {
    const crlfTarget = target.replace(/\n/g, '\r\n');
    if (content.includes(crlfTarget) && !content.includes('Vision AI Scrape & Build (Google Maps Photos)')) {
        content = content.replace(crlfTarget, replacement.replace(/\n/g, '\r\n'));
        fs.writeFileSync(htmlPath, content, 'utf8');
        console.log('✅ Added Vision AI quick trigger card with CRLF matching');
    }
}

