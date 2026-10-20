/* Home page: hero search, headline stats, featured / top-rated lists,
   cuisines, popular dishes and "recently viewed" from localStorage. */
$(async function () {
  'use strict';

  const $q = $('#heroQ');
  const go = (q) => {
    const params = new URLSearchParams();
    if (q) { params.set('q', q); FA.recent.addSearch(q); }
    if ($('#heroCity').val()) params.set('city', $('#heroCity').val());
    window.location.href = '/restaurants' + (params.toString() ? '?' + params : '');
  };
  FA.attachSuggest($q, go);
  $('#heroSearch').on('submit', (e) => { e.preventDefault(); go($q.val().trim()); });

  // skeletons while loading
  $('#featuredGrid').html(FA.skeletonCards(4));
  $('#topGrid').html(FA.skeletonCards(4));

  // Recently viewed (Web Storage)
  function renderRecent() {
    const list = FA.recent.views();
    $('#recentSection').toggleClass('hidden', !list.length);
    if (!list.length) return;
    FA.api('GET', '/restaurants', { ids: list.map((r) => r.id).join(','), limit: 8 }).then((res) => {
      const byId = Object.fromEntries(res.items.map((r) => [r.id, r]));
      const ordered = list.map((r) => byId[r.id]).filter(Boolean).slice(0, 4);
      $('#recentSection').toggleClass('hidden', !ordered.length);
      $('#recentGrid').html(ordered.map(FA.restaurantCard).join(''));
    }).catch(() => {});
  }
  renderRecent();
  $('#clearRecent').on('click', () => { FA.recent.clearViews(); renderRecent(); FA.toast('Viewing history cleared', 'info'); });

  try {
    const [meta, featured, top, dishes] = await Promise.all([
      FA.api('GET', '/meta'),
      FA.api('GET', '/restaurants', { sort: 'recommended', limit: 8 }),
      FA.api('GET', '/restaurants', { sort: 'rating', limit: 4 }),
      FA.api('GET', '/dishes', { sort: 'rating', limit: 50 }),
    ]);

    // animated counters
    Object.entries(meta.stats).forEach(([key, value]) => {
      const $el = $(`[data-stat="${key}"]`);
      $({ n: 0 }).animate({ n: value }, { duration: 900, easing: 'swing', step: (n) => $el.text(Math.round(n)), complete: () => $el.text(value) });
    });

    meta.cities.forEach((c) => $('#heroCity').append(`<option value="${FA.esc(c.city)}">${FA.esc(c.city)} (${c.restaurant_count})</option>`));
    const popular = meta.cuisines.filter((c) => c.restaurant_count > 0).sort((a, b) => b.restaurant_count - a.restaurant_count || a.name.localeCompare(b.name));
    popular.slice(0, 5).forEach((c) => $('#heroChips').append(`<a class="chip chip-sm" href="/restaurants?cuisine=${c.id}">${FA.esc(c.emoji)} ${FA.esc(c.name)}</a>`));
    $('#heroChips').append(`<a class="chip chip-sm" href="/restaurants?openNow=1">🟢 Open now</a>`);

    $('#cuisineGrid').html(popular.map((c) => `
      <a class="cuisine-tile" href="/restaurants?cuisine=${c.id}">
        <span class="emoji">${FA.esc(c.emoji)}</span><b>${FA.esc(c.name)}</b>
        <small>${c.restaurant_count} restaurant${c.restaurant_count > 1 ? 's' : ''}</small>
      </a>`).join(''));

    $('#featuredGrid').html(featured.items.map(FA.restaurantCard).join(''));
    $('#topGrid').html(top.items.map(FA.restaurantCard).join(''));
    // one photographed signature dish per restaurant, best-rated kitchens first
    const seen = new Set();
    const signature = dishes.items.filter((d) => d.image_url && !seen.has(d.restaurant_id) && seen.add(d.restaurant_id)).slice(0, 6);
    $('#dishGrid').html(signature.map((d) => FA.dishCard(d, { showRestaurant: true })).join(''));
  } catch (err) {
    $('#featuredGrid, #topGrid').html(FA.empty('⚠️', 'Could not load restaurants', FA.esc(err.message)));
  }
});
