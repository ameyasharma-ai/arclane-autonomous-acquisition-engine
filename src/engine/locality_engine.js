import fs from 'fs';
import path from 'path';

export class LocalityEngine {
    constructor() {
        this.hierarchyPath = path.join(process.cwd(), 'config', 'geo_hierarchy.json');
        this.coveragePath = path.join(process.cwd(), 'data', 'locality_coverage.json');
        this.initStorage();
    }

    initStorage() {
        const dataDir = path.join(process.cwd(), 'data');
        if (!fs.existsSync(dataDir)) {
            fs.mkdirSync(dataDir, { recursive: true });
        }
        if (!fs.existsSync(this.coveragePath)) {
            fs.writeFileSync(this.coveragePath, JSON.stringify({}, null, 2), 'utf-8');
        }
    }

    loadHierarchy() {
        try {
            return JSON.parse(fs.readFileSync(this.hierarchyPath, 'utf-8'));
        } catch {
            return { "Bihar": { "Patna": ["Boring Road", "Kankarbagh", "Fraser Road", "Bailey Road", "Patliputra Colony", "Mithapur", "Danapur", "Anisabad", "Rajendra Nagar"] } };
        }
    }

    loadCoverage() {
        try {
            return JSON.parse(fs.readFileSync(this.coveragePath, 'utf-8'));
        } catch {
            return {};
        }
    }

    saveCoverage(coverage) {
        fs.writeFileSync(this.coveragePath, JSON.stringify(coverage, null, 2), 'utf-8');
    }

    /**
     * Dynamically ask AI for high-density commercial micro-localities for a specific niche in a city.
     * Automatically registers new discoveries into config/geo_hierarchy.json.
     */
    async discoverLocalitiesWithAI(niche = 'Gyms', city = 'Patna', state = 'Bihar') {
        try {
            if (process.env.API) {
                const OpenAI = (await import('openai')).default;
                const client = new OpenAI({
                    baseURL: 'https://generativelanguage.googleapis.com/v1beta/openai/',
                    apiKey: process.env.API,
                });

                const existingHierarchy = this.loadHierarchy();
                const existing = (existingHierarchy[state] && existingHierarchy[state][city]) || [];

                const prompt = `You are an expert geographical market researcher for Indian commercial hubs.
We are scouting high-density commercial micro-localities, markets, and neighborhoods in ${city}, ${state} for: "${niche}".

Currently known localities: ${JSON.stringify(existing)}

Task:
Suggest 8-12 additional or high-potential commercial neighborhoods/pockets in ${city} known to have high concentrations of ${niche}.
Return ONLY a valid JSON array of strings containing the locality names. No explanations, no markdown tags.
Example: ["Boring Canal Road", "SK Puri", "Nageshwar Colony", "Harding Road"]`;

                const res = await client.chat.completions.create({
                    model: 'gemini-flash-lite-latest',
                    messages: [{ role: 'user', content: prompt }]
                });

                let text = res.choices[0].message.content.trim();
                text = text.replace(/```json/gi, '').replace(/```/g, '').trim();
                const parsed = JSON.parse(text);

                if (Array.isArray(parsed) && parsed.length > 0) {
                    console.log(`[LocalityEngine] 🧠 AI dynamically discovered ${parsed.length} micro-localities for ${niche} in ${city}, ${state}`);
                    this.registerDiscoveredLocalities(state, city, parsed);
                    return parsed;
                }
            }
        } catch (e) {
            console.log(`[LocalityEngine] AI locality discovery notice: ${e.message}`);
        }
        return [];
    }

    /**
     * Register newly discovered micro-localities into config/geo_hierarchy.json
     */
    registerDiscoveredLocalities(state, city, newLocalities) {
        try {
            const hierarchy = this.loadHierarchy();
            if (!hierarchy[state]) hierarchy[state] = {};
            if (!hierarchy[state][city]) hierarchy[state][city] = [];

            let addedCount = 0;
            for (const loc of newLocalities) {
                const cleanLoc = String(loc).trim();
                if (cleanLoc && !hierarchy[state][city].includes(cleanLoc)) {
                    hierarchy[state][city].push(cleanLoc);
                    addedCount++;
                }
            }

            if (addedCount > 0) {
                fs.writeFileSync(this.hierarchyPath, JSON.stringify(hierarchy, null, 2), 'utf-8');
                console.log(`[LocalityEngine] 💾 Saved ${addedCount} new micro-localities to config/geo_hierarchy.json`);
            }
        } catch (err) {
            console.error('[LocalityEngine] Failed to save discovered localities:', err.message);
        }
    }

    /**
     * Get list of localities for a state and city
     */
    getLocalities(state = 'Bihar', city = 'Patna') {
        const hierarchy = this.loadHierarchy();
        return (hierarchy[state] && hierarchy[state][city]) || ["Boring Road", "Kankarbagh", "Fraser Road", "Bailey Road", "Mithapur", "Danapur", "Rajendra Nagar"];
    }

    /**
     * Get next unvisited or least-recently scraped locality for a niche in city.
     * If all known localities are saturated or exhausted, dynamically queries AI for fresh micro-localities!
     */
    async getNextLocality(niche, state = 'Bihar', city = 'Patna') {
        let localities = this.getLocalities(state, city);
        let coverage = this.loadCoverage();
        let cityCoverage = coverage[niche]?.[state]?.[city] || {};

        // 1. Look for unvisited localities
        for (const loc of localities) {
            if (!cityCoverage[loc] || cityCoverage[loc].status === 'PENDING' || cityCoverage[loc].totalLeads === 0) {
                return loc;
            }
        }

        // 2. If all existing localities are covered, ask AI for new micro-localities dynamically!
        console.log(`[LocalityEngine] 🧭 All ${localities.length} known localities in ${city} explored. Querying AI for new micro-niche pockets...`);
        const aiDiscovered = await this.discoverLocalitiesWithAI(niche, city, state);
        if (aiDiscovered.length > 0) {
            localities = this.getLocalities(state, city);
            coverage = this.loadCoverage();
            cityCoverage = coverage[niche]?.[state]?.[city] || {};
            for (const loc of localities) {
                if (!cityCoverage[loc] || cityCoverage[loc].status === 'PENDING' || cityCoverage[loc].totalLeads === 0) {
                    return loc;
                }
            }
        }

        // 3. Fallback: least recently scraped locality
        let oldestLoc = localities[0];
        let oldestTime = Infinity;
        for (const loc of localities) {
            const lastTime = cityCoverage[loc]?.lastScraped ? new Date(cityCoverage[loc].lastScraped).getTime() : 0;
            if (lastTime < oldestTime) {
                oldestTime = lastTime;
                oldestLoc = loc;
            }
        }
        return oldestLoc;
    }

    /**
     * Record scrape yield for a locality
     */
    recordYield(niche, locality, city = 'Patna', state = 'Bihar', leadsCount = 0) {
        const coverage = this.loadCoverage();
        if (!coverage[niche]) coverage[niche] = {};
        if (!coverage[niche][state]) coverage[niche][state] = {};
        if (!coverage[niche][state][city]) coverage[niche][state][city] = {};

        const existing = coverage[niche][state][city][locality] || { totalLeads: 0, runs: 0 };
        coverage[niche][state][city][locality] = {
            status: 'COMPLETED',
            totalLeads: existing.totalLeads + leadsCount,
            runs: existing.runs + 1,
            lastScraped: new Date().toISOString()
        };
        this.saveCoverage(coverage);
    }

    /**
     * Generate structured coverage report
     */
    getCoverageReport(niche, state = 'Bihar', city = 'Patna') {
        const localities = this.getLocalities(state, city);
        const coverage = this.loadCoverage();
        const cityCoverage = coverage[niche]?.[state]?.[city] || {};

        let totalLeads = 0;
        let coveredCount = 0;

        const breakdown = localities.map(loc => {
            const data = cityCoverage[loc];
            if (data && data.totalLeads > 0) {
                coveredCount++;
                totalLeads += data.totalLeads;
                return { locality: loc, status: 'COMPLETED', leads: data.totalLeads, lastScraped: data.lastScraped };
            }
            return { locality: loc, status: 'PENDING', leads: 0, lastScraped: null };
        });

        return {
            niche,
            state,
            city,
            totalLocalities: localities.length,
            coveredLocalities: coveredCount,
            coveragePercentage: Math.round((coveredCount / localities.length) * 100),
            totalLeads,
            breakdown
        };
    }
}

export const localityEngine = new LocalityEngine();
