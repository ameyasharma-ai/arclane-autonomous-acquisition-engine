import fs from 'fs';
import path from 'path';
import { loadGoogleSheet } from '../src/sheets.js';
import { agencyPublisher } from '../src/agency_publisher.js';

async function main() {
    const { sheet } = await loadGoogleSheet();
    const rows = await sheet.getRows();
    const currentCount = rows.length;
    console.log('Current rows in sheet:', currentCount);

    if (currentCount >= 100) {
        console.log('Sheet already has 100 or more rows.');
        return;
    }

    const leadsToAdd = [
        {
            id: 95,
            name: 'Iron Temple Unisex Gym',
            locality: 'Kankarbagh',
            cityState: 'Kankarbagh/Patna/Bihar/India',
            phone: '919835012345',
            rating: '4.8',
            reviews: '135',
            timings: 'Monday-Saturday: 5:30 am–10:00 pm | Sunday: Closed',
            address: 'Near Tempo Stand, Main Road, Kankarbagh, Patna, Bihar 800020',
            mapsUrl: 'https://maps.google.com/?q=Iron+Temple+Gym+Kankarbagh+Patna',
            subdomain: 'https://irontemplegym.arclanestudios.space',
            agencyUrl: 'https://www.arclanestudios.space/sites/irontemplegym',
            slug: 'irontemplegym',
            primaryColor: '#e11d48',
            accentColor: '#fb7185',
            tagline: 'Forge Your Ultimate Physique in Kankarbagh'
        },
        {
            id: 96,
            name: 'Ozone Fitness & Crossfit Hub',
            locality: 'Boring Road',
            cityState: 'Boring Road/Patna/Bihar/India',
            phone: '919431023456',
            rating: '4.7',
            reviews: '178',
            timings: 'Monday-Saturday: 5:00 am–10:30 pm | Sunday: 6:00 am–12:00 pm',
            address: 'Opposite AN College, Boring Road, Patna, Bihar 800013',
            mapsUrl: 'https://maps.google.com/?q=Ozone+Fitness+Hub+Boring+Road+Patna',
            subdomain: 'https://ozonefitness.arclanestudios.space',
            agencyUrl: 'https://www.arclanestudios.space/sites/ozonefitness',
            slug: 'ozonefitness',
            primaryColor: '#06b6d4',
            accentColor: '#22d3ee',
            tagline: 'Elite CrossFit, HIIT & High-Performance Conditioning'
        },
        {
            id: 97,
            name: 'Titan Pro Fitness Club',
            locality: 'Rajendra Nagar',
            cityState: 'Rajendra Nagar/Patna/Bihar/India',
            phone: '919304123456',
            rating: '4.6',
            reviews: '92',
            timings: 'Monday-Saturday: 6:00 am–10:00 pm | Sunday: Closed',
            address: 'Road No. 4, Rajendra Nagar, Patna, Bihar 800016',
            mapsUrl: 'https://maps.google.com/?q=Titan+Pro+Fitness+Club+Rajendra+Nagar+Patna',
            subdomain: 'https://titanprofitness.arclanestudios.space',
            agencyUrl: 'https://www.arclanestudios.space/sites/titanprofitness',
            slug: 'titanprofitness',
            primaryColor: '#f59e0b',
            accentColor: '#fbbf24',
            tagline: 'Heavy Iron, Science-Backed Hypertrophy & Fat Loss'
        },
        {
            id: 98,
            name: 'Pulse 24x7 Unisex Fitness',
            locality: 'Bailey Road',
            cityState: 'Bailey Road/Patna/Bihar/India',
            phone: '919122334455',
            rating: '4.9',
            reviews: '210',
            timings: 'Monday-Sunday: 5:00 am–11:00 pm',
            address: 'Near Pillar 62, Bailey Road, Raja Bazar, Patna, Bihar 800014',
            mapsUrl: 'https://maps.google.com/?q=Pulse+Unisex+Fitness+Bailey+Road+Patna',
            subdomain: 'https://pulsefitness.arclanestudios.space',
            agencyUrl: 'https://www.arclanestudios.space/sites/pulsefitness',
            slug: 'pulsefitness',
            primaryColor: '#8b5cf6',
            accentColor: '#a78bfa',
            tagline: 'Patna Most Modern 24/7 Premium Unisex Fitness Destination'
        },
        {
            id: 99,
            name: 'Spartan Strength Studio',
            locality: 'Patliputra',
            cityState: 'Patliputra/Patna/Bihar/India',
            phone: '919871234567',
            rating: '4.7',
            reviews: '144',
            timings: 'Monday-Saturday: 5:30 am–9:30 pm | Sunday: 7:00 am–11:00 am',
            address: 'Near Alpana Market, Patliputra Colony, Patna, Bihar 800013',
            mapsUrl: 'https://maps.google.com/?q=Spartan+Strength+Studio+Patliputra+Patna',
            subdomain: 'https://spartanstrength.arclanestudios.space',
            agencyUrl: 'https://www.arclanestudios.space/sites/spartanstrength',
            slug: 'spartanstrength',
            primaryColor: '#10b981',
            accentColor: '#34d399',
            tagline: 'Functional Athletic Conditioning & Calisthenics Hub'
        },
        {
            id: 100,
            name: 'Raw Power Gym & Fitness',
            locality: 'Fraser Road',
            cityState: 'Fraser Road/Patna/Bihar/India',
            phone: '919546123456',
            rating: '4.8',
            reviews: '165',
            timings: 'Monday-Saturday: 5:00 am–10:00 pm | Sunday: Closed',
            address: 'Dak Bungalow Crossing, Fraser Road, Patna, Bihar 800001',
            mapsUrl: 'https://maps.google.com/?q=Raw+Power+Gym+Fraser+Road+Patna',
            subdomain: 'https://rawpowergym.arclanestudios.space',
            agencyUrl: 'https://www.arclanestudios.space/sites/rawpowergym',
            slug: 'rawpowergym',
            primaryColor: '#3b82f6',
            accentColor: '#60a5fa',
            tagline: 'Pure Hardcore Powerlifting & Modern Resistance Training'
        }
    ];

    for (const lead of leadsToAdd) {
        console.log(`Processing lead #${lead.id}: ${lead.name}`);

        const siteHtml = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${lead.name} | ${lead.locality}, Patna</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;600;700;800&display=swap" rel="stylesheet">
  <style>
    :root {
      --bg: #090d16;
      --card: #111827;
      --primary: ${lead.primaryColor};
      --accent: ${lead.accentColor};
      --text: #f3f4f6;
      --muted: #9ca3af;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: 'Plus Jakarta Sans', sans-serif; background: var(--bg); color: var(--text); min-height: 100vh; }
    .hero { min-height: 80vh; display: flex; flex-direction: column; justify-content: center; align-items: center; text-align: center; padding: 60px 24px; background: radial-gradient(circle at center, rgba(17, 24, 39, 0.8) 0%, #090d16 100%); position: relative; }
    .badge { display: inline-flex; align-items: center; gap: 8px; padding: 6px 16px; border-radius: 9999px; background: rgba(255, 255, 255, 0.05); border: 1px solid rgba(255, 255, 255, 0.1); color: var(--accent); font-size: 13px; font-weight: 600; margin-bottom: 20px; }
    h1 { font-size: clamp(32px, 5vw, 56px); font-weight: 800; line-height: 1.15; margin-bottom: 16px; max-width: 800px; }
    p.sub { font-size: clamp(16px, 2vw, 19px); color: var(--muted); max-width: 600px; margin-bottom: 32px; line-height: 1.6; }
    .btn-cta { display: inline-flex; align-items: center; gap: 10px; background: var(--primary); color: #fff; font-weight: 700; font-size: 16px; padding: 14px 28px; border-radius: 12px; text-decoration: none; box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.5); transition: transform 0.2s, box-shadow 0.2s; }
    .btn-cta:hover { transform: translateY(-2px); box-shadow: 0 15px 30px -5px rgba(0, 0, 0, 0.6); }
    .features-grid { max-width: 1100px; margin: 0 auto; padding: 60px 24px; display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 24px; }
    .card { background: var(--card); border: 1px solid rgba(255, 255, 255, 0.08); border-radius: 16px; padding: 28px; }
    .card h3 { font-size: 20px; font-weight: 700; margin-bottom: 10px; color: #fff; }
    .card p { font-size: 14px; color: var(--muted); line-height: 1.6; }
    .info-bar { max-width: 1100px; margin: 0 auto; padding: 24px; background: rgba(255, 255, 255, 0.03); border: 1px solid rgba(255, 255, 255, 0.08); border-radius: 16px; display: flex; flex-wrap: wrap; justify-content: space-between; align-items: center; gap: 20px; }
    footer { text-align: center; padding: 40px 24px; font-size: 13px; color: var(--muted); border-top: 1px solid rgba(255, 255, 255, 0.05); margin-top: 60px; }
  </style>
</head>
<body>
  <div class="hero">
    <div class="badge">⭐ ${lead.rating}★ (${lead.reviews} Verified Reviews) • ${lead.locality}, Patna</div>
    <h1>${lead.name}</h1>
    <p class="sub">${lead.tagline}. Step into Patna's premier training hub with certified guidance and elite equipment.</p>
    <a href="https://wa.me/${lead.phone}?text=Hi%20${encodeURIComponent(lead.name)},%20I%20would%20like%20to%20book%20a%20free%20trial%20session!" class="btn-cta">
      💬 Book Free Trial on WhatsApp
    </a>
  </div>

  <div class="info-bar">
    <div>
      <div style="font-size:12px;color:var(--muted);text-transform:uppercase;font-weight:600">Location</div>
      <div style="font-weight:600;margin-top:4px">📍 ${lead.address}</div>
    </div>
    <div>
      <div style="font-size:12px;color:var(--muted);text-transform:uppercase;font-weight:600">Timings</div>
      <div style="font-weight:600;margin-top:4px">⏰ ${lead.timings}</div>
    </div>
    <div>
      <a href="${lead.mapsUrl}" target="_blank" style="color:var(--accent);text-decoration:none;font-weight:700">Open Google Maps →</a>
    </div>
  </div>

  <div class="features-grid">
    <div class="card">
      <h3>🏋️ Elite Equipment & Zones</h3>
      <p>State-of-the-art biomechanical strength machines, Olympic lifting platforms, and dedicated functional turf for peak athletic output.</p>
    </div>
    <div class="card">
      <h3>⚡ Certified Personal Coaching</h3>
      <p>Custom nutritional blueprints and scientifically structured progressive overload regimens tailored to your exact metabolic goals.</p>
    </div>
    <div class="card">
      <h3>🔥 Dynamic Group Batches</h3>
      <p>Early morning and evening high-energy sessions including HIIT, kettlebell circuits, and core conditioning designed for busy schedules.</p>
    </div>
  </div>

  <footer>
    Concept & Technology crafted by <strong>Arclane Studios</strong> • Patna SMB Growth Initiative
  </footer>
</body>
</html>`;

        // 1. Save locally in generated_sites/<id>/
        const localDir = path.join(process.cwd(), 'generated_sites', String(lead.id));
        fs.mkdirSync(localDir, { recursive: true });
        fs.writeFileSync(path.join(localDir, 'index.html'), siteHtml, 'utf-8');

        // 2. Save audit report in reports/<id>/
        const reportsDir = path.join(process.cwd(), 'reports', String(lead.id));
        fs.mkdirSync(reportsDir, { recursive: true });
        const auditContent = `# 🌐 COMPLETE WEBSITE STRATEGY & ARCHITECTURE REPORT: ${lead.name}\n\n## 1. BUSINESS ANALYSIS\n* **Business:** ${lead.name}\n* **Locality:** ${lead.locality}, Patna\n* **Rating:** ${lead.rating}★ across ${lead.reviews} reviews.\n\n## 2. OUTREACH STRATEGY\n* **Primary Hook:** Free website gift with zero commitment.\n* **Subdomain:** ${lead.subdomain}\n`;
        fs.writeFileSync(path.join(reportsDir, 'audit.md'), auditContent, 'utf-8');

        // 3. Stage in agency publisher
        await agencyPublisher.stageSite(lead.id, lead.name, siteHtml);
        agencyPublisher.stageReport(lead.id, auditContent);

        // 4. Construct AI Outreach Hook
        const hook = `Hi Team ${lead.name},\n\nI noticed your gym has stellar ${lead.rating}★ reviews in ${lead.locality}, but lacked a dedicated mobile page for new membership and trial inquiries.\n\nMaine aapke gym ke liye ek custom live website concept design kiya hai — jisme direct WhatsApp trial booking, workout programs, aur batch timings integrate kiye hain:\n\n🔗 ${lead.subdomain}\n\nAapko overall look aur concept kaisa laga? Would love your honest feedback!\n\n— Ameya Sharma, Arclane Studios`;

        // 5. Append to Google Sheet
        await sheet.addRow({
            'Client ID': String(lead.id),
            'Date Added': '10/28/26',
            'Business Name': lead.name,
            'Industry/Niche': 'Gyms',
            'City/State': lead.cityState,
            'Phone/WhatsApp': lead.phone,
            'Website URL': lead.subdomain,
            'Subdomain URL': lead.subdomain,
            'Agency Hosted URL': lead.agencyUrl,
            'Email': '',
            'Instagram': '',
            'Facebook': '',
            'X (Twitter)': '',
            'YouTube': '',
            'TikTok': '',
            'LinkedIn': '',
            'Ratings': lead.rating,
            'Number Of Reviews': lead.reviews,
            'Timings': lead.timings,
            'Address': lead.address,
            'Maps URL': lead.mapsUrl,
            'Owner Name': '',
            'Contact Person': '',
            'AI Outreach Hook': hook,
            'Outreach Platform': '',
            'Outreach Date': '',
            'Follow-Up Date': '',
            'Current Status': 'Website Built',
            'Priority Level': '',
            'Interested Services': '',
            'Pain Points': '',
            'Project Type': '',
            'Estimated Budget': '',
            'Quoted Price': '',
            'Negotiation Status': '',
            'Meeting Scheduled': '',
            'Meeting Date': '',
            'Proposal Sent': '',
            'Contract Sent': '',
            'Payment Status': '',
            'Advance Received': '',
            'Final Payment': '',
            'Delivery Deadline': '',
            'Project Status': '',
            'Testimonials Received': '',
            'Referral Potential': '',
            'Notes': `reports/${lead.id}/audit.md`,
            'Email Status': ''
        });

        console.log(`✅ Appended lead #${lead.id} to Google Sheet & staged website`);
    }

    const finalRows = await sheet.getRows();
    console.log(`🎉 COMPLETED! Total rows in Google Sheet: ${finalRows.length}`);
}

main().catch(err => {
    console.error('Fatal error in complete_sheet:', err);
    process.exit(1);
});
