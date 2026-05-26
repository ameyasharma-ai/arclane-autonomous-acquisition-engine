import { LLMClient } from './llm.js';

export class Summarizer {
    constructor() {
        this.llmClient = new LLMClient();
    }

    async analyze(leadData, scrapedData) {
        // Add any column names here that contain redundant data you don't want sent to the LLM.
        // For example, if "AI Outreach Hook" already contains the pros/cons, you can ignore the individual "Pros" and "Cons" columns here.
        const ignoredColumns = ['Notes', 'Outreach Platform', 'Outreach Date', 'Follow-Up Date']; 

        const crmDataString = Object.entries(leadData)
            .filter(([key, value]) => value && value.toString().trim() !== '' && !ignoredColumns.includes(key))
            .map(([key, value]) => `${key}: ${value}`)
            .join('\n');

        // The absolute ceiling for input + output is 120k tokens. 
        // We assume max output of 5k tokens (20k chars). This leaves 115k tokens (460,000 chars) for input.
        // We will safely allocate 350,000 characters for website data and 100,000 for social media data (total 450k chars = ~112.5k tokens).
        let websiteRemaining = 350000;
        let socialRemaining = 100000;

        const websiteDataString = Object.entries(scrapedData.website).map(([page, content]) => {
            const snippet = content.substring(0, websiteRemaining);
            websiteRemaining -= snippet.length;
            return `--- ${page.toUpperCase()} PAGE ---\n${snippet}\n`;
        }).join('\n');

        const socialDataString = Object.entries(scrapedData.social).map(([platform, content]) => {
            const snippet = content.substring(0, socialRemaining);
            socialRemaining -= snippet.length;
            return `--- ${platform.toUpperCase()} ---\n${snippet}\n`;
        }).join('\n');

        const prompt = `
Analyze the following business for CRM outreach automation.

Business Details from CRM (Including Previous Agent Analysis):
${crmDataString}

Scraped Website Data:
${websiteDataString}

Scraped Social Media Data:
${socialDataString}

Based on the above, provide a comprehensive analysis.
Follow the exact structural instructions provided in your system prompt.
`;
        
        // Rough token estimation: 1 token ≈ 4 characters
        const estimatedTokens = Math.ceil(prompt.length / 4);
        console.log(`[LLM] 🧠 Sending prompt to OpenRouter. Estimated prompt tokens: ~${estimatedTokens.toLocaleString()}`);
        
        return await this.llmClient.generateSummary(prompt);
    }
}
