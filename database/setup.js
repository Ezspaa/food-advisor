// =====================================================================
//  npm run db:setup
//  Creates the database, runs schema.sql and inserts realistic sample data
//  (users of all three roles, restaurants, menus, reviews, votes, reports).
//  Safe to re-run: it rebuilds everything from scratch.
// =====================================================================
const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');
const config = require('../config');
const { hashPassword } = require('../server/utils/password');
const NUTRITION = require('./nutrition');

const DEMO_PASSWORD = config.demoPassword;
const img = (id, w = 900) => `https://images.unsplash.com/photo-${id}?auto=format&fit=crop&w=${w}&q=70`;

// Deterministic pseudo-random generator so every teammate gets the same data.
let seed = 20261124;
function rand() {
  seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const pick = (arr) => arr[Math.floor(rand() * arr.length)];
const shuffle = (arr) => arr.map((v) => [rand(), v]).sort((a, b) => a[0] - b[0]).map((x) => x[1]);
const daysAgo = (d, h = 12) => {
  const dt = new Date(Date.now() - d * 86400000);
  dt.setHours(h, Math.floor(rand() * 60), 0, 0);
  return dt.toISOString().slice(0, 19).replace('T', ' ');
};

// ---------------------------------------------------------------------
const CUISINES = [
  ['Kazakh', '🫖'], ['Italian', '🍝'], ['Japanese', '🍣'], ['Turkish', '🥙'], ['Georgian', '🥟'],
  ['American', '🍔'], ['Korean', '🥢'], ['Indian', '🍛'], ['Uzbek', '🍚'], ['Chinese', '🥡'],
  ['French', '🥐'], ['Vegetarian', '🥗'], ['Mexican', '🌮'], ['Steakhouse', '🥩'], ['Desserts', '🍰'],
  ['Seafood', '🦐'], ['Middle Eastern', '🧆'], ['Coffee & Tea', '☕'],
];

const USERS = [
  // key, name, email, role, city, status
  ['admin', 'Food Advisor Admin', 'admin@foodadvisor.kz', 'admin', 'Aktobe'],
  ['aidos', 'Aidos Seitkali', 'owner@foodadvisor.kz', 'owner', 'Aktobe'],
  ['marco', 'Marco Rossi', 'marco@foodadvisor.kz', 'owner', 'Almaty'],
  ['yuki', 'Yuki Tanaka', 'yuki@foodadvisor.kz', 'owner', 'Astana'],
  ['elif', 'Elif Demir', 'elif@foodadvisor.kz', 'owner', 'Almaty'],
  ['sam', 'Sam Carter', 'sam@foodadvisor.kz', 'owner', 'Aktobe'],
  ['aruzhan', 'Aruzhan Bekova', 'customer@foodadvisor.kz', 'customer', 'Aktobe'],
  ['timur', 'Timur Akhmetov', 'timur@mail.kz', 'customer', 'Almaty'],
  ['dana', 'Dana Omarova', 'dana@mail.kz', 'customer', 'Astana'],
  ['alikhan', 'Alikhan Serikov', 'alikhan@mail.kz', 'customer', 'Aktobe'],
  ['kamila', 'Kamila Ismailova', 'kamila@mail.kz', 'customer', 'Almaty'],
  ['yerlan', 'Yerlan Tulegenov', 'yerlan@mail.kz', 'customer', 'Astana'],
  ['saule', 'Saule Abenova', 'saule@mail.kz', 'customer', 'Aktobe'],
  ['ruslan', 'Ruslan Kim', 'ruslan@mail.kz', 'customer', 'Almaty'],
  ['aliya', 'Aliya Nurlanova', 'aliya@mail.kz', 'customer', 'Astana'],
  ['arman', 'Arman Bekzhanov', 'arman@mail.kz', 'customer', 'Aktobe'],
  ['zhanna', 'Zhanna Li', 'zhanna@mail.kz', 'customer', 'Almaty'],
  ['nurlan', 'Nurlan Kassymov', 'nurlan@mail.kz', 'customer', 'Astana'],
  ['spam', 'Best Deals KZ', 'deals4you@spam.kz', 'customer', null],
  ['troll', 'Angry Diner', 'angry.diner@mail.kz', 'customer', 'Aktobe', 'blocked'],
];
const REVIEWERS = ['aruzhan', 'timur', 'dana', 'alikhan', 'kamila', 'yerlan', 'saule', 'ruslan', 'aliya', 'arman', 'zhanna', 'nurlan'];

// [key, owner, cuisine, name, city, address, phone, price, opens, closes, imageId, status, featured, quality, description, dishes]
// dish: [name, category, price, veg, spicy, imageId?, description?]
const RESTAURANTS = [
  ['dastarkhan', 'aidos', 'Kazakh', 'Dastarkhan House', 'Aktobe', 'Abilkayyr Khan Ave 42', '+7 7132 55 12 34', 2, '10:00', '23:00', '1606787366850-de6330128bfc', 'approved', 1, 4.7,
    'A warm family restaurant serving traditional Kazakh cuisine the way grandmothers make it: slow-cooked beshbarmak, crispy baursaks straight from the pan and endless pots of milky tea. Large tables for celebrations and a quiet hall for business lunches.',
    [['Beshbarmak', 'Mains', 4200, 0, 0, null, 'Hand-rolled noodles with tender horse meat and beef, onion sauce and rich sorpa broth.'],
      ['Kuyrdak', 'Mains', 3800, 0, 0, null, 'Pan-fried lamb liver, heart and kidneys with potatoes and onions.'],
      ['Manty (5 pcs)', 'Mains', 3200, 0, 0, '1534422298391-e4f8c172dddb', 'Steamed dumplings filled with minced lamb and pumpkin, served with sour cream.'],
      ['Baursak basket', 'Starters', 900, 1, 0, '1606491956689-2ea866880c84', 'Golden fried dough puffs served with butter, honey and homemade jam.'],
      ['Kazy platter', 'Starters', 4500, 0, 0, null, 'Traditional horse-meat sausage, karta and zhal sliced for the table.'],
      ['Chak-chak', 'Desserts', 1200, 1, 0, null, 'Crunchy fried dough bound with warm honey.'],
      ['Kazakh tea with milk', 'Drinks', 600, 1, 0, null, 'Strong black tea with milk, served in a traditional pot.']]],
  ['trattoria', 'marco', 'Italian', 'Trattoria Bella Notte', 'Almaty', 'Dostyk Ave 128', '+7 727 312 44 10', 3, '12:00', '23:30', '1574071318508-1cdbab80d002', 'approved', 1, 4.5,
    'Neapolitan wood-fired pizza, fresh pasta made every morning and a short list of Italian wines. Candle-lit tables, an open kitchen and a terrace with mountain views in summer.',
    [['Bruschetta al pomodoro', 'Starters', 2400, 1, 0, null, 'Grilled sourdough, cherry tomatoes, basil and extra-virgin olive oil.'],
      ['Margherita pizza', 'Mains', 3900, 1, 0, '1458642849426-cfb724f15ef7', 'San Marzano tomato, fior di latte and basil, baked at 450°C.'],
      ['Diavola pizza', 'Mains', 4400, 0, 1, '1513104890138-7c749659a591', 'Spicy salami, chilli oil, mozzarella and oregano.'],
      ['Spaghetti carbonara', 'Mains', 4600, 0, 0, null, 'Guanciale, egg yolk, pecorino romano and black pepper — no cream.'],
      ['Penne all\'arrabbiata', 'Mains', 3800, 1, 1, '1621996346565-e3dbc646d9a9', 'Penne in a garlicky, fiery tomato sauce.'],
      ['Tiramisu', 'Desserts', 2600, 1, 0, null, 'Mascarpone cream, espresso-soaked savoiardi and cocoa.'],
      ['Espresso', 'Drinks', 900, 1, 0, '1495474472287-4d71bcdd2085', 'Single-origin espresso from a local roaster.']]],
  ['sakura', 'yuki', 'Japanese', 'Sakura Garden', 'Astana', 'Kabanbay Batyr Ave 15', '+7 7172 70 20 30', 4, '12:00', '23:00', '1553621042-f6e147245754', 'approved', 1, 4.6,
    'An elegant sushi bar where the chef prepares nigiri and rolls in front of you. Fish is delivered twice a week, and the omakase counter has only eight seats — book ahead.',
    [['Edamame', 'Starters', 1800, 1, 0, null, 'Steamed soy beans with sea salt.'],
      ['Salmon nigiri set', 'Mains', 6900, 0, 0, '1617196034796-73dfa7b1fd56', 'Eight pieces of salmon nigiri on seasoned rice.'],
      ['Dragon roll', 'Mains', 5400, 0, 0, '1579871494447-9811cf80d66c', 'Tempura shrimp, avocado and eel sauce.'],
      ['Chef\'s sushi platter', 'Mains', 14500, 0, 0, '1611143669185-af224c5e3252', '24 pieces chosen by the chef — perfect for two.'],
      ['Tonkotsu ramen', 'Mains', 4900, 0, 0, '1569718212165-3a8278d5f624', 'Pork bone broth simmered for 18 hours, chashu and a soft egg.'],
      ['Mochi ice cream', 'Desserts', 2200, 1, 0, null, 'Three flavours: matcha, mango and black sesame.'],
      ['Matcha latte', 'Drinks', 1600, 1, 0, null, 'Ceremonial-grade matcha with steamed milk.']]],
  ['anatolia', 'elif', 'Turkish', 'Anatolia Grill', 'Aktobe', 'Sankibai Batyr Ave 9', '+7 7132 90 11 22', 2, '11:00', '00:00', '1529006557810-274b9b2fc783', 'approved', 0, 4.1,
    'Charcoal-grilled kebabs, freshly baked lahmacun and Turkish tea until midnight. Quick lunches on weekdays and a lively atmosphere in the evenings.',
    [['Lentil soup', 'Starters', 1500, 1, 0, null, 'Red lentil soup with lemon and paprika butter.'],
      ['Adana kebab', 'Mains', 3900, 0, 1, '1599487488170-d11ec9c172f0', 'Hand-minced spicy lamb kebab grilled on charcoal.'],
      ['Iskender kebab', 'Mains', 4300, 0, 0, null, 'Sliced döner over pide with tomato sauce, butter and yoghurt.'],
      ['Chicken döner wrap', 'Mains', 2200, 0, 0, '1626700051175-6818013e1d4f', 'Chicken döner, salad and garlic sauce in lavash.'],
      ['Lahmacun', 'Mains', 1900, 0, 1, null, 'Thin flatbread topped with spiced minced meat.'],
      ['Baklava', 'Desserts', 1800, 1, 0, null, 'Pistachio baklava with syrup.'],
      ['Ayran', 'Drinks', 600, 1, 0, null, 'Chilled salted yoghurt drink.']]],
  ['tbilisi', 'elif', 'Georgian', 'Tbilisi Courtyard', 'Almaty', 'Abay Ave 77', '+7 727 250 60 70', 3, '12:00', '00:00', '1534422298391-e4f8c172dddb', 'approved', 0, 4.4,
    'Georgian hospitality in a green inner courtyard: juicy khinkali, bubbling khachapuri and live polyphonic music on Friday nights.',
    [['Khinkali (6 pcs)', 'Mains', 3000, 0, 0, '1534422298391-e4f8c172dddb', 'Soup-filled dumplings with beef and pork — eat them by hand!'],
      ['Khachapuri Adjaruli', 'Mains', 3600, 1, 0, null, 'Boat-shaped cheese bread with an egg yolk and butter.'],
      ['Pkhali trio', 'Starters', 2400, 1, 0, null, 'Spinach, beetroot and leek pâtés with walnuts.'],
      ['Mtsvadi', 'Mains', 4800, 0, 0, null, 'Pork shashlik grilled over vine branches.'],
      ['Chakapuli', 'Mains', 4900, 0, 0, null, 'Lamb stewed with tarragon, plums and white wine.'],
      ['Churchkhela', 'Desserts', 1400, 1, 0, null, 'Walnuts dipped in thickened grape juice.'],
      ['Tarragon lemonade', 'Drinks', 1200, 1, 0, null, 'Bright green Georgian classic.']]],
  ['smoke', 'sam', 'American', 'Smoke & Stack Burgers', 'Aktobe', 'Mametova St 21', '+7 7132 44 88 00', 2, '11:00', '23:00', '1572802419224-296b0aeee0d9', 'approved', 1, 4.3,
    'Smash burgers on potato buns, slow-smoked ribs and thick milkshakes. Loud music, sports on the big screen and the best fries in town.',
    [['Classic cheeseburger', 'Mains', 2900, 0, 0, '1568901346375-23c9450c58cd', 'Beef patty, cheddar, pickles, onion and house sauce.'],
      ['Double smash burger', 'Mains', 3900, 0, 0, '1572802419224-296b0aeee0d9', 'Two crispy-edged patties, double cheese.'],
      ['Spicy jalapeño burger', 'Mains', 3400, 0, 1, '1586190848861-99aa4a171e90', 'Pepper jack, jalapeños and chipotle mayo.'],
      ['BBQ pork ribs', 'Mains', 6200, 0, 0, '1544025162-d76694265947', 'Half rack smoked for 6 hours with bourbon glaze.'],
      ['Loaded fries', 'Sides', 1600, 1, 0, '1594212699903-ec8a3eca50f5', 'Fries with cheese sauce, spring onion and crispy shallots.'],
      ['Onion rings', 'Sides', 1300, 1, 0, null, 'Beer-battered onion rings with ranch.'],
      ['Chocolate milkshake', 'Drinks', 1700, 1, 0, null, 'Thick shake with Belgian chocolate.']]],
  ['seoul', 'yuki', 'Korean', 'Seoul Kitchen', 'Astana', 'Turan Ave 37', '+7 7172 55 66 77', 2, '11:00', '22:00', '1563379926898-05f4575a45d8', 'approved', 0, 3.9,
    'Korean home cooking and street food: crispy fried chicken, sizzling stone-pot bibimbap and plenty of kimchi on the side.',
    [['Kimchi pancake', 'Starters', 2200, 1, 1, null, 'Crispy pancake with house-fermented kimchi.'],
      ['Bibimbap', 'Mains', 3500, 1, 0, '1547592180-85f173990554', 'Rice bowl with vegetables, egg and gochujang.'],
      ['Korean fried chicken', 'Mains', 4200, 0, 1, '1562967914-608f82629710', 'Double-fried wings in sweet-spicy yangnyeom glaze.'],
      ['Tteokbokki', 'Mains', 2800, 1, 1, null, 'Chewy rice cakes in spicy gochujang sauce.'],
      ['Spicy stir-fried noodles', 'Mains', 3100, 0, 1, '1563379926898-05f4575a45d8', 'Wok-fried noodles with pork and vegetables.'],
      ['Bingsu', 'Desserts', 2400, 1, 0, null, 'Shaved milk ice with red beans and fruit.']]],
  ['spice', 'elif', 'Indian', 'Spice Route', 'Almaty', 'Tole Bi St 55', '+7 727 300 12 12', 3, '12:00', '23:00', '1631515243349-e0cb75fb8d3a', 'approved', 0, 4.2,
    'North Indian curries from the tandoor and slow-cooked biryanis. Spice level is adjustable — just ask your waiter.',
    [['Vegetable samosa', 'Starters', 1600, 1, 0, '1601050690597-df0568f70950', 'Crispy pastry with spiced potato and peas.'],
      ['Butter chicken', 'Mains', 4400, 0, 0, '1565557623262-b51c2513a641', 'Tandoori chicken in a creamy tomato-butter sauce.'],
      ['Chicken biryani', 'Mains', 4100, 0, 1, '1631515243349-e0cb75fb8d3a', 'Fragrant basmati layered with spiced chicken.'],
      ['Paneer tikka masala', 'Mains', 3900, 1, 1, '1588166524941-3bf61a9c41db', 'Grilled paneer in a rich masala gravy.'],
      ['Garlic naan', 'Sides', 800, 1, 0, null, 'Fresh from the tandoor.'],
      ['Gulab jamun', 'Desserts', 1500, 1, 0, null, 'Milk dumplings in rose syrup.'],
      ['Mango lassi', 'Drinks', 1300, 1, 0, null, 'Yoghurt and Alphonso mango.']]],
  ['samarkand', 'aidos', 'Uzbek', 'Samarkand Plov Centre', 'Aktobe', 'Bratyev Zhubanovykh St 270', '+7 7132 21 21 21', 1, '09:00', '21:00', '1603133872878-684f208fb84b', 'approved', 0, 4.6,
    'Plov cooked in a huge kazan over fire every morning — come before 2 pm, it sells out! Simple interior, fast service and honest prices.',
    [['Wedding plov', 'Mains', 2400, 0, 0, '1603133872878-684f208fb84b', 'Rice with lamb, yellow carrots, chickpeas and quail egg.'],
      ['Lagman', 'Mains', 2200, 0, 0, null, 'Hand-pulled noodles with beef and vegetables.'],
      ['Shurpa', 'Mains', 2300, 0, 0, null, 'Clear lamb soup with potatoes and herbs.'],
      ['Samsa with lamb', 'Starters', 800, 0, 0, null, 'Baked in a tandyr oven.'],
      ['Achichuk salad', 'Sides', 900, 1, 0, null, 'Tomatoes, onions and fresh herbs.'],
      ['Halva', 'Desserts', 900, 1, 0, null, 'Sesame halva with pistachios.'],
      ['Green tea pot', 'Drinks', 500, 1, 0, null, 'Served in a traditional teapot.']]],
  ['dragon', 'yuki', 'Chinese', 'Golden Dragon', 'Astana', 'Mangilik El Ave 20', '+7 7172 40 50 60', 2, '11:00', '23:00', '1585032226651-759b368d7246', 'approved', 0, 3.5,
    'Cantonese and Sichuan classics in a spacious dining hall with round tables — great for groups and family dinners.',
    [['Spring rolls', 'Starters', 1800, 1, 0, null, 'Crispy vegetable rolls with sweet chilli sauce.'],
      ['Dim sum basket', 'Starters', 2600, 0, 0, null, 'Har gow, siu mai and char siu bao.'],
      ['Kung pao chicken', 'Mains', 3600, 0, 1, null, 'Chicken, peanuts and dried chillies.'],
      ['Beef chow mein', 'Mains', 3400, 0, 0, '1585032226651-759b368d7246', 'Wok-tossed egg noodles with beef.'],
      ['Mapo tofu', 'Mains', 3100, 1, 1, null, 'Silken tofu in numbing Sichuan pepper sauce.'],
      ['Egg fried rice', 'Sides', 1500, 1, 0, null, 'Classic wok-fried rice.'],
      ['Jasmine tea', 'Drinks', 700, 1, 0, null, 'A pot of fragrant jasmine tea.']]],
  ['petit', 'marco', 'French', 'Le Petit Café', 'Almaty', 'Panfilov St 98', '+7 727 222 33 44', 2, '08:00', '21:00', '1484723091739-30a097e8f929', 'approved', 0, 4.4,
    'A Parisian-style café for slow breakfasts and afternoon pastries. Croissants are baked on site every morning; the terrace is perfect for people-watching.',
    [['Butter croissant', 'Starters', 1100, 1, 0, null, 'Flaky all-butter croissant.'],
      ['French toast with berries', 'Mains', 2800, 1, 0, '1484723091739-30a097e8f929', 'Brioche, mascarpone, fresh berries and maple syrup.'],
      ['Croque monsieur', 'Mains', 2600, 0, 0, '1528735602780-2552fd46c7af', 'Toasted ham and gruyère with béchamel.'],
      ['Quiche lorraine', 'Mains', 2700, 0, 0, null, 'Bacon, onion and cream in short pastry.'],
      ['Crème brûlée', 'Desserts', 1900, 1, 0, null, 'Vanilla custard with a crackling sugar top.'],
      ['Cappuccino', 'Drinks', 1200, 1, 0, '1509042239860-f550ce710b93', 'Double shot with silky milk foam.']]],
  ['greenleaf', 'sam', 'Vegetarian', 'Green Leaf Bowl', 'Aktobe', 'Abay Ave 50', '+7 7132 33 22 11', 2, '09:00', '21:00', '1546069901-ba9599a7e63c', 'approved', 1, 4.0,
    '100% vegetarian kitchen with plenty of vegan options. Colourful bowls, fresh smoothies and a calm, plant-filled interior.',
    [['Buddha bowl', 'Mains', 2900, 1, 0, '1490645935967-10de6ba17061', 'Quinoa, roasted vegetables, hummus and tahini.'],
      ['Avocado toast', 'Starters', 2200, 1, 0, '1482049016688-2d3e1b311543', 'Sourdough, smashed avocado, egg and seeds.'],
      ['Quinoa salad', 'Mains', 2600, 1, 0, '1505253716362-afaea1d3d1af', 'Quinoa, feta, cucumber and pomegranate.'],
      ['Falafel wrap', 'Mains', 2400, 1, 1, null, 'Falafel, pickles and harissa yoghurt.'],
      ['Sweet potato fries', 'Sides', 1300, 1, 0, null, 'With smoked paprika aioli.'],
      ['Green smoothie', 'Drinks', 1500, 1, 0, null, 'Spinach, banana, apple and ginger.'],
      ['Vegan brownie', 'Desserts', 1400, 1, 0, null, 'Dark chocolate and walnuts.']]],
  ['casa', 'sam', 'Mexican', 'Casa Mexicana', 'Astana', 'Dostyk St 5', '+7 7172 99 88 77', 2, '12:00', '00:00', '1565299585323-38d6b0865b47', 'approved', 0, 3.7,
    'Tacos, burritos and loud mariachi Saturdays. Colourful decor and a menu that goes from mild to "muy picante".',
    [['Nachos supreme', 'Starters', 2600, 1, 1, null, 'Tortilla chips, cheese, jalapeños, salsa and sour cream.'],
      ['Tacos al pastor', 'Mains', 3200, 0, 1, '1565299585323-38d6b0865b47', 'Three tacos with marinated pork and pineapple.'],
      ['Chicken quesadilla', 'Mains', 2900, 0, 0, '1618040996337-56904b7850b9', 'Grilled tortilla with chicken and melted cheese.'],
      ['Beef burrito', 'Mains', 3300, 0, 0, null, 'Rice, beans, beef and pico de gallo.'],
      ['Guacamole & chips', 'Starters', 2200, 1, 0, null, 'Made to order at your table.'],
      ['Churros', 'Desserts', 1600, 1, 0, null, 'With hot chocolate dip.']]],
  ['steppe', 'aidos', 'Steakhouse', 'Steppe Steakhouse', 'Astana', 'Kunayev St 12', '+7 7172 77 00 77', 4, '13:00', '00:00', '1432139555190-58524dae6a55', 'approved', 1, 4.8,
    'Premium dry-aged Kazakh beef grilled over birch charcoal. Dark wood, leather chairs and a serious wine cellar — the place for special occasions.',
    [['Beef tartare', 'Starters', 5200, 0, 0, null, 'Hand-cut tenderloin, capers, shallots and quail yolk.'],
      ['Caesar salad', 'Starters', 3600, 0, 0, '1540189549336-e6e99c3679fe', 'Romaine, parmesan, croutons and anchovy dressing.'],
      ['Ribeye steak 300 g', 'Mains', 14900, 0, 0, '1432139555190-58524dae6a55', '28-day dry-aged ribeye with peppercorn sauce.'],
      ['Tomahawk for two', 'Mains', 32000, 0, 0, null, '1.2 kg bone-in rib steak, carved at the table.'],
      ['Grilled chicken breast', 'Mains', 5900, 0, 0, '1598515214211-89d3c73ae83b', 'Free-range chicken with herb butter.'],
      ['Truffle mashed potatoes', 'Sides', 2400, 1, 0, null, 'Creamy mash with black truffle oil.'],
      ['Chocolate fondant', 'Desserts', 3200, 1, 0, null, 'Molten centre, vanilla ice cream.']]],
  ['crumbs', 'sam', 'Desserts', 'Sweet Crumbs Bakery', 'Aktobe', 'Moldagulova Ave 30', '+7 7132 66 55 44', 1, '08:00', '20:00', '1551024601-bec78aea704b', 'approved', 0, 4.5,
    'Small neighbourhood bakery with donuts, layered cakes and the best cinnamon rolls in Aktobe. Everything is baked in the morning and sold out by evening.',
    [['Glazed donuts', 'Desserts', 700, 1, 0, '1551024601-bec78aea704b', 'Classic, chocolate or strawberry glaze.'],
      ['Napoleon cake slice', 'Desserts', 1400, 1, 0, null, 'Many thin layers of puff pastry and custard.'],
      ['Cinnamon roll', 'Desserts', 1100, 1, 0, null, 'With cream cheese frosting.'],
      ['Pancake stack', 'Mains', 2200, 1, 0, '1567620905732-2d1ec7ab7445', 'Fluffy pancakes, butter and maple syrup.'],
      ['Ice cream scoops', 'Desserts', 1200, 1, 0, '1570197788417-0e82375c9371', 'Three scoops of house-made gelato.'],
      ['Flat white', 'Drinks', 1100, 1, 0, null, 'Double ristretto with velvety milk.']]],
  ['ocean', 'marco', 'Seafood', 'Ocean Pearl Seafood', 'Almaty', 'Al-Farabi Ave 140', '+7 727 355 00 11', 4, '12:00', '23:00', '1606850780554-b55ea4dd0b70', 'approved', 0, 3.9,
    'Fresh fish and seafood flown in from the Caspian and the Black Sea. Bright, airy dining room with an oyster bar.',
    [['Grilled octopus', 'Starters', 6800, 0, 0, '1606850780554-b55ea4dd0b70', 'Charred octopus with potatoes and paprika.'],
      ['Oysters (half dozen)', 'Starters', 9600, 0, 0, null, 'Served on ice with mignonette.'],
      ['Shrimp udon', 'Mains', 5200, 0, 1, '1559847844-5315695dadae', 'Thick noodles, tiger prawns and chilli broth.'],
      ['Seafood linguine', 'Mains', 6400, 0, 0, null, 'Mussels, clams and prawns in white wine.'],
      ['Fish & chips', 'Mains', 4800, 0, 0, null, 'Beer-battered cod, chips and tartare sauce.'],
      ['Lemon tart', 'Desserts', 2200, 1, 0, null, 'Sharp lemon curd, Italian meringue.']]],
  ['baursak', 'aidos', 'Kazakh', 'Baursak & Co', 'Aktobe', 'Zhankozha Batyr St 88', '+7 7132 10 20 30', 1, '08:00', '22:00', '1606491956689-2ea866880c84', 'pending', 0, 0,
    'A new tea house from the team behind Dastarkhan House: fresh baursaks, samsa and Kazakh tea for breakfast and evening gatherings.',
    [['Baursak with honey', 'Starters', 700, 1, 0, '1606491956689-2ea866880c84', null],
      ['Samsa', 'Starters', 600, 0, 0, null, null],
      ['Kurt plate', 'Starters', 900, 1, 0, null, 'Dried salty cheese balls.'],
      ['Kazakh tea with milk', 'Drinks', 500, 1, 0, null, null]]],
  ['nightowl', 'elif', 'Middle Eastern', 'Night Owl Shawarma', 'Aktobe', 'Street food kiosk', null, 1, '18:00', '04:00', '1626700051175-6818013e1d4f', 'rejected', 0, 0,
    'Late-night shawarma kiosk. Address and photos to be added.',
    [['Chicken shawarma', 'Mains', 1600, 0, 0, null, null]]],
];

const TITLES = {
  5: ['Best in town', 'Exceeded expectations', 'A must-visit', 'Perfect evening', 'Absolutely delicious'],
  4: ['Very good', 'Will be back', 'Tasty and friendly', 'Great value'],
  3: ['Okay, not amazing', 'Average experience', 'Hit and miss'],
  2: ['Disappointing', 'Not worth the wait'],
  1: ['Very poor experience'],
};
const COMMENTS = {
  5: [
    'Absolutely loved it. The {dish} was the best I have had in {city} — generous portion, perfect seasoning and it arrived quickly. Staff remembered us from our last visit, which was a lovely touch.',
    'Came here for a birthday dinner and everything was spot on. You have to try the {dish}! Cosy atmosphere and fair prices for this quality.',
    'Five stars without hesitation. Fresh ingredients, friendly service, and the {dish} alone is worth the trip.',
    'Our new favourite place. We ordered half the menu to share and the {dish} disappeared first. Already planning the next visit.',
  ],
  4: [
    'Really good food and a nice atmosphere. The {dish} was excellent; only the wait on a Friday evening was a bit long.',
    'Solid choice. The {dish} was tasty and well presented, desserts could be better. We will come back.',
    'Great value for money. Service was friendly and portions are big. One star off because it was quite noisy.',
    'Lovely lunch with colleagues. The {dish} was very good and the staff were attentive without being pushy.',
  ],
  3: [
    'Decent but not memorable. The {dish} was fine, though a little lukewarm when it arrived. Service was polite.',
    'Mixed experience — starters were great, mains average. Prices are a bit high for what you get.',
    'Nice interior and friendly staff, but the {dish} lacked flavour this time. Maybe it was an off day.',
  ],
  2: [
    'Disappointing visit. We waited forty minutes for the {dish} and it was over-salted. The staff apologised, at least.',
    'Expected more after reading the reviews. Small portions and it was too loud to have a conversation.',
  ],
  1: ['Unfortunately the worst meal of our trip. Cold food, the wrong order and nobody seemed to care when we complained.'],
};
const REPLIES = {
  high: ['Thank you so much for your kind words! We look forward to welcoming you again soon.',
    'We are delighted you enjoyed it — the kitchen team will be very happy to read this. See you next time!'],
  mid: ['Thank you for the honest feedback. We have shared your comments with the team and hope to impress you more next time.'],
  low: ['We are sorry your visit did not meet expectations. Please contact us directly — we would like to make it right.'],
};

// ---------------------------------------------------------------------
async function setupDatabase() {
  const { database, ...server } = config.db;
  console.log(`\n▶ Connecting to MySQL at ${server.host}:${server.port} as "${server.user}"…`);
  const conn = await mysql.createConnection({ ...server, multipleStatements: true, charset: 'utf8mb4' });

  try {
    await conn.query(`CREATE DATABASE IF NOT EXISTS \`${database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
  } catch (err) {
    // managed cloud databases often forbid CREATE DATABASE — the database already exists there
    if (err.code !== 'ER_DBACCESS_DENIED_ERROR' && err.code !== 'ER_ACCESS_DENIED_ERROR') throw err;
  }
  await conn.query(`USE \`${database}\``);
  console.log(`▶ Creating tables in "${database}"…`);
  await conn.query(fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8'));

  const insert = async (sql, params) => (await conn.query(sql, params))[0].insertId;

  // Cuisines
  const cuisineId = {};
  for (const [name, emoji] of CUISINES) cuisineId[name] = await insert('INSERT INTO cuisines (name, emoji) VALUES (?, ?)', [name, emoji]);

  // Users
  console.log('▶ Hashing demo passwords and creating users…');
  const userId = {};
  for (const [i, [key, name, email, role, city, status]] of USERS.entries()) {
    const bio = role === 'customer' && city ? pick(['Weekend foodie and amateur cook.', 'Always hunting for the best plov in town.', 'Coffee first, then dessert.', 'I review honestly — good and bad.', null]) : null;
    userId[key] = await insert(
      'INSERT INTO users (name, email, password_hash, role, status, city, bio, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      [name, email, await hashPassword(DEMO_PASSWORD), role, status || 'active', city, bio, daysAgo(Math.max(3, 400 - i * 21))]
    );
  }

  // Restaurants + dishes
  console.log('▶ Adding restaurants and menus…');
  const restaurants = [];
  for (const [i, r] of RESTAURANTS.entries()) {
    const [key, owner, cuisine, name, city, address, phone, price, opens, closes, imageId, status, featured, quality, description, dishes] = r;
    const id = await insert(
      `INSERT INTO restaurants (owner_id, cuisine_id, name, description, city, address, phone, price_level,
                                opens_at, closes_at, image_url, status, is_featured, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [userId[owner], cuisineId[cuisine], name, description, city, address, phone, price, opens, closes,
        img(imageId, 1200), status, featured, daysAgo(status === 'approved' ? 360 - i * 9 : 3 + i % 4)]
    );
    for (const [dName, category, dPrice, veg, spicy, dImg, dDesc] of dishes) {
      await insert(
        `INSERT INTO dishes (restaurant_id, name, description, category, price, image_url, is_vegetarian, is_spicy, is_available,
                             weight_g, calories, protein_g, fat_g, carbs_g, allergens, recommended_for)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [id, dName, dDesc, category, dPrice, dImg ? img(dImg, 600) : null, veg, spicy, rand() > 0.06 ? 1 : 0,
          ...(NUTRITION[dName] || [null, null, null, null, null, '', ''])]
      );
    }
    restaurants.push({ id, key, name, city, quality, status, dishes: dishes.map((d) => d[0]).filter((_, j) => dishes[j][1] === 'Mains' || dishes[j][1] === 'Starters') });
  }

  // Reviews
  console.log('▶ Writing reviews, owner replies and helpful votes…');
  const reviewIds = [];
  for (const r of restaurants.filter((x) => x.status === 'approved')) {
    const reviewers = shuffle(REVIEWERS).slice(0, 5 + Math.floor(rand() * 5));
    for (const who of reviewers) {
      const noise = pick([-2, -1, -1, 0, 0, 0, 1, 1, 1]);
      const rating = Math.max(1, Math.min(5, Math.round(r.quality + noise * (0.7 + rand() * 0.5))));
      const ago = Math.floor(rand() * 175) + 2;
      const created = daysAgo(ago, 10 + Math.floor(rand() * 11));
      const comment = pick(COMMENTS[rating]).replace('{dish}', pick(r.dishes).toLowerCase()).replace('{city}', r.city);
      let reply = null;
      let replyAt = null;
      if (rand() < 0.45 || rating <= 2) {
        reply = pick(rating >= 4 ? REPLIES.high : rating === 3 ? REPLIES.mid : REPLIES.low);
        replyAt = daysAgo(Math.max(ago - 1, 0), 18);
      }
      const edited = rand() < 0.1 ? daysAgo(Math.max(ago - 2, 0), 20) : created;
      const reviewId = await insert(
        `INSERT INTO reviews (restaurant_id, user_id, rating, title, comment, visit_date, owner_reply, owner_reply_at, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, DATE(DATE_SUB(?, INTERVAL ? DAY)), ?, ?, ?, ?)`,
        [r.id, userId[who], rating, pick(TITLES[rating]), comment, created, Math.floor(rand() * 4), reply, replyAt, created, edited]
      );
      reviewIds.push({ id: reviewId, author: who });
    }
  }

  // Helpful votes
  for (const rv of reviewIds) {
    for (const voter of shuffle(REVIEWERS).slice(0, Math.floor(rand() * 5))) {
      if (voter !== rv.author) await conn.query('INSERT IGNORE INTO review_votes (review_id, user_id) VALUES (?, ?)', [rv.id, userId[voter]]);
    }
  }

  // Moderation scenario for the demo
  console.log('▶ Adding moderation examples (reports, hidden review)…');
  const byKey = Object.fromEntries(restaurants.map((r) => [r.key, r]));
  const spamAt = daysAgo(2);
  const hiddenAt = daysAgo(30);
  const spamReview = await insert(
    `INSERT INTO reviews (restaurant_id, user_id, rating, title, comment, created_at, updated_at)
     VALUES (?, ?, 5, 'CHEAP DEALS!!!', 'Best prices in Kazakhstan!!! Visit my page for 90% discount coupons for every restaurant, write me in direct now!!!', ?, ?)`,
    [byKey.trattoria.id, userId.spam, spamAt, spamAt]
  );
  await conn.query(
    `INSERT INTO review_reports (review_id, reporter_id, reason, details, created_at) VALUES
       (?, ?, 'spam', 'Advertising, not a real review.', ?), (?, ?, 'fake', 'This account posts the same text everywhere.', ?)`,
    [spamReview, userId.timur, daysAgo(1), spamReview, userId.kamila, daysAgo(1)]
  );
  const hidden = await insert(
    `INSERT INTO reviews (restaurant_id, user_id, rating, title, comment, status, created_at, updated_at)
     VALUES (?, ?, 1, 'Terrible people', 'Rude comment about staff members that broke the community rules.', 'hidden', ?, ?)`,
    [byKey.dastarkhan.id, userId.troll, hiddenAt, hiddenAt]
  );
  await conn.query(
    `INSERT INTO review_reports (review_id, reporter_id, reason, status, created_at, resolved_at) VALUES (?, ?, 'offensive', 'resolved', ?, ?)`,
    [hidden, userId.aruzhan, daysAgo(29), daysAgo(28)]
  );
  // a report that an admin can dismiss (the review itself is fine)
  const fair = reviewIds.find((x) => x.author === 'dana');
  await conn.query(`INSERT IGNORE INTO review_reports (review_id, reporter_id, reason, details, created_at) VALUES (?, ?, 'off-topic', 'I do not agree with this review.', ?)`,
    [fair.id, userId.yerlan, daysAgo(3)]);

  // Site feedback examples (admin → Feedback)
  await conn.query(
    `INSERT INTO feedback (user_id, rating, category, message, page, device, status, created_at) VALUES
       (?, 5, 'design', 'Very clean design, the dark mode looks great on my phone.', '/', 'mobile', 'read', ?),
       (?, 4, 'idea', 'Would be nice to filter dishes by calories for my diet.', '/restaurants?mode=dishes', 'desktop', 'new', ?),
       (NULL, 3, 'usability', 'It took me a while to find where to write a review.', '/restaurant?id=2', 'mobile', 'new', ?)`,
    [userId.dana, daysAgo(6), userId.alikhan, daysAgo(2), daysAgo(1)]
  );

  // Favourites
  const approved = restaurants.filter((r) => r.status === 'approved');
  for (const who of REVIEWERS) {
    for (const r of shuffle(approved).slice(0, 2 + Math.floor(rand() * 4))) {
      await conn.query('INSERT IGNORE INTO favorites (user_id, restaurant_id, created_at) VALUES (?, ?, ?)', [userId[who], r.id, daysAgo(Math.floor(rand() * 90))]);
    }
  }

  const [[counts]] = await conn.query(
    `SELECT (SELECT COUNT(*) FROM users) users, (SELECT COUNT(*) FROM restaurants) restaurants,
            (SELECT COUNT(*) FROM dishes) dishes, (SELECT COUNT(*) FROM reviews) reviews`
  );
  await conn.end();

  console.log(`\n✅ Database "${database}" is ready: ${counts.users} users, ${counts.restaurants} restaurants, ${counts.dishes} dishes, ${counts.reviews} reviews.\n`);
  console.log(`   Demo accounts (password for all: ${DEMO_PASSWORD})`);
  console.log('   ─────────────────────────────────────────────');
  console.log('   Customer          customer@foodadvisor.kz');
  console.log('   Restaurant owner  owner@foodadvisor.kz');
  console.log('   Administrator     admin@foodadvisor.kz\n');
  if (require.main === module) console.log('   Start the app with:  npm start\n');
}

module.exports = { setupDatabase };

// Run directly with `npm run db:setup`; server.js also calls setupDatabase()
// automatically the first time, when the database does not exist yet.
if (require.main === module) {
  setupDatabase().catch((err) => {
    console.error('\n❌ Database setup failed:', err.message);
    if (err.code === 'ER_ACCESS_DENIED_ERROR') console.error('   Check DB_USER / DB_PASSWORD in your .env file (see .env.example).');
    if (err.code === 'ECONNREFUSED') console.error('   Is the MySQL server running?');
    process.exit(1);
  });
}
