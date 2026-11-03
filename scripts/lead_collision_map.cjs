const fs = require('fs');
const path = require('path');

// 1. Identify all 47 leads sharing slugs and define deterministic, beautiful unique slugs
const leadCustomizations = {
  // Lead 2 vs Lead 251
  2: { slug: 'cultfraser', nameSuffix: 'Fraser Road', address: 'Fraser Road, Patna' },
  251: { slug: 'populardineout', nameSuffix: '', address: 'Patna' },

  // Crossfit: Lead 4, 36, 41
  4: { slug: 'crossfitstudio', nameSuffix: 'Studio', address: 'Boring Road, Patna' },
  36: { slug: 'crossfitgym', nameSuffix: 'Gym', address: 'Kankarbagh, Patna' },
  41: { slug: 'crossfitpatna', nameSuffix: 'Patna', address: 'Patliputra, Patna' },

  // Fitness Freak: Lead 30, 147
  30: { slug: 'fitnessfreakgym', nameSuffix: 'Gym', address: 'Patna' },
  147: { slug: 'thefitnessfreak', nameSuffix: '', address: 'Patna' },

  // Davis The Gym: Lead 31, 160
  31: { slug: 'davisthegym', nameSuffix: 'Central', address: 'Patna Central' },
  160: { slug: 'davisthegym-kankarbagh', nameSuffix: 'Kankarbagh', address: 'Kankarbagh, Patna' },

  // Alpha Gym: Lead 32, 123
  32: { slug: 'alphagym-canal', nameSuffix: 'Canal Road', address: 'Boring Canal Road, Patna' },
  123: { slug: 'alphagym-kankarbagh', nameSuffix: 'Kankarbagh', address: 'Kankarbagh, Patna' },

  // Titan Pro: Lead 33, 97
  33: { slug: 'titanpro', nameSuffix: 'Gym', address: 'Patna' },
  97: { slug: 'titanpro-fitness', nameSuffix: 'Fitness Club', address: 'Patna' },

  // Pro Fitness: Lead 49, 131
  49: { slug: 'profitness', nameSuffix: 'Central', address: 'Patna' },
  131: { slug: 'profitness-kankarbagh', nameSuffix: 'Kankarbagh', address: 'Kankarbagh, Patna' },

  // Barbell: Lead 66, 139
  66: { slug: 'barbellstudio', nameSuffix: 'Studio', address: 'Patna' },
  139: { slug: 'thebarbellgym', nameSuffix: 'Gym', address: 'Patna' },

  // Hardcore Gym: Lead 70, 178
  70: { slug: 'hardcoregym', nameSuffix: '', address: 'Patna' },
  178: { slug: 'hardcoregym-east', nameSuffix: 'Branch 2', address: 'East Patna' },

  // Muscles Beach: Lead 71, 150
  71: { slug: 'musclesbeach', nameSuffix: '', address: 'Patna' },
  150: { slug: 'musclesbeach-club', nameSuffix: 'Fitness Club', address: 'Patna' },

  // Muscle Factory: Lead 106, 156
  106: { slug: 'musclefactory', nameSuffix: '', address: 'Patna' },
  156: { slug: 'musclefactorygym', nameSuffix: 'Gym', address: 'Patna' },

  // Fit Planet: Lead 136, 143
  136: { slug: 'fitplanet-rps', nameSuffix: 'RPS More', address: 'RPS More, Bailey Road, Patna' },
  143: { slug: 'fitplanet-boringroad', nameSuffix: 'Boring Road', address: 'Boring Road, Patna' },

  // Mani Martial Arts: Lead 173, 196
  173: { slug: 'manimartialarts', nameSuffix: '', address: 'Patna' },
  196: { slug: 'manimartialarts-academy', nameSuffix: 'Academy', address: 'Patna' },

  // Fit 2 Fight: Lead 192, 194
  192: { slug: 'fit2fight-intl', nameSuffix: 'International', address: 'Patna' },
  194: { slug: 'fit2fight-gym', nameSuffix: 'Gym', address: 'Patna' },

  // Tasty Treat: Lead 201, 290
  201: { slug: 'tastytreat-boringroad', nameSuffix: 'Boring Road', address: 'Boring Road, Patna' },
  290: { slug: 'tastytreat-cafe', nameSuffix: 'Restro Cafe', address: 'Patna' },

  // Lazeez: Lead 244, 366
  244: { slug: 'lazeezrestaurant', nameSuffix: '', address: 'Patna' },
  366: { slug: 'lazeez-fddi', nameSuffix: 'Near FDDI', address: 'Near FDDI Institute, Patna' },

  // Bawarchi: Lead 257, 423, 445
  257: { slug: 'bawarchi-patliputra', nameSuffix: 'Hotel Patliputra', address: 'Hotel Patliputra, Patna' },
  423: { slug: 'bawarchifood', nameSuffix: 'Food & Restro', address: 'Patna' },
  445: { slug: 'certifiedbawarchi', nameSuffix: 'Certified', address: 'Patna' },

  // LBW: Lead 262, 293
  262: { slug: 'lbwlounge', nameSuffix: 'Lounge', address: 'Patna' },
  293: { slug: 'lbw-patna', nameSuffix: 'Cafe', address: 'Patna' },

  // Craft Coffee: Lead 317, 342
  317: { slug: 'craftcoffee-citycentre', nameSuffix: 'City Centre Mall', address: 'City Centre Mall, Patna' },
  342: { slug: 'craftcoffee-patna', nameSuffix: 'Boring Road', address: 'Patna' },

  // Cafe Buddy's: Lead 320, 330
  320: { slug: 'cafebuddys-patna', nameSuffix: 'Patna Central', address: 'Patna Central' },
  330: { slug: 'cafebuddys-golaroad', nameSuffix: 'Gola Road', address: 'Gola Road, Patna' },

  // Suto: Lead 322, 328, 480
  322: { slug: 'suto-patna', nameSuffix: 'Patna Central', address: 'Patna' },
  328: { slug: 'suto-danapur', nameSuffix: 'Danapur', address: 'Danapur, Patna' },
  480: { slug: 'suto-express', nameSuffix: 'Express', address: 'Patna' },

  // Patna Dental: Lead 488, 497
  488: { slug: 'patnadentalhospital', nameSuffix: 'Hospital', address: 'Patna' },
  497: { slug: 'patnadentalclinic', nameSuffix: 'Clinic', address: 'Patna' }
};

module.exports = { leadCustomizations };
