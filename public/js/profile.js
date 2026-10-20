/* Profile page — FR6 view/update profile, FR5 manage own reviews,
   FR7 favourites + recently viewed / recent searches (Web Storage). */
$(async function () {
  'use strict';

  if (!(await FA.guard())) return;
  let me = FA.auth.user();
  let myReviews = [];
  const isCustomer = me.role === 'customer';

  const SECTIONS = [
    ['overview', 'Overview', 'user'],
    ['edit', 'Edit profile', 'edit'],
    ...(isCustomer ? [['reviews', 'My reviews', 'message']] : []),
    ['favorites', 'Favourites', 'heart'],
    ['activity', 'Browsing history', 'history'],
    ['security', 'Security', 'lock'],
  ];

  function renderNav() {
    $('#dashNav').html(`
      <div class="who">${FA.avatar(me.name, me.avatar_url)}<div><b>${FA.esc(me.name)}</b><small>${FA.esc(me.email)}</small></div></div>
      ${SECTIONS.map(([key, label, ico]) => `<a href="#${key}" data-nav="${key}" class="${current() === key ? 'active' : ''}">${FA.icon(ico)} ${label}</a>`).join('')}
      ${me.role === 'owner' ? `<a href="/owner">${FA.icon('chef')} Owner dashboard</a>` : ''}
      ${me.role === 'admin' ? `<a href="/admin">${FA.icon('shield')} Admin panel</a>` : ''}
      <button type="button" class="nav-item" data-logout>${FA.icon('logout')} Log out</button>`);
  }

  function current() {
    const h = location.hash.slice(1);
    return SECTIONS.some(([k]) => k === h) ? h : 'overview';
  }

  function show(section) {
    if (!SECTIONS.some(([k]) => k === section)) section = 'overview';
    $('[data-nav]').removeClass('active').filter(`[data-nav=${section}]`).addClass('active');
    $('.dash-section').removeClass('active').filter(`[data-section=${section}]`).addClass('active');
    if (section === 'reviews') loadReviews();
    if (section === 'favorites') loadFavorites();
    if (section === 'activity') renderActivity();
  }
  $(window).on('hashchange', () => show(location.hash.slice(1)));

  /* ---------- Overview ---------- */
  async function loadOverview() {
    const { user, stats } = await FA.api('GET', '/me');
    me = user;
    FA.auth.setUser(user);
    renderNav();
    $('#profileHero').html(`
      <div class="profile-hero">
        ${FA.avatar(user.name, user.avatar_url, 'avatar-lg')}
        <div style="flex:1;min-width:0">
          <h2>${FA.esc(user.name)}</h2>
          <div class="meta">${FA.roleBadge(user.role)}
            ${user.city ? `<span>${FA.icon('pin')} ${FA.esc(user.city)}</span>` : ''}
            <span>${FA.icon('calendar')} Member since ${FA.date(user.created_at)}</span></div>
          ${user.bio ? `<p class="bio">${FA.esc(user.bio)}</p>` : '<p class="bio muted">No bio yet — <a href="#edit" style="color:var(--brand);font-weight:600">add one</a>.</p>'}
        </div>
        <a href="#edit" class="btn btn-soft">${FA.icon('edit')} Edit profile</a>
      </div>`);
    const kpi = (ico, color, label, value, sub) => `<div class="kpi"><div class="top">${label}<span class="ico ${color}">${FA.icon(ico)}</span></div><b>${value}</b><small>${sub}</small></div>`;
    $('#profileKpis').html(
      kpi('message', '', 'Reviews written', stats.reviews, isCustomer ? 'Share more experiences!' : 'Reviews are for customer accounts') +
      kpi('heart', 'purple', 'Favourites', stats.favorites, 'Saved restaurants') +
      kpi('thumb', 'green', 'Helpful votes', stats.helpful_votes, 'Received on your reviews') +
      kpi('star', 'amber', 'Average rating given', stats.avg_given ? Number(stats.avg_given).toFixed(1) : '—', 'Across all your reviews'));
    fillForm(user);

    if (isCustomer) {
      const { items } = await FA.api('GET', '/me/reviews');
      myReviews = items;
      $('#latest').html(items.length ? items.slice(0, 3).map((rv) => `
        <div class="mini-review"><div class="top"><span>You reviewed <a href="/restaurant?id=${rv.restaurant_id}#reviews"><b>${FA.esc(rv.restaurant)}</b></a></span><span>${FA.timeAgo(rv.created_at)}</span></div>
        <div style="margin-top:6px">${FA.stars(rv.rating)} <b>${FA.esc(rv.title)}</b></div><p>${FA.esc(rv.comment)}</p></div>`).join('')
        : FA.empty('✍️', 'No reviews yet', 'Visited a restaurant recently? Tell others about it.', '<a href="/restaurants" class="btn btn-primary">Find a restaurant</a>'));
    } else {
      const views = FA.recent.views();
      $('#latest').html(views.length ? views.slice(0, 4).map((v) => `<div class="mini-review"><div class="top"><span>Viewed <a href="/restaurant?id=${v.id}"><b>${FA.esc(v.name)}</b></a></span><span>${FA.timeAgo(new Date(v.at).toISOString())}</span></div></div>`).join('')
        : FA.empty('👀', 'Nothing here yet', 'Restaurants you view will appear here.'));
    }
  }

  /* ---------- Edit profile (FR6) ---------- */
  const $pf = $('#profileForm');
  function fillForm(u) {
    $('#p-name').val(u.name); $('#p-email').val(u.email); $('#p-city').val(u.city || '');
    $('#p-avatar').val(u.avatar_url || ''); $('#p-bio').val(u.bio || '').trigger('input');
    $pf.find('.field').removeClass('has-error');
  }
  $pf.on('reset', (e) => { e.preventDefault(); fillForm(me); FA.toast('Changes discarded', 'info'); });
  $pf.on('submit', async (e) => {
    e.preventDefault();
    if (!FA.validate($pf)) return;
    const $btn = $pf.find('[type=submit]');
    FA.loading($btn, true);
    try {
      const res = await FA.api('PUT', '/me', FA.formData($pf));
      me = res.user;
      FA.auth.setUser(res.user);
      FA.renderHeader();
      FA.toast(res.message);
      await loadOverview();
      location.hash = 'overview';
    } catch (err) {
      if (err.details) FA.showErrors($pf, err.details);
      FA.toast(err.message, 'error');
    } finally { FA.loading($btn, false); }
  });

  /* ---------- My reviews (FR5) ---------- */
  async function loadReviews() {
    $('#myReviews').html('<div class="skeleton" style="height:160px"></div>');
    try {
      myReviews = (await FA.api('GET', '/me/reviews')).items;
      renderReviews();
    } catch (err) { $('#myReviews').html(FA.empty('⚠️', 'Could not load reviews', FA.esc(err.message))); }
  }
  function renderReviews() {
    const sort = $('#myReviewSort').val();
    const list = [...myReviews].sort((a, b) => (sort === 'high' ? b.rating - a.rating : sort === 'low' ? a.rating - b.rating : b.created_at.localeCompare(a.created_at)));
    if (!list.length) return $('#myReviews').html(`<div class="card">${FA.empty('✍️', 'You have not written any reviews yet', 'Your reviews help others choose where to eat.', '<a href="/restaurants" class="btn btn-primary">Find a restaurant</a>')}</div>`);
    $('#myReviews').html(`<div class="card">${list.map((rv) => `
      <div class="own-r-card">
        <a href="/restaurant?id=${rv.restaurant_id}">${rv.image_url ? `<img src="${FA.esc(rv.image_url)}" alt="${FA.esc(rv.restaurant)}" data-fallback="🍽️">` : '<div class="img-fallback" style="width:180px;height:120px;border-radius:12px">🍽️</div>'}</a>
        <div style="min-width:0">
          <h3><a href="/restaurant?id=${rv.restaurant_id}#reviews">${FA.esc(rv.restaurant)}</a> ${rv.status === 'hidden' ? '<span class="badge badge-red">Hidden by moderator</span>' : ''}</h3>
          <div class="meta">${FA.esc(rv.city)} · reviewed ${FA.date(rv.created_at)}${rv.updated_at !== rv.created_at ? ' · edited' : ''}</div>
          <div style="margin-top:8px">${FA.stars(rv.rating)} <b>${FA.esc(rv.title)}</b></div>
          <p class="muted" style="margin-top:4px;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden">${FA.esc(rv.comment)}</p>
          ${rv.owner_reply ? `<div class="owner-reply" style="margin-top:10px"><b>${FA.icon('reply')} The restaurant replied</b>${FA.esc(rv.owner_reply)}</div>` : ''}
          <div class="nums"><span>${FA.icon('thumb')} <b>${rv.helpful_count}</b> found helpful</span></div>
        </div>
        <div class="actions">
          <button class="btn btn-sm" data-edit="${rv.id}">${FA.icon('edit')} Edit</button>
          <button class="btn btn-sm btn-soft-danger" data-del="${rv.id}">${FA.icon('trash')} Delete</button>
        </div>
      </div>`).join('')}</div>`);
  }
  $('#myReviewSort').on('change', renderReviews);
  $(document).on('click', '[data-edit]', function () {
    const rv = myReviews.find((x) => x.id === $(this).data('edit'));
    FA.reviewModal({ restaurantId: rv.restaurant_id, restaurantName: rv.restaurant, review: rv, onDone: loadReviews });
  });
  $(document).on('click', '[data-del]', function () { FA.deleteReview($(this).data('del'), () => { loadReviews(); loadOverview(); }); });

  /* ---------- Favourites (FR7) ---------- */
  async function loadFavorites() {
    $('#favGrid').html(FA.skeletonCards(3));
    try {
      const { items } = await FA.api('GET', '/me/favorites');
      $('#favSub').text(`${items.length} saved restaurant${items.length === 1 ? '' : 's'}.`);
      $('#favGrid').html(items.length ? items.map(FA.restaurantCard).join('')
        : `<div style="grid-column:1/-1">${FA.empty('💛', 'No favourites yet', 'Tap the heart on any restaurant to save it here.', '<a href="/restaurants" class="btn btn-primary">Explore restaurants</a>')}</div>`);
    } catch (err) { $('#favGrid').html(FA.empty('⚠️', 'Could not load favourites', FA.esc(err.message))); }
  }
  $(document).on('fa:favchange', (e, id, on) => {
    if (!on && $('[data-section=favorites]').hasClass('active')) {
      $(`#favGrid [data-fav=${id}]`).closest('.r-card').fadeOut(250, function () { $(this).remove(); if (!$('#favGrid .r-card').length) loadFavorites(); });
    }
  });

  /* ---------- Browsing history (Web Storage) ---------- */
  function renderActivity() {
    const views = FA.recent.views();
    $('#viewList').html(views.length ? views.map((v) => `
      <a href="/restaurant?id=${v.id}" style="display:flex;gap:12px;align-items:center;padding:8px 0;border-bottom:1px solid var(--line)">
        <span style="width:52px;height:52px;border-radius:12px;overflow:hidden;flex-shrink:0;background:var(--surface-2)">${v.image_url ? `<img src="${FA.esc(v.image_url)}" alt="" style="width:100%;height:100%;object-fit:cover" data-fallback="${FA.esc(v.cuisine_emoji || '🍽️')}">` : ''}</span>
        <span style="flex:1"><b>${FA.esc(v.name)}</b><small class="muted" style="display:block">${FA.esc(v.cuisine)} · ${FA.esc(v.city)}</small></span>
        <small class="muted">${FA.timeAgo(new Date(v.at).toISOString())}</small></a>`).join('')
      : '<p class="muted">You have not viewed any restaurants on this device yet.</p>');
    const searches = FA.recent.searches();
    $('#searchList').html(searches.length
      ? `<div style="display:flex;gap:8px;flex-wrap:wrap">${searches.map((s) => `<a class="chip chip-sm" href="/restaurants?q=${encodeURIComponent(s)}">${FA.icon('search')} ${FA.esc(s)}</a>`).join('')}</div>`
      : '<p class="muted">No recent searches.</p>');
  }
  $('#clearViews').on('click', () => { FA.recent.clearViews(); renderActivity(); FA.toast('Viewing history cleared', 'info'); });
  $('#clearSearches').on('click', () => { FA.recent.clearSearches(); renderActivity(); FA.toast('Search history cleared', 'info'); });

  /* ---------- Security ---------- */
  const $pw = $('#passwordForm');
  $pw.on('submit', async (e) => {
    e.preventDefault();
    if (!FA.validate($pw)) return;
    const $btn = $pw.find('[type=submit]');
    FA.loading($btn, true);
    try {
      const d = FA.formData($pw);
      const res = await FA.api('PUT', '/me/password', { current_password: d.current_password, new_password: d.new_password });
      $pw[0].reset();
      FA.toast(res.message);
    } catch (err) {
      if (err.details) FA.showErrors($pw, err.details);
      FA.toast(err.message, 'error');
    } finally { FA.loading($btn, false); }
  });

  $('#deleteAccount').on('click', () => {
    FA.modal({
      title: 'Delete your account?',
      size: 'modal-sm',
      danger: true,
      submitText: 'Delete forever',
      body: `<div class="confirm-ico">${FA.icon('trash')}</div><p style="margin-bottom:16px">This cannot be undone. Enter your password to confirm.</p>
        <div class="field"><label for="del-pass">Password <span class="req">*</span></label><input class="input" type="password" id="del-pass" name="password" required autocomplete="current-password"></div>`,
      async onSubmit(d) {
        const res = await FA.api('DELETE', '/me', { password: d.password });
        FA.auth.clear();
        FA.toast(res.message, 'info');
        setTimeout(() => { window.location.href = '/'; }, 700);
      },
    });
  });

  /* ---------- boot ---------- */
  renderNav();
  show(location.hash.slice(1));
  try { await loadOverview(); } catch (err) { FA.toast(err.message, 'error'); }
});
