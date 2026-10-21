/* =====================================================================
   Food Advisor — shared front-end module (jQuery)
   Loaded on every page. Provides:
     FA.api        AJAX/JSON calls to the Node.js REST API
     FA.store      Web Storage helpers (localStorage + sessionStorage)
     FA.auth       login state kept in localStorage
     FA.fav        favourites (DB for members, localStorage for guests)
     FA.recent     recently viewed restaurants & recent searches
     UI helpers    header/footer, toasts, modals, validation, cards…
   ===================================================================== */
(function ($, window, document) {
  'use strict';

  const FA = (window.FA = {});

  /* ---------------- Web Storage ---------------- */
  function makeStore(area) {
    return {
      get(key, fallback = null) {
        try {
          const raw = window[area].getItem('fa.' + key);
          return raw === null ? fallback : JSON.parse(raw);
        } catch (e) { return fallback; }
      },
      set(key, value) {
        try { window[area].setItem('fa.' + key, JSON.stringify(value)); } catch (e) { /* storage full / disabled */ }
      },
      remove(key) {
        try { window[area].removeItem('fa.' + key); } catch (e) { /* ignore */ }
      },
    };
  }
  FA.store = makeStore('localStorage');
  FA.session = makeStore('sessionStorage');

  /* ---------------- Auth state ---------------- */
  FA.auth = {
    token: () => FA.store.get('token'),
    user: () => FA.store.get('user'),
    save(token, user) { FA.store.set('token', token); FA.store.set('user', user); },
    setUser(user) { FA.store.set('user', user); },
    clear() { FA.store.remove('token'); FA.store.remove('user'); },
    is(...roles) {
      const u = FA.auth.user();
      return !!u && (roles.length === 0 || roles.includes(u.role));
    },
  };

  /* ---------------- API (jQuery AJAX + JSON) ---------------- */
  FA.api = function (method, url, data) {
    const token = FA.auth.token();
    const isGet = method === 'GET';
    if (isGet && data) {
      data = Object.fromEntries(Object.entries(data).filter(([, v]) => v !== '' && v !== null && v !== undefined && v !== false));
    }
    return new Promise((resolve, reject) => {
      $.ajax({
        url: '/api' + url,
        method,
        data: isGet ? data : data !== undefined ? JSON.stringify(data) : undefined,
        contentType: isGet ? undefined : 'application/json',
        dataType: 'json',
        headers: token ? { Authorization: 'Bearer ' + token } : {},
      })
        .done(resolve)
        .fail((xhr) => {
          const body = xhr.responseJSON || {};
          const err = new Error(body.error || (xhr.status === 0 ? 'Cannot reach the server. Is it running?' : 'Request failed (' + xhr.status + ')'));
          err.status = xhr.status;
          err.details = body.details;
          if (xhr.status === 401 && token) {
            // token expired or account blocked → forget it everywhere
            FA.auth.clear();
            FA.renderHeader();
          }
          reject(err);
        });
    });
  };

  /* ---------------- Formatting helpers ---------------- */
  const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  FA.esc = (s) => String(s === null || s === undefined ? '' : s).replace(/[&<>"']/g, (c) => ESC[c]);

  FA.money = (n) => Math.round(Number(n)).toLocaleString('ru-RU').replace(/,/g, ' ') + ' ₸';
  FA.priceLevel = (level, withMuted = true) => '₸'.repeat(level) + (withMuted ? '<i>' + '₸'.repeat(4 - level) + '</i>' : '');
  FA.priceWords = ['', 'Budget', 'Moderate', 'Upscale', 'Fine dining'];

  FA.date = (s) => (s ? new Date(s.replace(' ', 'T')).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '');
  FA.timeAgo = function (s) {
    if (!s) return '';
    const diff = (Date.now() - new Date(s.replace(' ', 'T')).getTime()) / 1000;
    const units = [[31536000, 'year'], [2592000, 'month'], [604800, 'week'], [86400, 'day'], [3600, 'hour'], [60, 'minute']];
    for (const [sec, name] of units) {
      const v = Math.floor(diff / sec);
      if (v >= 1) return v + ' ' + name + (v > 1 ? 's' : '') + ' ago';
    }
    return 'just now';
  };
  FA.monthLabel = (ym) => new Date(ym + '-01T00:00:00').toLocaleDateString('en-GB', { month: 'short' });

  FA.debounce = function (fn, ms) {
    let t;
    return function (...args) { clearTimeout(t); t = setTimeout(() => fn.apply(this, args), ms); };
  };
  FA.param = (name) => new URLSearchParams(window.location.search).get(name);

  /* ---------------- Icons (inline SVG, no icon library) ---------------- */
  const P = {
    search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
    star: '<path d="M12 2.8l2.8 5.9 6.4.8-4.7 4.4 1.2 6.4L12 17.2l-5.7 3.1 1.2-6.4L2.8 9.5l6.4-.8z"/>',
    heart: '<path d="M12 20.5s-7.5-4.6-9.3-9.2C1.4 7.9 3.6 4.5 7 4.5c2 0 3.4 1 5 2.8 1.6-1.8 3-2.8 5-2.8 3.4 0 5.6 3.4 4.3 6.8-1.8 4.6-9.3 9.2-9.3 9.2z"/>',
    pin: '<path d="M12 21s-7-6.2-7-11.5A7 7 0 0 1 19 9.5C19 14.8 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.5"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    phone: '<path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2"/>',
    globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/>',
    user: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
    users: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0M16 4.5a3.5 3.5 0 0 1 0 7M18 14a6.5 6.5 0 0 1 3.5 6"/>',
    logout: '<path d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3M10 16l-4-4 4-4M6 12h10"/>',
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
    moon: '<path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    edit: '<path d="M4 20h4L19 9l-4-4L4 16v4zM14 6l4 4"/>',
    trash: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>',
    flag: '<path d="M5 21V4M5 4h11l-2 4 2 4H5"/>',
    thumb: '<path d="M7 11v9H4v-9h3zM7 11l4-8a2 2 0 0 1 2.5 2.2L13 9h5.5a2 2 0 0 1 2 2.4l-1.4 7A2 2 0 0 1 17.1 20H7"/>',
    check: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
    x: '<path d="M6 6l12 12M18 6 6 18"/>',
    menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
    chef: '<path d="M7 14v6h10v-6M6.5 14A4.5 4.5 0 0 1 7.6 5.2 5 5 0 0 1 16.4 5.2 4.5 4.5 0 0 1 17.5 14z"/>',
    shield: '<path d="M12 3 4.5 6v6c0 4.5 3.2 8 7.5 9 4.3-1 7.5-4.5 7.5-9V6z"/><path d="m9 12 2 2 4-4"/>',
    store: '<path d="M4 10v10h16V10M3 4h18l-1.5 6a3 3 0 0 1-5.6.6 3 3 0 0 1-5.8 0A3 3 0 0 1 4.5 10z"/><path d="M10 20v-5h4v5"/>',
    utensils: '<path d="M7 3v8M4 3v5a3 3 0 0 0 6 0V3M7 11v10M17 21V3c-2.2 0-4 2.7-4 6.5V13h4"/>',
    filter: '<path d="M4 5h16M7 12h10M10 19h4"/>',
    arrow: '<path d="M5 12h14M13 6l6 6-6 6"/>',
    chevron: '<path d="m9 6 6 6-6 6"/>',
    grid: '<rect x="4" y="4" width="7" height="7" rx="1.5"/><rect x="13" y="4" width="7" height="7" rx="1.5"/><rect x="4" y="13" width="7" height="7" rx="1.5"/><rect x="13" y="13" width="7" height="7" rx="1.5"/>',
    list: '<path d="M9 6h11M9 12h11M9 18h11"/><circle cx="4.5" cy="6" r="1"/><circle cx="4.5" cy="12" r="1"/><circle cx="4.5" cy="18" r="1"/>',
    message: '<path d="M4 5h16v11H8l-4 4z"/>',
    reply: '<path d="M10 8 5 13l5 5M5 13h9a5 5 0 0 1 5 5"/>',
    eye: '<path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
    eyeOff: '<path d="M3 3l18 18M10.6 5.1A10 10 0 0 1 12 5c6.4 0 10 7 10 7a17 17 0 0 1-3 3.8M6.6 6.6A17 17 0 0 0 2 12s3.6 7 10 7a9.6 9.6 0 0 0 4.4-1"/><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2"/>',
    mail: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/>',
    lock: '<rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
    chart: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
    history: '<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5M12 7v5l3 2"/>',
    fire: '<path d="M12 22c4 0 7-2.7 7-7 0-4.5-4-6.5-4-11-3 1.5-5.5 4.5-5.5 8.5C8 11.5 7 10 7 8c-1.6 1.6-2 4-2 6 0 4.4 3 8 7 8z"/>',
    leaf: '<path d="M5 19c0-8 5-14 15-14 0 10-6 15-14 15M5 19c3-4 6-6 9-7"/>',
    info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5v.01"/>',
    alert: '<path d="M12 3 2 20h20zM12 10v4M12 17v.01"/>',
    sparkle: '<path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M6 18l2.5-2.5M15.5 8.5 18 6"/>',
    trophy: '<path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0zM7 6H4a3 3 0 0 0 3 4M17 6h3a3 3 0 0 1-3 4"/>',
    ban: '<circle cx="12" cy="12" r="9"/><path d="m5.6 5.6 12.8 12.8"/>',
    tag: '<path d="M3 12V4h8l10 10-8 8z"/><circle cx="7.5" cy="8.5" r="1.5"/>',
    camera: '<path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/>',
    settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-1.8-.3 1.6 1.6 0 0 0-1 1.5V21a2 2 0 0 1-4 0v-.1a1.6 1.6 0 0 0-1-1.5 1.6 1.6 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.6 1.6 0 0 0 .3-1.8 1.6 1.6 0 0 0-1.5-1H3a2 2 0 0 1 0-4h.1a1.6 1.6 0 0 0 1.5-1 1.6 1.6 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.6 1.6 0 0 0 1.8.3H9a1.6 1.6 0 0 0 1-1.5V3a2 2 0 0 1 4 0v.1a1.6 1.6 0 0 0 1 1.5 1.6 1.6 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0-.3 1.8V9a1.6 1.6 0 0 0 1.5 1H21a2 2 0 0 1 0 4h-.1a1.6 1.6 0 0 0-1.5 1z"/>',
    home: '<path d="M3 11 12 3l9 8M5 9.5V21h14V9.5"/>',
    calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>',
    compare: '<path d="M8 4v16M16 4v16M3 8h5M16 16h5M8 12H3M21 12h-5"/>',
    dice: '<rect x="3" y="3" width="18" height="18" rx="4"/><circle cx="8" cy="8" r="1.3" fill="currentColor"/><circle cx="16" cy="16" r="1.3" fill="currentColor"/><circle cx="12" cy="12" r="1.3" fill="currentColor"/><circle cx="16" cy="8" r="1.3" fill="currentColor"/><circle cx="8" cy="16" r="1.3" fill="currentColor"/>',
    command: '<path d="M9 6a3 3 0 1 0-3 3h12a3 3 0 1 0-3-3v12a3 3 0 1 0 3-3H6a3 3 0 1 0 3 3z"/>',
  };
  FA.icon = (name, cls = '') => `<svg class="icon ${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${P[name] || ''}</svg>`;
  FA.starIcon = (filled) => `<svg class="icon ${filled ? '' : 'star-off'}" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">${P.star}</svg>`;

  /* ---------------- Rating / avatar widgets ---------------- */
  FA.stars = function (rating) {
    const r = Math.round(Number(rating));
    let html = `<span class="stars" role="img" aria-label="${Number(rating).toFixed(1)} out of 5 stars">`;
    for (let i = 1; i <= 5; i++) html += FA.starIcon(i <= r);
    return html + '</span>';
  };
  FA.ratingPill = function (rating, count) {
    const v = Number(rating);
    if (!count) return '<span class="rating-pill none">New</span>';
    const cls = v >= 4 ? '' : v >= 3 ? 'mid' : 'low';
    return `<span class="rating-pill ${cls}">${FA.starIcon(true)}${v.toFixed(1)}</span>`;
  };
  const AVATAR_COLORS = ['#e4572e', '#23865a', '#2f6fdb', '#7752d1', '#b7791f', '#d23f6b', '#0f8b8d', '#5f6caf'];
  FA.avatar = function (name, url, cls = '') {
    const initials = String(name || '?').split(/\s+/).map((w) => w[0]).slice(0, 2).join('').toUpperCase();
    const color = AVATAR_COLORS[[...String(name)].reduce((a, c) => a + c.charCodeAt(0), 0) % AVATAR_COLORS.length];
    if (url) return `<span class="avatar ${cls}" style="background:${color}"><img src="${FA.esc(url)}" alt="" data-fallback-hide></span>`;
    return `<span class="avatar ${cls}" style="background:${color}" aria-hidden="true">${FA.esc(initials)}</span>`;
  };
  FA.roleBadge = function (role) {
    const map = { customer: ['badge-blue', 'Customer'], owner: ['badge-purple', 'Restaurant owner'], admin: ['badge-brand', 'Administrator'] };
    const [cls, label] = map[role] || ['', role];
    return `<span class="badge ${cls}">${label}</span>`;
  };
  FA.statusBadge = function (status) {
    const map = {
      approved: 'badge-green', pending: 'badge-amber', rejected: 'badge-red', active: 'badge-green', blocked: 'badge-red',
      visible: 'badge-green', hidden: 'badge-red', open: 'badge-amber', resolved: 'badge-green', dismissed: '',
    };
    return `<span class="badge ${map[status] || ''}"><span class="dot"></span>${FA.esc(status.charAt(0).toUpperCase() + status.slice(1))}</span>`;
  };
  FA.openBadge = (r) => (r.opens_at ? (Number(r.is_open) ? '<span class="badge badge-green"><span class="dot"></span>Open now</span>' : '<span class="badge badge-dark">Closed</span>') : '');

  /* Image fallback without inline handlers (CSP friendly): capture <img> load errors. */
  document.addEventListener('error', (e) => {
    const img = e.target;
    if (img.tagName !== 'IMG') return;
    if (img.hasAttribute('data-fallback-hide')) { img.remove(); return; }
    if (img.hasAttribute('data-fallback')) {
      const emoji = img.getAttribute('data-fallback') || '🍽️';
      $(img).replaceWith(`<div class="img-fallback">${FA.esc(emoji)}</div>`);
    }
  }, true);

  /* ---------------- Cards ---------------- */
  FA.restaurantCard = function (r, i = 0) {
    const img = r.image_url
      ? `<img src="${FA.esc(r.image_url)}" alt="${FA.esc(r.name)}" loading="lazy" class="fade" data-fallback="${FA.esc(r.cuisine_emoji || '🍽️')}">`
      : `<div class="img-fallback">${FA.esc(r.cuisine_emoji || '🍽️')}</div>`;
    return `
      <article class="r-card" data-rid="${r.id}">
        <div class="media">
          ${img}
          <div class="tags">${Number(r.is_featured) ? `<span class="badge badge-brand">${FA.icon('sparkle')}Featured</span>` : ''}${FA.openBadge(r)}</div>
          <div class="card-actions">
            <button class="fav-btn cmp-btn ${FA.compare.has(r.id) ? 'active' : ''}" data-compare="${r.id}" aria-label="Compare ${FA.esc(r.name)}" aria-pressed="${FA.compare.has(r.id)}" title="Compare">${FA.icon('compare')}</button>
            <button class="fav-btn ${FA.fav.has(r.id) ? 'active' : ''}" data-fav="${r.id}" aria-label="Save ${FA.esc(r.name)} to favourites" aria-pressed="${FA.fav.has(r.id)}">${FA.icon('heart')}</button>
          </div>
        </div>
        <div class="body">
          <div class="meta"><span>${FA.esc(r.cuisine_emoji || '')} ${FA.esc(r.cuisine)}</span><span class="sep">•</span><span>${FA.icon('pin')} ${FA.esc(r.city)}</span></div>
          <h3><a href="/restaurant?id=${r.id}">${FA.esc(r.name)}</a></h3>
          <p class="desc">${FA.esc(r.description || '')}</p>
          <div class="foot">
            <span>${FA.ratingPill(r.avg_rating, r.review_count)} <span class="reviews-count">${r.review_count} review${r.review_count == 1 ? '' : 's'}</span></span>
            <span class="price" title="${FA.priceWords[r.price_level]}">${FA.priceLevel(r.price_level)}</span>
          </div>
        </div>
      </article>`;
  };

  const DISH_EMOJI = { Starters: '🥗', Mains: '🍲', Sides: '🍟', Desserts: '🍰', Drinks: '🥤' };
  // labels for the nutrition / audience data
  FA.AUDIENCE = {
    kids: ['👶', 'Kids'], sharing: ['👥', 'Great for sharing'], sport: ['💪', 'High protein · active people'],
    light: ['🥗', 'Light · low calorie'], halal: ['✅', 'Halal'], vegan: ['🌱', 'Vegan'], gluten_free: ['🌾', 'Gluten-free'],
  };
  FA.ALLERGEN = { gluten: '🌾 Gluten', dairy: '🥛 Dairy', eggs: '🥚 Eggs', nuts: '🥜 Nuts', fish: '🐟 Fish', shellfish: '🦐 Shellfish', soy: '🫘 Soy', sesame: '⚪ Sesame' };
  FA.dishCache = {};

  FA.dishCard = function (d, opts = {}) {
    FA.dishCache[d.id] = { ...FA.dishCache[d.id], ...d };
    const thumb = d.image_url
      ? `<img src="${FA.esc(d.image_url)}" alt="${FA.esc(d.name)}" loading="lazy" class="fade" data-fallback="${DISH_EMOJI[d.category] || '🍽️'}">`
      : DISH_EMOJI[d.category] || '🍽️';
    const tags = [
      Number(d.is_vegetarian) ? `<span class="badge badge-green">${FA.icon('leaf')}Vegetarian</span>` : '',
      Number(d.is_spicy) ? `<span class="badge badge-red">${FA.icon('fire')}Spicy</span>` : '',
      d.is_available !== undefined && !Number(d.is_available) ? '<span class="badge">Sold out</span>' : '',
    ].join('');
    const where = opts.showRestaurant
      ? `<a href="/restaurant?id=${d.restaurant_id}#menu" class="muted" style="font-size:13px">${FA.esc(d.cuisine_emoji || '')} ${FA.esc(d.restaurant)} · ${FA.esc(d.city)}</a>`
      : '';
    const facts = d.calories || d.weight_g
      ? `<div class="facts">${d.weight_g ? `<span><b>${d.weight_g} g</b></span>` : ''}${d.calories ? `<span><b>${d.calories}</b> kcal</span>` : ''}${d.protein_g ? `<span>P ${Math.round(d.protein_g)} g</span>` : ''}</div>`
      : '';
    const clickable = opts.clickable !== false;
    return `
      <div class="d-card ${d.is_available !== undefined && !Number(d.is_available) ? 'unavailable' : ''}" ${clickable ? `data-dish="${d.id}" role="button" tabindex="0" aria-label="Details of ${FA.esc(d.name)}"` : ''}>
        <div class="thumb">${thumb}</div>
        <div class="info">
          <h4>${FA.esc(d.name)}</h4>
          ${where}
          ${d.description ? `<p class="desc">${FA.esc(d.description)}</p>` : ''}
          ${facts}
          <div class="row">${tags}<span class="price-tag">${FA.money(d.price)}</span></div>
        </div>
      </div>`;
  };

  /* Dish details: weight, calories, macros, allergens and who it suits */
  FA.showDish = async function (id) {
    let d = FA.dishCache[id];
    if (!d || d.calories === undefined || !d.restaurant) {
      try { d = { ...d, ...(await FA.api('GET', '/dishes/' + id)).dish }; FA.dishCache[id] = d; } catch (e) { if (!d) return FA.toast(e.message, 'error'); }
    }
    const kcalP = (Number(d.protein_g) || 0) * 4;
    const kcalF = (Number(d.fat_g) || 0) * 9;
    const kcalC = (Number(d.carbs_g) || 0) * 4;
    const kcalSum = kcalP + kcalF + kcalC || 1;
    const hasNutrition = d.calories !== null && d.calories !== undefined;
    const audience = String(d.recommended_for || '').split(',').filter(Boolean);
    const allergens = String(d.allergens || '').split(',').filter(Boolean);
    const per100 = hasNutrition && d.weight_g ? Math.round((d.calories / d.weight_g) * 100) : null;
    const daily = hasNutrition ? Math.round((d.calories / 2000) * 100) : null;
    const macro = (cls, label, grams, kcal) => `
      <div class="macro macro-${cls}"><span>${label}</span><span class="track"><span data-w="${Math.round((kcal / kcalSum) * 100)}"></span></span><span class="val">${grams !== null && grams !== undefined ? Math.round(grams) + ' g' : '—'}</span></div>`;
    const img = d.image_url ? `<img src="${FA.esc(d.image_url.replace('w=600', 'w=900'))}" alt="${FA.esc(d.name)}" class="fade">` : (DISH_EMOJI[d.category] || '🍽️');

    FA.modal({
      title: d.category || 'Dish',
      footer: false,
      body: `
        <div class="dish-view">
          <div class="dv-media">${img}</div>
          <div class="dv-head">
            <div>
              <h2>${FA.esc(d.name)}</h2>
              ${d.restaurant ? `<div class="dv-sub">${FA.esc(d.cuisine_emoji || '')} <a href="/restaurant?id=${d.restaurant_id}#menu">${FA.esc(d.restaurant)}</a>${d.city ? ' · ' + FA.esc(d.city) : ''}</div>` : ''}
            </div>
            <div class="dv-price">${FA.money(d.price)}</div>
          </div>
          ${d.description ? `<p class="dv-desc">${FA.esc(d.description)}</p>` : '<div style="height:16px"></div>'}
          ${hasNutrition ? `
          <div class="dv-stats">
            <div class="dv-stat"><b>${d.weight_g || '—'}${d.weight_g ? '<small> g</small>' : ''}</b><small>Portion</small></div>
            <div class="dv-stat"><b>${d.calories}</b><small>kcal</small></div>
            <div class="dv-stat"><b>${per100 ?? '—'}</b><small>kcal / 100 g</small></div>
            <div class="dv-stat"><b>${daily}%</b><small>of 2000 kcal day</small></div>
          </div>
          <div class="dv-section"><h4>Nutrition per portion</h4>
            ${macro('protein', 'Protein', d.protein_g, kcalP)}${macro('fat', 'Fat', d.fat_g, kcalF)}${macro('carbs', 'Carbs', d.carbs_g, kcalC)}
            <small class="muted">Bars show the share of energy from each macronutrient.</small>
          </div>` : '<p class="muted">The restaurant has not added nutrition facts for this dish yet.</p>'}
          <div class="dv-section"><h4>Recommended for</h4>
            <div class="tag-list">${audience.length ? audience.map((a) => `<span class="tag good">${FA.AUDIENCE[a][0]} ${FA.AUDIENCE[a][1]}</span>`).join('') : '<span class="muted">Everyone who loves good food 🙂</span>'}
              ${Number(d.is_vegetarian) ? `<span class="tag good">${FA.icon('leaf')} Vegetarian</span>` : ''}${Number(d.is_spicy) ? '<span class="tag warn">🌶️ Spicy</span>' : ''}</div>
          </div>
          <div class="dv-section"><h4>Allergens</h4>
            <div class="tag-list">${allergens.length ? allergens.map((a) => `<span class="tag warn">${FA.ALLERGEN[a]}</span>`).join('') : '<span class="tag good">No common allergens listed</span>'}</div>
          </div>
          ${d.is_available !== undefined && !Number(d.is_available) ? `<div class="alert alert-warn" style="margin:18px 0 0">${FA.icon('info')}<span>Sold out today.</span></div>` : ''}
          <p class="muted" style="font-size:12px;margin-top:18px">Values are approximate and provided by the restaurant.</p>
        </div>`,
      onOpen($form) {
        setTimeout(() => $form.find('.macro .track span').each(function () { $(this).css('width', $(this).data('w') + '%'); }), 120);
      },
    });
  };
  $(document).on('click', '[data-dish]', function (e) {
    const $inner = $(e.target).closest('a, button');
    if ($inner.length && $inner[0] !== this) return; // links inside the card keep working
    FA.showDish($(this).data('dish'));
  });
  $(document).on('keydown', '[data-dish]', function (e) {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); FA.showDish($(this).data('dish')); }
  });

  FA.skeletonCards = (n = 6) => Array.from({ length: n }, () => '<div class="sk-card"><div class="skeleton sk-media"></div><div class="skeleton sk-line"></div><div class="skeleton sk-line short"></div></div>').join('');
  FA.empty = (emoji, title, text, action = '') => `<div class="empty"><div class="e-ico">${emoji}</div><h3>${title}</h3><p>${text}</p>${action}</div>`;

  /* ---------------- Toasts ---------------- */
  FA.toast = function (message, type = 'success') {
    let $wrap = $('.toasts');
    if (!$wrap.length) $wrap = $('<div class="toasts" role="status" aria-live="polite"></div>').appendTo('body');
    const ico = { success: 'check', error: 'x', info: 'info' }[type] || 'info';
    const $t = $(`<div class="toast ${type}"><span class="t-ico">${FA.icon(ico)}</span><span></span></div>`);
    $t.find('span').last().text(message);
    $wrap.append($t);
    setTimeout(() => { $t.addClass('out'); setTimeout(() => $t.remove(), 300); }, type === 'error' ? 5000 : 3200);
  };

  /* ---------------- Modals ---------------- */
  FA.modal = function ({ title, body, size = '', submitText = 'Save', cancelText = 'Cancel', danger = false, onSubmit, onOpen, footer = true }) {
    const $bd = $(`
      <div class="modal-backdrop" role="dialog" aria-modal="true" aria-label="${FA.esc(title)}">
        <form class="modal ${size}" novalidate>
          <div class="modal-head"><h3>${FA.esc(title)}</h3><button type="button" class="btn btn-ghost btn-icon btn-sm" data-close aria-label="Close">${FA.icon('x')}</button></div>
          <div class="modal-body">${body}</div>
          ${footer ? `<div class="modal-foot"><button type="button" class="btn btn-ghost" data-close>${cancelText}</button><button type="submit" class="btn ${danger ? 'btn-danger' : 'btn-primary'}">${submitText}</button></div>` : ''}
        </form>
      </div>`).appendTo('body');
    const $form = $bd.find('form');
    const previouslyFocused = document.activeElement;
    $('body').css('overflow', 'hidden');
    requestAnimationFrame(() => $bd.addClass('open'));
    setTimeout(() => $form.find('input:not([type=hidden]),select,textarea').filter(':visible').first().trigger('focus'), 60);

    function close() {
      $bd.removeClass('open');
      $(document).off('keydown.modal');
      setTimeout(() => {
        $bd.remove();
        if (!$('.modal-backdrop').length) $('body').css('overflow', '');
        if (previouslyFocused) previouslyFocused.focus();
      }, 200);
    }
    $bd.on('click', '[data-close]', close);
    // close when the dark backdrop is clicked — but ignore the "ghost" touch events
    // iOS Safari sends right after the tap that opened the modal
    const openedAt = Date.now();
    let downOnBackdrop = false;
    $bd.on('pointerdown', (e) => { downOnBackdrop = e.target === $bd[0]; });
    $bd.on('click', (e) => {
      if (e.target === $bd[0] && downOnBackdrop && Date.now() - openedAt > 400) close();
    });
    $(document).on('keydown.modal', (e) => { if (e.key === 'Escape') close(); });

    $form.on('submit', async (e) => {
      e.preventDefault();
      if (!onSubmit) return close();
      if (!FA.validate($form)) return;
      const $btn = $form.find('[type=submit]');
      FA.loading($btn, true);
      try {
        const keepOpen = await onSubmit(FA.formData($form), $form, close);
        if (keepOpen !== true) close();
      } catch (err) {
        if (err.details) FA.showErrors($form, err.details);
        FA.toast(err.message, 'error');
      } finally {
        FA.loading($btn, false);
      }
    });
    if (onOpen) onOpen($form, close);
    return { $el: $bd, $form, close };
  };

  FA.confirm = function ({ title = 'Are you sure?', message = '', confirmText = 'Delete', danger = true }) {
    return new Promise((resolve) => {
      let answered = false;
      const m = FA.modal({
        title, size: 'modal-sm', submitText: confirmText, danger,
        body: `<div class="confirm-ico">${FA.icon(danger ? 'trash' : 'info')}</div><p>${message}</p>`,
        onSubmit: () => { answered = true; resolve(true); },
      });
      m.$el.on('click', '[data-close]', () => { if (!answered) resolve(false); });
      m.$el.on('click', (e) => { if (e.target === m.$el[0] && !answered) setTimeout(() => { if (!m.$el.closest('body').length) resolve(false); }, 250); });
    });
  };

  /* ---------------- Forms: client-side validation ---------------- */
  FA.loading = ($btn, on) => $btn.prop('disabled', on).toggleClass('is-loading', on);

  FA.formData = function ($form) {
    const data = {};
    $form.find('input[name], select[name], textarea[name]').each(function () {
      const $el = $(this);
      const name = this.name;
      if (this.type === 'checkbox' && $el.is('[data-multi]')) { (data[name] = data[name] || []); if (this.checked) data[name].push($el.val()); }
      else if (this.type === 'checkbox') data[name] = this.checked;
      else if (this.type === 'radio') { if (this.checked) data[name] = $el.val(); }
      else data[name] = $el.val();
    });
    return data;
  };

  function fieldError($input, message) {
    const $field = $input.closest('.field');
    $field.toggleClass('has-error', !!message);
    let $err = $field.find('.error');
    if (!$err.length) $err = $('<div class="error" role="alert"></div>').appendTo($field);
    $err.text(message || '');
    $input.attr('aria-invalid', message ? 'true' : null);
  }
  FA.fieldError = fieldError;

  function checkInput(el) {
    const $el = $(el);
    const v = String($el.val() || '').trim();
    const label = $el.data('label') || $el.closest('.field').find('label').first().text().replace('*', '').trim() || 'This field';
    if (el.type === 'radio') {
      const any = $(`input[name="${el.name}"]:checked`, el.form).length;
      return el.required && !any ? 'Please select ' + ($el.data('label') || 'an option') : '';
    }
    if (el.type === 'checkbox') return el.required && !el.checked ? 'Please tick this box to continue' : '';
    if (el.required && !v) return `${label} is required`;
    if (!v) return '';
    if (el.type === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v)) return 'Enter a valid email address';
    if (el.type === 'url' && !/^https?:\/\/\S+\.\S+/.test(v)) return 'Enter a full URL starting with http:// or https://';
    if (el.minLength > 0 && v.length < el.minLength) return `${label} must be at least ${el.minLength} characters`;
    if (el.maxLength > 0 && v.length > el.maxLength) return `${label} must be at most ${el.maxLength} characters`;
    if (el.type === 'number') {
      const n = Number(v);
      if (Number.isNaN(n)) return `${label} must be a number`;
      if (el.min !== '' && n < Number(el.min)) return `${label} must be at least ${el.min}`;
      if (el.max !== '' && n > Number(el.max)) return `${label} must be at most ${el.max}`;
    }
    if ($el.data('password') !== undefined && (!/[A-Za-z]/.test(v) || !/\d/.test(v))) return 'Use letters and at least one number';
    if (el.pattern && !new RegExp('^(?:' + el.pattern + ')$').test(v)) return $el.data('pattern-msg') || `${label} has an invalid format`;
    const match = $el.data('match');
    if (match && v !== String($(match).val())) return 'Passwords do not match';
    if (el.type === 'date' && $el.data('not-future') !== undefined && new Date(v) > new Date()) return 'Date cannot be in the future';
    return '';
  }

  FA.validate = function ($form) {
    let ok = true;
    let $first = null;
    $form.find('input[name], select[name], textarea[name]').each(function () {
      if (this.disabled || this.type === 'hidden') return;
      const msg = checkInput(this);
      fieldError($(this), msg);
      if (msg && ok) { ok = false; $first = $(this); }
    });
    if ($first) $first.trigger('focus');
    return ok;
  };

  FA.showErrors = function ($form, details) {
    Object.entries(details || {}).forEach(([name, msg]) => {
      const $input = $form.find(`[name="${name}"]`).first();
      if ($input.length) fieldError($input, msg);
    });
    $form.find('.has-error input, .has-error select, .has-error textarea').first().trigger('focus');
  };

  // live re-validation once a field has been touched
  $(document).on('input change', '.field.has-error input, .field.has-error select, .field.has-error textarea', function () {
    fieldError($(this), checkInput(this));
  });
  // character counters: <textarea maxlength data-counter>
  $(document).on('input', '[data-counter]', function () {
    $(this).closest('.field').find('.char-count').text(`${this.value.length} / ${this.maxLength}`);
  });
  // show / hide password
  $(document).on('click', '.toggle-pass', function () {
    const $input = $(this).siblings('input');
    const show = $input.attr('type') === 'password';
    $input.attr('type', show ? 'text' : 'password');
    $(this).html(FA.icon(show ? 'eyeOff' : 'eye')).attr('aria-label', show ? 'Hide password' : 'Show password');
  });

  /* ---------------- Favourites ---------------- */
  FA.fav = {
    ids: new Set(),
    loaded: false,
    has(id) { return this.ids.has(Number(id)); },
    async load() {
      if (FA.auth.token()) {
        try {
          const guest = FA.store.get('guestFavs', []);
          let res;
          if (guest.length) {
            res = await FA.api('POST', '/me/favorites/sync', { ids: guest });
            FA.store.remove('guestFavs');
            FA.toast(`${guest.length} saved restaurant${guest.length > 1 ? 's were' : ' was'} added to your account`, 'info');
          } else {
            res = await FA.api('GET', '/me/favorites/ids');
          }
          this.ids = new Set(res.ids);
        } catch (e) { /* not fatal */ }
      } else {
        this.ids = new Set(FA.store.get('guestFavs', []));
      }
      this.loaded = true;
      this.paint();
    },
    async toggle(id) {
      id = Number(id);
      const on = !this.has(id);
      if (FA.auth.token()) {
        await FA.api(on ? 'PUT' : 'DELETE', '/me/favorites/' + id);
      } else {
        const list = FA.store.get('guestFavs', []).filter((x) => x !== id);
        if (on) list.unshift(id);
        FA.store.set('guestFavs', list.slice(0, 50));
      }
      on ? this.ids.add(id) : this.ids.delete(id);
      this.paint();
      $(document).trigger('fa:favchange', [id, on]);
      FA.toast(on ? (FA.auth.token() ? 'Saved to your favourites' : 'Saved on this device — log in to keep it in your account') : 'Removed from favourites', on ? 'success' : 'info');
      return on;
    },
    paint() {
      $('[data-fav]').each((_, el) => {
        const on = this.has($(el).data('fav'));
        $(el).toggleClass('active', on).attr('aria-pressed', on);
      });
    },
  };
  $(document).on('click', '[data-fav]', async function (e) {
    e.preventDefault();
    e.stopPropagation();
    const $btn = $(this);
    try {
      await FA.fav.toggle($btn.data('fav'));
      $btn.removeClass('pop');
      void this.offsetWidth; // restart animation
      $btn.addClass('pop');
    } catch (err) { FA.toast(err.message, 'error'); }
  });

  /* ---------------- Recently viewed & recent searches (localStorage) ---------------- */
  FA.recent = {
    views: () => FA.store.get('recentViews', []),
    addView(r) {
      const list = this.views().filter((x) => x.id !== r.id);
      list.unshift({ id: r.id, name: r.name, image_url: r.image_url, cuisine: r.cuisine, cuisine_id: r.cuisine_id, cuisine_emoji: r.cuisine_emoji, city: r.city, at: Date.now() });
      FA.store.set('recentViews', list.slice(0, 8));
    },
    clearViews() { FA.store.remove('recentViews'); },
    searches: () => FA.store.get('recentSearches', []),
    addSearch(term) {
      term = String(term || '').trim();
      if (term.length < 2) return;
      const list = this.searches().filter((x) => x.toLowerCase() !== term.toLowerCase());
      list.unshift(term);
      FA.store.set('recentSearches', list.slice(0, 6));
    },
    clearSearches() { FA.store.remove('recentSearches'); },
  };

  /* ---------------- Theme (stored in localStorage) ---------------- */
  FA.theme = {
    current: () => document.documentElement.getAttribute('data-theme') || 'light',
    toggle(e) {
      const next = FA.theme.current() === 'dark' ? 'light' : 'dark';
      const apply = () => {
        document.documentElement.setAttribute('data-theme', next);
        FA.store.set('theme', next);
        $('[data-theme-toggle]').html(FA.icon(next === 'dark' ? 'sun' : 'moon'));
      };
      const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      if (!document.startViewTransition || reduce) return apply();
      // circular "ink" reveal starting from the toggle button
      const x = e && e.clientX ? e.clientX : window.innerWidth - 60;
      const y = e && e.clientY ? e.clientY : 30;
      const r = Math.hypot(Math.max(x, window.innerWidth - x), Math.max(y, window.innerHeight - y));
      document.documentElement.style.setProperty('--vt-x', x + 'px');
      document.documentElement.style.setProperty('--vt-y', y + 'px');
      document.documentElement.style.setProperty('--vt-r', r + 'px');
      document.startViewTransition(apply);
    },
  };
  $(document).on('click', '[data-theme-toggle]', (e) => FA.theme.toggle(e));

  /* ---------------- Header & footer ---------------- */
  const LOGO = `<a href="/" class="logo" aria-label="Food Advisor home"><span class="logo-mark">${FA.icon('utensils')}</span><span>Food<b>Advisor</b></span></a>`;

  FA.renderHeader = function () {
    const user = FA.auth.user();
    const path = window.location.pathname.replace(/\.html$/, '');
    const mode = FA.param('mode');
    const links = [
      ['/', 'Home', 'home'],
      ['/restaurants', 'Restaurants', 'store'],
      ['/restaurants?mode=dishes', 'Dishes', 'utensils'],
    ];
    if (user && user.role === 'owner') links.push(['/owner', 'My restaurants', 'chef']);
    if (user && user.role === 'admin') links.push(['/admin', 'Admin panel', 'shield']);
    const isActive = (href) => {
      const [p, q] = href.split('?');
      if (p === '/restaurants') return path === '/restaurants' && (q ? mode === 'dishes' : mode !== 'dishes');
      return path === p || (p === '/' && path === '/index');
    };
    const nav = links.map(([href, label]) => `<a href="${href}" class="${isActive(href) ? 'active' : ''}">${label}</a>`).join('');
    const mobile = links.map(([href, label, ico]) => `<a href="${href}">${FA.icon(ico)} ${label}</a>`).join('');
    const themeIco = FA.icon(FA.theme.current() === 'dark' ? 'sun' : 'moon');

    let actions;
    if (user) {
      const roleLabel = { customer: 'Customer', owner: 'Restaurant owner', admin: 'Administrator' }[user.role];
      actions = `
        <div class="user-menu">
          <button class="user-trigger" aria-haspopup="true" aria-expanded="false">
            ${FA.avatar(user.name, user.avatar_url, 'avatar-sm')}
            <span class="who">${FA.esc(user.name.split(' ')[0])}<span class="role-dot">${roleLabel}</span></span>
          </button>
          <div class="dropdown" role="menu">
            <div class="dd-head"><b>${FA.esc(user.name)}</b><small>${FA.esc(user.email)}</small></div>
            <hr>
            <a href="/profile" role="menuitem">${FA.icon('user')} My profile</a>
            ${user.role === 'customer' ? `<a href="/profile#reviews" role="menuitem">${FA.icon('message')} My reviews</a>` : ''}
            <a href="/profile#favorites" role="menuitem">${FA.icon('heart')} Favourites</a>
            ${user.role === 'owner' ? `<a href="/owner" role="menuitem">${FA.icon('chef')} Owner dashboard</a>` : ''}
            ${user.role === 'admin' ? `<a href="/admin" role="menuitem">${FA.icon('shield')} Admin panel</a>` : ''}
            <hr>
            <button type="button" data-logout role="menuitem">${FA.icon('logout')} Log out</button>
          </div>
        </div>`;
    } else {
      actions = `
        <a href="/login" class="btn btn-ghost hide-mobile">Log in</a>
        <a href="/register" class="btn btn-primary">Sign up</a>`;
    }
    $('#site-header').attr('class', 'site-header').html(`
      <a href="#main" class="skip-link">Skip to content</a>
      <div class="container">
        ${LOGO}
        <nav class="main-nav" aria-label="Main">${nav}</nav>
        <div class="header-actions">
          <button class="btn btn-ghost kbd-btn hide-mobile" data-palette aria-label="Quick search (Ctrl+K)">${FA.icon('search')}<span>Search</span><kbd>${/Mac|iPhone|iPad/.test(navigator.platform) ? '⌘' : 'Ctrl'} K</kbd></button>
          <button class="btn btn-ghost btn-icon" data-theme-toggle aria-label="Toggle dark mode">${themeIco}</button>
          ${actions}
          <button class="btn btn-ghost btn-icon nav-toggle" aria-label="Open menu" aria-expanded="false">${FA.icon('menu')}</button>
        </div>
      </div>
      <nav class="mobile-nav" aria-label="Mobile">${mobile}${user ? '' : `<a href="/login">${FA.icon('user')} Log in</a>`}</nav>`);
  };

  FA.renderFooter = function () {
    $('#site-footer').attr('class', 'site-footer').html(`
      <div class="container">
        <div>${LOGO}<p>Discover restaurants and dishes across Kazakhstan, compare them by cuisine, location, rating and price, and share honest reviews.</p></div>
        <div><h5>Explore</h5><ul>
          <li><a href="/restaurants">All restaurants</a></li>
          <li><a href="/restaurants?mode=dishes">Search dishes</a></li>
          <li><a href="/restaurants?openNow=1">Open now</a></li>
          <li><a href="/restaurants?sort=rating&minRating=4.5">Top rated</a></li>
          <li><a href="/compare">Compare restaurants</a></li>
          <li><a href="/#roulette">What should I eat?</a></li></ul></div>
        <div><h5>Cities</h5><ul>
          <li><a href="/restaurants?city=Aktobe">Aktobe</a></li>
          <li><a href="/restaurants?city=Almaty">Almaty</a></li>
          <li><a href="/restaurants?city=Astana">Astana</a></li></ul></div>
        <div><h5>For business</h5><ul>
          <li><a href="/register?role=owner">List your restaurant</a></li>
          <li><a href="/owner">Owner dashboard</a></li>
          <li><a href="/login">Log in</a></li></ul></div>
      </div>
      <div class="bottom"><span>© 2026 Food Advisor · F28JC Web Programming · CE 202 Group 4</span><span>Built with HTML, CSS, JavaScript, jQuery, Node.js &amp; MySQL</span></div>`);
  };

  // header interactions
  $(document).on('click', '.user-trigger', function (e) {
    e.stopPropagation();
    const $dd = $(this).siblings('.dropdown');
    const open = !$dd.hasClass('open');
    $dd.toggleClass('open', open);
    $(this).attr('aria-expanded', open);
  });
  $(document).on('click', () => { $('.dropdown.open').removeClass('open'); $('.user-trigger').attr('aria-expanded', false); });
  $(document).on('keydown', (e) => { if (e.key === 'Escape') $('.dropdown.open').removeClass('open'); });
  $(document).on('click', '.nav-toggle', function () {
    const $nav = $('.mobile-nav').toggleClass('open');
    $(this).attr('aria-expanded', $nav.hasClass('open'));
  });
  // header: shadow once scrolled, slides away while scrolling down, comes back when scrolling up
  let lastY = 0;
  $(window).on('scroll', () => {
    const y = window.scrollY;
    const $h = $('.site-header');
    $h.toggleClass('is-scrolled', y > 8);
    const menuOpen = $('.mobile-nav.open, .dropdown.open').length > 0;
    if (!menuOpen && Math.abs(y - lastY) > 6) {
      const hide = y > lastY && y > 220;
      $h.toggleClass('is-hidden', hide);
      document.documentElement.classList.toggle('header-hidden', hide); // sticky elements move up too
    }
    lastY = y;
  });

  FA.logout = async function () {
    try { await FA.api('POST', '/auth/logout'); } catch (e) { /* already invalid */ }
    FA.auth.clear();
    FA.session.remove('reviewDraft');
    FA.toast('You have been logged out', 'info');
    setTimeout(() => { window.location.href = '/'; }, 500);
  };
  $(document).on('click', '[data-logout]', () => FA.logout());

  /* ---------------- Access control on protected pages ---------------- */
  // UX only — the server enforces the same rules on every API call.
  FA.guard = async function (roles) {
    await FA.ready;
    const user = FA.auth.user();
    if (!user) {
      window.location.href = '/login?next=' + encodeURIComponent(window.location.pathname + window.location.search + window.location.hash);
      return false;
    }
    if (roles && !roles.includes(user.role)) {
      $('#main').html(`<div class="container">${FA.empty('🔒', 'Access denied', 'This page is only available for ' + roles.join(' / ') + ' accounts.', '<a href="/" class="btn btn-primary">Back to home</a>')}</div>`);
      return false;
    }
    return true;
  };

  /* ---------------- Search box with live suggestions ---------------- */
  // Shows recent searches (localStorage) on focus and server suggestions while typing.
  FA.attachSuggest = function ($input, onSearch) {
    const $wrap = $input.closest('[data-suggest-wrap]');
    const $box = $('<div class="suggest" role="listbox"></div>').appendTo($wrap);
    let idx = -1;
    const close = () => { $box.removeClass('open'); idx = -1; };
    const mark = (text, q) => {
      const safe = FA.esc(text);
      const needle = FA.esc(q).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      return q ? safe.replace(new RegExp('(' + needle + ')', 'ig'), '<mark>$1</mark>') : safe;
    };
    function showRecent() {
      const list = FA.recent.searches();
      if (!list.length) return close();
      $box.html(`<h6>Recent searches <button type="button" data-clear-recent>Clear</button></h6>` +
        list.map((s) => `<button type="button" class="s-item" data-term="${FA.esc(s)}"><span class="s-ico">${FA.icon('history')}</span>${FA.esc(s)}</button>`).join('')).addClass('open');
    }
    const lookup = FA.debounce(async (q) => {
      try {
        const r = await FA.api('GET', '/restaurants/suggest', { q });
        if (q !== $input.val().trim()) return; // a newer keystroke won
        let html = '';
        if (r.restaurants.length) html += '<h6>Restaurants</h6>' + r.restaurants.map((x) => `<a class="s-item" href="/restaurant?id=${x.id}"><span class="s-ico">${FA.icon('store')}</span><span>${mark(x.name, q)}<small>${FA.esc(x.cuisine)} · ${FA.esc(x.city)}</small></span></a>`).join('');
        if (r.cuisines.length) html += '<h6>Cuisines</h6>' + r.cuisines.map((x) => `<a class="s-item" href="/restaurants?cuisine=${x.id}"><span class="s-ico">${FA.esc(x.emoji)}</span><span>${mark(x.name, q)} cuisine</span></a>`).join('');
        if (r.dishes.length) html += '<h6>Dishes</h6>' + r.dishes.map((x) => `<a class="s-item" href="/restaurants?mode=dishes&q=${encodeURIComponent(x.name)}"><span class="s-ico">${FA.icon('utensils')}</span><span>${mark(x.name, q)}<small>at ${FA.esc(x.restaurant)}</small></span></a>`).join('');
        if (!html) html = `<div class="muted" style="padding:10px 12px;font-size:14px">No quick matches — press Enter to search everything for “${FA.esc(q)}”.</div>`;
        $box.html(html).addClass('open');
        idx = -1;
      } catch (e) { close(); }
    }, 200);

    $input.attr({ autocomplete: 'off', 'aria-autocomplete': 'list' });
    $input.on('focus', () => { if (!$input.val().trim()) showRecent(); });
    $input.on('input', () => {
      const q = $input.val().trim();
      if (q.length < 2) showRecent(); else lookup(q);
    });
    $input.on('keydown', (e) => {
      const $items = $box.find('.s-item');
      if (e.key === 'Escape') return close();
      if (!$box.hasClass('open') || !$items.length) return;
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        idx = (idx + (e.key === 'ArrowDown' ? 1 : -1) + $items.length) % $items.length;
        $items.removeClass('hl').eq(idx).addClass('hl');
      } else if (e.key === 'Enter' && idx >= 0) {
        e.preventDefault();
        $items.eq(idx)[0].click();
      }
    });
    $box.on('click', '[data-term]', function () {
      const term = String($(this).data('term'));
      $input.val(term);
      close();
      onSearch(term);
    });
    $box.on('click', '[data-clear-recent]', (e) => { e.stopPropagation(); FA.recent.clearSearches(); close(); });
    $(document).on('click', (e) => { if (!$wrap[0].contains(e.target)) close(); });
    return { close };
  };

  /* ---------------- Motion ---------------- */
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const REVEAL = '.section-head, .r-card, .d-card, .cuisine-tile, .kpi, .review, .own-r-card, .mini-review, .stats-strip .card, .grid-2 > .card, .grid-2-1 > .card, .menu-cat h3, .fb-item';

  // 1. scroll reveal: elements glide in the first time they enter the screen
  const revealObserver = 'IntersectionObserver' in window && !reduceMotion
    ? new IntersectionObserver((entries) => {
      let batch = 0;
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        entry.target.style.setProperty('--rv-delay', Math.min(batch++, 8) * 60 + 'ms');
        entry.target.classList.add('in');
        revealObserver.unobserve(entry.target);
      });
    }, { rootMargin: '0px 0px -40px 0px', threshold: 0.08 })
    : null;
  function prepare(root) {
    $(root).find(REVEAL).addBack(REVEAL).each((_, el) => {
      if (el.classList.contains('rv') || !revealObserver || el.closest('.modal, .filters, .dropdown')) return;
      el.classList.add('rv');
      revealObserver.observe(el);
    });
    // bars (<span data-w="40">) grow from 0 to their width
    const $bars = $(root).find('[data-w]').addBack('[data-w]').filter((_, el) => !el.dataset.grown);
    if ($bars.length) {
      $bars.each((_, el) => { el.dataset.grown = '1'; });
      setTimeout(() => $bars.each((_, el) => { el.style.width = el.dataset.w + '%'; }), 150);
    }
    // KPI numbers count up
    $(root).find('.kpi b').each((_, el) => {
      const text = el.textContent.trim();
      if (el.dataset.counted || !/^\d+(\.\d+)?$/.test(text)) return;
      el.dataset.counted = '1';
      FA.countUp($(el), text, (text.split('.')[1] || '').length);
    });
    // 2. images fade in once loaded
    $(root).find('img.fade').addBack('img.fade').each((_, img) => {
      if (img.complete && img.naturalWidth) img.classList.add('loaded');
    });
  }
  document.addEventListener('load', (e) => { if (e.target.tagName === 'IMG') e.target.classList.add('loaded'); }, true);
  new MutationObserver((records) => records.forEach((r) => r.addedNodes.forEach((n) => { if (n.nodeType === 1) prepare(n); })))
    .observe(document.documentElement, { childList: true, subtree: true });

  // 3. smooth page-to-page transition for internal links
  $(document).on('click', 'a[href]', function (e) {
    const a = this;
    if (reduceMotion || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    if (a.target && a.target !== '_self') return;
    const url = new URL(a.href, location.href);
    if (url.origin !== location.origin || (url.pathname === location.pathname && url.search === location.search)) return;
    e.preventDefault();
    document.body.classList.add('is-leaving');
    setTimeout(() => { window.location.href = url.href; }, 170);
  });
  window.addEventListener('pageshow', () => document.body.classList.remove('is-leaving')); // back/forward cache

  // 4. animated number counters: <b data-count="123">
  FA.countUp = function ($el, value, decimals = 0) {
    if (reduceMotion) return $el.text(Number(value).toFixed(decimals));
    $({ n: 0 }).animate({ n: Number(value) || 0 }, {
      duration: 1100, easing: 'swing',
      step: (n) => $el.text(n.toFixed(decimals)),
      complete: () => $el.text(Number(value).toFixed(decimals)),
    });
  };

  /* ---------------- Feedback button (testers can rate the site) ---------------- */
  FA.isLocal = ['localhost', '127.0.0.1', '[::1]', '::1'].includes(location.hostname);
  function openFeedback() {
    const user = FA.auth.user();
    const faces = [['1', '😞'], ['2', '🙁'], ['3', '😐'], ['4', '🙂'], ['5', '🤩']];
    const cats = [['design', 'Design'], ['usability', 'Ease of use'], ['bug', 'Bug'], ['idea', 'Idea'], ['other', 'Other']];
    FA.modal({
      title: 'How do you like Food Advisor?',
      submitText: 'Send feedback',
      body: `
        <p class="muted" style="margin-bottom:16px">We are students building this site — your honest opinion really helps! 🙏</p>
        <div class="field"><span class="field-label">Your impression <span class="req">*</span></span>
          <div class="face-rating" role="radiogroup" aria-label="Rating">${faces.map(([v, f]) => `<label><input type="radio" name="rating" value="${v}" required data-label="a rating"><span aria-label="${v} of 5">${f}</span></label>`).join('')}</div>
          <div class="error"></div></div>
        <div class="field"><label for="fb-cat">What is it about?</label>
          <select class="select" id="fb-cat" name="category">${cats.map(([v, l]) => `<option value="${v}">${l}</option>`).join('')}</select></div>
        <div class="field"><label for="fb-msg">Your message <span class="req">*</span></label>
          <textarea class="textarea" id="fb-msg" name="message" required minlength="5" maxlength="1000" data-counter data-label="Message" placeholder="What did you like? What was confusing? What should we add?"></textarea>
          <div class="char-count">0 / 1000</div></div>
        ${user ? '' : '<div class="field"><label for="fb-email">Email (optional)</label><input class="input" type="email" id="fb-email" name="email" maxlength="120" placeholder="If you want us to reply"></div>'}`,
      async onSubmit(d) {
        const w = window.innerWidth;
        const res = await FA.api('POST', '/feedback', {
          ...d, rating: Number(d.rating), page: (location.pathname + location.search).slice(0, 200),
          device: w < 640 ? 'mobile' : w < 1024 ? 'tablet' : 'desktop',
        });
        FA.store.set('feedbackSent', Date.now());
        FA.toast(res.message);
      },
    });
  }
  FA.openFeedback = openFeedback;
  $(document).on('click', '[data-feedback]', openFeedback);

  /* ---------------- Compare restaurants (localStorage, max 3) ---------------- */
  FA.compare = {
    ids: () => FA.store.get('compare', []),
    has(id) { return this.ids().includes(Number(id)); },
    toggle(id) {
      id = Number(id);
      let list = this.ids();
      if (list.includes(id)) list = list.filter((x) => x !== id);
      else {
        if (list.length >= 3) { FA.toast('You can compare up to 3 restaurants', 'info'); return; }
        list.push(id);
      }
      FA.store.set('compare', list);
      this.paint();
      return list.includes(id);
    },
    clear() { FA.store.set('compare', []); this.paint(); },
    async paint() {
      const list = this.ids();
      $('[data-compare]').each((_, el) => {
        const on = list.includes(Number($(el).data('compare')));
        $(el).toggleClass('active', on).attr('aria-pressed', on);
      });
      $('[data-compare-label]').each((_, el) => $(el).text(list.includes(Number($(el).data('compare-label'))) ? 'Comparing' : 'Compare'));
      let $tray = $('.compare-tray');
      if (!list.length || location.pathname.startsWith('/compare')) { $tray.removeClass('show'); return; }
      if (!$tray.length) $tray = $('<div class="compare-tray" role="region" aria-label="Compare restaurants"></div>').appendTo('body');
      // fetch names/photos of the selected restaurants once
      const missing = list.filter((id) => !FA.compare.cache[id]);
      if (missing.length) {
        try { (await FA.api('GET', '/restaurants', { ids: missing.join(','), limit: 3 })).items.forEach((r) => { FA.compare.cache[r.id] = r; }); } catch (e) { /* ignore */ }
      }
      const slots = [0, 1, 2].map((i) => {
        const r = FA.compare.cache[list[i]];
        return r ? `<button class="slot filled" data-compare="${r.id}" title="Remove ${FA.esc(r.name)}">${r.image_url ? `<img src="${FA.esc(r.image_url)}" alt="">` : FA.esc(r.cuisine_emoji)}<span class="x">×</span></button>` : '<span class="slot">+</span>';
      }).join('');
      $tray.html(`<div class="slots">${slots}</div><div class="txt"><b>${list.length} of 3</b><small>selected to compare</small></div>
        <a href="/compare" class="btn btn-primary btn-sm" ${list.length < 2 ? 'aria-disabled="true" tabindex="-1"' : ''}>Compare</a>
        <button class="btn btn-ghost btn-icon btn-sm" data-compare-clear aria-label="Clear comparison">${FA.icon('x')}</button>`);
      requestAnimationFrame(() => $tray.addClass('show'));
    },
    cache: {},
  };
  $(document).on('click', '[data-compare]', function (e) {
    e.preventDefault(); e.stopPropagation();
    const on = FA.compare.toggle($(this).data('compare'));
    if (on) FA.toast(FA.compare.ids().length < 2 ? 'Added — pick one more restaurant to compare' : 'Added to comparison', 'info');
  });
  $(document).on('click', '[data-compare-clear]', () => FA.compare.clear());
  $(document).on('click', '.compare-tray a[aria-disabled]', (e) => { e.preventDefault(); FA.toast('Choose at least 2 restaurants', 'info'); });

  /* ---------------- 3D tilt + spotlight on cards (mouse only) ---------------- */
  if (window.matchMedia('(hover: hover) and (pointer: fine)').matches && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    $(document).on('mousemove', '.r-card, .cuisine-tile', function (e) {
      const r = this.getBoundingClientRect();
      const px = (e.clientX - r.left) / r.width;
      const py = (e.clientY - r.top) / r.height;
      this.style.setProperty('--rx', ((0.5 - py) * 7).toFixed(2) + 'deg');
      this.style.setProperty('--ry', ((px - 0.5) * 9).toFixed(2) + 'deg');
      this.style.setProperty('--mx', (px * 100).toFixed(1) + '%');
      this.style.setProperty('--my', (py * 100).toFixed(1) + '%');
    });
    $(document).on('mouseleave', '.r-card, .cuisine-tile', function () {
      this.style.setProperty('--rx', '0deg');
      this.style.setProperty('--ry', '0deg');
    });
  }

  /* ---------------- Confetti (tiny canvas animation, no library) ---------------- */
  FA.confetti = function (x = window.innerWidth / 2, y = window.innerHeight / 2.5) {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const canvas = document.createElement('canvas');
    canvas.className = 'confetti';
    canvas.width = window.innerWidth; canvas.height = window.innerHeight;
    document.body.appendChild(canvas);
    const ctx = canvas.getContext('2d');
    const colors = ['#e4572e', '#f5a524', '#23865a', '#2f6fdb', '#7752d1', '#ff8fab'];
    const parts = Array.from({ length: 140 }, () => ({
      x, y, r: 3 + Math.random() * 4, c: colors[Math.floor(Math.random() * colors.length)],
      vx: (Math.random() - 0.5) * 14, vy: -6 - Math.random() * 10, rot: Math.random() * 6, vr: (Math.random() - 0.5) * 0.3,
    }));
    let frame = 0;
    (function draw() {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      parts.forEach((p) => {
        p.vy += 0.35; p.vx *= 0.99; p.x += p.vx; p.y += p.vy; p.rot += p.vr;
        ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot); ctx.fillStyle = p.c;
        ctx.globalAlpha = Math.max(0, 1 - frame / 110); ctx.fillRect(-p.r, -p.r / 2, p.r * 2, p.r); ctx.restore();
      });
      if (++frame < 110) requestAnimationFrame(draw); else canvas.remove();
    })();
  };

  /* ---------------- Quick search palette: Ctrl/⌘ + K ---------------- */
  function openPalette() {
    if ($('.palette').length) return;
    const user = FA.auth.user();
    const pages = [
      ['🏠', 'Home', '/'], ['🍽️', 'All restaurants', '/restaurants'], ['🥗', 'Search dishes', '/restaurants?mode=dishes'],
      ['🟢', 'Open now', '/restaurants?openNow=1'], ['🎲', 'What should I eat? (roulette)', '/#roulette'], ['⚖️', 'Compare restaurants', '/compare'],
      ...(user ? [['👤', 'My profile', '/profile'], ['💛', 'My favourites', '/profile#favorites']] : [['🔑', 'Log in', '/login'], ['✨', 'Create account', '/register']]),
      ...(user && user.role === 'owner' ? [['👨‍🍳', 'Owner dashboard', '/owner'], ['📋', 'Edit my menu', '/owner#menu']] : []),
      ...(user && user.role === 'admin' ? [['🛡️', 'Admin panel', '/admin'], ['🚩', 'Reports queue', '/admin#reports'], ['💬', 'Site feedback', '/admin#feedback']] : []),
    ];
    const $p = $(`
      <div class="palette-backdrop"><div class="palette" role="dialog" aria-label="Quick search">
        <div class="palette-input">${FA.icon('search')}<input type="text" placeholder="Search restaurants, dishes, cuisines or pages…" aria-label="Quick search" autocomplete="off"><kbd>Esc</kbd></div>
        <div class="palette-list" role="listbox"></div>
        <div class="palette-foot"><span><kbd>↑</kbd><kbd>↓</kbd> navigate</span><span><kbd>Enter</kbd> open</span></div>
      </div></div>`).appendTo('body');
    const $in = $p.find('input');
    const $list = $p.find('.palette-list');
    let idx = 0;
    const item = (ico, title, sub, href) => `<a class="p-item" href="${href}"><span class="p-ico">${ico}</span><span>${title}${sub ? `<small>${sub}</small>` : ''}</span></a>`;
    const highlight = () => $list.find('.p-item').removeClass('hl').eq(idx).addClass('hl')[0]?.scrollIntoView({ block: 'nearest' });
    function renderPages(q = '') {
      const list = pages.filter((p) => p[1].toLowerCase().includes(q.toLowerCase()));
      return list.length ? `<h6>Pages</h6>${list.map(([i, t, h]) => item(i, FA.esc(t), '', h)).join('')}` : '';
    }
    const search = FA.debounce(async (q) => {
      let html = renderPages(q);
      if (q.length >= 2) {
        try {
          const r = await FA.api('GET', '/restaurants/suggest', { q });
          if ($in.val().trim() !== q) return;
          if (r.restaurants.length) html = `<h6>Restaurants</h6>${r.restaurants.map((x) => item('🏪', FA.esc(x.name), `${FA.esc(x.cuisine)} · ${FA.esc(x.city)}`, `/restaurant?id=${x.id}`)).join('')}` + html;
          if (r.dishes.length) html += `<h6>Dishes</h6>${r.dishes.map((x) => item('🍲', FA.esc(x.name), 'at ' + FA.esc(x.restaurant), `/restaurant?id=${x.restaurant_id}#menu`)).join('')}`;
          if (r.cuisines.length) html += `<h6>Cuisines</h6>${r.cuisines.map((x) => item(FA.esc(x.emoji), FA.esc(x.name), '', `/restaurants?cuisine=${x.id}`)).join('')}`;
        } catch (e) { /* offline */ }
        html += `<h6>Search</h6>${item('🔍', `Search everything for “${FA.esc(q)}”`, '', `/restaurants?q=${encodeURIComponent(q)}`)}`;
      }
      $list.html(html || '<p class="muted" style="padding:14px">Nothing found</p>');
      idx = 0; highlight();
    }, 160);
    const close = () => { $p.removeClass('open'); setTimeout(() => $p.remove(), 200); $(document).off('keydown.palette'); };
    $list.html(renderPages()); highlight();
    $in.trigger('focus');
    requestAnimationFrame(() => $p.addClass('open'));
    $in.on('input', () => search($in.val().trim()));
    $p.on('click', (e) => { if (e.target === $p[0]) close(); });
    $p.on('click', '.p-item', close);
    $(document).on('keydown.palette', (e) => {
      const $items = $list.find('.p-item');
      if (e.key === 'Escape') close();
      else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); idx = (idx + (e.key === 'ArrowDown' ? 1 : -1) + $items.length) % $items.length; highlight(); }
      else if (e.key === 'Enter' && $items.length) { e.preventDefault(); $items.eq(idx)[0].click(); }
    });
  }
  FA.openPalette = openPalette;
  $(document).on('click', '[data-palette]', openPalette);
  $(document).on('keydown', (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); openPalette(); }
  });

  /* ---------------- Boot ---------------- */
  FA.ready = (async function () {
    await new Promise((r) => $(r));
    FA.renderHeader();
    FA.renderFooter();
    if (!$('.feedback-fab').length && !/\/(login|register)/.test(location.pathname)) {
      $('body').append(`<button type="button" class="feedback-fab" data-feedback aria-label="Send feedback">💬 <span class="lbl">Feedback</span></button>`);
    }
    prepare(document.body);
    if (FA.auth.token()) {
      try {
        const { user } = await FA.api('GET', '/auth/me');
        FA.auth.setUser(user);
      } catch (e) {
        if (e.status === 401) FA.auth.clear();
      }
      FA.renderHeader();
    }
    await FA.fav.load();
    FA.compare.paint();
  })();
})(jQuery, window, document);
