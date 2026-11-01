import fs from 'fs';
import path from 'path';

// 1. Update src/llm.js
const llmPath = path.join(process.cwd(), 'src', 'llm.js');
let llmCode = fs.readFileSync(llmPath, 'utf8');

const oldFoodPromptRegex = /\* For restaurants, cafes, and bakeries: Every single menu item MUST have a distinct, mouth-watering food photo[\s\S]*?clinic or dental photos for food\./;

const newFoodPrompt = `* For restaurants, cafes, and bakeries: Every single menu item MUST have a distinct, mouth-watering food photo matching its specific item.
      * MANDATORY VERIFIED FOOD PHOTO REGISTRY (STRICTLY USE THESE EXACT PHOTO IDS FOR DISHES):
        - Pizza (Margherita): 'https://images.unsplash.com/photo-1513104890138-7c749659a591?auto=format&fit=crop&q=80&w=600'
        - Pizza (Peri Peri / Chicken): 'https://images.unsplash.com/photo-1565299624946-b28f40a0ae38?auto=format&fit=crop&q=80&w=600'
        - Pasta (Creamy Alfredo / White Sauce): 'https://images.unsplash.com/photo-1555949258-eb67b1ef0ceb?auto=format&fit=crop&q=80&w=600'
        - Pasta (Arrabbiata / Red Tomato): 'https://images.unsplash.com/photo-1608897013039-887f21d8c804?auto=format&fit=crop&q=80&w=600'
        - Kebabs / Tikkas / Tandoori: 'https://images.unsplash.com/photo-1555939594-58d7cb561ad1?auto=format&fit=crop&q=80&w=600'
        - Potatoes / Crispy Starters / Fries: 'https://images.unsplash.com/photo-1573080496219-bb080dd4f877?auto=format&fit=crop&q=80&w=600'
        - Butter Chicken / Makhani / Curry: 'https://images.unsplash.com/photo-1588166524941-3bf61a9c41db?auto=format&fit=crop&q=80&w=600'
        - Biryani (Dum Handi): 'https://images.unsplash.com/photo-1563379091339-03b21ab4a4f8?auto=format&fit=crop&q=80&w=600'
        - Coffee / Cold Brew / Iced Latte: 'https://images.unsplash.com/photo-1517701604599-bb29b565090c?auto=format&fit=crop&q=80&w=600'
        - STRICT BAN: NEVER use random Unsplash IDs (such as aquarium fish 'photo-1599488615731-7e5c2823ff28', raw meat, or animals) that do not match the dish!`;

if (oldFoodPromptRegex.test(llmCode)) {
    llmCode = llmCode.replace(oldFoodPromptRegex, newFoodPrompt);
    fs.writeFileSync(llmPath, llmCode, 'utf8');
    console.log('✅ Updated src/llm.js with Verified Food Registry');
} else {
    console.warn('⚠️ Could not find oldFoodPromptRegex in src/llm.js');
}

// 2. Update src/builder.js
const builderPath = path.join(process.cwd(), 'src', 'builder.js');
let builderCode = fs.readFileSync(builderPath, 'utf8');

if (!builderCode.includes('resolveVerifiedFoodImage')) {
    builderCode = `import { resolveVerifiedFoodImage, VERIFIED_IMAGE_CATALOG } from './engine/verified_asset_catalog.js';\r\n` + builderCode;
}

const endOfEnforceRegex = /return html;\r?\n\s*\}/;
const reconciliationLogic = `// 10. Intelligent Asset Accuracy & Fish Eradication Engine
        // Automatically replaces mismatched dish images (e.g. aquarium fish, barbecue ribs for potatoes, steak for red pasta)
        const isFoodVenue = /restaurant|cafe|dine|dining|kitchen|food|dhaba|bistro/i.test(businessName + ' ' + html.slice(0, 3000));
        if (isFoodVenue) {
            // Neutralize the fish URL globally across the HTML
            html = html.replace(/photo-1599488615731-7e5c2823ff28/g, 'photo-1555939594-58d7cb561ad1');

            // Parse each dish / menu-item card and ensure exact item-to-photo accuracy
            html = html.replace(/(<div[^>]*class=["'][^"']*(?:menu-item|dish-card|food-card)[^"']*["'][^>]*>[\\s\\S]*?<\\/div>\\s*<\\/div>)/gi, (card) => {
                const titleMatch = card.match(/<h[34][^>]*>([^<]+)<\\/h[34]>/i);
                if (titleMatch) {
                    const dishTitle = titleMatch[1].trim();
                    const correctUrl = resolveVerifiedFoodImage(dishTitle);
                    if (correctUrl) {
                        return card.replace(/(<img[^>]*src=["'])(https:\\/\\/images\\.unsplash\\.com\\/[^"']+)(["'])/i, \`\$1\${correctUrl}\$3\`);
                    }
                }
                return card;
            });
        }

        return html;
    }`;

if (endOfEnforceRegex.test(builderCode)) {
    builderCode = builderCode.replace(endOfEnforceRegex, reconciliationLogic);
    fs.writeFileSync(builderPath, builderCode, 'utf8');
    console.log('✅ Updated src/builder.js with Intelligent Asset Accuracy Engine');
} else {
    console.warn('⚠️ Could not find endOfEnforceRegex in src/builder.js');
}
