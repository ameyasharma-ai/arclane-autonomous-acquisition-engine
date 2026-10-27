import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const agencyDir = path.join(rootDir, 'web-dev-agency');

function run(cmd, cwd) {
    try {
        return execSync(cmd, { cwd, encoding: 'utf-8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
    } catch (e) {
        return null;
    }
}

function commitAndPushRepo(repoPath, label, customMessage) {
    console.log(`\n🔍 Checking repository: ${label} (${repoPath})...`);
    if (!fs.existsSync(repoPath)) {
        console.log(`⚠️ Path ${repoPath} does not exist. Skipping.`);
        return;
    }

    const status = run('git status --porcelain', repoPath);
    if (!status) {
        console.log(`✨ ${label} working tree is clean. Nothing to commit.`);
        return;
    }

    console.log(`📝 Detected changes in ${label}:\n${status}\n`);

    // Determine descriptive message if not provided
    let message = customMessage;
    if (!message) {
        const changedFiles = status
            .split('\n')
            .map(line => line.trim().substring(3).trim())
            .filter(Boolean);

        const summary = changedFiles.slice(0, 3).join(', ');
        const extra = changedFiles.length > 3 ? ` (+${changedFiles.length - 3} more)` : '';
        message = `chore(auto): commit major changes in ${summary}${extra}`;
    }

    console.log(`⚙️ Staging files...`);
    run('git add -A', repoPath);

    console.log(`💾 Committing with message: "${message}"...`);
    const commitOut = run(`git commit -m "${message.replace(/"/g, '\\"')}"`, repoPath);
    if (commitOut) {
        console.log(commitOut);
    }

    console.log(`🚀 Pushing to origin main...`);
    const pushOut = run('git push origin main', repoPath);
    if (pushOut) {
        console.log(pushOut);
    }
    console.log(`✅ ${label} committed and pushed successfully!`);
}

const customMsg = process.argv.slice(2).join(' ').trim();
console.log('====================================================');
console.log('🔄 ARCLANE AUTO-COMMIT DISPATCHER');
console.log('====================================================');

// 1. Commit and push parent engine repo
commitAndPushRepo(rootDir, 'Arclane Engine', customMsg);

// 2. Commit and push web-dev-agency repo if modified
if (fs.existsSync(agencyDir)) {
    commitAndPushRepo(agencyDir, 'Web Dev Agency Submodule/Repo', customMsg);
}

console.log('\n🎉 All repositories synchronized.');
