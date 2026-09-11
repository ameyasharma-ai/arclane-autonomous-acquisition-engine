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
        : path.resolve(rootDir, '..', 'scraper'),
    PLAN_JSON_PATH: path.join(rootDir, 'plan', 'week_1_plan.json'),
    REPORTS_DIR: path.join(rootDir, 'reports'),
    SITES_DIR: path.join(rootDir, 'generated_sites'),
    
    // WhatsApp User Session (Shared persistent browser session)
    WHATSAPP_SESSION_DIR: path.join(rootDir, 'whatsapp_user_session'),
    
    // Timezone
    TIMEZONE: "Asia/Kolkata",
    
    // Load Plan JSON (supports week_1_plan.json or specific week number)
    loadPlan: (weekNum = null) => {
        try {
            if (!weekNum) {
                // Determine week from engine_state.json if available
                const statePath = path.join(rootDir, 'plan', 'engine_state.json');
                if (fs.existsSync(statePath)) {
                    const state = JSON.parse(fs.readFileSync(statePath, 'utf8'));
                    if (state.startDate) {
                        const start = new Date(state.startDate);
                        const now = new Date();
                        const diffDays = Math.floor((now - start) / (1000 * 60 * 60 * 24));
                        const cycleDay = (diffDays % 70) + 1;
                        weekNum = Math.ceil(cycleDay / 7);
                    } else if (state.currentCycleDay) {
                        weekNum = Math.ceil(state.currentCycleDay / 7);
                    }
                }
            }
            const targetWeek = weekNum ? Math.min(Math.max(weekNum, 1), 10) : 1;
            const weekPath = path.join(rootDir, 'plan', `week_${targetWeek}_plan.json`);
            if (fs.existsSync(weekPath)) {
                return JSON.parse(fs.readFileSync(weekPath, 'utf8'));
            }
            // Fallback to week_1_plan.json
            return JSON.parse(fs.readFileSync(path.join(rootDir, 'plan', 'week_1_plan.json'), 'utf8'));
        } catch (e) {
            console.error("[Config] Error loading plan json:", e.message);
            return null;
        }
    }
};
