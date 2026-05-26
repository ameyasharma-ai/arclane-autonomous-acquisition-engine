import OpenAI from 'openai';
import pRetry from 'p-retry';

export class LLMClient {
    constructor() {
        this.openai = new OpenAI({
            baseURL: "https://openrouter.ai/api/v1",
            apiKey: process.env.OPENROUTER_API_KEY,
        });
        this.model = 'openai/gpt-oss-120b';
    }

    async generateSummary(prompt) {
        return await pRetry(async () => {
            const response = await this.openai.chat.completions.create({
                model: this.model,
                messages: [
                    {
                        role: "system",
                        content: `You are an expert business analyst and CRM enrichment agent. 
You extract structured insights from raw website and social media scraped text.
Always reply with valid JSON. Do not include markdown formatting like \`\`\`json. 
Just raw JSON matching the requested schema exactly.`
                    },
                    {
                        role: "user",
                        content: prompt
                    }
                ],
                // OpenRouter supports response_format for some models, but to be safe with OSS models, 
                // we rely on the system prompt and then parse out any markdown in our code.
            });

            const content = response.choices[0].message.content;
            
            // Clean up any potential markdown formatting around the JSON
            const cleanContent = content.replace(/^```json\n?/, '').replace(/```$/, '').trim();
            
            try {
                return JSON.parse(cleanContent);
            } catch (e) {
                console.error("Failed to parse JSON from LLM response:", cleanContent);
                throw new Error("Invalid JSON format from LLM");
            }
        }, {
            retries: 3,
            onFailedAttempt: error => {
                console.log(`LLM attempt ${error.attemptNumber} failed. There are ${error.retriesLeft} retries left.`);
            }
        });
    }
}
