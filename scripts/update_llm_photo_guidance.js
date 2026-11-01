import fs from 'fs';
import path from 'path';

const llmPath = path.join(process.cwd(), 'src', 'llm.js');
let content = fs.readFileSync(llmPath, 'utf8');

const target = "- High-Quality Imagery: Use crisp, relevant Unsplash photos with curated query parameters (e.g. 'https://images.unsplash.com/photo-...?auto=format&fit=crop&w=800&q=80') and beautiful gradient fallback backgrounds.";

const replacement = "- High-Quality Imagery & Authentic Photography: When authentic business photography paths (e.g. './assets/hero.jpg', './assets/featured-1.jpg', './assets/gallery-1.jpg') are specified in the prompt, you MUST prioritize and embed those exact relative paths with responsive 'w-full h-full object-cover' styling. If no authentic paths are specified, use verified category Unsplash photos with query parameters and beautiful gradient fallback backgrounds.";

if (content.includes(target)) {
    content = content.replace(target, replacement);
    fs.writeFileSync(llmPath, content, 'utf8');
    console.log('✅ Successfully updated llm.js with authentic photo prompt guidance');
} else {
    console.error('❌ Target string not found in src/llm.js');
}

