import fs from 'fs';
import path from 'path';

const builderPath = path.join(process.cwd(), 'src', 'builder.js');
let content = fs.readFileSync(builderPath, 'utf8');

const target = "const githubRepoUrl = `https://github.com/ameyasharma-ai/WEB-DEV-AGENCY/tree/main/public/sites/${vercelSlug}`;";

const syncSnippet = `// Ensure authentic assets are synced to agency public sites and generated_sites
        const agencyAssetsDir = path.join(agencyPublisher.agencyPublicSitesDir, vercelSlug, 'assets');
        const clientAssetsDir = path.join(clientSiteDir, 'assets');
        const reportsAssetsDir = path.join(clientReportsDir, 'assets');

        const sourceAssetsDir = fs.existsSync(reportsAssetsDir) ? reportsAssetsDir : (fs.existsSync(clientAssetsDir) ? clientAssetsDir : null);
        if (sourceAssetsDir && fs.existsSync(sourceAssetsDir)) {
            if (!fs.existsSync(agencyAssetsDir)) fs.mkdirSync(agencyAssetsDir, { recursive: true });
            if (!fs.existsSync(clientAssetsDir)) fs.mkdirSync(clientAssetsDir, { recursive: true });

            const assetFiles = fs.readdirSync(sourceAssetsDir);
            for (const f of assetFiles) {
                fs.copyFileSync(path.join(sourceAssetsDir, f), path.join(agencyAssetsDir, f));
                fs.copyFileSync(path.join(sourceAssetsDir, f), path.join(clientAssetsDir, f));
            }
            console.log(\`[Builder] 📁 Synced \${assetFiles.length} authentic asset files to /sites/\${vercelSlug}/assets/\`);
        }

        `;

if (content.includes(target)) {
    content = content.replace(target, syncSnippet + target);
    fs.writeFileSync(builderPath, content, 'utf8');
    console.log('✅ Successfully added asset sync to src/builder.js');
} else {
    console.error('❌ Target string not found in src/builder.js');
}
