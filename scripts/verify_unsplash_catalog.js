import 'dotenv/config';
import OpenAI from 'openai';

const geminiClient = new OpenAI({
  baseURL: 'https://generativelanguage.googleapis.com/v1beta/openai/',
  apiKey: process.env.API,
});

const candidates = [
  // Tikka / Kebab candidates
  'photo-1599488615731-7e5c2823ff28',
  'photo-1603894584373-5ac82b2ae398',
  'photo-1626777552726-4a6b54c97e46',
  'photo-1555939594-58d7cb561ad1',
  'photo-1606471191009-63994c53433b',
  // Potatoes / Starters candidates
  'photo-1585109649139-366815a0d713',
  'photo-1541592106381-b31e9677c0e5',
  'photo-1573080496219-bb080dd4f877',
  'photo-1528735602780-2552fd46c7af',
  // Pasta red sauce candidates
  'photo-1551183053-bf91a1d81141',
  'photo-1563379926898-05f4575a45d8',
  'photo-1579684947550-22e945225d9a',
  'photo-1608897013039-887f21d8c804'
];

async function inspectImages() {
  console.log('Inspecting candidates with Gemini Vision...');
  for (const id of candidates) {
    const url = `https://images.unsplash.com/${id}?auto=format&fit=crop&q=80&w=600`;
    try {
      const res = await geminiClient.chat.completions.create({
        model: 'gemini-flash-lite-latest',
        messages: [
          {
            role: 'user',
            content: [
              { type: 'text', text: 'Describe in 1 short sentence what food or object is shown in this image.' },
              { type: 'image_url', image_url: { url } }
            ]
          }
        ]
      });
      const desc = res.choices[0].message.content.trim();
      console.log(`${id} => ${desc}`);
    } catch (e) {
      console.log(`${id} => Error: ${e.message}`);
    }
  }
}

inspectImages().catch(console.error);

