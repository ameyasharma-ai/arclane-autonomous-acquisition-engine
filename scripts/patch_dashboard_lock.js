import fs from 'fs';

const htmlPath = 'public/index.html';
// Normalize CRLF to LF
let content = fs.readFileSync(htmlPath, 'utf8').replace(/\r\n/g, '\n');

// 1. Input bar HTML
const targetHtml = `<div class="p-3 bg-slate-950 border-t border-slate-800 flex gap-2">
                    <input type="text" id="cmdInput" class="flex-1 bg-slate-900 border border-slate-800 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-cyan-500" placeholder="Type command (e.g. /status, /auto_explore, or paste a Google Maps URL)..." onkeypress="if(event.key === 'Enter') sendInput()">
                    <button onclick="sendInput()" class="px-5 py-2.5 bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold text-sm rounded-xl transition">Send</button>
                </div>`;

const replacementHtml = `<!-- Terminal Input Bar with Concurrency Guard & Lock -->
                <div class="p-3 bg-slate-950 border-t border-slate-800 flex items-center gap-2 relative">
                    <div id="process-lock-banner" class="hidden absolute -top-8 left-0 right-0 bg-amber-500/15 border-t border-b border-amber-500/30 px-3 py-1 flex items-center justify-between text-[11px] text-amber-300 backdrop-blur-md">
                        <span class="flex items-center gap-1.5 font-medium">
                            <span class="w-2 h-2 rounded-full bg-amber-400 animate-ping"></span>
                            <span id="process-lock-text">Process actively running... Input locked.</span>
                        </span>
                        <button onclick="abortRunningProcess()" class="px-2 py-0.5 bg-red-500/20 hover:bg-red-500/30 text-red-300 border border-red-500/40 rounded text-[10px] font-bold transition">
                            🛑 Abort Process
                        </button>
                    </div>
                    <input type="text" id="cmdInput" class="flex-1 bg-slate-900 border border-slate-800 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-cyan-500 disabled:opacity-50 disabled:cursor-not-allowed transition" placeholder="Type command (e.g. /status, /auto_explore, or paste a Google Maps URL)..." onkeypress="if(event.key === 'Enter') sendInput()">
                    <button id="cmdSendBtn" onclick="sendInput()" class="px-5 py-2.5 bg-cyan-500 hover:bg-cyan-400 disabled:bg-slate-800 disabled:text-slate-500 disabled:cursor-not-allowed text-slate-950 font-bold text-sm rounded-xl transition">Send</button>
                    <button id="cmdAbortBtn" onclick="abortRunningProcess()" class="hidden px-4 py-2.5 bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 border border-rose-500/40 font-bold text-sm rounded-xl transition" title="Abort current execution">Abort</button>
                </div>`;

if (content.includes(targetHtml)) {
    content = content.replace(targetHtml, replacementHtml);
    console.log('✓ Replaced Input bar HTML');
} else {
    console.warn('✗ Target HTML not found');
}

// 2. JavaScript sendInput logic
const targetJs = `        function sendInput() {
            const text = cmdInput.value.trim();
            if (!text) return;
            sendCommand(text);
            cmdInput.value = '';
        }

        function sendCommand(cmd) {
            socket.emit('command', { text: cmd });
            // Show toast notification
            showToast(\`⚡ Triggered: \${cmd}\`);
            // Auto switch to terminal view so user sees live output
            switchView('terminal');
        }`;

const replacementJs = `        let isProcessRunning = false;

        function updateProcessLockUI(status) {
            const isBusy = status && Boolean(status.isBusy);
            isProcessRunning = isBusy;
            const input = document.getElementById('cmdInput');
            const sendBtn = document.getElementById('cmdSendBtn');
            const abortBtn = document.getElementById('cmdAbortBtn');
            const banner = document.getElementById('process-lock-banner');
            const bannerText = document.getElementById('process-lock-text');

            if (isBusy) {
                input.disabled = true;
                sendBtn.disabled = true;
                if (abortBtn) abortBtn.classList.remove('hidden');
                if (banner) {
                    banner.classList.remove('hidden');
                    bannerText.innerText = \`⏳ \${status.reason || 'Process actively running'}... Input locked.\`;
                }
                input.placeholder = \`⏳ Active: \${status.reason || 'Execution in progress'} (Click Abort to halt)\`;
            } else {
                input.disabled = false;
                sendBtn.disabled = false;
                if (abortBtn) abortBtn.classList.add('hidden');
                if (banner) banner.classList.add('hidden');
                input.placeholder = "Type command (e.g. /status, /auto_explore, or paste a Google Maps URL)...";
            }
        }

        function abortRunningProcess() {
            if (!confirm('Are you sure you want to abort the currently running process?')) return;
            socket.emit('command', { text: '/abort' });
            showToast('🛑 Sending Abort signal...');
        }

        function sendInput() {
            const text = cmdInput.value.trim();
            if (!text) return;
            if (isProcessRunning && !text.startsWith('/status') && !text.startsWith('/abort') && !text.startsWith('/today')) {
                showToast('⚠️ Process is currently busy! Wait or click Abort.');
                return;
            }
            sendCommand(text);
            cmdInput.value = '';
        }

        function sendCommand(cmd) {
            socket.emit('command', { text: cmd });
            // Show toast notification
            showToast(\`⚡ Triggered: \${cmd}\`);
            // Auto switch to terminal view so user sees live output
            switchView('terminal');
        }`;

if (content.includes(targetJs)) {
    content = content.replace(targetJs, replacementJs);
    console.log('✓ Replaced sendInput JS logic');
} else {
    console.warn('✗ Target JS not found');
}

// 3. Socket event listener
const targetSocket = `        // Live Socket.io Updates
        socket.on('metrics_update', (metrics) => {
            updateMetricsDisplay(metrics);
        });`;

const replacementSocket = `        // Live Socket.io Updates
        socket.on('process_status', (status) => {
            updateProcessLockUI(status);
        });

        socket.on('metrics_update', (metrics) => {
            updateMetricsDisplay(metrics);
        });`;

if (content.includes(targetSocket)) {
    content = content.replace(targetSocket, replacementSocket);
    console.log('✓ Added socket process_status listener');
} else {
    console.warn('✗ Target Socket not found');
}

fs.writeFileSync(htmlPath, content, 'utf8');
console.log('Finished updating public/index.html');
