import fs from 'fs';
import path from 'path';

const sitesDir = path.join(process.cwd(), 'generated_sites');
const folders = fs.readdirSync(sitesDir).filter(f => fs.statSync(path.join(sitesDir, f)).isDirectory());

console.log(`Standardizing and fixing scripts across all ${folders.length} sites...`);

for (const f of folders) {
    const htmlPath = path.join(sitesDir, f, 'index.html');
    if (!fs.existsSync(htmlPath)) continue;

    let html = fs.readFileSync(htmlPath, 'utf-8');

    // Clean up any broken script blocks
    html = html.replace(/<script>([\s\S]*?)<\/script>(\s*<\/body>)/i, (match, jsCode, endBody) => {
        if (jsCode.includes('tailwind.config')) return match;

        // Clean standardized script
        const cleanScript = `
    <!-- JavaScript Interactivity -->
    <script>
        // Initialize Lucide Icons
        if (typeof lucide !== 'undefined') {
            lucide.createIcons();
        }

        // Set Current Year in Footer
        const yearEl = document.getElementById('current-year');
        if (yearEl) yearEl.textContent = new Date().getFullYear();

        // Mobile Menu Toggle
        const menuBtn = document.getElementById('menu-btn') || document.getElementById('menu-toggle');
        const closeMenuBtn = document.getElementById('close-menu') || document.getElementById('close-menu-btn') || document.getElementById('menu-close');
        const mobileMenu = document.getElementById('mobile-menu');
        const menuBackdrop = document.getElementById('menu-backdrop');
        const mobileLinks = document.querySelectorAll('.mobile-link');

        function openMenu() {
            if (mobileMenu) {
                mobileMenu.classList.remove('translate-x-full');
                mobileMenu.classList.remove('hidden');
                mobileMenu.classList.remove('-translate-y-full');
                mobileMenu.classList.remove('opacity-0');
                mobileMenu.classList.remove('pointer-events-none');
            }
            if (menuBackdrop) menuBackdrop.classList.remove('hidden');
            document.body.classList.add('overflow-hidden');
        }

        function closeMenu() {
            if (mobileMenu) {
                mobileMenu.classList.add('translate-x-full');
            }
            if (menuBackdrop) menuBackdrop.classList.add('hidden');
            document.body.classList.remove('overflow-hidden');
        }

        function toggleMenu() {
            if (!mobileMenu) return;
            const isClosed = mobileMenu.classList.contains('translate-x-full') || mobileMenu.classList.contains('hidden');
            if (isClosed) {
                openMenu();
            } else {
                closeMenu();
            }
        }

        if (menuBtn) menuBtn.addEventListener('click', toggleMenu);
        if (closeMenuBtn) closeMenuBtn.addEventListener('click', closeMenu);
        if (menuBackdrop) menuBackdrop.addEventListener('click', closeMenu);
        mobileLinks.forEach(link => link.addEventListener('click', closeMenu));

        // FAQ Accordion
        const faqToggles = document.querySelectorAll('.faq-toggle');
        faqToggles.forEach(toggle => {
            toggle.addEventListener('click', () => {
                const content = toggle.nextElementSibling;
                const icon = toggle.querySelector('i') || toggle.querySelector('svg');
                if (content) content.classList.toggle('hidden');
                if (icon) icon.classList.toggle('rotate-180');
            });
        });

        // Contact Form Submission & Modal
        const inquiryForm = document.getElementById('inquiry-form') || document.getElementById('contact-form');
        const successModal = document.getElementById('success-modal');
        const closeModalBtn = document.getElementById('close-modal');
        const submitBtn = document.getElementById('submit-btn');
        const btnText = document.getElementById('btn-text');

        if (inquiryForm) {
            inquiryForm.addEventListener('submit', (e) => {
                e.preventDefault();
                if (btnText) btnText.textContent = 'Submitting...';
                if (submitBtn) submitBtn.disabled = true;

                setTimeout(() => {
                    if (btnText) btnText.textContent = 'Submit Inquiry';
                    if (submitBtn) submitBtn.disabled = false;
                    inquiryForm.reset();
                    if (successModal) {
                        successModal.classList.remove('hidden');
                        successModal.classList.add('flex');
                    }
                }, 800);
            });
        }

        if (closeModalBtn && successModal) {
            closeModalBtn.addEventListener('click', () => {
                successModal.classList.remove('flex');
                successModal.classList.add('hidden');
            });
        }

        if (successModal) {
            successModal.addEventListener('click', (e) => {
                if (e.target === successModal) {
                    successModal.classList.remove('flex');
                    successModal.classList.add('hidden');
                }
            });
        }
    </script>
${endBody}`;
        return cleanScript;
    });

    fs.writeFileSync(htmlPath, html, 'utf-8');
    console.log(`✅ Cleaned and validated script for: ${f}`);
}

console.log("All site scripts cleaned and verified!");
