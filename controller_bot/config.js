import path from 'path';
import dotenv from 'dotenv';
import fs from 'fs';

dotenv.config();

const rootDir = process.cwd();

export const CONFIG = {
    // Dedicated Telegram Bot Token for Controller Bot
    BOT_TOKEN: process.env.CONTROLLER_BOT_TOKEN,
    
    // Paths
    ROOT_DIR: rootDir,
    SCRAPER_DIR: fs.existsSync(path.resolve(rootDir, 'scraper')) 
        ? path.resolve(rootDir, 'scraper') 
        : path.resolve(rootDir, '..', 'gmaps-scraper-Indian'),
    PLAN_JSON_PATH: path.join(rootDir, 'plan', 'week_1_plan.json'),
    REPORTS_DIR: path.join(rootDir, 'reports'),
    SITES_DIR: path.join(rootDir, 'generated_sites'),
    
    // WhatsApp User Session (Shared persistent browser session)
    WHATSAPP_SESSION_DIR: path.join(rootDir, 'whatsapp_user_session'),
    
    // Timezone
    TIMEZONE: "Asia/Kolkata",
    
    // Load Plan JSON
    loadPlan: () => {
        try {
            const content = fs.readFileSync(path.join(rootDir, 'plan', 'week_1_plan.json'), 'utf8');
            return JSON.parse(content);
        } catch (e) {
            console.error("[Config] Error loading week_1_plan.json:", e.message);
            return null;
        }
    }
};
