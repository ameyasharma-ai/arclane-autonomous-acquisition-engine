import fs from 'fs';
import path from 'path';

/**
 * ArcLane Codebase Hygiene & Lean Storage Auditor
 * Categorizes files into 3 safety tiers:
 *  🟢 Tier 1: 100% Safe to remove immediately (Scratch scripts, test images, browser cache)
 *  🟡 Tier 2: Safe to prune with confirmation (Stale logs, temporary test captures, duplicates)
 *  🔴 Tier 3: Protected (Core engine, active sites, credentials, CRM states)
 */

function getDirSize(dirPath) {
    let size = 0;
    if (!fs.existsSync(dirPath)) return 0;
    try {
        const entries = fs.readdirSync(dirPath, { withFileTypes: true });
        for (const entry of entries) {
            const fullPath = path.join(dirPath, entry.name);
            if (entry.isDirectory()) {
                size += getDirSize(fullPath);
            } else if (entry.isFile()) {
                size += fs.statSync(fullPath).size;
            }
        }
    } catch {
        // ignore permission errors
    }
    return size;
}

function formatBytes(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

export function auditCodebase(options = {}) {
    const rootDir = process.cwd();
    const isCleanMode = options.clean || false;

    const report = {
        tier1: [], // Safe to remove immediately
        tier2: [], // Prune with confirmation
        tier3: []  // Protected
    };

    // --- TIER 1: Scratch, Test Artifacts, Browser Caches ---
    // 1. Scratch directory files
    const scratchDir = path.join(rootDir, 'scratch');
    if (fs.existsSync(scratchDir)) {
        const scratchFiles = fs.readdirSync(scratchDir);
        for (const f of scratchFiles) {
            const p = path.join(scratchDir, f);
            const stat = fs.statSync(p);
            report.tier1.push({
                path: p,
                relPath: path.relative(rootDir, p),
                size: stat.size,
                reason: 'Temporary scratch test/script file'
            });
        }
    }

    // 2. Root-level test images and diagnostics
    const rootFiles = fs.readdirSync(rootDir);
    for (const f of rootFiles) {
        if (/^(?:crop_.*|test_.*|gamershub_.*|hellorestaurant_.*|full_preview_.*)\.(?:png|jpg|jpeg|webp)$/i.test(f) ||
            /^(?:debug_.*|temp_.*)\.(?:json|txt|log|html)$/i.test(f)) {
            const p = path.join(rootDir, f);
            const stat = fs.statSync(p);
            report.tier1.push({
                path: p,
                relPath: f,
                size: stat.size,
                reason: 'Temporary root-level visual test capture / diagnostic dump'
            });
        }
    }

    // 3. Chrome profile cache directories (GPUCache, Service Worker CacheStorage)
    const chromeCacheDirs = [
        path.join(rootDir, 'chrome_profile', 'Default', 'GPUCache'),
        path.join(rootDir, 'chrome_profile', 'Default', 'Service Worker', 'CacheStorage'),
        path.join(rootDir, 'chrome_profile', 'Default', 'Service Worker', 'ScriptCache'),
        path.join(rootDir, 'chrome_profile', 'GrShaderCache'),
        path.join(rootDir, 'chrome_profile', 'ShaderCache')
    ];

    for (const cd of chromeCacheDirs) {
        if (fs.existsSync(cd)) {
            const sz = getDirSize(cd);
            if (sz > 0) {
                report.tier1.push({
                    path: cd,
                    relPath: path.relative(rootDir, cd),
                    size: sz,
                    isDir: true,
                    reason: 'Disposable Chromium shader/service-worker cache'
                });
            }
        }
    }

    // --- TIER 2: Stale logs, old sessions, redundant test files ---
    const logsDir = path.join(rootDir, 'logs');
    if (fs.existsSync(logsDir)) {
        const logFiles = fs.readdirSync(logsDir);
        for (const lf of logFiles) {
            if (lf.endsWith('.log') && lf !== 'active.log') {
                const p = path.join(logsDir, lf);
                const stat = fs.statSync(p);
                report.tier2.push({
                    path: p,
                    relPath: path.relative(rootDir, p),
                    size: stat.size,
                    reason: 'Archival log file (safe to prune if not actively debugging)'
                });
            }
        }
    }

    // Check for empty report folders
    const reportsDir = path.join(rootDir, 'reports');
    if (fs.existsSync(reportsDir)) {
        const repEntries = fs.readdirSync(reportsDir);
        for (const re of repEntries) {
            const p = path.join(reportsDir, re);
            if (fs.statSync(p).isDirectory()) {
                const items = fs.readdirSync(p);
                if (items.length === 0) {
                    report.tier2.push({
                        path: p,
                        relPath: path.relative(rootDir, p),
                        size: 0,
                        isDir: true,
                        reason: 'Empty report directory without audit or assets'
                    });
                }
            }
        }
    }

    // Calculate totals
    const tier1Total = report.tier1.reduce((sum, item) => sum + item.size, 0);
    const tier2Total = report.tier2.reduce((sum, item) => sum + item.size, 0);

    return {
        report,
        tier1Total,
        tier2Total,
        isCleanMode
    };
}

// CLI Runner
if (process.argv[1] && process.argv[1].endsWith('audit_codebase_hygiene.js')) {
    const shouldClean = process.argv.includes('--clean');
    const { report, tier1Total, tier2Total } = auditCodebase({ clean: shouldClean });

    console.log('====================================================');
    console.log('🧹 ARCLANE CODEBASE HYGIENE & LEAN STORAGE AUDIT');
    console.log('====================================================\n');

    console.log(`🟢 TIER 1: 100% Safe to Delete Immediately (${report.tier1.length} items, ${formatBytes(tier1Total)})`);
    if (report.tier1.length === 0) {
        console.log('   ✨ No Tier 1 junk found! Codebase is already ultra-lean.');
    } else {
        report.tier1.forEach(item => {
            console.log(`   [${formatBytes(item.size)}] ${item.relPath} -> ${item.reason}`);
        });
    }

    console.log(`\n🟡 TIER 2: Safe to Prune with Confirmation (${report.tier2.length} items, ${formatBytes(tier2Total)})`);
    if (report.tier2.length === 0) {
        console.log('   ✨ No Tier 2 stale items found.');
    } else {
        report.tier2.forEach(item => {
            console.log(`   [${formatBytes(item.size)}] ${item.relPath} -> ${item.reason}`);
        });
    }

    console.log('\n🔴 TIER 3: Protected Core Assets (DO NOT TOUCH)');
    console.log('   🔒 src/ (Core engine, scrapers, pipelines, server)');
    console.log('   🔒 web-dev-agency/public/sites/ (Live deployed client websites)');
    console.log('   🔒 data_exports/ (Active CRM leads database)');
    console.log('   🔒 .env / keys (Authentication tokens & API keys)');

    if (shouldClean) {
        console.log('\n⚙️ Executing Safe Cleanup of Tier 1 files...');
        let cleanedBytes = 0;
        let cleanedCount = 0;

        for (const item of report.tier1) {
            try {
                if (item.isDir) {
                    fs.rmSync(item.path, { recursive: true, force: true });
                } else {
                    fs.unlinkSync(item.path);
                }
                cleanedBytes += item.size;
                cleanedCount++;
            } catch (err) {
                console.warn(`   ⚠️ Could not remove ${item.relPath}: ${err.message}`);
            }
        }
        console.log(`✅ Cleaned ${cleanedCount} temporary items, recovered ${formatBytes(cleanedBytes)} of disk space!`);
    } else {
        console.log('\n💡 Recommendation:');
        if (report.tier1.length > 0) {
            console.log(`   Run 'node scripts/audit_codebase_hygiene.js --clean' to safely reclaim ${formatBytes(tier1Total)}.`);
        } else {
            console.log('   Codebase is currently clean and lean. Nothing needs deletion.');
        }
    }
}
