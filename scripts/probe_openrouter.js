import OpenAI from 'openai';
import dotenv from 'dotenv';
dotenv.config();

async function testWorkingModel() {
    let key = process.env.OPENROUTER_API_KEY || '';
    key = key.replace(/["'\r\n]/g, '').trim();

    const client = new OpenAI({
        baseURL: 'https://openrouter.ai/api/v1',
        apiKey: key,
        timeout: 15000,
        defaultHeaders: {
            'HTTP-Referer': 'https://arclanestudios.space',
            'X-Title': 'Arclane Acquisition Engine'
        }
    });

    const models = [
        'poolside/laguna-s-2.1:free',
        'poolside/laguna-xs-2.1:free',
        'nvidia/nemotron-3.5-super-vl:free'
    ];

    for (const m of models) {
        console.log(`Testing model: ${m}...`);
        const t0 = Date.now();
        try {
            const res = await client.chat.completions.create({
                model: m,
                messages: [
                    { role: 'user', content: 'Say hello and report your operational readiness in one sentence.' }
                ],
                max_tokens: 50
            });
            const latency = Date.now() - t0;
            console.log(`\n======================================================`);
            console.log(`✅ OPENROUTER MODEL RESPONSIVENESS REPORT`);
            console.log(`======================================================`);
            console.log(`Target Model:    ${m}`);
            console.log(`Reported Model:  ${res.model}`);
            console.log(`HTTP Status:     200 OK`);
            console.log(`Latency:         ${latency} ms (${(latency / 1000).toFixed(2)}s)`);
            console.log(`Tokens Used:     Prompt: ${res.usage?.prompt_tokens} | Completion: ${res.usage?.completion_tokens} | Total: ${res.usage?.total_tokens}`);
            console.log(`------------------------------------------------------`);
            console.log(`Generated Text Content:`);
            console.log(res.choices[0]?.message?.content);
            console.log(`======================================================\n`);
            return;
        } catch(e) {
            console.log(`Model ${m} failed (${Date.now() - t0} ms): ${e.message}`);
        }
    }
}

testWorkingModel();
