/* Explore page — FR2 search & filter (restaurants and dishes).
   The filter state lives in the URL query string, so every result page can be
   bookmarked or shared; the preferred grid/list layout is kept in localStorage. */
$(async function () {
  'use strict';

  const SORTS = {
    restaurants: [['recommended', 'Recommended'], ['rating', 'Highest rated'], ['reviews', 'Most reviewed'], ['price_asc', 'Price: low to high'], ['price_desc', 'Price: high to low'], ['name', 'Name A–Z'], ['newest', 'Newest']],
    dishes: [['recommended', 'Recommended'], ['price_asc', 'Price: low to high'], ['price_desc', 'Price: high to low'], ['calories_asc', 'Fewest calories'], ['protein_desc', 'Most protein'], ['name', 'Name A–Z']],
  };
  const FIELDS = ['q', 'city', 'cuisine', 'category', 'minRating', 'price', 'maxPrice', 'openNow', 'vegetarian', 'spicy', 'for', 'maxCalories', 'free', 'sort', 'page'];
  const FOR_LABELS = { sport: '💪 High protein', light: '🥗 Light', kids: '👶 Kids', sharing: '👥 Sharing', halal: '✅ Halal', vegan: '🌱 Vegan', gluten_free: '🌾 Gluten-free' };
  let meta = { cuisines: [], cities: [] };
  let state = readUrl();
  let request = 0;

  function readUrl() {
    const p = new URLSearchParams(window.location.search);
    const s = { mode: p.get('mode') === 'dishes' ? 'dishes' : 'restaurants' };
    FIELDS.forEach((f) => { if (p.get(f)) s[f] = p.get(f); });
    return s;
  }
  function writeUrl() {
    const p = new URLSearchParams();
    if (state.mode === 'dishes') p.set('mode', 'dishes');
    FIELDS.forEach((f) => { if (state[f] && !(f === 'page' && state[f] == 1)) p.set(f, state[f]); });
    history.replaceState(null, '', '/restaurants' + (p.toString() ? '?' + p : ''));
  }

  /* ---------- form <-> state ---------- */
  function paintForm() {
    const dishes = state.mode === 'dishes';
    $('[data-mode]').removeClass('active').attr('aria-selected', false).filter(`[data-mode=${state.mode}]`).addClass('active').attr('aria-selected', true);
    $('[data-for=dishes]').toggle(dishes);
    $('[data-for=restaurants]').toggle(!dishes);
    $('#pageTitle').text(dishes ? 'Search dishes' : 'Explore restaurants');
    $('#crumb').text(dishes ? 'Dishes' : 'Restaurants');
    $('#pageSub').text(dishes ? 'Find a specific dish across every menu — filter by price, diet and spice.' : 'Filter by cuisine, city, rating and price to find the perfect place.');
    document.title = (dishes ? 'Search dishes' : 'Explore restaurants') + ' — Food Advisor';

    $('#fQ').val(state.q || '');
    $('#fCity').val(state.city || '');
    $('#fCuisine').val(state.cuisine || '');
    $('#fCategory').val(state.category || '');
    $(`[name=minRating][value="${state.minRating || ''}"]`).prop('checked', true);
    const prices = (state.price || '').split(',');
    $('#fPrice button').each(function () {
      const on = prices.includes(String($(this).data('price')));
      $(this).toggleClass('active', on).attr('aria-pressed', on);
    });
    $('#fMaxPrice').val(state.maxPrice || 15000);
    $('#maxPriceOut').text(state.maxPrice ? 'up to ' + FA.money(state.maxPrice) : 'Any');
    $('#fFor').val(state.for || '');
    $('#fMaxKcal').val(state.maxCalories || 1500);
    $('#maxKcalOut').text(state.maxCalories ? `≤ ${state.maxCalories} kcal` : 'Any');
    const free = (state.free || '').split(',');
    $('#fFree [data-free]').each(function () { $(this).toggleClass('active', free.includes($(this).data('free'))); });
    $('#fOpen').prop('checked', state.openNow === '1');
    $('#fVeg').prop('checked', state.vegetarian === '1');
    $('#fSpicy').prop('checked', state.spicy === '1');

    $('#sort').html(SORTS[state.mode].map(([v, l]) => `<option value="${v}">${l}</option>`).join('')).val(state.sort || 'recommended');
    const view = FA.store.get('viewMode', 'grid');
    $('#viewToggle button').each(function () { $(this).toggleClass('active', $(this).data('view') === view); });
    $('#results').toggleClass('list-view', view === 'list' && !dishes);
  }

  function set(changes, keepPage) {
    Object.assign(state, changes);
    Object.keys(state).forEach((k) => { if (state[k] === '' || state[k] === null || state[k] === false) delete state[k]; });
    if (!keepPage) delete state.page;
    writeUrl();
    paintForm();
    load();
  }

  /* ---------- active filter chips ---------- */
  function paintChips() {
    const chips = [];
    const chip = (key, label) => chips.push(`<button type="button" class="chip chip-sm" data-remove="${key}">${label} <span class="x" aria-hidden="true">×</span><span class="sr-only">remove filter</span></button>`);
    if (state.q) chip('q', `“${FA.esc(state.q)}”`);
    if (state.city) chip('city', '📍 ' + FA.esc(state.city));
    if (state.cuisine) { const c = meta.cuisines.find((x) => String(x.id) === String(state.cuisine)); if (c) chip('cuisine', `${FA.esc(c.emoji)} ${FA.esc(c.name)}`); }
    if (state.minRating) chip('minRating', `★ ${state.minRating}+`);
    if (state.mode === 'restaurants') {
      if (state.price) chip('price', state.price.split(',').map((n) => '₸'.repeat(n)).join(' / '));
      if (state.openNow) chip('openNow', '🟢 Open now');
    } else {
      if (state.category) chip('category', FA.esc(state.category));
      if (state.maxPrice) chip('maxPrice', '≤ ' + FA.money(state.maxPrice));
      if (state.vegetarian) chip('vegetarian', '🌿 Vegetarian');
      if (state.spicy) chip('spicy', '🌶️ Spicy');
      if (state.for) chip('for', FOR_LABELS[state.for] || FA.esc(state.for));
      if (state.maxCalories) chip('maxCalories', `≤ ${state.maxCalories} kcal`);
      if (state.free) chip('free', 'No ' + FA.esc(state.free.split(',').join(', ')));
    }
    if (chips.length > 1) chips.push('<button type="button" class="btn btn-ghost btn-xs" data-remove="all">Clear all</button>');
    $('#activeFilters').html(chips.join(''));
  }

  /* ---------- results ---------- */
  async function load() {
    const id = ++request;
    const dishes = state.mode === 'dishes';
    paintChips();
    $('#results').html(dishes ? '<div class="d-grid">' + Array(6).fill('<div class="skeleton" style="height:122px;border-radius:14px"></div>').join('') + '</div>' : `<div class="r-grid">${FA.skeletonCards(6)}</div>`);
    const params = { ...state, limit: dishes ? 12 : 9 };
    delete params.mode;
    if (dishes) { delete params.price; delete params.openNow; } else { ['category', 'maxPrice', 'vegetarian', 'spicy', 'for', 'maxCalories', 'free'].forEach((k) => delete params[k]); }
    try {
      const res = await FA.api('GET', dishes ? '/dishes' : '/restaurants', params);
      if (id !== request) return; // a newer request is on its way
      const noun = dishes ? 'dish' : 'restaurant';
      $('#resultCount').html(`<b>${res.total}</b> ${noun}${res.total === 1 ? '' : dishes ? 'es' : 's'} found`);
      if (!res.items.length) {
        $('#results').html(FA.empty('🔍', 'Nothing matches these filters', 'Try removing a filter or searching for something else.', '<button class="btn btn-primary" data-remove="all">Clear all filters</button>'));
      } else if (dishes) {
        $('#results').html(`<div class="d-grid">${res.items.map((d) => FA.dishCard(d, { showRestaurant: true })).join('')}</div>`);
      } else {
        $('#results').html(`<div class="r-grid">${res.items.map(FA.restaurantCard).join('')}</div>`);
      }
      paintPagination(res.page, res.pages);
    } catch (err) {
      $('#resultCount').text('');
      $('#results').html(FA.empty('⚠️', 'Something went wrong', FA.esc(err.message)));
    }
  }

  function paintPagination(page, pages) {
    if (pages <= 1) return $('#pagination').empty();
    const btn = (p, label, extra = '') => `<button type="button" data-page="${p}" ${extra}>${label}</button>`;
    let html = btn(page - 1, '‹', `aria-label="Previous page" ${page === 1 ? 'disabled' : ''}`);
    for (let p = 1; p <= pages; p++) {
      if (p === 1 || p === pages || Math.abs(p - page) <= 1) html += btn(p, p, p === page ? 'class="active" aria-current="page"' : '');
      else if (Math.abs(p - page) === 2) html += '<button type="button" disabled>…</button>';
    }
    html += btn(page + 1, '›', `aria-label="Next page" ${page === pages ? 'disabled' : ''}`);
    $('#pagination').html(html);
  }

  /* ---------- events ---------- */
  $('[data-mode]').on('click', function () {
    const mode = $(this).data('mode');
    if (mode !== state.mode) set({ mode, sort: '' });
  });
  const searchNow = (q) => { FA.recent.addSearch(q); set({ q }); };
  FA.attachSuggest($('#fQ'), searchNow);
  $('#fQ').on('input', FA.debounce(function () { const q = this.value.trim(); if (q.length !== 1) set({ q }); }, 450));
  $('#fQ').on('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); searchNow(this.value.trim()); } });
  $('#fQ').on('change', function () { FA.recent.addSearch(this.value); });
  $('#filterForm').on('submit', (e) => e.preventDefault());
  $('#fCity').on('change', function () { set({ city: this.value }); });
  $('#fCuisine').on('change', function () { set({ cuisine: this.value }); });
  $('#fCategory').on('change', function () { set({ category: this.value }); });
  $('[name=minRating]').on('change', function () { set({ minRating: this.value }); });
  $('#fPrice').on('click', 'button', function () {
    const p = String($(this).data('price'));
    const list = (state.price || '').split(',').filter(Boolean);
    const next = list.includes(p) ? list.filter((x) => x !== p) : [...list, p].sort();
    set({ price: next.join(',') });
  });
  $('#fMaxPrice').on('input', function () { $('#maxPriceOut').text(this.value == 15000 ? 'Any' : 'up to ' + FA.money(this.value)); });
  $('#fMaxPrice').on('change', function () { set({ maxPrice: this.value == 15000 ? '' : this.value }); });
  $('#fOpen').on('change', function () { set({ openNow: this.checked ? '1' : '' }); });
  $('#fFor').on('change', function () { set({ for: this.value }); });
  $('#fMaxKcal').on('input', function () { $('#maxKcalOut').text(this.value == 1500 ? 'Any' : `≤ ${this.value} kcal`); });
  $('#fMaxKcal').on('change', function () { set({ maxCalories: this.value == 1500 ? '' : this.value }); });
  $('#fFree').on('click', '[data-free]', function () {
    const a = $(this).data('free');
    const list = (state.free || '').split(',').filter(Boolean);
    set({ free: (list.includes(a) ? list.filter((x) => x !== a) : [...list, a]).join(',') });
  });
  $('#fVeg').on('change', function () { set({ vegetarian: this.checked ? '1' : '' }); });
  $('#fSpicy').on('change', function () { set({ spicy: this.checked ? '1' : '' }); });
  $('#sort').on('change', function () { set({ sort: this.value === 'recommended' ? '' : this.value }); });
  $(document).on('click', '[data-remove]', function () {
    const key = $(this).data('remove');
    if (key === 'all') set(Object.fromEntries(FIELDS.map((f) => [f, ''])));
    else set({ [key]: '' });
  });
  $('#resetFilters').on('click', () => set(Object.fromEntries(FIELDS.map((f) => [f, '']))));
  $('#pagination').on('click', 'button[data-page]:not(:disabled)', function () {
    set({ page: $(this).data('page') }, true);
    $('html, body').animate({ scrollTop: $('.toolbar').offset().top - 90 }, 250);
  });
  $('#viewToggle button').each(function () { $(this).html(FA.icon($(this).data('view'))); });
  $('#viewToggle').on('click', 'button', function () {
    FA.store.set('viewMode', $(this).data('view'));
    paintForm();
  });
  // mobile filter drawer
  const toggleDrawer = (open) => { $('#filters, .filters-backdrop').toggleClass('open', open); $('body').css('overflow', open ? 'hidden' : ''); };
  $('#openFilters').on('click', () => toggleDrawer(true)).prepend(FA.icon('filter') + ' ');
  $('#applyMobile, .filters-backdrop').on('click', () => toggleDrawer(false));

  /* ---------- boot ---------- */
  paintForm();
  load();
  try {
    meta = await FA.api('GET', '/meta');
    meta.cities.forEach((c) => $('#fCity').append(`<option value="${FA.esc(c.city)}">${FA.esc(c.city)} (${c.restaurant_count})</option>`));
    meta.cuisines.forEach((c) => $('#fCuisine').append(`<option value="${c.id}">${FA.esc(c.emoji)} ${FA.esc(c.name)} (${c.restaurant_count})</option>`));
    paintForm();
    paintChips();
  } catch (e) { /* filters still work without counts */ }
});
