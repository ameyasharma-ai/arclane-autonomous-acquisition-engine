import { PipelineRunner } from './pipeline_runner.js';
import { ScraperRunner } from './scraper_runner.js';

async function runDemo() {
    console.log("==================================================");
    console.log("🚀 DEMO: Monday Plan — 5 Leads in Pune (Gyms)");
    console.log("⚡ Real-Time Streaming Scraper + Builder Pipeline");
    console.log("==================================================");

    const scraperRunner = new ScraperRunner(null, null);
    const pipelineRunner = new PipelineRunner(null, null);

    const result = await pipelineRunner.runStreamingScrapeAndBuild({
        query: "Gyms",
        locality: "in Pune",
        city: "Pune",
        targetLeads: 5,
        scraperRunner
    });

    console.log("\n==================================================");
    console.log("🎉 DEMO COMPLETED SUCCESSFULLY!");
    console.log(`• Streamed Leads: ${result.streamedCount}`);
    console.log(`• Built Websites: ${result.processedCount}`);
    console.log(`• Total Duration: ${result.totalDurationMin} min`);
    console.log("==================================================");
}

runDemo().catch(err => {
    console.error("❌ Demo encountered error:", err);
    process.exit(1);
});
