import OpenAI from 'openai';
import pRetry from 'p-retry';
import fs from 'fs';
import path from 'path';

export class LLMClient {
    constructor() {
        this.openai = new OpenAI({
            baseURL: "https://openrouter.ai/api/v1",
            apiKey: process.env.OPENROUTER_API_KEY,
        });
        this.model = 'openai/gpt-oss-120b';
        this.systemPrompt = fs.readFileSync(path.join(process.cwd(), 'src', 'system_prompt.txt'), 'utf-8');
    }

    async generateSummary(prompt) {
        return await pRetry(async () => {
            try {
                if (process.env.API) {
                    console.log("Attempting to use Gemini API...");
                    const geminiClient = new OpenAI({
                        baseURL: "https://generativelanguage.googleapis.com/v1beta/openai/",
                        apiKey: process.env.API,
                    });
                    const response = await geminiClient.chat.completions.create({
                        model: "gemini-flash-lite-latest",
                        messages: [
                            { role: "system", content: this.systemPrompt },
                            { role: "user", content: prompt }
                        ]
                    });
                    return response.choices[0].message.content.trim();
                } else {
                    throw new Error("Gemini API key not configured in .env");
                }
            } catch (error) {
                console.log(`Gemini API failed or not configured (${error.message}). Falling back to OpenRouter...`);
                const response = await this.openai.chat.completions.create({
                    model: this.model,
                    messages: [
                        {
                            role: "system",
                            content: this.systemPrompt
                        },
                        {
                            role: "user",
                            content: prompt
                        }
                    ]
                });
                return response.choices[0].message.content.trim();
            }
        }, {
            retries: 3,
            onFailedAttempt: error => {
                console.log(`LLM attempt ${error.attemptNumber} failed. There are ${error.retriesLeft} retries left.`);
            }
        });
    }

    async generateCode(prompt) {
        const coderSystemPrompt = `You are a world-class Lead Frontend Architect, UI/UX Designer, and Conversion Optimization Specialist.
Your task is to take the provided Antigravity prompt and build an extraordinary, production-grade, mobile-first website that local business owners will fall in love with at first glance.

CRITICAL DESIGN & AESTHETIC PRINCIPLES (MUST FOLLOW STRICTLY):
1. MOBILE-FIRST ARCHITECTURE & ZERO-DISTORTION GUARANTEE:
   - 80%+ of users view on mobile. Design every section, font size, padding, and layout mobile-first (375px–428px) before scaling up to tablet (768px) and desktop (1280px+).
   - ZERO Horizontal Overflow: Prevent horizontal scrollbars by applying 'overflow-x-hidden' on the body and using fluid responsive containers ('w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8').
   - ZERO Overlapping / Text Clipping: Never use fixed pixel heights (e.g. 'h-[300px]') on content cards. Always use 'min-h-...', 'flex flex-col justify-between', and auto-wrapping text ('break-words', 'leading-relaxed') so titles, descriptions, and CTA buttons never collide or overlap on small screens.
   - ZERO Image Distortion: All image wrappers must use consistent aspect ratios ('aspect-video', 'aspect-square', or 'aspect-[4/3]') with 'object-cover w-full h-full rounded-xl' so pictures never stretch or warp on any display (320px to 4K).
   - Touch-Friendly: All buttons and interactive elements must have minimum 48px height for effortless finger taps.
   - Sticky Mobile Bottom Bar: Include a fixed bottom bar on mobile screens ('md:hidden fixed bottom-0 left-0 right-0 z-50 bg-black/90 backdrop-blur-lg border-t border-zinc-800 p-3') with high-contrast, glowing 'Call Now' (tel:) and 'WhatsApp' (wa.me) quick buttons. Add 'pb-24 md:pb-0' to body so page content and footer are never covered.

2. ULTRA-PREMIUM AGENCY VISUAL AESTHETICS (ZERO GENERIC LOOKS):
   - Dark/Sleek or Modern Tailored Palette matching the industry with high WCAG AAA contrast.
   - Rich visual depth: Use subtle glassmorphism backdrop blurs ('backdrop-blur-md bg-zinc-950/80 border border-zinc-800/80'), radial gradient ambient glows matching the primary accent color, and soft card shadows.
   - Typography: Pair Google Fonts beautifully (e.g. Syne / Outfit for bold punchy headings, Inter / Plus Jakarta Sans for clean readable body copy).
   - Micro-interactions: Add smooth hover zoom (1.02x), border highlight transitions ('transition-all duration-300'), and button pulse animations.

3. ROBUST INTERACTIVITY & ZERO-BUG FUNCTIONALITY:
   - Mobile Hamburger Menu: Fully working toggle script with clean slide-in animation and backdrop dismiss.
   - Interactive FAQ Accordion: Working JavaScript accordion where clicking a question smoothly toggles the answer and rotates the chevron icon.
   - Customer Reviews / Testimonials: Visual rating stars (5★ with Lucide 'star' icons), authentic review snippets, and reviewer avatars.
   - Interactive Contact Form: Complete form with inputs (Name, Phone, Service, Message) that features real-time validation, loading state on submit button, and a polished success popup modal.
   - Google Maps Embed: Responsive Google Maps iframe using the exact Google Maps URL provided in the prompt, with rounded corners and a direct 'Get Directions' button.
   - Clickable Links: All phone numbers ('tel:...'), WhatsApp links ('https://wa.me/...'), and maps links must be active and correctly formatted.
   - High-Quality Imagery: Use crisp, relevant Unsplash photos with curated query parameters (e.g. 'https://images.unsplash.com/photo-...?auto=format&fit=crop&w=800&q=80') and beautiful gradient fallback backgrounds.

4. DELIVERABLE FORMAT:
   - Output a single, complete, beautiful index.html file.
   - Load Tailwind CSS via CDN: <script src="https://cdn.tailwindcss.com"></script>
   - Load Google Fonts & Lucide Icons (<script src="https://unpkg.com/lucide@latest"></script> + lucide.createIcons()).
   - Output ONLY the complete HTML code wrapped in \`\`\`html and \`\`\` without markdown commentary or truncated code.`;

        return await pRetry(async () => {
            try {
                if (process.env.API) {
                    console.log("[LLM] Generating website code using Gemini API...");
                    const geminiClient = new OpenAI({
                        baseURL: "https://generativelanguage.googleapis.com/v1beta/openai/",
                        apiKey: process.env.API,
                    });
                    const response = await geminiClient.chat.completions.create({
                        model: "gemini-flash-lite-latest",
                        messages: [
                            { role: "system", content: coderSystemPrompt },
                            { role: "user", content: prompt }
                        ]
                    });
                    return response.choices[0].message.content.trim();
                } else {
                    throw new Error("Gemini API key not configured in .env");
                }
            } catch (error) {
                console.log(`[LLM] Gemini API code generation failed (${error.message}). Falling back to OpenRouter...`);
                const response = await this.openai.chat.completions.create({
                    model: this.model,
                    messages: [
                        { role: "system", content: coderSystemPrompt },
                        { role: "user", content: prompt }
                    ]
                });
                return response.choices[0].message.content.trim();
            }
        }, {
            retries: 3,
            onFailedAttempt: error => {
                console.log(`Code generation attempt ${error.attemptNumber} failed. There are ${error.retriesLeft} retries left.`);
            }
        });
    }
}

