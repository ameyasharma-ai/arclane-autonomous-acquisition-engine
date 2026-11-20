import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const TUNNEL_URL_FILE = path.join(__dirname, '../data/tunnel_url.txt');

function startTunnel() {
    console.log('[Tunnel] 🚀 Initializing Instant HTTPS Tunnel via SSH...');
    const child = spawn('ssh', [
        '-o', 'StrictHostKeyChecking=no',
        '-o', 'ServerAliveInterval=30',
        '-R', '80:127.0.0.1:3001',
        'nokey@localhost.run'
    ]);

    let tunnelUrl = null;

    child.stdout.on('data', (data) => {
        const text = data.toString();
        const match = text.match(/(https:\/\/[a-zA-Z0-9-]+\.app\.lhr\.life|https:\/\/[a-zA-Z0-9-]+\.lhr\.life)/);
        if (match && !tunnelUrl) {
            tunnelUrl = match[1];
            try {
                fs.writeFileSync(TUNNEL_URL_FILE, tunnelUrl);
            } catch (e) {}
            console.log('\n==================================================');
            console.log('🌐 [ArcLane HTTPS Tunnel] LIVE ON MOBILE:');
            console.log(`👉 ${tunnelUrl}`);
            console.log('🔑 Admin Password:', process.env.ADMIN_PASSWORD || 'arclane2026!');
            console.log('==================================================\n');
        }
    });

    child.stderr.on('data', (data) => {
        const text = data.toString();
        const match = text.match(/(https:\/\/[a-zA-Z0-9-]+\.app\.lhr\.life|https:\/\/[a-zA-Z0-9-]+\.lhr\.life)/);
        if (match && !tunnelUrl) {
            tunnelUrl = match[1];
            try {
                fs.writeFileSync(TUNNEL_URL_FILE, tunnelUrl);
            } catch (e) {}
            console.log('\n==================================================');
            console.log('🌐 [ArcLane HTTPS Tunnel] LIVE ON MOBILE:');
            console.log(`👉 ${tunnelUrl}`);
            console.log('🔑 Admin Password:', process.env.ADMIN_PASSWORD || 'arclane2026!');
            console.log('==================================================\n');
        }
    });

    child.on('close', (code) => {
        console.log(`[Tunnel] Connection closed (code ${code}). Reconnecting in 3s...`);
        tunnelUrl = null;
        setTimeout(startTunnel, 3000);
    });

    child.on('error', (err) => {
        console.error('[Tunnel] Error:', err.message);
    });
}

startTunnel();
