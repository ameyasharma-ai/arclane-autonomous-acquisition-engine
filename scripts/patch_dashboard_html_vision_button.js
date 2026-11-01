import fs from 'fs';
import path from 'path';

const htmlPath = path.join(process.cwd(), 'public', 'index.html');
let content = fs.readFileSync(htmlPath, 'utf8');

// 1. Add header button
const headerTarget = '<button onclick="startTwelveHourAutopilot()" id="btn-autopilot-12h"';
const headerButton = `<button onclick="openVisionModal()" id="btn-vision-pipeline" class="px-3.5 py-1.5 rounded-lg bg-gradient-to-r from-violet-600 via-indigo-600 to-purple-600 hover:from-violet-500 hover:to-indigo-500 text-white text-xs font-bold transition flex items-center gap-1.5 shadow-md shadow-indigo-500/25 border border-indigo-400/40" title="Scrape Google Maps & build live website using authentic Maps photos analyzed by Gemini Vision">
                <span>📸</span> <span>Vision AI Scrape & Build</span>
            </button>
            <button onclick="startTwelveHourAutopilot()" id="btn-autopilot-12h"`;

if (!content.includes('id="btn-vision-pipeline"')) {
    content = content.replace(headerTarget, headerButton);
    console.log('✅ Added Vision AI button to header');
}

// 2. Add quick trigger card
const quickTriggerTarget = `<div class="grid grid-cols-2 gap-3">
                            <button onclick="sendCommand('/status')"`;

const quickTriggerCard = `<div class="grid grid-cols-2 gap-3">
                            <button onclick="openVisionModal()" class="p-3.5 bg-gradient-to-br from-indigo-950/70 via-slate-950 to-purple-950/70 hover:from-indigo-900/80 hover:to-purple-900/80 border border-indigo-500/40 hover:border-indigo-400 rounded-xl text-left transition col-span-2 shadow-sm group">
                                <div class="flex items-center justify-between">
                                    <span class="text-xs text-indigo-300 font-extrabold flex items-center gap-1.5 group-hover:text-white">📸 Vision AI Scrape & Build (Google Maps Photos)</span>
                                    <span class="text-[10px] bg-indigo-500/30 text-indigo-200 border border-indigo-400/40 px-2 py-0.5 rounded-full font-mono font-bold">New Vision Pipeline</span>
                                </div>
                                <span class="text-[11px] text-slate-400 block mt-1">Extracts real Google Maps photos, runs Gemini Vision AI classification, downloads HD assets locally, and builds custom prototype</span>
                            </button>
                            <button onclick="sendCommand('/status')"`;

if (!content.includes('Vision AI Scrape & Build (Google Maps Photos)')) {
    content = content.replace(quickTriggerTarget, quickTriggerCard);
    console.log('✅ Added Vision AI quick trigger card to Overview tab');
}

// 3. Add Modal and JS helper functions before </body>
const modalAndJs = `
    <!-- MODAL: Vision AI Scrape & Build Config -->
    <div id="modal-vision-pipeline" class="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4 hidden">
        <div class="bg-slate-900 border border-slate-800 rounded-2xl max-w-md w-full p-6 shadow-2xl relative">
            <div class="flex items-center justify-between mb-4 border-b border-slate-800 pb-3">
                <div class="flex items-center gap-2">
                    <span class="text-xl">📸</span>
                    <div>
                        <h3 class="text-base font-bold text-white">Vision AI Scrape & Build</h3>
                        <p class="text-[11px] text-indigo-400">Authentic Google Maps Photos + Gemini Vision</p>
                    </div>
                </div>
                <button onclick="closeVisionModal()" class="text-slate-400 hover:text-white text-xl p-1 leading-none">&times;</button>
            </div>
            
            <p class="text-xs text-slate-300 mb-4 leading-relaxed">
                Autonomous pipeline: crawls real photos from the business's Google Maps profile, uses <strong>Gemini Vision</strong> to classify the best hero ambiance & facility shots, downloads high-resolution local assets, and compiles a live prototype.
            </p>

            <div class="space-y-3.5">
                <div>
                    <label class="block text-xs font-semibold text-slate-300 mb-1">Search Query / Industry</label>
                    <input type="text" id="vision-query" class="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500" value="Restaurants" placeholder="e.g. Restaurants, Gyms, Dental Clinics, Cafes">
                </div>
                <div>
                    <label class="block text-xs font-semibold text-slate-300 mb-1">Locality (Target Zone)</label>
                    <input type="text" id="vision-locality" class="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500" value="Kankarbagh, Patna" placeholder="e.g. Kankarbagh, Patna or Fraser Road, Patna">
                </div>
                <div class="grid grid-cols-2 gap-3">
                    <div>
                        <label class="block text-xs font-semibold text-slate-300 mb-1">City</label>
                        <input type="text" id="vision-city" class="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500" value="Patna">
                    </div>
                    <div>
                        <label class="block text-xs font-semibold text-slate-300 mb-1">Target Leads</label>
                        <input type="number" id="vision-count" class="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500" value="1" min="1" max="25">
                    </div>
                </div>
            </div>

            <div class="mt-6 flex items-center justify-end gap-2 border-t border-slate-800 pt-4">
                <button onclick="closeVisionModal()" class="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-300 transition">Cancel</button>
                <button onclick="executeVisionPipeline()" class="px-5 py-2 rounded-lg bg-gradient-to-r from-violet-600 via-indigo-600 to-purple-600 hover:from-violet-500 hover:to-indigo-500 text-xs font-extrabold text-white shadow-lg shadow-indigo-500/30 transition flex items-center gap-1.5">
                    <span>⚡ Launch Vision Pipeline</span>
                </button>
            </div>
        </div>
    </div>

    <script>
        function openVisionModal() {
            const modal = document.getElementById('modal-vision-pipeline');
            if (modal) modal.classList.remove('hidden');
        }

        function closeVisionModal() {
            const modal = document.getElementById('modal-vision-pipeline');
            if (modal) modal.classList.add('hidden');
        }

        function executeVisionPipeline() {
            const query = document.getElementById('vision-query').value.trim() || 'Restaurants';
            const locality = document.getElementById('vision-locality').value.trim() || 'in Patna';
            const city = document.getElementById('vision-city').value.trim() || 'Patna';
            const count = parseInt(document.getElementById('vision-count').value.trim(), 10) || 1;

            closeVisionModal();
            const commandText = \`/stream_scrape_vision "\${query}" "\${locality}" "\${city}" \${count}\`;
            sendCommand(commandText);
            showToast(\`📸 Launching Vision Pipeline: \${query} in \${locality} (\${count} lead\${count > 1 ? 's' : ''})\`);
        }
    </script>
</body>`;

if (!content.includes('id="modal-vision-pipeline"')) {
    content = content.replace('</body>', modalAndJs);
    console.log('✅ Added Vision modal & client JS logic before </body>');
}

fs.writeFileSync(htmlPath, content, 'utf8');
console.log('✅ public/index.html fully patched with zero errors!');
