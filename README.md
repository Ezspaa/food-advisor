# 🍽️ Food Advisor

**F28JC Web Programming · CW1.2 · CE 202 Group 4**
Bazarbayeva Madina · Nurmanova Zamira · Sungatov Ilyas · Yernazarov Miras

Food Advisor is a web application for discovering restaurants and dishes in Kazakhstan (Aktobe, Almaty, Astana).
Customers search and filter restaurants, read menus and write reviews. Restaurant owners manage their own restaurants, menus and replies. Administrators moderate users, restaurants and reviews.

---

## 1. Quick start

Install once: **Node.js 22.9+** (LTS 22 or 24, from nodejs.org) and **MySQL 8+**, and make sure MySQL is running.

### Easiest: double-click

| macOS | Windows |
|---|---|
| double-click **`start.command`** | double-click **`start.bat`** |

On the first run it asks for your MySQL password, saves it to `.env`, installs the dependencies, creates the database with sample data and opens the browser. After that it starts straight away.
(macOS may block the file the first time: right-click → **Open** → **Open**.)

### Or from a terminal

```bash
npm run go          # same as the double-click launcher
```

Manual steps, if you prefer:

```bash
npm install
cp .env.example .env    # Windows: copy .env.example .env, then set DB_PASSWORD
npm start               # creates the database automatically on the first run
```

`npm run db:setup` resets the database to the original sample data at any time (useful before recording the demo).

### Share a public link with testers

Double-click **`share.command`** (macOS) or **`share.bat`** (Windows), or run `npm run share`.
This prints a temporary `https://….trycloudflare.com` link (a free Cloudflare quick tunnel, no account needed).
Anyone can open the link on a phone or laptop while the window stays open. The site and database still run on your computer, as the coursework requires.
Testers leave their opinion with the **💬 Feedback** button, and you read it in **Admin panel → Feedback**.
The one-click demo-login buttons are hidden on the public link.

### Demo accounts (password for all: `Password123`)

| Role | Email |
|---|---|
| Customer | `customer@foodadvisor.kz` |
| Restaurant owner | `owner@foodadvisor.kz` |
| Administrator | `admin@foodadvisor.kz` |

The login page also has one-click demo buttons for each role.

### Automated tests

With the server running, `npm test` runs 42 end-to-end API tests (Node's built-in `node:test`). They cover every functional requirement and the security rules. The tests delete everything they create when they finish.

---

## 2. Tools and techniques (course technologies only)

| Layer | Technology | Where |
|---|---|---|
| Structure | HTML5 (semantic, accessible) | `public/*.html` |
| Design | CSS3: custom properties, grid/flexbox, light/dark theme, responsive, animations, system fonts (no web fonts) | `public/css/style.css` |
| Interactivity | JavaScript + **jQuery 3.7.1** (DOM, events, AJAX, animation) | `public/js/*.js` |
| Data transfer | **JSON** REST API | `/api/*` |
| Backend | **Node.js** + Express | `server.js`, `server/` |
| Database | **MySQL** (9 tables, foreign keys, indexes) | `database/schema.sql` |
| Local persistence | **Web Storage**: `localStorage` + `sessionStorage` | `public/js/core.js` |
| Testing | `node:test` (built into Node) | `tests/api.test.js` |

No React and no other third-party front-end or back-end libraries are used. Password hashing uses Node's built-in `crypto.scrypt`, and validation, rate limiting, security headers and charts are all written by hand.

---

## 3. Architecture

```
┌──────────────────────── Browser ────────────────────────┐
│ HTML pages + CSS                                         │
│ jQuery page scripts (home, explore, restaurant, …)       │
│ core.js → FA.api()  ── AJAX, JSON ──┐                    │
│ Web Storage: token, theme, favourites (guest),           │
│   recently viewed, recent searches, review draft         │
└─────────────────────────────────────┼────────────────────┘
                                      ▼  HTTP  /api/*
┌──────────────────── Node.js / Express ──────────────────┐
│ securityHeaders → express.json → loadUser (token)        │
│ routes: auth · meta · restaurants · dishes · reviews ·   │
│         me · owner (requireRole owner) ·                 │
│         admin (requireRole admin)                        │
│ utils: validate · password (scrypt) · sql fragments      │
│ central error handler → JSON errors                      │
└─────────────────────────────────────┼────────────────────┘
                                      ▼  mysql2 pool, ? placeholders
┌────────────────────────── MySQL ────────────────────────┐
│ users · sessions · cuisines · restaurants · dishes ·     │
│ reviews · review_votes · review_reports · favorites      │
└──────────────────────────────────────────────────────────┘
```

### Code structure

```
server.js                 Express app, static files, error handler
config.js                 settings from .env
database/schema.sql       tables, foreign keys, indexes, CHECK constraints
database/setup.js         creates DB + realistic sample data (also run automatically on first start)
database/nutrition.js     nutrition facts for the sample dishes
scripts/start.js          one-click launcher used by start.command / start.bat
scripts/share.js          public test link (Cloudflare quick tunnel), used by share.command / share.bat
server/db.js              MySQL connection pool
server/middleware/        auth.js (tokens + RBAC), security.js (headers, rate limit)
server/routes/            one file per area of the REST API
server/utils/             validation, hashing, shared SQL, errors
public/                   front-end (HTML pages, CSS, jQuery scripts)
tests/api.test.js         end-to-end tests
```

---

## 4. Functional requirements → implementation

| FR | Requirement | Pages | API | DB operation |
|---|---|---|---|---|
| FR1 | Register, log in, log out | register, login | `POST /auth/register` `/login` `/logout` | INSERT users / sessions, DELETE sessions |
| FR2 | Search & filter by cuisine, location, rating, price | home, restaurants | `GET /restaurants?…` `/dishes?…` `/restaurants/suggest` | SELECT with JOIN, filters, sort, pagination |
| FR3 | View restaurant details and dishes | restaurant | `GET /restaurants/:id` | SELECT |
| FR4 | Submit rating & review | restaurant | `POST /restaurants/:id/reviews` | INSERT reviews |
| FR5 | Edit / delete own reviews | restaurant, profile | `PUT/DELETE /reviews/:id` | UPDATE / DELETE reviews |
| FR6 | View & update own profile | profile | `GET/PUT /me`, `PUT /me/password`, `DELETE /me` | SELECT / UPDATE / DELETE users |
| FR7 | Favourites & recent searches (Web Storage) | all | `PUT/DELETE /me/favorites/:id`, `POST /me/favorites/sync` | INSERT / DELETE favorites + localStorage |
| FR8 | Owner creates/updates/deletes own restaurant | owner | `POST/PUT/DELETE /owner/restaurants` | INSERT / UPDATE / DELETE restaurants |
| FR9 | Owner adds/edits/deletes dishes | owner | `/owner/restaurants/:id/dishes`, `/owner/dishes/:id` | INSERT / UPDATE / DELETE dishes |
| FR10 | Owner views reviews & average rating | owner | `GET /owner/overview`, `/owner/reviews`, `PUT /owner/reviews/:id/reply` | SELECT (AVG, COUNT, GROUP BY), UPDATE |
| FR11 | Admin views, blocks, deletes users | admin | `GET/PUT/DELETE /admin/users` | SELECT / UPDATE / DELETE users |
| FR12 | Admin views, edits, removes restaurants | admin | `/admin/restaurants`, `PATCH …/status` | SELECT / UPDATE / DELETE restaurants |
| FR13 | Admin deletes inappropriate reviews | admin | `/admin/reviews`, `/admin/reports` | UPDATE (hide) / DELETE reviews |

### Extra features (beyond the proposal)

- **“What should I eat today?” roulette** on the home page: choose city, budget, mood and course, then a slot-machine reel spins through matching dishes and lands on one (preferences remembered in localStorage)
- **Compare up to 3 restaurants** side by side (rating breakdown, prices, menu size, vegetarian, kid-friendly and halal dishes, calories, opening hours) with the best value in each row highlighted; the selection lives in localStorage and a floating tray follows you across pages
- **“Picked for you”** recommendations based on the cuisines of your favourites and recently viewed restaurants
- **Quick search palette** (Ctrl/⌘ + K) for restaurants, dishes, cuisines and pages, with keyboard navigation
- Delightful details: 3D tilt + spotlight on cards, circular theme switch (View Transitions API), rotating headline, confetti after publishing a review
- **Nutrition facts for every dish**: portion weight, calories, kcal per 100 g, % of a 2000 kcal day, protein, fat and carbs (with bars), allergens, and who the dish suits (kids, sharing, high protein, light, halal, vegan, gluten-free). Shown in a dish details window, filterable (max calories, recommended for, *without* chosen allergens), and editable by owners
- **Site feedback** button on every page (rating, topic, message), with an admin inbox
- **Public test link** (`npm run share`) for user testing on real phones
- Smooth **motion design**: scroll-reveal, page transitions, image fade-in, slow photo zoom, header that hides while scrolling, animated counters and bars; respects *reduce motion*

- Restaurant **approval workflow**: pending → approved / rejected, and **featured** restaurants
- **Live search suggestions** (restaurants, cuisines, dishes) with keyboard navigation
- **Dish search** across every menu: vegetarian, spicy, course and maximum-price filters
- **"Open now"** filter, worked out from opening hours (including hours past midnight)
- **Helpful votes** on reviews, plus **reporting** reviews, which feeds the admin moderation queue
- **Owner public replies** to reviews
- Dashboards with **charts**: reviews per month, rating breakdown, users by role (pure CSS)
- Rating **distribution bars** that also act as a filter
- **Guest favourites** kept in localStorage and **synced into the account** on login
- Review **draft autosave** (sessionStorage), **dark mode** (localStorage), grid/list view preference
- Filter state kept in the **URL**, so search results can be bookmarked and shared
- Responsive mobile layout, a filter drawer, skeleton loaders, toasts, an accessible modal and focus states

---

## 5. Non-functional requirements

| NFR | How it is met |
|---|---|
| Security | Salted `scrypt` password hashes with constant-time comparison; random session tokens (only their SHA-256 hash is stored); **parameterised SQL** everywhere; **server-side role checks** (`requireRole`) and ownership checks (`owner_id = ?`); blocked users are logged out immediately; login rate limiting; CSP and other security headers; output escaping against XSS; no open redirects |
| Usability | Clear navigation, inline form errors, toasts, empty states, demo login buttons, responsive design, keyboard and screen-reader support |
| Performance | Indexed filter columns, paginated JSON responses, a connection pool, debounced search |
| Data integrity | The same validation runs on client and server; foreign keys with CASCADE / SET NULL; UNIQUE and CHECK constraints (one review per user per restaurant, rating 1–5, price ≥ 0) |
| Maintainability | Routes, middleware, utilities, SQL and UI are kept in separate files; shared helpers (`core.js`, `forms.js`, `rules.js`, `sql.js`) |
| Portability | Runs with `npm install && npm run db:setup && npm start` on any OS; configured through `.env` |

---

## 6. Suggested 6-minute demo script

| Time | Who | What to show |
|---|---|---|
| 0:00–0:30 | Madina | Group introduction, aim of Food Advisor, the three roles |
| 0:30–1:15 | Miras | Architecture diagram (section 3): browser ↔ JSON API ↔ MySQL, RBAC, security |
| 1:15–2:30 | Zamira | **Guest/customer:** spin the “What should I eat?” roulette → home search with suggestions → explore filters (city, cuisine, rating, price, open now) → dish search → restaurant page → log in as customer → write a review, edit it, vote helpful, save a favourite, show the profile and Web Storage history |
| 2:30–3:45 | Miras | **Owner:** dashboard charts → add a restaurant (pending) → edit the menu, mark a dish as sold out → reply to a review. Show that another owner's restaurant cannot be edited (403/404) |
| 3:45–5:00 | Ilyas | **Admin:** approve the new restaurant → reports queue: hide the spam review → block the spammer → users / cuisines. Then show the MySQL tables and `npm test` (34 passing) |
| 5:00–6:00 | Madina | Code structure overview (section 3) and the Team Member Contribution Table |

---

## 7. Team member contribution (planned in CW1.1)

| Member | Role | Main areas in this code base |
|---|---|---|
| Bazarbayeva Madina | Reporter | Integration, README/documentation, demo video, Canvas submission |
| Nurmanova Zamira | Front-end developer | `public/*.html`, `public/css/style.css`, `explore.js`, `restaurant.js`, responsive layout |
| Yernazarov Miras | Back-end developer | `server.js`, `server/routes/*`, `server/middleware/*` (auth, RBAC, security), validation |
| Sungatov Ilyas | Database & QA | `database/schema.sql`, `database/setup.js`, SQL queries, `tests/api.test.js` |

> Update this table so it matches who actually did what. Git commit history is good evidence.
