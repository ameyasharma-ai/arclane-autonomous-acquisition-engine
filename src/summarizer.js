import { LLMClient } from './llm.js';

export class Summarizer {
    constructor() {
        this.llmClient = new LLMClient();
    }

    async analyze(leadData, scrapedData) {
        const prompt = `
Analyze the following business for CRM outreach automation.

Business Details from CRM:
Name: ${leadData['Business Name'] || 'Unknown'}
Industry: ${leadData['Industry/Niche'] || 'Unknown'}
Location: ${leadData['City/State'] || 'Unknown'}
Google Maps Ratings: ${leadData['Ratings'] || 'N/A'}
Google Maps Reviews: ${leadData['Number Of Reviews'] || 'N/A'}

Scraped Website Data:
${Object.entries(scrapedData.website).map(([page, content]) => `--- ${page.toUpperCase()} PAGE ---\n${content.substring(0, 3000)}\n`).join('\n')}

Scraped Google Maps Data:
${scrapedData.maps ? scrapedData.maps.substring(0, 3000) : 'N/A'}

Scraped Social Media Data:
${Object.entries(scrapedData.social).map(([platform, content]) => `--- ${platform.toUpperCase()} ---\n${content.substring(0, 2000)}\n`).join('\n')}

Based on the above, provide a comprehensive analysis.
You MUST reply with ONLY a raw JSON object matching this EXACT schema:
{
  "business_summary": "A short 2-sentence summary of what the business does.",
  "services": ["Service 1", "Service 2"],
  "target_audience": ["Audience 1", "Audience 2"],
  "brand_tone": "e.g., Professional, Playful, Luxury",
  "website_quality_score": 0, // Integer 1-10
  "social_activity_score": 0, // Integer 1-10
  "estimated_business_size": "Small, Medium, Enterprise",
  "marketing_maturity": "Low, Medium, High",
  "pain_points": ["Pain point 1 (e.g. outdated website)", "Pain point 2"],
  "opportunities": ["Opportunity 1", "Opportunity 2"],
  "recent_events": ["Event 1", "Event 2"],
  "review_sentiment": "Overall sentiment from reviews (e.g., Highly positive but slow service)",
  "website_issues": ["Issue 1 (e.g., no mobile responsive)", "Issue 2"],
  "social_media_observations": ["Observation 1", "Observation 2"],
  "recommended_pitch_angle": "A customized pitch for a digital marketing/web dev agency targeting this business."
}
`;
        
        return await this.llmClient.generateSummary(prompt);
    }
}
