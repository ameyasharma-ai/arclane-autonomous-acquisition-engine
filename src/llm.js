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
   - CLEAN 2-BUTTON STICKY MOBILE BOTTOM BAR:
     * Include a fixed bottom bar on mobile screens ('md:hidden fixed bottom-0 left-0 right-0 z-40 bg-[#09090b] border-t border-zinc-800 p-3 flex gap-3').
     * MUST contain EXACTLY TWO touch buttons:
       1. 'Call Now' (tel:) -> 'flex-1 py-3 px-4 rounded-xl font-bold text-sm flex items-center justify-center gap-2 whitespace-nowrap bg-zinc-800 hover:bg-zinc-700 text-white'
       2. 'WhatsApp' (wa.me) -> 'flex-1 py-3 px-4 rounded-xl font-bold text-sm flex items-center justify-center gap-2 whitespace-nowrap bg-emerald-600 hover:bg-emerald-500 text-white'
     * STRICTLY FORBID: Never cram a 3rd button or Cart button into the mobile sticky bottom bar! 3 buttons on 360-393px screens wrap text and look broken.
     * ZERO TEXT WRAP: Apply 'whitespace-nowrap' on both buttons.
     * Add 'pb-24 md:pb-0' to body so page content and footer are never covered by the sticky bar.
   - MOBILE CART ARCHITECTURE:
     * The Cart button MUST either live in the sticky header (with a clean shopping bag icon and notification count badge), OR appear as a floating pill ABOVE the bottom bar: 'fixed bottom-20 right-4 z-50 bg-amber-500 hover:bg-amber-400 text-black px-4 py-2.5 rounded-full shadow-2xl font-bold flex items-center gap-2 whitespace-nowrap transition-all' that updates dynamically when items are added.

2. DESKTOP SPLIT-HERO SHOWCASE ARCHITECTURE (INSTANT BUSINESS IDENTIFICATION):
   - HERO LAYOUT (lg:grid-cols-12 gap-8 lg:gap-12 items-center):
     * Left Column (col-span-12 lg:col-span-7): High-contrast typography, Google rating badge ('⭐ 4.5+ (1,600+ Google Reviews)'), locality chip ('📍 Boring Road, Patna'), punchy value proposition, and two primary action buttons ('Order Online', 'Reserve Table' / 'Book Consultation').
     * Right Column (col-span-12 lg:col-span-5): Dedicated Elevated Showcase Card ('relative bg-zinc-900 border border-zinc-800 rounded-3xl p-3 sm:p-4 shadow-2xl backdrop-blur-md overflow-hidden') featuring an authentic signature dish or pristine interior photo.
   - 100% UN-TINTED VIBRANT PHOTOGRAPHY:
     * Inside the Showcase Card, the photo MUST be 100% full opacity, vibrant, sharp, and visible ('w-full h-72 sm:h-84 lg:h-[400px] object-cover rounded-2xl'). NEVER wash it out or darken it with 40% black overlays!
     * Include an elevated floating badge over the card: e.g. '<span class="absolute top-6 left-6 bg-amber-500/90 text-black font-black text-xs px-3 py-1.5 rounded-full uppercase tracking-wider backdrop-blur-sm shadow-lg">⭐ House Signature</span>'.
     * Include a real-time status chip: e.g. '<span class="absolute bottom-6 right-6 bg-black/80 text-white font-medium text-xs px-3 py-1.5 rounded-full border border-zinc-700 backdrop-blur-sm">🟢 Open Now</span>'.
   - ZERO STREET CLUTTER: Absolutely NEVER use an outdoor street flex board, roadside banner, hoarding, or photo with neighboring shop text as a background image! If no 4K wide interior exists, use a pristine dark ambient gradient or verified high-res interior stock for the hero backdrop.

3. 100% SOLID OPAQUE HEADER & FLAWLESS MOBILE DRAWER ARCHITECTURE (ZERO OVERLAPS / ZERO CLIPPING):
   - 100% OPAQUE, SOLID HEADER: Every website header MUST have a 100% solid, fully opaque background (e.g. 'bg-[#09090b]' / 'bg-zinc-950' / 'bg-black' for dark themes or solid 'bg-white' / 'bg-[#FAF9F6]' for light themes), with 'border-b border-zinc-800' and 'sticky top-0 z-40'.
   - NEVER USE TRANSPARENT OR SEMI-TRANSPARENT HEADERS: Absolutely NEVER use 'bg-transparent', 'bg-background/80', 'bg-zinc-950/80', 'bg-white/80', or 'absolute top-0' overlays.
   - ZERO HERO COLLISION: The Announcement Bar and Header must sit naturally in normal document flow BEFORE the Hero section. Never use negative margins ('-mt-...'), 'top-[37px]', or absolute positioning that forces the Hero section underneath the navigation bar.
   - FLAWLESS MOBILE DRAWER & BACKDROP OVERLAY:
     * Mobile Backdrop: Always include '<div id="menu-backdrop" class="fixed inset-0 bg-black/80 backdrop-blur-sm z-[90] hidden transition-opacity duration-300"></div>'.
     * Mobile Drawer: Structure with 'fixed top-11 sm:top-12 bottom-0 right-0 z-[100] w-full max-w-xs sm:max-w-sm bg-[#09090b] border-l border-zinc-800 rounded-tl-2xl p-6 pt-5 flex flex-col justify-between transform translate-x-full transition-transform duration-300 lg:hidden shadow-2xl overflow-y-auto' (leave clean breathing room below top announcement banner with 'top-11 sm:top-12' and 'rounded-tl-2xl' corner).
     * Z-INDEX HIERARCHY: Mobile Drawer (z-[100]) > Backdrop Overlay (z-[90]) > Sticky Header (z-40) > Sticky Mobile Bottom Bar (z-40). This guarantees that when the mobile menu is opened, the drawer sits cleanly on top of BOTH the announcement bar and the bottom action bar with ZERO overlapping or clipping!
     * Body Scroll Lock: When the drawer is opened, JS must add 'overflow-hidden' to body and reveal the backdrop; when closed, remove 'overflow-hidden' and hide backdrop.

4. ULTRA-PREMIUM AGENCY VISUAL AESTHETICS (ZERO GENERIC LOOKS):
   - Dark/Sleek or Modern Tailored Palette matching the industry with high WCAG AAA contrast.
   - Rich visual depth: Use solid elevated card surfaces ('bg-zinc-900 border border-zinc-800'), subtle radial gradient ambient glows matching the primary accent color, and soft card shadows.
   - Typography: Pair Google Fonts beautifully (e.g. Syne / Outfit for bold punchy headings, Inter / Plus Jakarta Sans for clean readable body copy).
   - Micro-interactions: Add smooth hover zoom (1.02x), border highlight transitions ('transition-all duration-300'), and button pulse animations.

5. ROBUST INTERACTIVITY & ZERO-BUG FUNCTIONALITY:
   - Mobile Hamburger Menu: Fully working toggle script with clean slide-in animation and backdrop dismiss.
   - Interactive FAQ Accordion: Working JavaScript accordion where clicking a question smoothly toggles the answer and rotates the chevron icon.
   - Customer Reviews / Testimonials: Visual rating stars (5★ with Lucide 'star' icons), authentic review snippets, and reviewer avatars.
   - Interactive Contact Form: Complete form with inputs (Name, Phone, Service, Message) that features real-time validation, loading state on submit button, and a polished success popup modal.
   - Google Maps Embed: Responsive Google Maps iframe using the exact Google Maps URL provided in the prompt, with rounded corners and a direct 'Get Directions' button.
   - Clickable Links: All phone numbers ('tel:...'), WhatsApp links ('https://wa.me/...'), and maps links must be active and correctly formatted.
   - High-Quality Imagery & Zero-Redundancy Photography:
     * When authentic business photography paths (e.g. './assets/hero.jpg', './assets/featured-1.jpg', './assets/gallery-1.jpg') are specified in the prompt, you MUST prioritize and embed those exact relative paths with responsive 'w-full h-full object-cover' styling.
     * NEVER REPEAT THE SAME IMAGE URL across multiple service cards, gallery items, or menu dishes. Every card MUST have a distinct, visually diverse photo.
     * For restaurants, cafes, and bakeries: Every single menu item MUST have a distinct, mouth-watering food photo matching its specific item (e.g. pizza photo for pizza, pasta photo for pasta, biryani photo for biryani, beverage photo for drinks). NEVER use restaurant dining room or furniture photos for food cards, and NEVER use clinic or dental photos for food.
     * If no authentic paths are specified, use verified category Unsplash photos with query parameters and beautiful gradient fallback backgrounds. Always include an inline 'onerror' fallback on all images.

5. SECURE WEB PRACTICES & ZERO-VULNERABILITY GUARANTEE (MANDATORY & ENFORCED):
   - Zero XSS & DOM Injection:
     * Never write unescaped user input or dynamic text directly into 'innerHTML' or 'document.write'. Always use 'textContent', 'innerText', or sanitize before insertion.
     * Never use 'eval()', 'Function()', or inline 'javascript:' pseudo-protocols.
     * Sanitize all form values before showing inside modals or popups.
   - Reverse Tabnabbing & Origin Hijacking Protection:
     * Every external link with 'target="_blank"' MUST strictly include 'rel="noopener noreferrer"' to prevent reverse tabnabbing and window.opener hijacking.
   - Resource Protocol Integrity & HTTPS:
     * All CDN scripts, styles, Google Fonts, and images MUST use strict HTTPS ('https://...'). Never use unencrypted HTTP ('http://') or protocol-relative ('//...') URLs.
     * Include proper Content-Security-Policy meta tags and strict-origin-when-cross-origin referrer policy.
   - Safe Dynamic Actions, Forms & Anti-Spam:
     * Contact and inquiry forms must validate inputs client-side, sanitize values before any feedback modal or alert, and never expose sensitive keys or send credentials over unencrypted channels.
     * All phone numbers ('tel:+...') and WhatsApp links ('https://wa.me/...') must contain only valid digits and standard E.164 characters, avoiding CRLF or malformed characters.
     * Form submit handlers must prevent default submission, show simulated client-side loading states without submitting plaintext credentials to external endpoints.
   - Leak-Free Hosting:
     * Zero exposure of environment variables, Vercel tokens, Gemini API keys, or Telegram credentials anywhere in client-facing code.
   - Modern Safe APIs:
     * Use standard, secure browser APIs (e.g., addEventListener) without leaking global variables or risking prototype pollution.

6. DELIVERABLE FORMAT:
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

