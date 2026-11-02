import fs from 'fs';

const htmlPath = 'public/index.html';
let html = fs.readFileSync(htmlPath, 'utf8');

// 1. Insert Photo Strategy selector in header
const targetHeader = '<button onclick="openVisionModal()" id="btn-vision-pipeline"';
const photoSelectorHtml = `<!-- Persistent Photo Sourcing Strategy -->
            <div class="flex items-center gap-1.5 bg-slate-900 border border-slate-700/80 rounded-lg px-2.5 py-1 text-xs shadow-sm" title="Persistent Photo Policy (Stored across restarts)">
                <span class="text-slate-400 font-medium">📸 Photos:</span>
                <select id="select-photo-policy" onchange="changePhotoPolicy(this.value)" class="bg-transparent text-amber-300 font-bold focus:outline-none cursor-pointer">
                    <option value="auto" class="bg-slate-900 text-slate-100">Auto (Maps First, Stock Fallback)</option>
                    <option value="stock_only" class="bg-slate-900 text-slate-100">Verified Stock Only</option>
                    <option value="maps_only" class="bg-slate-900 text-slate-100">Strict Maps Only</option>
                </select>
            </div>\n\n            `;

if (!html.includes('id="select-photo-policy"')) {
    html = html.replace(targetHeader, photoSelectorHtml + targetHeader);
    console.log('✅ Injected Photo Sourcing Selector into dashboard header');
}

// 2. Add lead photo toggle button in Approval Queue card
const demoUrlTarget = '${safeDemoUrl ? `<div class="text-xs text-cyan-400">🔗 Live Demo: <a href="${safeDemoUrl}" target="_blank" rel="noopener noreferrer" class="underline font-semibold">${escapeHtml(q.demo_url)}</a></div>` : \'\'}';
const leadPhotoToggleBtn = `\${safeDemoUrl ? \`<div class="flex items-center justify-between text-xs text-cyan-400 pt-1">
                        <div>🔗 Live Demo: <a href="\${safeDemoUrl}" target="_blank" rel="noopener noreferrer" class="underline font-semibold">\${escapeHtml(q.demo_url)}</a></div>
                        <button onclick="toggleLeadPhotoSource('\${safeLeadId}', '\${q.photo_source === 'stock' ? 'maps' : 'stock'}')" class="px-2 py-1 bg-slate-800 hover:bg-slate-700 text-amber-300 border border-slate-700 rounded-lg text-xs font-semibold transition flex items-center gap-1" title="Toggle between authentic Google Maps photos and verified stock photography">
                            <span>🔄</span> <span>Switch to \${q.photo_source === 'stock' ? 'Maps Photos' : 'Curated Stock'}</span>
                        </button>
                    </div>\` : \'\'}`;

if (html.includes(demoUrlTarget) && !html.includes('toggleLeadPhotoSource')) {
    html = html.replace(demoUrlTarget, leadPhotoToggleBtn);
    console.log('✅ Injected Lead Photo Source Toggle button into Approval Queue card');
}

// 3. Add client JS functions
const jsFunctions = `
        // --- Photo Policy Client API ---
        async function fetchPhotoPolicy() {
            try {
                const res = await fetch('/api/photo-policy');
                const data = await res.json();
                if (data.success && data.mode) {
                    const sel = document.getElementById('select-photo-policy');
                    if (sel) sel.value = data.mode;
                }
            } catch (e) {
                console.warn('[PhotoPolicy] Error fetching policy:', e);
            }
        }

        async function changePhotoPolicy(mode) {
            try {
                showToast(\`📸 Setting photo policy to: \${mode}...\`);
                const res = await fetch('/api/photo-policy/toggle', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ mode })
                });
                const data = await res.json();
                if (data.success) {
                    showToast(\`✅ Photo policy persistently set to: \${mode}\`);
                }
            } catch (e) {
                alert('Failed to change photo policy: ' + e.message);
            }
        }

        async function toggleLeadPhotoSource(clientId, targetSource) {
            if (!confirm(\`Rebuild Lead #\${clientId} with \${targetSource === 'stock' ? 'Curated Stock' : 'Authentic Maps'} photos?\`)) return;
            showToast(\`🔄 Rebuilding Lead #\${clientId} with \${targetSource} photos...\`);
            try {
                const res = await fetch('/api/photo-policy/lead-toggle', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ clientId, source: targetSource })
                });
                const data = await res.json();
                if (data.success) {
                    showToast(\`🎉 Lead #\${clientId} rebuilt successfully with \${targetSource} photos!\`);
                    fetchApprovalQueue();
                } else {
                    alert('Error toggling photo: ' + data.error);
                }
            } catch (e) {
                alert('Request failed: ' + e.message);
            }
        }
`;

if (!html.includes('function fetchPhotoPolicy()')) {
    html = html.replace('// Real-time Event Listeners', jsFunctions + '\n        // Real-time Event Listeners');
    // Also call fetchPhotoPolicy on load
    html = html.replace('fetchSchedulerStatus();', 'fetchSchedulerStatus();\n            fetchPhotoPolicy();');
    console.log('✅ Injected Photo Policy JavaScript functions');
}

fs.writeFileSync(htmlPath, html, 'utf8');
console.log('public/index.html patched successfully!');
