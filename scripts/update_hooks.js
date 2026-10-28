import fs from 'fs';
import path from 'path';
import { loadGoogleSheet } from '../src/sheets.js';

async function updateOutreachHooks() {
    const { sheet } = await loadGoogleSheet();
    const rows = await sheet.getRows();

    const leads = [
        {
            id: 95,
            name: 'Iron Temple Unisex Gym',
            area: 'Kankarbagh',
            rating: '4.8',
            reviews: '135',
            phone: '919835012345',
            url: 'https://irontemple.arclanestudios.space'
        },
        {
            id: 96,
            name: 'Ozone Fitness & Crossfit Hub',
            area: 'Boring Road',
            rating: '4.7',
            reviews: '178',
            phone: '919431023456',
            url: 'https://ozonecrossfit.arclanestudios.space'
        },
        {
            id: 97,
            name: 'Titan Pro Fitness Club',
            area: 'Rajendra Nagar',
            rating: '4.6',
            reviews: '92',
            phone: '919304123456',
            url: 'https://titanpro.arclanestudios.space'
        },
        {
            id: 98,
            name: 'Pulse 24x7 Unisex Fitness',
            area: 'Bailey Road',
            rating: '4.9',
            reviews: '210',
            phone: '919122334455',
            url: 'https://pulse247.arclanestudios.space'
        },
        {
            id: 99,
            name: 'Spartan Strength Studio',
            area: 'Patliputra',
            rating: '4.7',
            reviews: '144',
            phone: '919871234567',
            url: 'https://spartanstrength.arclanestudios.space'
        },
        {
            id: 100,
            name: 'Raw Power Gym & Fitness',
            area: 'Fraser Road',
            rating: '4.8',
            reviews: '165',
            phone: '919546123456',
            url: 'https://rawpower.arclanestudios.space'
        }
    ];

    for (const lead of leads) {
        const waMessage = `Hi Team ${lead.name},\n\nI noticed your gym has stellar ${lead.rating}★ reviews across ${lead.reviews}+ members in ${lead.area}, but lacked a dedicated mobile page for new membership and trial inquiries.\n\nMaine aapke gym ke liye ek custom live website concept design kiya hai — jisme direct WhatsApp trial booking, workout programs, aur batch timings integrate kiye hain:\n\n🔗 ${lead.url}\n\nAapko overall look aur concept kaisa laga? Would love your honest feedback!\n\n— Ameya Sharma, Arclane Studios`;

        const callScript = `"Hi Team ${lead.name}, Ameya here from Arclane Studios. Maine aapke business ke liye ek custom live website concept banakar WhatsApp par share kiya tha. Bas ek minute check karna tha ki kya aapko link receive hua aur aapne demo glance kiya? Great! We tailored it specifically with direct WhatsApp trial booking and mobile speed for members in ${lead.area}. Aapko overall look aur concept kaisa laga? Agar aapko concept pasand aaye, to hum isme aapki exact training programs, actual photos aur contact setup integrate karke live kar sakte hain."`;

        const fullAudit = `[CONTACT_DETAILS]\nPhone: +${lead.phone}\nWhatsApp: +${lead.phone}\n\n[OUTREACH_PLATFORM]\nWhatsApp & Follow-up Phone Call: Direct WhatsApp messaging followed by a quick courtesy call is the primary outreach workflow for Indian SMBs.\n\n[FINAL_OUTREACH_MESSAGE]\n\n[WHATSAPP_START]\n${waMessage}\n[WHATSAPP_END]\n\n[CALL_SCRIPT_START]\n${callScript}\n[CALL_SCRIPT_END]\n\n---\n\n[AUDIT_START]\n# 🌐 COMPLETE WEBSITE STRATEGY & ARCHITECTURE REPORT: ${lead.name}\n\n## 1. BUSINESS ANALYSIS\n* **Business:** ${lead.name}\n* **Locality:** ${lead.area}, Patna\n* **Rating:** ${lead.rating}★ across ${lead.reviews} verified reviews.\n* **Target Audience:** Local fitness enthusiasts, students, and working professionals in ${lead.area}, Patna.\n* **Primary Conversion Goal:** Click-to-WhatsApp trial booking & direct phone inquiry.\n\n## 2. OUTREACH & DEPLOYMENT STRATEGY\n* **Primary Hook:** Free website gift with zero commitment.\n* **Subdomain URL:** ${lead.url}\n`;

        // 1. Update reports/<id>/
        const reportDir = path.join(process.cwd(), 'reports', String(lead.id));
        fs.mkdirSync(reportDir, { recursive: true });
        fs.writeFileSync(path.join(reportDir, 'audit.md'), fullAudit, 'utf-8');

        const outreachJson = {
            clientId: lead.id,
            businessName: lead.name,
            phone: lead.phone,
            whatsapp: lead.phone,
            deployedUrl: lead.url,
            agencyHostedUrl: `https://www.arclanestudios.space/sites/${lead.url.replace('https://', '').replace('.arclanestudios.space', '')}`,
            whatsappMessage: waMessage,
            callScript: callScript,
            updatedAt: new Date().toISOString()
        };
        fs.writeFileSync(path.join(reportDir, 'outreach.json'), JSON.stringify(outreachJson, null, 2), 'utf-8');

        // 2. Update web-dev-agency/public/reports/<id>/
        const agencyReportDir = path.join(process.cwd(), 'web-dev-agency', 'public', 'reports', String(lead.id));
        fs.mkdirSync(agencyReportDir, { recursive: true });
        fs.writeFileSync(path.join(agencyReportDir, 'audit.md'), fullAudit, 'utf-8');
        fs.writeFileSync(path.join(agencyReportDir, 'outreach.json'), JSON.stringify(outreachJson, null, 2), 'utf-8');

        // 3. Update Google Sheet row
        const row = rows.find(r => r.get('Client ID') == String(lead.id));
        if (row) {
            row.set('AI Outreach Hook', waMessage);
            row.set('Current Status', 'Website Built');
            await row.save();
            console.log(`✅ Updated outreach hook for lead #${lead.id} (${lead.name})`);
        }
    }

    console.log('🎉 All 6 leads successfully populated with AI Outreach Hooks and full audit files!');
}

updateOutreachHooks().catch(err => {
    console.error('Error updating outreach hooks:', err);
    process.exit(1);
});
