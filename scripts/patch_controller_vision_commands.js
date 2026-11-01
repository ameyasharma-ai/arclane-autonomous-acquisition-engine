import fs from 'fs';
import path from 'path';

const indexPath = path.join(process.cwd(), 'controller_bot', 'index.js');
let content = fs.readFileSync(indexPath, 'utf8');

const target = "bot.command('stream_scrape', handleTriggerStream);";

const visionSnippet = `bot.command('stream_scrape', handleTriggerStream);

// Command: /stream_scrape_vision & /run_vision [query] [locality] [city] [count]
async function handleVisionStream(ctx) {
    if (!scheduler) scheduler = new Scheduler(bot, ctx.chat?.id || 'local-web-ui');
    if (ctx.chat?.id) scheduler.setChatId(ctx.chat.id);

    const args = parseArgs(ctx.message?.text || '');
    const query = args[0] || "Restaurants";
    let locality = args[1] || "in Patna";
    if (!locality.startsWith('in ')) locality = \`in \${locality}\`;
    let city = args[2] || "Patna";
    let count = parseInt(args[3], 10) || 1;

    await ctx.reply(
        \`📸 *[Vision AI Pipeline]* Launching Google Maps photo scraping & website generation for *\${query}* in *\${locality}* (\${count} lead\${count > 1 ? 's' : ''})...\\n\` +
        \`• *Photos:* Real Google Maps uploads\\n\` +
        \`• *Classifier:* Gemini Vision AI\\n\` +
        \`• *Output:* Custom live demo on arclanestudios.space\\n\\n\` +
        \`🛑 Send \\\`/abort\\\` to halt at any time.\`,
        { parse_mode: 'Markdown' }
    );

    scheduler.pipelineRunner.runStreamingScrapeAndBuild({
        query,
        locality,
        city,
        targetLeads: count,
        scraperRunner: scheduler.scraperRunner
    }).catch(e => {
        if (!scheduler.pipelineRunner.isAborted) {
            ctx.reply(\`❌ Vision stream error: \${e.message}\`);
        }
    });
}
bot.command('stream_scrape_vision', handleVisionStream);
bot.command('run_vision', handleVisionStream);
bot.command('vision', handleVisionStream);
bot.action('cmd_vision_stream', async (ctx) => {
    try { await ctx.answerCbQuery(); } catch (e) {}
    await handleVisionStream(ctx);
});`;

if (!content.includes('handleVisionStream')) {
    content = content.replace(target, visionSnippet);
    fs.writeFileSync(indexPath, content, 'utf8');
    console.log('✅ Successfully registered Vision AI commands in controller_bot/index.js');
} else {
    console.log('ℹ️ Vision AI commands already registered in controller_bot/index.js');
}
