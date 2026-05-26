import OpenAI from 'openai';
import pRetry from 'p-retry';
import fs from 'fs';
import path from 'path';

export class LLMClient {
    constructor() {
        this.openai = new OpenAI({
            baseURL: "https://openrouter.ai/api/v1",
            apiKey: process.env.OPENROUTER_API_KEY,
        });
        this.model = 'openai/gpt-oss-120b';
        this.systemPrompt = fs.readFileSync(path.join(process.cwd(), 'src', 'system_prompt.txt'), 'utf-8');
    }

    async generateSummary(prompt) {
        return await pRetry(async () => {
            const response = await this.openai.chat.completions.create({
                model: this.model,
                messages: [
                    {
                        role: "system",
                        content: this.systemPrompt
                    },
                    {
                        role: "user",
                        content: prompt
                    }
                ]
            });

            return response.choices[0].message.content.trim();
        }, {
            retries: 3,
            onFailedAttempt: error => {
                console.log(`LLM attempt ${error.attemptNumber} failed. There are ${error.retriesLeft} retries left.`);
            }
        });
    }
}
