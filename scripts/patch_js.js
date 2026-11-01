import fs from 'fs';

const htmlPath = 'public/index.html';
let content = fs.readFileSync(htmlPath, 'utf8');

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
                if (input) {
                    input.disabled = true;
                    input.placeholder = \`⏳ Active: \${status.reason || 'Execution in progress'} (Click Abort to halt)\`;
                }
                if (sendBtn) sendBtn.disabled = true;
                if (abortBtn) abortBtn.classList.remove('hidden');
                if (banner) {
                    banner.classList.remove('hidden');
                    bannerText.innerText = \`⏳ \${status.reason || 'Process actively running'}... Input locked.\`;
                }
            } else {
                if (input) {
                    input.disabled = false;
                    input.placeholder = "Type command (e.g. /status, /auto_explore, or paste a Google Maps URL)...";
                }
                if (sendBtn) sendBtn.disabled = false;
                if (abortBtn) abortBtn.classList.add('hidden');
                if (banner) banner.classList.add('hidden');
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

if (content.indexOf('function sendInput()') !== -1) {
    const startIdx = content.indexOf('function sendInput()');
    const endMarker = "switchView('terminal');\n        }";
    const endIdx = content.indexOf(endMarker, startIdx);
    if (endIdx !== -1) {
        const fullOld = content.substring(startIdx, endIdx + endMarker.length);
        content = content.replace(fullOld, replacementJs.trim());
        console.log('✓ Successfully replaced sendInput logic with Concurrency Lock!');
    }
}

fs.writeFileSync(htmlPath, content, 'utf8');

