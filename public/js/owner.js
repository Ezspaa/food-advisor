/* Owner dashboard — FR8 manage own restaurants, FR9 manage dishes,
   FR10 view reviews & average rating (plus public replies). */
$(async function () {
  'use strict';

  if (!(await FA.guard(['owner']))) return;
  const me = FA.auth.user();
  let restaurants = [];
  let dishes = [];
  let cuisines = [];
  let ownerReviews = [];

  const SECTIONS = [['overview', 'Overview', 'chart'], ['restaurants', 'My restaurants', 'store'], ['menu', 'Menu', 'utensils'], ['reviews', 'Reviews', 'message']];

  function renderNav(unanswered = 0) {
    const cur = current();
    $('#dashNav').html(`
      <div class="who">${FA.avatar(me.name, me.avatar_url)}<div><b>${FA.esc(me.name)}</b><small>Restaurant owner</small></div></div>
      ${SECTIONS.map(([k, l, i]) => `<a href="#${k}" data-nav="${k}" class="${cur === k ? 'active' : ''}">${FA.icon(i)} ${l}${k === 'reviews' && unanswered ? `<span class="pill" title="Unanswered">${unanswered}</span>` : ''}</a>`).join('')}
      <a href="/profile">${FA.icon('user')} My profile</a>
      <button type="button" class="nav-item" data-logout>${FA.icon('logout')} Log out</button>`);
  }
  function current() { const h = location.hash.slice(1); return SECTIONS.some(([k]) => k === h) ? h : 'overview'; }
  function show() {
    const s = current();
    $('[data-nav]').removeClass('active').filter(`[data-nav=${s}]`).addClass('active');
    $('.dash-section').removeClass('active').filter(`[data-section=${s}]`).addClass('active');
    if (s === 'overview') loadOverview();
    if (s === 'restaurants') loadRestaurants();
    if (s === 'menu') loadMenu();
    if (s === 'reviews') loadReviews();
  }
  $(window).on('hashchange', show);

  /* ---------- Overview ---------- */
  async function loadOverview() {
    $('#hello').text(`Hello, ${me.name.split(' ')[0]} 👋`);
    const o = await FA.api('GET', '/owner/overview');
    const t = o.totals;
    renderNav(t.unanswered || 0);
    const kpi = (ico, color, label, value, sub) => `<div class="kpi"><div class="top">${label}<span class="ico ${color}">${FA.icon(ico)}</span></div><b>${value}</b><small>${sub}</small></div>`;
    $('#kpis').html(
      kpi('store', '', 'Restaurants', t.restaurants || 0, `${t.approved || 0} live · ${t.pending || 0} awaiting approval`) +
      kpi('star', 'amber', 'Average rating', t.avg_rating ? Number(t.avg_rating).toFixed(2) : '—', 'Across all visible reviews') +
      kpi('message', 'blue', 'Reviews', t.reviews || 0, `${t.unanswered || 0} without a reply`) +
      kpi('heart', 'purple', 'Saved by guests', t.favorites || 0, `${t.dishes || 0} dishes on your menus`));

    // reviews per month (last 6 months, including empty months)
    const months = [];
    for (let i = 5; i >= 0; i--) { const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - i); months.push(d.toISOString().slice(0, 7)); }
    const byMonth = Object.fromEntries(o.monthly.map((m) => [m.month, m.count]));
    const max = Math.max(1, ...months.map((m) => byMonth[m] || 0));
    $('#monthChart').html(months.map((m) => `<div class="col"><div class="bar" style="height:0" data-h="${((byMonth[m] || 0) / max) * 100}"><span>${byMonth[m] || 0}</span></div><label>${FA.monthLabel(m)}</label></div>`).join(''));
    const total = Object.values(o.ratings).reduce((a, b) => a + b, 0) || 1;
    $('#ratingBars').html([5, 4, 3, 2, 1].map((n) => `<div class="row"><span>${n} ★</span><span class="track"><span style="width:0;background:var(--star)" data-w="${(o.ratings[n] / total) * 100}"></span></span><span class="n">${o.ratings[n]}</span></div>`).join(''));
    requestAnimationFrame(() => {
      $('#monthChart .bar').each(function () { $(this).css('height', $(this).data('h') + '%'); });
      $('#ratingBars [data-w]').each(function () { $(this).css('width', $(this).data('w') + '%'); });
    });

    $('#recent').html(o.recent.length ? o.recent.map((rv) => `
      <div class="mini-review"><div class="top"><span><b>${FA.esc(rv.author)}</b> on <a href="/restaurant?id=${rv.restaurant_id}#reviews">${FA.esc(rv.restaurant)}</a></span><span>${FA.timeAgo(rv.created_at)}</span></div>
        <div style="margin-top:6px">${FA.stars(rv.rating)} <b>${FA.esc(rv.title)}</b> ${rv.owner_reply ? '<span class="badge badge-green">Replied</span>' : '<span class="badge badge-amber">Needs reply</span>'}</div>
        <p>${FA.esc(rv.comment)}</p></div>`).join('')
      : FA.empty('💬', 'No reviews yet', 'Reviews from guests will appear here.'));
    if (!t.restaurants) {
      $('#recent').html(FA.empty('🏪', 'Add your first restaurant', 'Create a page for your restaurant — an administrator will approve it shortly.', '<button class="btn btn-primary" data-add-restaurant>+ Add restaurant</button>'));
    }
  }

  /* ---------- Restaurants (FR8) ---------- */
  async function loadRestaurants() {
    $('#restaurantList').html('<div class="card-body"><div class="skeleton" style="height:120px"></div></div>');
    restaurants = (await FA.api('GET', '/owner/restaurants')).items;
    if (!restaurants.length) {
      return $('#restaurantList').html(FA.empty('🏪', 'You have no restaurants yet', 'Add your restaurant to start receiving reviews.', '<button class="btn btn-primary" data-add-restaurant>+ Add restaurant</button>'));
    }
    $('#restaurantList').html(restaurants.map((r) => `
      <div class="own-r-card">
        ${r.image_url ? `<img src="${FA.esc(r.image_url)}" alt="${FA.esc(r.name)}" data-fallback="${FA.esc(r.cuisine_emoji)}">` : `<div class="img-fallback" style="width:180px;height:120px;border-radius:12px">${FA.esc(r.cuisine_emoji)}</div>`}
        <div style="min-width:0">
          <h3>${FA.esc(r.name)} ${FA.statusBadge(r.status)} ${Number(r.is_featured) ? '<span class="badge badge-brand">Featured</span>' : ''}</h3>
          <div class="meta">${FA.esc(r.cuisine_emoji)} ${FA.esc(r.cuisine)} · ${FA.esc(r.address)}, ${FA.esc(r.city)} · ${'₸'.repeat(r.price_level)}</div>
          <div class="nums">
            <span>${FA.ratingPill(r.avg_rating, r.review_count)}</span>
            <span><b>${r.review_count}</b> reviews</span><span><b>${r.dish_count}</b> dishes</span><span><b>${r.favorite_count}</b> saves</span>
            <span>${FA.icon('clock')} ${r.opens_at ? `${r.opens_at}–${r.closes_at}` : 'Hours not set'}</span>
          </div>
          ${r.status === 'rejected' ? `<div class="alert alert-error" style="margin:12px 0 0;padding:10px 12px">${FA.icon('alert')}<span>Rejected by an administrator. Update the details to resubmit.</span></div>` : ''}
        </div>
        <div class="actions">
          <a class="btn btn-sm" href="/restaurant?id=${r.id}">${FA.icon('eye')} ${r.status === 'approved' ? 'View' : 'Preview'}</a>
          <button class="btn btn-sm" data-edit-restaurant="${r.id}">${FA.icon('edit')} Edit</button>
          <a class="btn btn-sm" href="#menu" data-menu-of="${r.id}">${FA.icon('utensils')} Menu</a>
          <button class="btn btn-sm btn-soft-danger" data-delete-restaurant="${r.id}">${FA.icon('trash')} Delete</button>
        </div>
      </div>`).join(''));
  }

  async function ensureCuisines() {
    if (!cuisines.length) cuisines = (await FA.api('GET', '/meta')).cuisines;
    return cuisines;
  }
  $(document).on('click', '[data-add-restaurant]', async () => {
    FA.restaurantModal({ cuisines: await ensureCuisines(), endpoint: '/owner/restaurants', method: 'POST', onDone: () => { location.hash = 'restaurants'; show(); } });
  });
  $(document).on('click', '[data-edit-restaurant]', async function () {
    const r = restaurants.find((x) => x.id === $(this).data('edit-restaurant'));
    FA.restaurantModal({ restaurant: r, cuisines: await ensureCuisines(), endpoint: '/owner/restaurants/' + r.id, method: 'PUT', onDone: loadRestaurants });
  });
  $(document).on('click', '[data-delete-restaurant]', async function () {
    const r = restaurants.find((x) => x.id === $(this).data('delete-restaurant'));
    const ok = await FA.confirm({ title: `Delete ${r.name}?`, message: `The restaurant, its <b>${r.dish_count} dishes</b> and <b>${r.review_count} reviews</b> will be permanently deleted.` });
    if (!ok) return;
    try { FA.toast((await FA.api('DELETE', '/owner/restaurants/' + r.id)).message); loadRestaurants(); } catch (e) { FA.toast(e.message, 'error'); }
  });
  $(document).on('click', '[data-menu-of]', function () { FA.session.set('ownerMenuRestaurant', $(this).data('menu-of')); });

  /* ---------- Menu (FR9) ---------- */
  async function loadMenu() {
    if (!restaurants.length) restaurants = (await FA.api('GET', '/owner/restaurants')).items;
    if (!restaurants.length) {
      $('#dishRows').html(`<tr><td colspan="6">${FA.empty('🏪', 'Add a restaurant first', 'Menus belong to restaurants.', '<button class="btn btn-primary" data-add-restaurant>+ Add restaurant</button>')}</td></tr>`);
      return $('#addDish').prop('disabled', true);
    }
    const selected = FA.session.get('ownerMenuRestaurant') || restaurants[0].id;
    $('#menuRestaurant').html(restaurants.map((r) => `<option value="${r.id}">${FA.esc(r.name)}</option>`).join('')).val(String(selected));
    if (!$('#menuRestaurant').val()) $('#menuRestaurant').val(String(restaurants[0].id));
    await loadDishes();
  }
  async function loadDishes() {
    const rid = Number($('#menuRestaurant').val());
    FA.session.set('ownerMenuRestaurant', rid);
    $('#dishRows').html('<tr><td colspan="6"><div class="skeleton" style="height:60px"></div></td></tr>');
    dishes = (await FA.api('GET', `/owner/restaurants/${rid}/dishes`)).items;
    renderDishes();
  }
  function renderDishes() {
    const q = $('#dishSearch').val().trim().toLowerCase();
    const cat = $('#dishCategory').val();
    const list = dishes.filter((d) => (!q || d.name.toLowerCase().includes(q)) && (!cat || d.category === cat));
    if (!list.length) return $('#dishRows').html(`<tr><td colspan="6">${FA.empty('🍽️', dishes.length ? 'No dishes match' : 'This menu is empty', dishes.length ? 'Try another search.' : 'Add your first dish so guests know what to order.')}</td></tr>`);
    $('#dishRows').html(list.map((d) => `
      <tr>
        <td><div class="cell-user">${d.image_url ? `<img class="thumb" src="${FA.esc(d.image_url)}" alt="" data-fallback-hide>` : '<span class="thumb" style="display:grid;place-items:center">🍽️</span>'}<div><b>${FA.esc(d.name)}</b><small class="text-clip" style="display:block;max-width:280px">${FA.esc(d.description || '')}</small></div></div></td>
        <td>${FA.esc(d.category)}</td>
        <td class="nowrap"><b>${FA.money(d.price)}</b>${d.calories ? `<br><small class="muted">${d.weight_g ? d.weight_g + ' g · ' : ''}${d.calories} kcal</small>` : ''}</td>
        <td>${Number(d.is_vegetarian) ? '<span class="badge badge-green">Veg</span> ' : ''}${Number(d.is_spicy) ? '<span class="badge badge-red">Spicy</span>' : ''}</td>
        <td><label class="switch"><input type="checkbox" data-avail="${d.id}" ${Number(d.is_available) ? 'checked' : ''} aria-label="Available"><span class="track"></span></label></td>
        <td><div class="actions"><button class="btn btn-xs" data-edit-dish="${d.id}">${FA.icon('edit')} Edit</button><button class="btn btn-xs btn-soft-danger btn-icon" data-delete-dish="${d.id}" aria-label="Delete ${FA.esc(d.name)}">${FA.icon('trash')}</button></div></td>
      </tr>`).join(''));
  }
  $('#menuRestaurant').on('change', loadDishes);
  $('#dishSearch').on('input', FA.debounce(renderDishes, 150));
  $('#dishCategory').on('change', renderDishes);
  $('#addDish').on('click', () => {
    FA.dishModal({ endpoint: `/owner/restaurants/${$('#menuRestaurant').val()}/dishes`, method: 'POST', onDone: loadDishes });
  });
  $(document).on('click', '[data-edit-dish]', function () {
    const d = dishes.find((x) => x.id === $(this).data('edit-dish'));
    FA.dishModal({ dish: d, endpoint: '/owner/dishes/' + d.id, method: 'PUT', onDone: loadDishes });
  });
  $(document).on('click', '[data-delete-dish]', async function () {
    const d = dishes.find((x) => x.id === $(this).data('delete-dish'));
    if (!(await FA.confirm({ title: 'Remove dish?', message: `“${FA.esc(d.name)}” will be removed from the menu.`, confirmText: 'Remove' }))) return;
    try { FA.toast((await FA.api('DELETE', '/owner/dishes/' + d.id)).message); loadDishes(); } catch (e) { FA.toast(e.message, 'error'); }
  });
  $(document).on('change', '[data-avail]', async function () {
    const el = this;
    try {
      const res = await FA.api('PATCH', `/owner/dishes/${$(el).data('avail')}/availability`, { is_available: el.checked });
      const d = dishes.find((x) => x.id === $(el).data('avail'));
      if (d) d.is_available = el.checked ? 1 : 0;
      FA.toast(res.message, el.checked ? 'success' : 'info');
    } catch (e) { el.checked = !el.checked; FA.toast(e.message, 'error'); }
  });

  /* ---------- Reviews (FR10) ---------- */
  async function loadReviews() {
    if (!restaurants.length) restaurants = (await FA.api('GET', '/owner/restaurants')).items;
    if ($('#revRestaurant option').length === 1) restaurants.forEach((r) => $('#revRestaurant').append(`<option value="${r.id}">${FA.esc(r.name)}</option>`));
    $('#reviewList').html('<div class="skeleton" style="height:120px"></div>');
    ownerReviews = (await FA.api('GET', '/owner/reviews', { restaurant: $('#revRestaurant').val(), rating: $('#revRating').val(), unanswered: $('#revUnanswered').is(':checked') ? 1 : '' })).items;
    if (!ownerReviews.length) return $('#reviewList').html(FA.empty('💬', 'No reviews found', 'Try changing the filters.'));
    $('#reviewList').html(ownerReviews.map((rv) => `
      <article class="review" data-rid="${rv.id}">
        <div class="review-head">${FA.avatar(rv.author)}<div class="who"><b>${FA.esc(rv.author)}</b><small>on <a href="/restaurant?id=${rv.restaurant_id}#reviews">${FA.esc(rv.restaurant)}</a></small></div><div class="when">${FA.timeAgo(rv.created_at)}</div></div>
        <h4>${FA.stars(rv.rating)} ${FA.esc(rv.title)}</h4>
        <p>${FA.esc(rv.comment)}</p>
        <div class="reply-zone">${replyView(rv)}</div>
      </article>`).join(''));
  }
  function replyView(rv) {
    if (rv.owner_reply) {
      return `<div class="owner-reply"><b>${FA.icon('reply')} Your reply <small>· ${FA.timeAgo(rv.owner_reply_at)}</small></b>${FA.esc(rv.owner_reply)}</div>
        <div class="review-actions"><button class="btn btn-xs" data-reply="${rv.id}">${FA.icon('edit')} Edit reply</button><button class="btn btn-xs btn-ghost" data-unreply="${rv.id}">${FA.icon('trash')} Remove reply</button></div>`;
    }
    return `<div class="review-actions"><button class="btn btn-sm btn-soft" data-reply="${rv.id}">${FA.icon('reply')} Reply publicly</button></div>`;
  }
  $(document).on('click', '[data-reply]', function () {
    const rv = ownerReviews.find((x) => x.id === $(this).data('reply'));
    const $zone = $(this).closest('.review').find('.reply-zone');
    $zone.html(`
      <form class="reply-form" novalidate style="margin-top:14px">
        <div class="field"><label for="reply-${rv.id}">Public reply</label>
          <textarea class="textarea" id="reply-${rv.id}" name="reply" required minlength="2" maxlength="600" data-counter style="min-height:90px" placeholder="Thank the guest or address their concerns…">${FA.esc(rv.owner_reply || '')}</textarea>
          <div class="char-count">${(rv.owner_reply || '').length} / 600</div></div>
        <div style="display:flex;gap:8px;justify-content:flex-end"><button type="button" class="btn btn-sm btn-ghost" data-cancel-reply>Cancel</button><button class="btn btn-sm btn-primary" type="submit">Publish reply</button></div>
      </form>`);
    $zone.find('textarea').trigger('focus');
    $zone.find('[data-cancel-reply]').on('click', () => $zone.html(replyView(rv)));
    $zone.find('form').on('submit', async function (e) {
      e.preventDefault();
      if (!FA.validate($(this))) return;
      const $btn = $(this).find('[type=submit]');
      FA.loading($btn, true);
      try {
        const reply = $(this).find('textarea').val().trim();
        FA.toast((await FA.api('PUT', `/owner/reviews/${rv.id}/reply`, { reply })).message);
        rv.owner_reply = reply;
        rv.owner_reply_at = new Date().toISOString();
        $zone.html(replyView(rv));
      } catch (err) { FA.toast(err.message, 'error'); FA.loading($btn, false); }
    });
  });
  $(document).on('click', '[data-unreply]', async function () {
    const rv = ownerReviews.find((x) => x.id === $(this).data('unreply'));
    if (!(await FA.confirm({ title: 'Remove your reply?', message: 'The guest review will stay, only your reply is removed.', confirmText: 'Remove' }))) return;
    try {
      FA.toast((await FA.api('DELETE', `/owner/reviews/${rv.id}/reply`)).message);
      rv.owner_reply = null;
      $(`[data-rid=${rv.id}] .reply-zone`).html(replyView(rv));
    } catch (e) { FA.toast(e.message, 'error'); }
  });
  $('#revRestaurant, #revRating, #revUnanswered').on('change', loadReviews);

  /* ---------- boot ---------- */
  renderNav();
  show();
});
