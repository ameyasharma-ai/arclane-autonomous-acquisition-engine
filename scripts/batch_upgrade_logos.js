import fs from 'fs';
import path from 'path';
import * as cheerio from 'cheerio';

function getCanonicalMonogram(name, slug = '') {
  if (name) {
    const clean = name.replace(/^(?:The|A|An)\s+/i, '').replace(/[^a-zA-Z0-9\s]/g, '').trim();
    const words = clean.split(/\s+/).filter(w => w.length > 0);
    if (words.length >= 2) {
      return (words[0][0] + words[1][0]).toUpperCase();
    }
    if (clean.length >= 2) {
      return clean.slice(0, 2).toUpperCase();
    }
  }
  if (slug) {
    const cleanSlug = slug.replace(/[^a-zA-Z0-9]/g, '');
    if (cleanSlug.length >= 2) {
      return cleanSlug.slice(0, 2).toUpperCase();
    }
  }
  return 'AL';
}

function extractBusinessName($, slug = '') {
  // Try title tag
  const title = $('title').text().trim();
  if (title) {
    const parts = title.split(/[|•–—\-:]/);
    if (parts[0] && parts[0].trim().length >= 3) {
      return parts[0].trim();
    }
  }

  // Try header logo text
  const logoText = $('header a').first().find('span.font-syne, span.font-serif, span.font-bold, span.font-extrabold, h1').first().text().trim();
  if (logoText && logoText.length >= 3) {
    return logoText;
  }

  // Fallback to formatted slug
  return slug.replace(/[-_]/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

export function upgradeSiteLogo(indexPath, slug = '') {
  if (!fs.existsSync(indexPath)) return false;
  const originalHtml = fs.readFileSync(indexPath, 'utf8');
  const $ = cheerio.load(originalHtml);

  const businessName = extractBusinessName($, slug);
  const monogram = getCanonicalMonogram(businessName, slug);

  let modified = false;

  // 1. Header Logo
  const header = $('header');
  if (header.length) {
    const logoLink = header.find('a').first();
    if (logoLink.length) {
      // Ensure logo link classes
      logoLink.addClass('shrink-0 min-w-0 flex items-center gap-2.5 sm:gap-3 group');
      if (!logoLink.attr('class').includes('mr-')) {
        logoLink.addClass('mr-3 lg:mr-8');
      }

      // Find monogram box
      const monogramBox = logoLink.find('div.w-10, div.w-11, div.w-12, div.w-9, div.rounded-xl, div.rounded-full, div:first-child').first();
      if (monogramBox.length) {
        monogramBox.addClass('w-10 h-10 rounded-xl shrink-0 flex items-center justify-center font-syne font-black text-lg shadow-md');
        monogramBox.removeClass('w-11 w-12 text-xl');
        
        const monoText = monogramBox.text().trim();
        // Replace single-letter or empty monogram
        if (monoText.length <= 1) {
          monogramBox.text(monogram);
          modified = true;
        }
      }

      // Find text container
      const textContainer = logoLink.find('div').eq(1).length ? logoLink.find('div').eq(1) : logoLink.children().not(monogramBox).first();
      if (textContainer.length) {
        textContainer.addClass('min-w-0 flex flex-col justify-center');

        // Brand Title
        const titleSpan = textContainer.find('span.font-syne, span.font-serif, span.font-bold, span.font-extrabold, h1, span:first-child').first();
        if (titleSpan.length) {
          titleSpan.addClass('truncate max-w-[160px] xs:max-w-[200px] sm:max-w-none block leading-tight font-extrabold');
          modified = true;
        }

        // Subtitle
        const subtitleSpan = textContainer.find('span').eq(1);
        if (subtitleSpan.length && subtitleSpan[0] !== titleSpan[0]) {
          subtitleSpan.addClass('truncate max-w-[160px] xs:max-w-[200px] sm:max-w-none block text-[10px] sm:text-xs tracking-wider uppercase');
          modified = true;
        }
      }
    }
  }

  // 2. Mobile Drawer Logo
  const mobileMenu = $('#mobile-menu, [id*="mobile-menu"]');
  if (mobileMenu.length) {
    const drawerLogo = mobileMenu.find('a').first();
    if (drawerLogo.length) {
      drawerLogo.addClass('shrink-0 min-w-0 flex items-center gap-2.5 sm:gap-3');
      const drawerMono = drawerLogo.find('div').first();
      if (drawerMono.length) {
        drawerMono.addClass('w-10 h-10 rounded-xl shrink-0 flex items-center justify-center font-syne font-black text-lg shadow-md');
        drawerMono.removeClass('w-11 w-12 text-xl');
        if (drawerMono.text().trim().length <= 1) {
          drawerMono.text(monogram);
          modified = true;
        }
      }

      const drawerText = drawerLogo.find('div').eq(1);
      if (drawerText.length) {
        drawerText.addClass('min-w-0 flex flex-col justify-center');
        const dTitle = drawerText.find('span, h1').first();
        if (dTitle.length) {
          dTitle.addClass('truncate max-w-[180px] block leading-tight font-extrabold');
          modified = true;
        }
      }
    }
  }

  // 3. Footer Logo Monogram
  const footer = $('footer');
  if (footer.length) {
    const footerMono = footer.find('div.w-10, div.w-11, div.w-12, div.rounded-xl, div.rounded-full').first();
    if (footerMono.length && footerMono.text().trim().length <= 1) {
      footerMono.text(monogram);
      footerMono.addClass('w-10 h-10 rounded-xl shrink-0 flex items-center justify-center font-syne font-black text-lg');
      footerMono.removeClass('w-11 w-12 text-xl');
      modified = true;
    }
  }

  if (modified) {
    fs.writeFileSync(indexPath, $.html(), 'utf8');
    return true;
  }
  return false;
}

// Batch Runner
const dirs = [
  path.join(process.cwd(), 'web-dev-agency', 'public', 'sites'),
  path.join(process.cwd(), 'generated_sites')
];

let totalUpgraded = 0;
let totalChecked = 0;

dirs.forEach(baseDir => {
  if (!fs.existsSync(baseDir)) return;
  const sites = fs.readdirSync(baseDir);
  sites.forEach(site => {
    const indexPath = path.join(baseDir, site, 'index.html');
    if (fs.existsSync(indexPath)) {
      totalChecked++;
      const wasModified = upgradeSiteLogo(indexPath, site);
      if (wasModified) totalUpgraded++;
    }
  });
});

console.log(`✅ Batch Logo Optimization Complete:`);
console.log(`   Audited: ${totalChecked} websites`);
console.log(`   Upgraded: ${totalUpgraded} websites with responsive 2-letter monograms and overflow guards`);
