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

  // rotating word in the headline
  const $words = $('.rotator > span');
  let w = 0;
  if ($words.length > 1 && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    setInterval(() => {
      const $cur = $words.eq(w);
      $cur.removeClass('on').addClass('out');
      setTimeout(() => $cur.removeClass('out'), 600);
      w = (w + 1) % $words.length;
      $words.eq(w).addClass('on');
    }, 2400);
  }

  /* ---------- "What should I eat?" roulette ---------- */
  let spinning = false;
  const reelItem = (d) => `<div class="reel-item">${d.image_url ? `<img src="${FA.esc(d.image_url)}" alt="">` : '<span class="ph">🍽️</span>'}
    <div><b>${FA.esc(d.name)}</b><small>${FA.esc(d.restaurant)} · ${FA.money(d.price)}${d.calories ? ' · ' + d.calories + ' kcal' : ''}</small></div></div>`;
  // remember the last choices (Web Storage)
  const prefs = FA.store.get('roulettePrefs', {});
  ['rCity', 'rBudget', 'rFor', 'rCategory'].forEach((id) => { if (prefs[id] !== undefined) $('#' + id).val(prefs[id]); });

  $('#spinBtn').on('click', async function () {
    if (spinning) return;
    spinning = true;
    const $btn = $(this).prop('disabled', true);
    $('#rResult').removeClass('show').empty();
    const p = { rCity: $('#rCity').val(), rBudget: $('#rBudget').val(), rFor: $('#rFor').val(), rCategory: $('#rCategory').val() };
    FA.store.set('roulettePrefs', p);
    try {
      const res = await FA.api('GET', '/dishes', { sort: 'random', limit: 14, city: p.rCity, maxPrice: p.rBudget, for: p.rFor, category: p.rCategory });
      if (!res.items.length) {
        $('#reel').empty();
        $('.reel-window').addClass('idle');
        $('#reelEmpty').show().html('<div><span class="big">🤷</span>No dishes match these settings — try a bigger budget or another mood.</div>');
        return;
      }
      $('#reelEmpty').hide();
      $('.reel-window').removeClass('idle');
      const pick = res.items[0];
      // build a long strip: random dishes repeated, the winner placed near the end
      const strip = [];
      for (let i = 0; i < 26; i++) strip.push(res.items[(i % (res.items.length - 1 || 1)) + (res.items.length > 1 ? 1 : 0)] || pick);
      strip.push(pick, res.items[1] || pick, res.items[2] || pick);
      const $reel = $('#reel').html(strip.map(reelItem).join(''));
      const itemH = 120;
      const winH = $('.reel-window').height();
      const target = (strip.length - 3) * itemH - (winH / 2 - itemH / 2);
      $reel.css({ transition: 'none', transform: 'translateY(0)' });
      void $reel[0].offsetHeight;
      $reel.css({ transition: 'transform 3.2s cubic-bezier(0.12, 0.8, 0.12, 1)', transform: `translateY(${-target}px)` });
      await new Promise((r) => setTimeout(r, 3300));
      FA.dishCache[pick.id] = pick;
      $('#rResult').html(`
        <span class="reason-chip">🎉 Your pick: ${FA.esc(pick.name)}</span>
        <button class="btn btn-dark btn-sm" data-dish="${pick.id}">See nutrition &amp; details</button>
        <a class="btn btn-sm" href="/restaurant?id=${pick.restaurant_id}#menu">Go to ${FA.esc(pick.restaurant)}</a>`).addClass('show');
      const box = $('.reel-window')[0].getBoundingClientRect();
      FA.confetti(box.left + box.width / 2, box.top + box.height / 2);
    } catch (err) {
      FA.toast(err.message, 'error');
    } finally {
      spinning = false;
      $btn.prop('disabled', false);
    }
  });

  /* ---------- "Picked for you" — cuisines from favourites + recently viewed ---------- */
  async function loadForYou() {
    const views = FA.recent.views();
    const favIds = [...FA.fav.ids];
    const counts = {};
    const names = {};
    views.forEach((v) => { if (v.cuisine_id) { counts[v.cuisine_id] = (counts[v.cuisine_id] || 0) + 1; names[v.cuisine_id] = v.cuisine; } });
    if (favIds.length) {
      try {
        (await FA.api('GET', '/restaurants', { ids: favIds.slice(0, 20).join(','), limit: 20 })).items.forEach((r) => {
          counts[r.cuisine_id] = (counts[r.cuisine_id] || 0) + 2; // a favourite counts double
          names[r.cuisine_id] = r.cuisine;
        });
      } catch (e) { /* ignore */ }
    }
    const top = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([id]) => id);
    if (!top.length) return;
    const seen = [...new Set([...favIds, ...views.map((v) => v.id)])];
    let res = await FA.api('GET', '/restaurants', { cuisines: top.join(','), exclude: seen.join(','), sort: 'rating', limit: 4 });
    if (res.items.length < 2) res = await FA.api('GET', '/restaurants', { cuisines: top.join(','), sort: 'rating', limit: 4 });
    if (!res.items.length) return;
    $('#forYouWhy').html(`Because you like <b>${top.map((id) => FA.esc(names[id])).join(', ')}</b> — saved and viewed on this device.`);
    $('#forYouGrid').html(res.items.map(FA.restaurantCard).join(''));
    $('#forYouSection').removeClass('hidden');
  }
  FA.ready.then(loadForYou).catch(() => {});

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
    meta.cities.forEach((c) => $('#rCity').append(`<option value="${FA.esc(c.city)}">📍 ${FA.esc(c.city)}</option>`));
    if (prefs.rCity) $('#rCity').val(prefs.rCity);
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
