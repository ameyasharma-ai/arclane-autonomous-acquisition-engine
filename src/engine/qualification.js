/**
 * Lead Qualification & Scoring Engine.
 * Evaluates verified data without hallucinating missing information.
 */
export class QualificationEngine {
    constructor(config = {}) {
        this.minLeadScore = config.minimum_lead_score ?? 60;
        this.weights = config.scoring_weights || {
            no_website_opportunity: 35,
            review_credibility: 25,
            contactability: 25,
            rating_health: 15
        };
    }

    /**
     * Evaluates a raw lead to determine qualification_score (0-100) and reason.
     */
    qualifyLead(lead) {
        let score = 0;
        const reasons = [];

        const hasPhone = Boolean(lead.phone && lead.phone.length >= 10);
        const hasWebsite = Boolean(lead.website && lead.website.trim().length > 3);
        const rating = parseFloat(lead.rating || lead['Ratings'] || lead['Rating'] || 0);
        const reviews = parseInt(lead.reviews || lead['Number Of Reviews'] || lead['Total Reviews'] || 0, 10);

        // 1. Contactability check
        if (!hasPhone) {
            return {
                qualified: false,
                qualification_score: 0,
                qualification_reason: 'RESEARCH_INSUFFICIENT: No verified direct phone or WhatsApp contact found.'
            };
        }
        score += 25;
        reasons.push('Verified phone contact available');

        // 2. Website Opportunity factor
        if (!hasWebsite) {
            score += 35;
            reasons.push('Massive opportunity: Business has zero official website');
        } else {
            // Has website, opportunity is redesign/audit
            score += 15;
            reasons.push('Has existing website: Opportunity for performance/mobile overhaul');
        }

        // 3. Review Credibility (Customer volume & validation)
        if (reviews >= 50) {
            score += 25;
            reasons.push(`High social proof: ${reviews} Google reviews`);
        } else if (reviews >= 20) {
            score += 15;
            reasons.push(`Moderate social proof: ${reviews} Google reviews`);
        } else if (reviews >= 5) {
            score += 10;
            reasons.push(`Emerging business: ${reviews} reviews`);
        } else {
            reasons.push('Low review volume: Lower priority SMB');
        }

        // 4. Rating Health (Customer satisfaction signals)
        if (rating >= 4.3) {
            score += 15;
            reasons.push(`Strong reputation: ${rating}★ rating`);
        } else if (rating >= 3.8) {
            score += 10;
            reasons.push(`Average rating: ${rating}★`);
        } else if (rating > 0) {
            score += 5;
            reasons.push(`Reputation distress: ${rating}★ (Reputation management angle)`);
        }

        const isQualified = score >= 50;

        return {
            qualified: isQualified,
            qualification_score: Math.min(score, 100),
            qualification_reason: reasons.join('; ')
        };
    }

    /**
     * Computes final weighted lead_score (0-100) and decides SKIP or PROCEED.
     */
    scoreLead(lead, qualificationResult) {
        let leadScore = qualificationResult.qualification_score;

        // Commercial Category Booster (High-ticket niches score higher)
        const category = String(lead.category || '').toLowerCase();
        const highTicketCategories = ['gym', 'fitness', 'salon', 'spa', 'clinic', 'dent', 'interior', 'architect', 'academy', 'resort', 'detailing'];
        if (highTicketCategories.some(c => category.includes(c))) {
            leadScore = Math.min(leadScore + 10, 100);
        }

        const shouldSkip = leadScore < this.minLeadScore;

        return {
            lead_score: leadScore,
            decision: shouldSkip ? 'SKIP_LEAD' : 'PROCEED_RESEARCH',
            reason: shouldSkip 
                ? `Lead score (${leadScore}) below campaign minimum threshold (${this.minLeadScore}).`
                : `Lead score (${leadScore}) meets target threshold (>= ${this.minLeadScore}).`
        };
    }
}
