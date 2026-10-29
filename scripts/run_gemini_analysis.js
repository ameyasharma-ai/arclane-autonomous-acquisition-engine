import { OpenAI } from 'openai';
import dotenv from 'dotenv';
import fs from 'fs';
dotenv.config();

const client = new OpenAI({
  baseURL: 'https://generativelanguage.googleapis.com/v1beta/openai/',
  apiKey: process.env.API,
});

const websites = [
  { url: 'http://gym.com/', domain: 'gym.com' },
  { url: 'http://theprofitnessgym.com/', domain: 'theprofitnessgym.com' },
  { url: 'https://www.marxfitness.info/', domain: 'marxfitness.info' },
  { url: 'https://goldsgym.in/', domain: 'goldsgym.in' },
  { url: 'https://form.svhrt.com/6762e8562505a317f8f1e779', domain: 'form.svhrt.com' },
  { url: 'https://www.globalfitness.co.in/', domain: 'globalfitness.co.in' },
  { url: 'http://www.relaxyogacentre.com/', domain: 'relaxyogacentre.com' },
  { url: 'http://www.nispa.in/', domain: 'nispa.in' },
  { url: 'https://mmaarenapatna.com/', domain: 'mmaarenapatna.com' },
  { url: 'http://familyfitness.in/', domain: 'familyfitness.in' },
  { url: 'http://fitnessasylum.in/', domain: 'fitnessasylum.in' },
  { url: 'http://www.anantarogyam.in/', domain: 'anantarogyam.in' },
  { url: 'http://www.sweatbox.co.in/', domain: 'sweatbox.co.in' },
  { url: 'https://hulkfitnesspatna.com/', domain: 'hulkfitnesspatna.com' },
  { url: 'https://www.risingyouthgymnastics.com/', domain: 'risingyouthgymnastics.com' },
  { url: 'http://proteinworld.in/', domain: 'proteinworld.in' }
];

const prompt = `You are the lead intelligence evaluator for Arclane Studios (an elite web development agency).
We hunt for local businesses that either have NO real website or have URLs that are merely:
- Temporary placeholders or parked domains (e.g., gym.com)
- Free builders or template test pages (e.g., netlify.app, vercel.app, github.io, replit.app, grexa.site)
- Single-page basic info templates or unmaintained experimental portfolio blogs (e.g., .info personal template, Marx Fitness)
- Form links or lead capture links (forms.gle, svhrt.com, waitlist)
- Aggregator directory pages (cult.fit, justdial)
Any of these qualify as a 'website_of_interest' because the business STILL NEEDS a dedicated, high-converting commercial website built by our agency.

On the other hand, established custom commercial portals (e.g. goldsgym.in, theprofitnessgym.com, mmaarenapatna.com) do NOT qualify as websites of interest.

Analyze each of these domains and reply with strict JSON:
${JSON.stringify(websites, null, 2)}

Return strict JSON array with this format:
[
  {
    "domain": "...",
    "url": "...",
    "is_website_of_interest": true,
    "reason": "1-2 sentence concise reason"
  }
]`;

async function main() {
  const res = await client.chat.completions.create({
    model: 'gemini-flash-lite-latest',
    messages: [
      { role: 'system', content: 'You are a JSON-only response assistant.' },
      { role: 'user', content: prompt }
    ],
    temperature: 0.1
  });

  let raw = res.choices[0].message.content.trim();
  if (raw.startsWith('```json')) raw = raw.replace(/^```json/, '').replace(/```$/, '').trim();
  else if (raw.startsWith('```')) raw = raw.replace(/^```/, '').replace(/```$/, '').trim();

  const data = JSON.parse(raw);
  fs.writeFileSync('scraper/ai_website_audit_results.json', JSON.stringify(data, null, 2));
  console.log(`Evaluated ${data.length} sites successfully!`);
}

main().catch(err => console.error('Error:', err));

