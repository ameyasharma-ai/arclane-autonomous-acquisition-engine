import fs from 'fs';
import path from 'path';
import { WebsiteBuilder } from '../src/builder.js';

const htmlContent = `<!DOCTYPE html>
<html lang="en" class="scroll-smooth overflow-x-hidden">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>La Fumee | Boring Road's Premier Cafe & Dining Patna</title>
    <meta name="description" content="Experience authentic wood-fired pizzas, succulent kebabs, artisan pastas, and craft coffee at La Fumee Cafe & Dining, Boring Road, Patna. Order online or reserve a table.">
    <link rel="icon" href="data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22><rect width=%22100%22 height=%22100%22 rx=%2224%22 fill=%22%230F172A%22/><text y=%2268%22 x=%2250%22 text-anchor=%22middle%22 font-size=%2260%22>🍽️</text></svg>">
    <base href="/sites/lafumee/">
    
    <!-- ArcLane Zero-Vulnerability Security Headers -->
    <meta http-equiv="Content-Security-Policy" content="default-src 'self' 'unsafe-inline' https: data: blob:; script-src 'self' 'unsafe-inline' https://cdn.tailwindcss.com https://unpkg.com https://cdn.jsdelivr.net; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com data:; img-src 'self' https: data: blob:; connect-src 'self' https:; frame-src 'self' https://www.google.com https://maps.google.com; object-src 'none'; base-uri 'self';">
    <meta name="referrer" content="strict-origin-when-cross-origin">
    <meta http-equiv="X-Content-Type-Options" content="nosniff">
    <meta http-equiv="X-Frame-Options" content="SAMEORIGIN">

    <!-- Fonts & Icons -->
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@400;500;600;700;800;900&family=Plus+Jakarta+Sans:wght@300;400;500;600;700&display=swap" rel="stylesheet">
    <script src="https://cdn.tailwindcss.com"></script>
    <script src="https://unpkg.com/lucide@latest"></script>
    <script>
        tailwind.config = {
            theme: {
                extend: {
                    fontFamily: {
                        sans: ['"Plus Jakarta Sans"', 'sans-serif'],
                        heading: ['"Outfit"', 'sans-serif'],
                    },
                    colors: {
                        amber: {
                            400: '#fbbf24',
                            500: '#f59e0b',
                            600: '#d97706',
                        }
                    }
                }
            }
        }
    </script>
    <script>
      window.addEventListener('error', function(e) {
        if (e.target && e.target.tagName === 'IMG') {
          var img = e.target;
          if (!img.dataset.hasFallenBack) {
            img.dataset.hasFallenBack = 'true';
            var src = img.getAttribute('src') || '';
            if (src.includes('assets/')) {
              var fName = src.split('assets/').pop();
              img.src = '/sites/lafumee/assets/' + fName;
              return;
            }
            img.src = 'https://images.unsplash.com/photo-1544025162-d76694265947?auto=format&fit=crop&w=800&q=80';
          }
        }
      }, true);
    </script>
</head>
<body class="bg-[#09090b] text-zinc-100 font-sans antialiased overflow-x-hidden pb-28 lg:pb-0 selection:bg-amber-500 selection:text-black">

    <!-- Top Announcement Bar -->
    <div class="bg-gradient-to-r from-amber-600 via-amber-500 to-amber-600 text-black text-xs sm:text-sm font-bold py-2 px-4 text-center tracking-wide flex items-center justify-center gap-2">
        <span>🔥 ORDER DIRECTLY WITH US & GET 10% OFF! USE CODE: <span class="underline uppercase">FUMEE10</span></span>
        <span class="hidden md:inline">• Fast Doorstep Delivery in Boring Road</span>
    </div>

    <!-- Solid Opaque Sticky Header -->
    <header class="sticky top-0 z-40 bg-[#09090b] border-b border-zinc-800/80 backdrop-blur-md">
        <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-20 flex items-center justify-between">
            <!-- Brand Logo -->
            <a href="/sites/lafumee/" class="flex items-center gap-3 group">
                <div class="w-11 h-11 rounded-xl bg-gradient-to-br from-amber-500 to-amber-600 flex items-center justify-center font-heading font-black text-black text-xl shadow-lg shadow-amber-500/20 group-hover:scale-105 transition-transform">
                    LF
                </div>
                <div>
                    <span class="font-heading font-black text-xl sm:text-2xl tracking-tight text-white block leading-none">LA FUMEE</span>
                    <span class="text-[10px] sm:text-xs text-amber-500 font-bold uppercase tracking-widest block mt-0.5">CAFE & DINING • PATNA</span>
                </div>
            </a>

            <!-- Desktop Navigation Links -->
            <nav class="hidden lg:flex items-center gap-8 font-medium text-sm text-zinc-300">
                <a href="#menu" class="hover:text-amber-400 transition-colors">Our Menu</a>
                <a href="#story" class="hover:text-amber-400 transition-colors">Our Story</a>
                <a href="#why-us" class="hover:text-amber-400 transition-colors">Why La Fumee</a>
                <a href="#reviews" class="hover:text-amber-400 transition-colors">Reviews</a>
                <a href="#location" class="hover:text-amber-400 transition-colors">Location</a>
            </nav>

            <!-- Desktop Right Actions -->
            <div class="hidden lg:flex items-center gap-4">
                <button onclick="toggleCartModal()" class="relative p-2.5 rounded-xl bg-zinc-900 border border-zinc-800 hover:border-amber-500/50 text-zinc-300 hover:text-white transition-all flex items-center gap-2 text-sm font-semibold">
                    <i data-lucide="shopping-bag" class="w-4 h-4 text-amber-400"></i>
                    <span>Cart</span>
                    <span id="nav-cart-count" class="w-5 h-5 rounded-full bg-amber-500 text-black text-xs font-black flex items-center justify-center">0</span>
                </button>
                <button onclick="openReservationModal()" class="bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-black font-bold text-sm px-5 py-2.5 rounded-xl shadow-lg shadow-amber-500/20 hover:shadow-amber-500/40 transition-all flex items-center gap-2">
                    <i data-lucide="calendar" class="w-4 h-4"></i>
                    <span>Book Table</span>
                </button>
            </div>

            <!-- Mobile Hamburger Button & Cart Icon -->
            <div class="flex items-center gap-3 lg:hidden">
                <button onclick="toggleCartModal()" class="relative p-2 rounded-lg bg-zinc-900 border border-zinc-800 text-amber-400">
                    <i data-lucide="shopping-bag" class="w-5 h-5"></i>
                    <span id="mobile-header-cart-count" class="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-amber-500 text-black text-[10px] font-black flex items-center justify-center">0</span>
                </button>
                <button id="menu-toggle" aria-label="Toggle navigation menu" class="p-2 rounded-lg bg-zinc-900 border border-zinc-800 text-zinc-300 hover:text-white">
                    <i data-lucide="menu" class="w-6 h-6"></i>
                </button>
            </div>
        </div>
    </header>

    <!-- Mobile Menu Backdrop Overlay -->
    <div id="menu-backdrop" class="fixed inset-0 bg-black/80 backdrop-blur-sm z-[90] hidden transition-opacity duration-300"></div>

    <!-- Mobile Drawer Menu -->
    <div id="mobile-menu" class="fixed top-11 sm:top-12 bottom-0 right-0 z-[100] w-full max-w-xs sm:max-w-sm bg-[#09090b] border-l border-t border-zinc-800 text-white p-6 pt-5 flex flex-col justify-between transform translate-x-full transition-transform duration-300 lg:hidden shadow-2xl overflow-y-auto rounded-tl-2xl">
        <div>
            <div class="flex items-center justify-between pb-6 border-b border-zinc-800">
                <div class="flex items-center gap-3">
                    <div class="w-9 h-9 rounded-lg bg-amber-500 flex items-center justify-center font-heading font-black text-black">LF</div>
                    <span class="font-heading font-bold text-lg">LA FUMEE</span>
                </div>
                <button id="menu-close" aria-label="Close menu" class="p-2 text-zinc-400 hover:text-white">
                    <i data-lucide="x" class="w-5 h-5"></i>
                </button>
            </div>
            <nav class="flex flex-col gap-4 mt-6 text-base font-medium text-zinc-300">
                <a href="#menu" class="mobile-nav-link hover:text-amber-400 py-2">Our Menu</a>
                <a href="#story" class="mobile-nav-link hover:text-amber-400 py-2">Our Story</a>
                <a href="#why-us" class="mobile-nav-link hover:text-amber-400 py-2">Why La Fumee</a>
                <a href="#reviews" class="mobile-nav-link hover:text-amber-400 py-2">Customer Reviews</a>
                <a href="#location" class="mobile-nav-link hover:text-amber-400 py-2">Location & Timings</a>
            </nav>
        </div>
        <div class="pt-6 border-t border-zinc-800 flex flex-col gap-3">
            <button onclick="openReservationModal(); closeMobileMenu();" class="w-full bg-amber-500 text-black font-bold py-3 rounded-xl flex items-center justify-center gap-2">
                <i data-lucide="calendar" class="w-4 h-4"></i>
                <span>Reserve a Table</span>
            </button>
            <a href="tel:09122557999" class="w-full bg-zinc-900 border border-zinc-800 text-zinc-300 font-medium py-2.5 rounded-xl text-center text-sm">
                Call Direct: +91 91225 57999
            </a>
        </div>
    </div>

    <!-- DESKTOP SPLIT-HERO SHOWCASE SECTION -->
    <section class="relative pt-8 pb-16 lg:pt-16 lg:pb-24 overflow-hidden bg-gradient-to-b from-[#09090b] via-zinc-950 to-[#09090b]">
        <!-- Ambient Radial Glow -->
        <div class="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-amber-500/10 blur-[140px] pointer-events-none rounded-full"></div>

        <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
            <div class="grid lg:grid-cols-12 gap-8 lg:gap-12 items-center">
                
                <!-- Left Column (col-span-7): Headline, Badges, Value Proposition, CTAs -->
                <div class="lg:col-span-7 flex flex-col items-start text-left">
                    <!-- Badges -->
                    <div class="flex flex-wrap items-center gap-2 sm:gap-3 mb-5">
                        <div class="inline-flex items-center gap-1.5 bg-amber-500/10 border border-amber-500/30 px-3 py-1 rounded-full text-amber-400 text-xs sm:text-sm font-bold tracking-wide">
                            <i data-lucide="star" class="w-4 h-4 fill-amber-400 text-amber-400"></i>
                            <span>4.5★ (1,604+ Google Reviews)</span>
                        </div>
                        <div class="inline-flex items-center gap-1.5 bg-zinc-900/80 border border-zinc-800 px-3 py-1 rounded-full text-zinc-300 text-xs sm:text-sm font-medium">
                            <i data-lucide="map-pin" class="w-3.5 h-3.5 text-amber-400"></i>
                            <span>Opposite Cimage, Boring Rd, Patna</span>
                        </div>
                    </div>

                    <!-- Main Heading -->
                    <h1 class="font-heading font-black text-3xl sm:text-5xl lg:text-5xl xl:text-6xl text-white tracking-tight leading-[1.1] mb-6">
                        Boring Road's Finest <br>
                        <span class="text-transparent bg-clip-text bg-gradient-to-r from-amber-400 via-amber-500 to-amber-600">
                            LA FUMEE
                        </span>
                        Cafe & Dining
                    </h1>

                    <!-- Descriptive Subtitle -->
                    <p class="text-zinc-400 text-base sm:text-lg lg:text-xl font-normal leading-relaxed max-w-2xl mb-8">
                        Indulge in authentic hand-stretched wood-fired pizzas, succulent kebabs, velvety pastas, and rich specialty brews. Crafted right opposite Cimage in Boring Road for your most unforgettable culinary moments.
                    </p>

                    <!-- CTAs -->
                    <div class="w-full sm:w-auto flex flex-col sm:flex-row items-stretch sm:items-center gap-4">
                        <a href="#menu" class="bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-black font-extrabold text-base px-8 py-4 rounded-xl shadow-xl shadow-amber-500/25 hover:shadow-amber-500/40 transition-all flex items-center justify-center gap-3 transform hover:-translate-y-0.5">
                            <i data-lucide="utensils" class="w-5 h-5"></i>
                            <span>Order Online (10% Off)</span>
                        </a>
                        <button onclick="openReservationModal()" class="bg-zinc-900/90 hover:bg-zinc-800 text-white border border-zinc-700/80 font-bold text-base px-7 py-4 rounded-xl transition-all flex items-center justify-center gap-2 hover:border-zinc-500">
                            <i data-lucide="calendar" class="w-5 h-5 text-amber-400"></i>
                            <span>Reserve Table</span>
                        </button>
                    </div>

                    <!-- Micro Trust Stats -->
                    <div class="grid grid-cols-3 gap-6 pt-8 mt-8 border-t border-zinc-800/80 w-full max-w-lg">
                        <div>
                            <span class="block font-heading font-black text-2xl text-white">100%</span>
                            <span class="text-xs text-zinc-400 font-medium">Fresh Daily Prep</span>
                        </div>
                        <div>
                            <span class="block font-heading font-black text-2xl text-amber-400">1,600+</span>
                            <span class="text-xs text-zinc-400 font-medium">Happy Diners</span>
                        </div>
                        <div>
                            <span class="block font-heading font-black text-2xl text-white">30 Min</span>
                            <span class="text-xs text-zinc-400 font-medium">Average Delivery</span>
                        </div>
                    </div>
                </div>

                <!-- Right Column (col-span-5): Dedicated Elevated Showcase Card -->
                <div class="lg:col-span-5 mt-6 lg:mt-0">
                    <div class="relative bg-zinc-900 border border-zinc-800 rounded-3xl p-3 sm:p-4 shadow-2xl backdrop-blur-md overflow-hidden group">
                        <!-- 100% Full Opacity Authentic Photography -->
                        <div class="relative rounded-2xl overflow-hidden aspect-[4/3] sm:aspect-[16/11]">
                            <img src="/sites/lafumee/assets/featured-1.jpg" onerror="this.onerror=null; this.src='https://images.unsplash.com/photo-1544025162-d76694265947?auto=format&fit=crop&w=800&q=80';" alt="La Fumee Authentic House Specialty" class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700">
                            
                            <!-- Un-tinted Clear Presentation with Floating Badges -->
                            <div class="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-black/30 pointer-events-none"></div>

                            <span class="absolute top-4 left-4 bg-amber-500 text-black font-black text-xs px-3.5 py-1.5 rounded-full uppercase tracking-wider shadow-lg flex items-center gap-1.5">
                                <i data-lucide="sparkles" class="w-3.5 h-3.5 fill-black"></i>
                                <span>Authentic House Specialty</span>
                            </span>

                            <div class="absolute bottom-4 left-4 right-4 flex items-center justify-between text-white">
                                <div>
                                    <h2 class="font-heading font-black text-lg sm:text-xl text-white drop-shadow">Freshly Made Starters</h2>
                                    <p class="text-xs text-zinc-300 drop-shadow">La Fumee's Authentic Kitchen • Boring Road</p>
                                </div>
                                <span class="bg-black/80 text-emerald-400 border border-emerald-500/40 text-xs font-bold px-3 py-1 rounded-full backdrop-blur-sm whitespace-nowrap">
                                    🟢 Open Now
                                </span>
                            </div>
                        </div>

                        <!-- Card Quick Footer -->
                        <div class="pt-4 px-2 pb-1 flex items-center justify-between text-xs text-zinc-400">
                            <span class="flex items-center gap-1.5 text-zinc-300">
                                <i data-lucide="clock" class="w-3.5 h-3.5 text-amber-400"></i>
                                <span>11:00 AM – 10:30 PM Daily</span>
                            </span>
                            <span class="flex items-center gap-1 text-amber-400 font-semibold">
                                <i data-lucide="shield-check" class="w-4 h-4"></i>
                                <span>100% Authentic Photos</span>
                            </span>
                        </div>
                    </div>
                </div>

            </div>
        </div>
    </section>

    <!-- CURATED MENU SECTION (9 Distinct Dishes with Unique Verified Photography) -->
    <section id="menu" class="py-16 sm:py-20 bg-[#09090b] border-t border-zinc-800/80">
        <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div class="text-center max-w-3xl mx-auto mb-10">
                <span class="text-amber-500 font-heading font-bold text-xs uppercase tracking-widest block mb-2">TASTE THE DIFFERENCE</span>
                <h2 class="font-heading font-black text-3xl sm:text-4xl text-white tracking-tight">Our Curated Signature Menu</h2>
                <p class="text-zinc-400 text-sm sm:text-base mt-3">Handcrafted with premium ingredients, rich spices, and authentic passion. Order directly to enjoy special discounts.</p>
            </div>

            <!-- Category Filter Tabs -->
            <div class="flex items-center justify-center gap-2 sm:gap-3 flex-wrap mb-10">
                <button onclick="filterMenu('all')" class="menu-tab active px-5 py-2 rounded-xl text-xs sm:text-sm font-bold transition-all bg-amber-500 text-black">All Dishes</button>
                <button onclick="filterMenu('pizza')" class="menu-tab px-5 py-2 rounded-xl text-xs sm:text-sm font-bold transition-all bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-white">Pizzas</button>
                <button onclick="filterMenu('pasta')" class="menu-tab px-5 py-2 rounded-xl text-xs sm:text-sm font-bold transition-all bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-white">Pastas</button>
                <button onclick="filterMenu('starters')" class="menu-tab px-5 py-2 rounded-xl text-xs sm:text-sm font-bold transition-all bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-white">Starters & Kebabs</button>
                <button onclick="filterMenu('main')" class="menu-tab px-5 py-2 rounded-xl text-xs sm:text-sm font-bold transition-all bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-white">Main Course</button>
                <button onclick="filterMenu('biryani')" class="menu-tab px-5 py-2 rounded-xl text-xs sm:text-sm font-bold transition-all bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-white">Biryani</button>
                <button onclick="filterMenu('beverages')" class="menu-tab px-5 py-2 rounded-xl text-xs sm:text-sm font-bold transition-all bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-white">Beverages</button>
            </div>

            <!-- Menu Grid: 9 Dishes with Unique Verified Photography -->
            <div id="dishes-grid" class="grid sm:grid-cols-2 lg:grid-cols-3 gap-6 sm:gap-8">
                
                <!-- Dish 1: Margherita Pizza -->
                <div class="menu-item bg-zinc-900/90 border border-zinc-800 rounded-2xl overflow-hidden hover:border-amber-500/40 transition-all group flex flex-col justify-between" data-category="pizza">
                    <div class="relative aspect-video overflow-hidden">
                        <img src="https://images.unsplash.com/photo-1513104890138-7c749659a591?auto=format&fit=crop&q=80&w=600" onerror="this.onerror=null; this.src='https://images.unsplash.com/photo-1544025162-d76694265947?auto=format&fit=crop&w=600&q=80';" alt="Margherita Artisan Pizza" class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500">
                        <span class="absolute top-3 left-3 bg-amber-500 text-black font-extrabold text-[10px] px-2.5 py-1 rounded-full uppercase tracking-wider">Bestseller</span>
                    </div>
                    <div class="p-5 flex-1 flex flex-col justify-between">
                        <div>
                            <div class="flex items-center justify-between gap-2 mb-2">
                                <h3 class="font-heading font-bold text-lg text-white">Margherita Artisan Pizza</h3>
                                <span class="font-heading font-black text-amber-400 text-lg">₹349</span>
                            </div>
                            <p class="text-zinc-400 text-xs sm:text-sm line-clamp-2 leading-relaxed">Classic fresh mozzarella, fragrant basil leaves, and signature house tomato sauce on crisp wood-fired crust.</p>
                        </div>
                        <button onclick="addToCart('Margherita Artisan Pizza', 349)" class="w-full mt-4 bg-zinc-800 hover:bg-amber-500 hover:text-black text-white font-bold text-xs sm:text-sm py-2.5 rounded-xl transition-all flex items-center justify-center gap-2">
                            <i data-lucide="plus" class="w-4 h-4"></i>
                            <span>Add to Order</span>
                        </button>
                    </div>
                </div>

                <!-- Dish 2: La Fumee Peri Peri Pizza -->
                <div class="menu-item bg-zinc-900/90 border border-zinc-800 rounded-2xl overflow-hidden hover:border-amber-500/40 transition-all group flex flex-col justify-between" data-category="pizza">
                    <div class="relative aspect-video overflow-hidden">
                        <img src="https://images.unsplash.com/photo-1565299624946-b28f40a0ae38?auto=format&fit=crop&q=80&w=600" onerror="this.onerror=null; this.src='https://images.unsplash.com/photo-1544025162-d76694265947?auto=format&fit=crop&w=600&q=80';" alt="La Fumee Special Peri Peri Pizza" class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500">
                        <span class="absolute top-3 left-3 bg-amber-500 text-black font-extrabold text-[10px] px-2.5 py-1 rounded-full uppercase tracking-wider">Chef's Special</span>
                    </div>
                    <div class="p-5 flex-1 flex flex-col justify-between">
                        <div>
                            <div class="flex items-center justify-between gap-2 mb-2">
                                <h3 class="font-heading font-bold text-lg text-white">La Fumee Special Peri Peri Pizza</h3>
                                <span class="font-heading font-black text-amber-400 text-lg">₹449</span>
                            </div>
                            <p class="text-zinc-400 text-xs sm:text-sm line-clamp-2 leading-relaxed">Loaded with spicy peri peri grilled chicken, bell peppers, jalapeños, and extra melted mozzarella cheese.</p>
                        </div>
                        <button onclick="addToCart('La Fumee Special Peri Peri Pizza', 449)" class="w-full mt-4 bg-zinc-800 hover:bg-amber-500 hover:text-black text-white font-bold text-xs sm:text-sm py-2.5 rounded-xl transition-all flex items-center justify-center gap-2">
                            <i data-lucide="plus" class="w-4 h-4"></i>
                            <span>Add to Order</span>
                        </button>
                    </div>
                </div>

                <!-- Dish 3: Creamy Alfredo White Sauce Pasta -->
                <div class="menu-item bg-zinc-900/90 border border-zinc-800 rounded-2xl overflow-hidden hover:border-amber-500/40 transition-all group flex flex-col justify-between" data-category="pasta">
                    <div class="relative aspect-video overflow-hidden">
                        <img src="https://images.unsplash.com/photo-1555949258-eb67b1ef0ceb?auto=format&fit=crop&q=80&w=600" onerror="this.onerror=null; this.src='https://images.unsplash.com/photo-1544025162-d76694265947?auto=format&fit=crop&w=600&q=80';" alt="Creamy Alfredo White Sauce Pasta" class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500">
                        <span class="absolute top-3 left-3 bg-amber-500 text-black font-extrabold text-[10px] px-2.5 py-1 rounded-full uppercase tracking-wider">Popular</span>
                    </div>
                    <div class="p-5 flex-1 flex flex-col justify-between">
                        <div>
                            <div class="flex items-center justify-between gap-2 mb-2">
                                <h3 class="font-heading font-bold text-lg text-white">Creamy Alfredo White Sauce Pasta</h3>
                                <span class="font-heading font-black text-amber-400 text-lg">₹379</span>
                            </div>
                            <p class="text-zinc-400 text-xs sm:text-sm line-clamp-2 leading-relaxed">Penne tossed in rich garlic parmesan cream sauce with sauteed mushrooms, fresh herbs, and cracked pepper.</p>
                        </div>
                        <button onclick="addToCart('Creamy Alfredo White Sauce Pasta', 379)" class="w-full mt-4 bg-zinc-800 hover:bg-amber-500 hover:text-black text-white font-bold text-xs sm:text-sm py-2.5 rounded-xl transition-all flex items-center justify-center gap-2">
                            <i data-lucide="plus" class="w-4 h-4"></i>
                            <span>Add to Order</span>
                        </button>
                    </div>
                </div>

                <!-- Dish 4: Spicy Arrabbiata Red Sauce Pasta -->
                <div class="menu-item bg-zinc-900/90 border border-zinc-800 rounded-2xl overflow-hidden hover:border-amber-500/40 transition-all group flex flex-col justify-between" data-category="pasta">
                    <div class="relative aspect-video overflow-hidden">
                        <img src="https://images.unsplash.com/photo-1551183053-bf91a1d81141?auto=format&fit=crop&q=80&w=600" onerror="this.onerror=null; this.src='https://images.unsplash.com/photo-1544025162-d76694265947?auto=format&fit=crop&w=600&q=80';" alt="Spicy Arrabbiata Red Sauce Pasta" class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500">
                        <span class="absolute top-3 left-3 bg-amber-500 text-black font-extrabold text-[10px] px-2.5 py-1 rounded-full uppercase tracking-wider">Classic</span>
                    </div>
                    <div class="p-5 flex-1 flex flex-col justify-between">
                        <div>
                            <div class="flex items-center justify-between gap-2 mb-2">
                                <h3 class="font-heading font-bold text-lg text-white">Spicy Arrabbiata Red Sauce Pasta</h3>
                                <span class="font-heading font-black text-amber-400 text-lg">₹399</span>
                            </div>
                            <p class="text-zinc-400 text-xs sm:text-sm line-clamp-2 leading-relaxed">Tangy Italian tomato sauce infused with garlic, chilli flakes, black olives, and fresh basil leaves.</p>
                        </div>
                        <button onclick="addToCart('Spicy Arrabbiata Red Sauce Pasta', 399)" class="w-full mt-4 bg-zinc-800 hover:bg-amber-500 hover:text-black text-white font-bold text-xs sm:text-sm py-2.5 rounded-xl transition-all flex items-center justify-center gap-2">
                            <i data-lucide="plus" class="w-4 h-4"></i>
                            <span>Add to Order</span>
                        </button>
                    </div>
                </div>

                <!-- Dish 5: Smoky Afghani Murgh Tikka -->
                <div class="menu-item bg-zinc-900/90 border border-zinc-800 rounded-2xl overflow-hidden hover:border-amber-500/40 transition-all group flex flex-col justify-between" data-category="starters">
                    <div class="relative aspect-video overflow-hidden">
                        <img src="https://images.unsplash.com/photo-1599488615731-7e5c2823ff28?auto=format&fit=crop&q=80&w=600" onerror="this.onerror=null; this.src='https://images.unsplash.com/photo-1544025162-d76694265947?auto=format&fit=crop&w=600&q=80';" alt="Smoky Afghani Murgh Tikka" class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500">
                        <span class="absolute top-3 left-3 bg-amber-500 text-black font-extrabold text-[10px] px-2.5 py-1 rounded-full uppercase tracking-wider">Must Try</span>
                    </div>
                    <div class="p-5 flex-1 flex flex-col justify-between">
                        <div>
                            <div class="flex items-center justify-between gap-2 mb-2">
                                <h3 class="font-heading font-bold text-lg text-white">Smoky Afghani Murgh Tikka</h3>
                                <span class="font-heading font-black text-amber-400 text-lg">₹429</span>
                            </div>
                            <p class="text-zinc-400 text-xs sm:text-sm line-clamp-2 leading-relaxed">Tender chicken chunks marinated in creamy cashew paste, mild spices, and char-grilled to smoky perfection.</p>
                        </div>
                        <button onclick="addToCart('Smoky Afghani Murgh Tikka', 429)" class="w-full mt-4 bg-zinc-800 hover:bg-amber-500 hover:text-black text-white font-bold text-xs sm:text-sm py-2.5 rounded-xl transition-all flex items-center justify-center gap-2">
                            <i data-lucide="plus" class="w-4 h-4"></i>
                            <span>Add to Order</span>
                        </button>
                    </div>
                </div>

                <!-- Dish 6: Crispy Honey Chilli Potatoes -->
                <div class="menu-item bg-zinc-900/90 border border-zinc-800 rounded-2xl overflow-hidden hover:border-amber-500/40 transition-all group flex flex-col justify-between" data-category="starters">
                    <div class="relative aspect-video overflow-hidden">
                        <img src="https://images.unsplash.com/photo-1544025162-d76694265947?auto=format&fit=crop&w=600" onerror="this.onerror=null; this.src='https://images.unsplash.com/photo-1544025162-d76694265947?auto=format&fit=crop&w=600&q=80';" alt="Crispy Honey Chilli Potatoes" class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500">
                        <span class="absolute top-3 left-3 bg-amber-500 text-black font-extrabold text-[10px] px-2.5 py-1 rounded-full uppercase tracking-wider">Crispy</span>
                    </div>
                    <div class="p-5 flex-1 flex flex-col justify-between">
                        <div>
                            <div class="flex items-center justify-between gap-2 mb-2">
                                <h3 class="font-heading font-bold text-lg text-white">Crispy Honey Chilli Potatoes</h3>
                                <span class="font-heading font-black text-amber-400 text-lg">₹249</span>
                            </div>
                            <p class="text-zinc-400 text-xs sm:text-sm line-clamp-2 leading-relaxed">Golden fried potato fingers tossed in sticky sweet chilli glaze with sesame seeds and spring onions.</p>
                        </div>
                        <button onclick="addToCart('Crispy Honey Chilli Potatoes', 249)" class="w-full mt-4 bg-zinc-800 hover:bg-amber-500 hover:text-black text-white font-bold text-xs sm:text-sm py-2.5 rounded-xl transition-all flex items-center justify-center gap-2">
                            <i data-lucide="plus" class="w-4 h-4"></i>
                            <span>Add to Order</span>
                        </button>
                    </div>
                </div>

                <!-- Dish 7: Butter Chicken with Butter Naan -->
                <div class="menu-item bg-zinc-900/90 border border-zinc-800 rounded-2xl overflow-hidden hover:border-amber-500/40 transition-all group flex flex-col justify-between" data-category="main">
                    <div class="relative aspect-video overflow-hidden">
                        <img src="https://images.unsplash.com/photo-1588166524941-3bf61a9c41db?auto=format&fit=crop&q=80&w=600" onerror="this.onerror=null; this.src='https://images.unsplash.com/photo-1544025162-d76694265947?auto=format&fit=crop&w=600&q=80';" alt="Butter Chicken with Butter Naan" class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500">
                        <span class="absolute top-3 left-3 bg-amber-500 text-black font-extrabold text-[10px] px-2.5 py-1 rounded-full uppercase tracking-wider">Chef's Pride</span>
                    </div>
                    <div class="p-5 flex-1 flex flex-col justify-between">
                        <div>
                            <div class="flex items-center justify-between gap-2 mb-2">
                                <h3 class="font-heading font-bold text-lg text-white">Butter Chicken with Butter Naan</h3>
                                <span class="font-heading font-black text-amber-400 text-lg">₹429</span>
                            </div>
                            <p class="text-zinc-400 text-xs sm:text-sm line-clamp-2 leading-relaxed">Rich, velvety tomato makhani gravy with tender tandoori chicken served with two fresh butter naans.</p>
                        </div>
                        <button onclick="addToCart('Butter Chicken with Butter Naan', 429)" class="w-full mt-4 bg-zinc-800 hover:bg-amber-500 hover:text-black text-white font-bold text-xs sm:text-sm py-2.5 rounded-xl transition-all flex items-center justify-center gap-2">
                            <i data-lucide="plus" class="w-4 h-4"></i>
                            <span>Add to Order</span>
                        </button>
                    </div>
                </div>

                <!-- Dish 8: Hyderabadi Dum Biryani -->
                <div class="menu-item bg-zinc-900/90 border border-zinc-800 rounded-2xl overflow-hidden hover:border-amber-500/40 transition-all group flex flex-col justify-between" data-category="biryani">
                    <div class="relative aspect-video overflow-hidden">
                        <img src="https://images.unsplash.com/photo-1563379091339-03b21ab4a4f8?auto=format&fit=crop&q=80&w=600" onerror="this.onerror=null; this.src='https://images.unsplash.com/photo-1544025162-d76694265947?auto=format&fit=crop&w=600&q=80';" alt="Hyderabadi Dum Biryani" class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500">
                        <span class="absolute top-3 left-3 bg-amber-500 text-black font-extrabold text-[10px] px-2.5 py-1 rounded-full uppercase tracking-wider">Royal</span>
                    </div>
                    <div class="p-5 flex-1 flex flex-col justify-between">
                        <div>
                            <div class="flex items-center justify-between gap-2 mb-2">
                                <h3 class="font-heading font-bold text-lg text-white">Hyderabadi Dum Biryani</h3>
                                <span class="font-heading font-black text-amber-400 text-lg">₹379</span>
                            </div>
                            <p class="text-zinc-400 text-xs sm:text-sm line-clamp-2 leading-relaxed">Aromatic long-grain basmati rice layered with tender marinated chicken, saffron, and slow-cooked in sealed handi.</p>
                        </div>
                        <button onclick="addToCart('Hyderabadi Dum Biryani', 379)" class="w-full mt-4 bg-zinc-800 hover:bg-amber-500 hover:text-black text-white font-bold text-xs sm:text-sm py-2.5 rounded-xl transition-all flex items-center justify-center gap-2">
                            <i data-lucide="plus" class="w-4 h-4"></i>
                            <span>Add to Order</span>
                        </button>
                    </div>
                </div>

                <!-- Dish 9: Cold Brew Iced Coffee -->
                <div class="menu-item bg-zinc-900/90 border border-zinc-800 rounded-2xl overflow-hidden hover:border-amber-500/40 transition-all group flex flex-col justify-between" data-category="beverages">
                    <div class="relative aspect-video overflow-hidden">
                        <img src="https://images.unsplash.com/photo-1517701604599-bb29b565090c?auto=format&fit=crop&q=80&w=600" onerror="this.onerror=null; this.src='https://images.unsplash.com/photo-1544025162-d76694265947?auto=format&fit=crop&w=600&q=80';" alt="Cold Brew Iced Coffee" class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500">
                        <span class="absolute top-3 left-3 bg-amber-500 text-black font-extrabold text-[10px] px-2.5 py-1 rounded-full uppercase tracking-wider">Refreshing</span>
                    </div>
                    <div class="p-5 flex-1 flex flex-col justify-between">
                        <div>
                            <div class="flex items-center justify-between gap-2 mb-2">
                                <h3 class="font-heading font-bold text-lg text-white">Cold Brew Iced Coffee</h3>
                                <span class="font-heading font-black text-amber-400 text-lg">₹199</span>
                            </div>
                            <p class="text-zinc-400 text-xs sm:text-sm line-clamp-2 leading-relaxed">Smooth 18-hour cold steeped artisan roast coffee served chilled over ice with a splash of milk and vanilla essence.</p>
                        </div>
                        <button onclick="addToCart('Cold Brew Iced Coffee', 199)" class="w-full mt-4 bg-zinc-800 hover:bg-amber-500 hover:text-black text-white font-bold text-xs sm:text-sm py-2.5 rounded-xl transition-all flex items-center justify-center gap-2">
                            <i data-lucide="plus" class="w-4 h-4"></i>
                            <span>Add to Order</span>
                        </button>
                    </div>
                </div>

            </div>
        </div>
    </section>

    <!-- OUR STORY & AMBIANCE SECTION -->
    <section id="story" class="py-16 sm:py-24 bg-zinc-950 border-t border-zinc-800/80">
        <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div class="grid lg:grid-cols-12 gap-12 items-center">
                <!-- Left: Double Authentic Visual Collage -->
                <div class="lg:col-span-6 grid grid-cols-2 gap-4">
                    <div class="space-y-4">
                        <div class="rounded-2xl overflow-hidden border border-zinc-800 shadow-xl aspect-square">
                            <img src="/sites/lafumee/assets/featured-2.jpg" onerror="this.onerror=null; this.src='https://images.unsplash.com/photo-1544025162-d76694265947?auto=format&fit=crop&w=600&q=80';" alt="La Fumee Authentic Glazed Creation" class="w-full h-full object-cover hover:scale-105 transition-transform duration-500">
                        </div>
                        <div class="bg-zinc-900 border border-zinc-800 p-5 rounded-2xl text-center">
                            <span class="block font-heading font-black text-3xl text-amber-400">1,600+</span>
                            <span class="text-xs text-zinc-400 font-medium mt-1 block">Patna Diners Served</span>
                        </div>
                    </div>
                    <div class="space-y-4 pt-8">
                        <div class="bg-gradient-to-br from-amber-500/20 to-amber-600/10 border border-amber-500/30 p-5 rounded-2xl text-center">
                            <span class="block font-heading font-black text-3xl text-white">4.5★</span>
                            <span class="text-xs text-amber-400 font-bold mt-1 block">Top Rated in Boring Rd</span>
                        </div>
                        <div class="rounded-2xl overflow-hidden border border-zinc-800 shadow-xl aspect-[3/4]">
                            <img src="https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?auto=format&fit=crop&w=600&q=80" alt="La Fumee Warm Dining Atmosphere" class="w-full h-full object-cover hover:scale-105 transition-transform duration-500">
                        </div>
                    </div>
                </div>

                <!-- Right: Story Narrative -->
                <div class="lg:col-span-6">
                    <span class="text-amber-500 font-heading font-bold text-xs uppercase tracking-widest block mb-3">OUR HEART & SOUL</span>
                    <h2 class="font-heading font-black text-3xl sm:text-4xl text-white tracking-tight leading-tight mb-6">
                        Redefining Modern Dining in Patna Since Inception
                    </h2>
                    <p class="text-zinc-300 text-sm sm:text-base leading-relaxed mb-4">
                        Nestled directly opposite Cimage on Boring Road, La Fumee was born from an unyielding obsession with authentic wood-fired crusts, rich aromatic kebabs, and handcrafted hospitality.
                    </p>
                    <p class="text-zinc-400 text-sm sm:text-base leading-relaxed mb-8">
                        Whether you are celebrating milestones with friends, enjoying a cozy evening dinner with family, or ordering your favorite late-night craving, our team ensures every bite speaks of passion and hygiene.
                    </p>

                    <div class="flex flex-wrap items-center gap-6">
                        <div class="flex items-center gap-3">
                            <div class="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400">
                                <i data-lucide="award" class="w-5 h-5"></i>
                            </div>
                            <div>
                                <span class="block text-white font-bold text-sm">Culinary Masterchefs</span>
                                <span class="text-xs text-zinc-400">Authentic Recipes</span>
                            </div>
                        </div>
                        <div class="flex items-center gap-3">
                            <div class="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400">
                                <i data-lucide="flame" class="w-5 h-5"></i>
                            </div>
                            <div>
                                <span class="block text-white font-bold text-sm">Wood-Fired Oven</span>
                                <span class="text-xs text-zinc-400">Smoky Italian Crust</span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    </section>

    <!-- TESTIMONIALS SECTION -->
    <section id="reviews" class="py-16 sm:py-20 bg-[#09090b] border-t border-zinc-800/80">
        <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div class="text-center max-w-2xl mx-auto mb-12">
                <span class="text-amber-500 font-heading font-bold text-xs uppercase tracking-widest block mb-2">REAL LOCAL EXPERIENCES</span>
                <h2 class="font-heading font-black text-3xl sm:text-4xl text-white">What Our Guests Are Saying</h2>
                <p class="text-zinc-400 text-sm mt-3">Verified reviews from Google Local Guides and food enthusiasts across Patna.</p>
            </div>

            <div class="grid md:grid-cols-3 gap-6">
                <!-- Review 1 -->
                <div class="bg-zinc-900 border border-zinc-800 p-6 rounded-2xl flex flex-col justify-between">
                    <div>
                        <div class="flex items-center gap-1 text-amber-400 mb-4">
                            <i data-lucide="star" class="w-4 h-4 fill-amber-400"></i>
                            <i data-lucide="star" class="w-4 h-4 fill-amber-400"></i>
                            <i data-lucide="star" class="w-4 h-4 fill-amber-400"></i>
                            <i data-lucide="star" class="w-4 h-4 fill-amber-400"></i>
                            <i data-lucide="star" class="w-4 h-4 fill-amber-400"></i>
                        </div>
                        <p class="text-zinc-300 text-sm leading-relaxed mb-6">"One of the best cafes on Boring Road! The wood-fired pizza and smoky tikkas were extraordinary. Cozy seating and prompt courteous staff."</p>
                    </div>
                    <div class="flex items-center gap-3 pt-4 border-t border-zinc-800">
                        <div class="w-9 h-9 rounded-full bg-amber-500/20 text-amber-400 font-bold flex items-center justify-center text-xs">AK</div>
                        <div>
                            <span class="block text-white font-bold text-sm">Ankit Kumar</span>
                            <span class="text-[11px] text-zinc-400">Google Local Guide</span>
                        </div>
                    </div>
                </div>

                <!-- Review 2 -->
                <div class="bg-zinc-900 border border-zinc-800 p-6 rounded-2xl flex flex-col justify-between">
                    <div>
                        <div class="flex items-center gap-1 text-amber-400 mb-4">
                            <i data-lucide="star" class="w-4 h-4 fill-amber-400"></i>
                            <i data-lucide="star" class="w-4 h-4 fill-amber-400"></i>
                            <i data-lucide="star" class="w-4 h-4 fill-amber-400"></i>
                            <i data-lucide="star" class="w-4 h-4 fill-amber-400"></i>
                            <i data-lucide="star" class="w-4 h-4 fill-amber-400"></i>
                        </div>
                        <p class="text-zinc-300 text-sm leading-relaxed mb-6">"Celebrated my birthday here! The Alfredo pasta and crispy starters were fantastic. Portions are generous and prices are very reasonable."</p>
                    </div>
                    <div class="flex items-center gap-3 pt-4 border-t border-zinc-800">
                        <div class="w-9 h-9 rounded-full bg-amber-500/20 text-amber-400 font-bold flex items-center justify-center text-xs">PS</div>
                        <div>
                            <span class="block text-white font-bold text-sm">Priya Singh</span>
                            <span class="text-[11px] text-zinc-400">Verified Diner</span>
                        </div>
                    </div>
                </div>

                <!-- Review 3 -->
                <div class="bg-zinc-900 border border-zinc-800 p-6 rounded-2xl flex flex-col justify-between">
                    <div>
                        <div class="flex items-center gap-1 text-amber-400 mb-4">
                            <i data-lucide="star" class="w-4 h-4 fill-amber-400"></i>
                            <i data-lucide="star" class="w-4 h-4 fill-amber-400"></i>
                            <i data-lucide="star" class="w-4 h-4 fill-amber-400"></i>
                            <i data-lucide="star" class="w-4 h-4 fill-amber-400"></i>
                            <i data-lucide="star" class="w-4 h-4 fill-amber-400"></i>
                        </div>
                        <p class="text-zinc-300 text-sm leading-relaxed mb-6">"Great location right opposite Cimage. Easy to find, lovely ambiance, and their cold brew iced coffee was spot on. Will definitely return!"</p>
                    </div>
                    <div class="flex items-center gap-3 pt-4 border-t border-zinc-800">
                        <div class="w-9 h-9 rounded-full bg-amber-500/20 text-amber-400 font-bold flex items-center justify-center text-xs">RM</div>
                        <div>
                            <span class="block text-white font-bold text-sm">Rahul Mishra</span>
                            <span class="text-[11px] text-zinc-400">Food Blogger, Patna</span>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    </section>

    <!-- LOCATION & OPENING HOURS -->
    <section id="location" class="py-16 sm:py-20 bg-zinc-950 border-t border-zinc-800/80">
        <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div class="grid lg:grid-cols-12 gap-8 items-center">
                <!-- Details -->
                <div class="lg:col-span-5 space-y-6">
                    <div>
                        <span class="text-amber-500 font-heading font-bold text-xs uppercase tracking-widest block mb-2">VISIT US</span>
                        <h2 class="font-heading font-black text-3xl sm:text-4xl text-white">Find Us on Boring Road</h2>
                        <p class="text-zinc-400 text-sm mt-2">Opposite Cimage Institute, easily accessible from all corners of Patna.</p>
                    </div>

                    <div class="space-y-4">
                        <div class="flex items-start gap-4 p-4 rounded-xl bg-zinc-900 border border-zinc-800">
                            <div class="w-10 h-10 rounded-lg bg-amber-500/10 flex items-center justify-center text-amber-400 flex-shrink-0 mt-0.5">
                                <i data-lucide="map-pin" class="w-5 h-5"></i>
                            </div>
                            <div>
                                <h4 class="text-white font-bold text-sm">Full Address</h4>
                                <p class="text-zinc-400 text-xs mt-1">Opposite Cimage, Boring Road, Patna, Bihar 800001</p>
                            </div>
                        </div>

                        <div class="flex items-start gap-4 p-4 rounded-xl bg-zinc-900 border border-zinc-800">
                            <div class="w-10 h-10 rounded-lg bg-amber-500/10 flex items-center justify-center text-amber-400 flex-shrink-0 mt-0.5">
                                <i data-lucide="clock" class="w-5 h-5"></i>
                            </div>
                            <div>
                                <h4 class="text-white font-bold text-sm">Opening Hours</h4>
                                <p class="text-zinc-400 text-xs mt-1">Monday – Sunday: 11:00 AM – 10:30 PM (No weekly off)</p>
                            </div>
                        </div>

                        <div class="flex items-start gap-4 p-4 rounded-xl bg-zinc-900 border border-zinc-800">
                            <div class="w-10 h-10 rounded-lg bg-amber-500/10 flex items-center justify-center text-amber-400 flex-shrink-0 mt-0.5">
                                <i data-lucide="phone" class="w-5 h-5"></i>
                            </div>
                            <div>
                                <h4 class="text-white font-bold text-sm">Direct Contact</h4>
                                <p class="text-zinc-400 text-xs mt-1">+91 91225 57999 • Online orders & table bookings</p>
                            </div>
                        </div>
                    </div>

                    <div class="flex flex-col sm:flex-row gap-3 pt-2">
                        <a href="https://maps.google.com/?q=La+Fumee+Boring+Road+Patna" target="_blank" rel="noopener noreferrer" class="bg-amber-500 hover:bg-amber-400 text-black font-bold text-sm py-3 px-6 rounded-xl flex items-center justify-center gap-2 transition-all">
                            <i data-lucide="navigation" class="w-4 h-4"></i>
                            <span>Get Directions</span>
                        </a>
                        <a href="tel:09122557999" class="bg-zinc-900 hover:bg-zinc-800 text-white border border-zinc-700 font-bold text-sm py-3 px-6 rounded-xl flex items-center justify-center gap-2 transition-all">
                            <i data-lucide="phone-call" class="w-4 h-4 text-amber-400"></i>
                            <span>Call La Fumee</span>
                        </a>
                    </div>
                </div>

                <!-- Google Map Embed -->
                <div class="lg:col-span-7 h-[380px] rounded-2xl overflow-hidden border border-zinc-800 shadow-2xl relative">
                    <iframe 
                        title="La Fumee Google Maps Location"
                        src="https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d3597.589886364024!2d85.1147!3d25.6192!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x39ed5839f88c8f0f%3A0xf3cb3f848be220ff!2sLa%20Fumee!5e0!3m2!1sen!2sin!4v1700000000000" 
                        class="w-full h-full border-0 filter grayscale contrast-125 opacity-90 hover:opacity-100 transition-opacity" 
                        allowfullscreen="" 
                        loading="lazy" 
                        referrerpolicy="no-referrer-when-downgrade">
                    </iframe>
                </div>
            </div>
        </div>
    </section>

    <!-- FOOTER -->
    <footer class="bg-[#09090b] border-t border-zinc-800 py-10 text-center text-xs text-zinc-500">
        <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-4">
            <div class="flex items-center gap-2">
                <span class="w-6 h-6 rounded-md bg-amber-500 text-black font-black text-xs flex items-center justify-center">LF</span>
                <span class="text-zinc-300 font-bold">La Fumee Cafe & Dining</span>
                <span>• Boring Road, Patna</span>
            </div>
            <p>© 2026 La Fumee. All rights reserved. Crafted by <a href="https://www.arclanestudios.space" target="_blank" rel="noopener noreferrer" class="text-amber-500 hover:underline font-semibold">ArcLane Studios</a></p>
        </div>
    </footer>

    <!-- FLOATING CART ACTION PILL (MOBILE) -->
    <div id="floating-cart-pill" class="md:hidden fixed bottom-20 right-4 z-50">
        <button onclick="toggleCartModal()" class="bg-amber-500 hover:bg-amber-400 text-black font-extrabold px-4 py-2.5 rounded-full shadow-2xl flex items-center gap-2 text-sm whitespace-nowrap border-2 border-white/20">
            <i data-lucide="shopping-bag" class="w-4 h-4"></i>
            <span>Cart (<span id="floating-cart-count">0</span>)</span>
        </button>
    </div>

    <!-- STRICT 2-BUTTON STICKY MOBILE BOTTOM BAR (ZERO CLUTTER, ZERO TEXT WRAP) -->
    <div class="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-[#09090b] border-t border-zinc-800 p-3 flex gap-3 shadow-2xl">
        <a href="tel:09122557999" class="flex-1 py-3 px-4 rounded-xl font-bold text-sm flex items-center justify-center gap-2 whitespace-nowrap bg-zinc-800 hover:bg-zinc-700 text-white shadow-lg">
            <i data-lucide="phone" class="w-4 h-4 text-amber-400"></i>
            <span class="whitespace-nowrap">Call Now</span>
        </a>
        <a href="https://wa.me/919122557999?text=Hi%20La%20Fumee!%20I%20would%20like%20to%20place%20an%20order." target="_blank" rel="noopener noreferrer" class="flex-1 py-3 px-4 rounded-xl font-bold text-sm flex items-center justify-center gap-2 whitespace-nowrap bg-emerald-600 hover:bg-emerald-500 text-white shadow-lg">
            <i data-lucide="message-circle" class="w-4 h-4"></i>
            <span class="whitespace-nowrap">WhatsApp</span>
        </a>
    </div>

    <!-- CART MODAL -->
    <div id="cart-modal" class="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm hidden flex items-center justify-center p-4">
        <div class="bg-zinc-900 border border-zinc-800 rounded-2xl w-full max-w-md p-6 shadow-2xl overflow-hidden flex flex-col max-h-[85vh]">
            <div class="flex items-center justify-between pb-4 border-b border-zinc-800">
                <div class="flex items-center gap-2">
                    <i data-lucide="shopping-bag" class="w-5 h-5 text-amber-400"></i>
                    <h3 class="font-heading font-bold text-lg text-white">Your Order</h3>
                </div>
                <button onclick="toggleCartModal()" class="text-zinc-400 hover:text-white p-1">
                    <i data-lucide="x" class="w-5 h-5"></i>
                </button>
            </div>

            <!-- Cart Items List -->
            <div id="cart-items" class="py-4 space-y-3 overflow-y-auto flex-1">
                <p id="empty-cart-msg" class="text-zinc-500 text-center py-8 text-sm">Your order is empty. Browse the menu to add delicious items!</p>
            </div>

            <!-- Bill Breakdown -->
            <div class="pt-4 border-t border-zinc-800 space-y-2 text-sm">
                <div class="flex justify-between text-zinc-400">
                    <span>Subtotal</span>
                    <span id="cart-subtotal" class="font-bold text-white">₹0</span>
                </div>
                <div class="flex justify-between text-emerald-400 font-medium">
                    <span>Direct Order Discount (10%)</span>
                    <span id="cart-discount">-₹0</span>
                </div>
                <div class="flex justify-between text-base font-extrabold text-white pt-2 border-t border-zinc-800/80">
                    <span>Total Payable</span>
                    <span id="cart-total" class="text-amber-400">₹0</span>
                </div>

                <button onclick="sendOrderViaWhatsApp()" id="checkout-btn" disabled class="w-full mt-4 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-extrabold py-3.5 rounded-xl shadow-lg flex items-center justify-center gap-2 transition-all">
                    <i data-lucide="send" class="w-4 h-4"></i>
                    <span>Confirm Order via WhatsApp</span>
                </button>
            </div>
        </div>
    </div>

    <!-- TABLE RESERVATION MODAL -->
    <div id="reservation-modal" class="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm hidden flex items-center justify-center p-4">
        <div class="bg-zinc-900 border border-zinc-800 rounded-2xl w-full max-w-md p-6 shadow-2xl">
            <div class="flex items-center justify-between pb-4 border-b border-zinc-800">
                <div class="flex items-center gap-2">
                    <i data-lucide="calendar" class="w-5 h-5 text-amber-400"></i>
                    <h3 class="font-heading font-bold text-lg text-white">Reserve a Table</h3>
                </div>
                <button onclick="closeReservationModal()" class="text-zinc-400 hover:text-white p-1">
                    <i data-lucide="x" class="w-5 h-5"></i>
                </button>
            </div>

            <form onsubmit="handleReservationSubmit(event)" class="mt-4 space-y-4">
                <div>
                    <label class="block text-xs font-semibold text-zinc-300 mb-1">Your Full Name</label>
                    <input type="text" required placeholder="e.g. Rahul Sharma" class="w-full bg-zinc-800/90 border border-zinc-700 rounded-xl px-4 py-2.5 text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-amber-500">
                </div>
                <div>
                    <label class="block text-xs font-semibold text-zinc-300 mb-1">Phone Number</label>
                    <input type="tel" required placeholder="e.g. 9876543210" class="w-full bg-zinc-800/90 border border-zinc-700 rounded-xl px-4 py-2.5 text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-amber-500">
                </div>
                <div class="grid grid-cols-2 gap-3">
                    <div>
                        <label class="block text-xs font-semibold text-zinc-300 mb-1">Guests</label>
                        <select class="w-full bg-zinc-800/90 border border-zinc-700 rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:border-amber-500">
                            <option>2 Guests</option>
                            <option>3-4 Guests</option>
                            <option>5-8 Guests</option>
                            <option>8+ Guests (Party)</option>
                        </select>
                    </div>
                    <div>
                        <label class="block text-xs font-semibold text-zinc-300 mb-1">Time</label>
                        <select class="w-full bg-zinc-800/90 border border-zinc-700 rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:border-amber-500">
                            <option>Lunch (1:00 PM)</option>
                            <option>Evening (5:30 PM)</option>
                            <option>Dinner (8:00 PM)</option>
                            <option>Late Dinner (9:30 PM)</option>
                        </select>
                    </div>
                </div>

                <button type="submit" class="w-full mt-4 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-black font-extrabold py-3.5 rounded-xl shadow-lg transition-all flex items-center justify-center gap-2">
                    <i data-lucide="check-circle" class="w-4 h-4"></i>
                    <span>Confirm Reservation</span>
                </button>
            </form>
        </div>
    </div>

    <!-- Client-Side Logic -->
    <script>
        // Initialize Lucide Icons
        lucide.createIcons();

        // Mobile Hamburger Drawer Toggle
        const menuToggle = document.getElementById('menu-toggle');
        const menuClose = document.getElementById('menu-close');
        const mobileMenu = document.getElementById('mobile-menu');
        const menuBackdrop = document.getElementById('menu-backdrop');

        function openMobileMenu() {
            mobileMenu.classList.remove('translate-x-full');
            menuBackdrop.classList.remove('hidden');
            document.body.classList.add('overflow-hidden');
        }

        function closeMobileMenu() {
            mobileMenu.classList.add('translate-x-full');
            menuBackdrop.classList.add('hidden');
            document.body.classList.remove('overflow-hidden');
        }

        if (menuToggle) menuToggle.addEventListener('click', openMobileMenu);
        if (menuClose) menuClose.addEventListener('click', closeMobileMenu);
        if (menuBackdrop) menuBackdrop.addEventListener('click', closeMobileMenu);

        document.querySelectorAll('.mobile-nav-link').forEach(link => {
            link.addEventListener('click', closeMobileMenu);
        });

        // Cart State & Logic
        let cart = [];

        function addToCart(name, price) {
            const existing = cart.find(item => item.name === name);
            if (existing) {
                existing.qty++;
            } else {
                cart.push({ name, price, qty: 1 });
            }
            updateCartUI();

            // Brief button feedback
            const toast = document.createElement('div');
            toast.className = 'fixed top-24 right-4 z-[110] bg-amber-500 text-black text-xs font-extrabold px-4 py-2.5 rounded-xl shadow-2xl flex items-center gap-2 animate-pulse';
            toast.innerHTML = '<i data-lucide="check" class="w-4 h-4"></i> Added to Order!';
            document.body.appendChild(toast);
            lucide.createIcons();
            setTimeout(() => toast.remove(), 2000);
        }

        function removeFromCart(name) {
            const idx = cart.findIndex(item => item.name === name);
            if (idx !== -1) {
                if (cart[idx].qty > 1) {
                    cart[idx].qty--;
                } else {
                    cart.splice(idx, 1);
                }
            }
            updateCartUI();
        }

        function updateCartUI() {
            const totalCount = cart.reduce((acc, item) => acc + item.qty, 0);
            const subtotal = cart.reduce((acc, item) => acc + (item.price * item.qty), 0);
            const discount = Math.round(subtotal * 0.10);
            const total = subtotal - discount;

            // Update badge counters
            document.getElementById('nav-cart-count').textContent = totalCount;
            document.getElementById('mobile-header-cart-count').textContent = totalCount;
            document.getElementById('floating-cart-count').textContent = totalCount;

            // Floating pill visibility
            const floatingPill = document.getElementById('floating-cart-pill');
            if (totalCount > 0) {
                floatingPill.classList.remove('hidden');
            }

            // Update totals
            document.getElementById('cart-subtotal').textContent = '₹' + subtotal;
            document.getElementById('cart-discount').textContent = '-₹' + discount;
            document.getElementById('cart-total').textContent = '₹' + total;

            const cartContainer = document.getElementById('cart-items');
            const emptyMsg = document.getElementById('empty-cart-msg');
            const checkoutBtn = document.getElementById('checkout-btn');

            if (cart.length === 0) {
                cartContainer.innerHTML = '<p id="empty-cart-msg" class="text-zinc-500 text-center py-8 text-sm">Your order is empty. Browse the menu to add delicious items!</p>';
                checkoutBtn.disabled = true;
            } else {
                checkoutBtn.disabled = false;
                cartContainer.innerHTML = cart.map(item => \`
                    <div class="flex items-center justify-between p-3 rounded-xl bg-zinc-800/60 border border-zinc-700/50">
                        <div>
                            <h4 class="font-bold text-sm text-white">\${item.name}</h4>
                            <span class="text-xs text-amber-400 font-semibold">₹\${item.price} × \${item.qty} = ₹\${item.price * item.qty}</span>
                        </div>
                        <div class="flex items-center gap-2 bg-zinc-900 border border-zinc-700 rounded-lg p-1">
                            <button onclick="removeFromCart('\${item.name}')" class="w-6 h-6 flex items-center justify-center text-zinc-400 hover:text-white font-bold text-base">-</button>
                            <span class="text-xs font-bold px-1 text-white">\${item.qty}</span>
                            <button onclick="addToCart('\${item.name}', \${item.price})" class="w-6 h-6 flex items-center justify-center text-amber-400 hover:text-white font-bold text-base">+</button>
                        </div>
                    </div>
                \`).join('');
            }
        }

        function toggleCartModal() {
            const modal = document.getElementById('cart-modal');
            modal.classList.toggle('hidden');
        }

        function openReservationModal() {
            document.getElementById('reservation-modal').classList.remove('hidden');
        }

        function closeReservationModal() {
            document.getElementById('reservation-modal').classList.add('hidden');
        }

        function handleReservationSubmit(e) {
            e.preventDefault();
            alert('🎉 Table Reservation Request Received! Our team at La Fumee will call you right away to confirm your table.');
            closeReservationModal();
        }

        function sendOrderViaWhatsApp() {
            if (cart.length === 0) return;
            const subtotal = cart.reduce((acc, item) => acc + (item.price * item.qty), 0);
            const discount = Math.round(subtotal * 0.10);
            const total = subtotal - discount;

            let msg = "🍽️ *NEW ORDER FROM LA FUMEE WEBSITE*%0A%0A";
            cart.forEach(i => {
                msg += "• " + i.name + " x " + i.qty + " - ₹" + (i.price * i.qty) + "%0A";
            });
            msg += "%0A*Subtotal:* ₹" + subtotal;
            msg += "%0A*10% Discount:* -₹" + discount;
            msg += "%0A*Total Payable:* ₹" + total;
            msg += "%0A%0A📍 *Delivery Location:* Boring Road, Patna";

            window.open("https://wa.me/919122557999?text=" + msg, "_blank");
        }

        // Category Filter
        function filterMenu(category) {
            document.querySelectorAll('.menu-tab').forEach(tab => {
                tab.classList.remove('bg-amber-500', 'text-black');
                tab.classList.add('bg-zinc-900', 'border', 'border-zinc-800', 'text-zinc-400');
            });
            event.target.classList.remove('bg-zinc-900', 'border', 'border-zinc-800', 'text-zinc-400');
            event.target.classList.add('bg-amber-500', 'text-black');

            const items = document.querySelectorAll('.menu-item');
            items.forEach(item => {
                if (category === 'all' || item.dataset.category === category) {
                    item.classList.remove('hidden');
                } else {
                    item.classList.add('hidden');
                }
            });
        }
    </script>
</body>
</html>`;

const builder = new WebsiteBuilder();
// Apply design quality gate
const processedHtml = builder.enforceDesignQualityStandards(htmlContent, 'lafumee', 'La Fumee');

const agencyPath = path.join(process.cwd(), 'web-dev-agency', 'public', 'sites', 'lafumee', 'index.html');
const clientPath = path.join(process.cwd(), 'generated_sites', '202', 'index.html');

fs.writeFileSync(agencyPath, processedHtml, 'utf8');
fs.writeFileSync(clientPath, processedHtml, 'utf8');

console.log('🎉 Successfully rebuilt Lead #1 (La Fumee):');
console.log(' - Agency Site:', agencyPath);
console.log(' - Client Site:', clientPath);
