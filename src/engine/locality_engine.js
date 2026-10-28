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
     * Get list of localities for a state and city
     */
    getLocalities(state = 'Bihar', city = 'Patna') {
        const hierarchy = this.loadHierarchy();
        return (hierarchy[state] && hierarchy[state][city]) || ["Boring Road", "Kankarbagh", "Fraser Road", "Bailey Road", "Mithapur", "Danapur", "Rajendra Nagar"];
    }

    /**
     * Get next unvisited or least-recently scraped locality for a niche in city
     */
    getNextLocality(niche, state = 'Bihar', city = 'Patna') {
        const localities = this.getLocalities(state, city);
        const coverage = this.loadCoverage();
        
        const cityCoverage = coverage[niche]?.[state]?.[city] || {};

        // 1. Look for unvisited localities
        for (const loc of localities) {
            if (!cityCoverage[loc] || cityCoverage[loc].status === 'PENDING' || cityCoverage[loc].totalLeads === 0) {
                return loc;
            }
        }

        // 2. Fallback: least recently scraped locality
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
