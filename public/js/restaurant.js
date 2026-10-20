/* Restaurant page — FR3 details & dishes, FR4/FR5 reviews, helpful votes,
   reporting, favourites and "recently viewed" (localStorage). */
$(async function () {
  'use strict';

  const id = Number(FA.param('id'));
  let data = null;      // { restaurant, dishes, ratings, can_manage }
  let reviews = [];
  let ratingFilter = 0;
  let menuFilter = 'all';

  if (!id) return showMissing();

  await FA.ready; // we need to know who is logged in for the review buttons
  try {
    data = await FA.api('GET', '/restaurants/' + id);
  } catch (err) {
    return showMissing(err.status === 404 ? null : err.message);
  }
  const r = data.restaurant;
  document.title = `${r.name} — ${r.cuisine} in ${r.city} | Food Advisor`;
  if (r.status === 'approved') FA.recent.addView(r);

  renderHero();
  renderInfo();
  renderMenu();
  renderOverview();
  loadReviews();
  loadSimilar();
  openTab((window.location.hash || '#overview').slice(1));

  /* ---------------- rendering ---------------- */
  function showMissing(message) {
    $('#main').html(`<div class="container">${FA.empty('🍽️', message ? 'Could not load this restaurant' : 'Restaurant not found',
      message ? FA.esc(message) : 'It may have been removed or is waiting for approval.', '<a href="/restaurants" class="btn btn-primary">Browse restaurants</a>')}</div>`);
  }

  function hoursText() {
    if (!r.opens_at || !r.closes_at) return 'Opening hours not provided';
    return `${r.opens_at} – ${r.closes_at}`;
  }

  function reviewButton() {
    const user = FA.auth.user();
    if (r.status !== 'approved') return '';
    if (r.my_review_id) return `<button class="btn btn-primary" data-edit-mine>${FA.icon('edit')} Edit my review</button>`;
    if (!user || user.role === 'customer') return `<button class="btn btn-primary" data-write>${FA.icon('star')} Write a review</button>`;
    return '';
  }

  function renderHero() {
    const user = FA.auth.user();
    const manage = data.can_manage
      ? `<a class="btn btn-glass" href="${user.role === 'admin' ? '/admin#restaurants' : '/owner#restaurants'}">${FA.icon('settings')} Manage</a>` : '';
    $('#rHero').html(`
      ${r.image_url ? `<img class="cover" src="${FA.esc(r.image_url)}" alt="${FA.esc(r.name)}" data-fallback="${FA.esc(r.cuisine_emoji)}">` : ''}
      <div class="container">
        <nav class="breadcrumbs" aria-label="Breadcrumb"><a href="/">Home</a><span>/</span><a href="/restaurants?city=${encodeURIComponent(r.city)}">${FA.esc(r.city)}</a><span>/</span><a href="/restaurants?cuisine=${r.cuisine_id}">${FA.esc(r.cuisine)}</a></nav>
        <div style="display:flex;gap:8px;margin-bottom:12px;flex-wrap:wrap">${Number(r.is_featured) ? `<span class="badge badge-brand">${FA.icon('sparkle')}Featured</span>` : ''}${FA.openBadge(r)}</div>
        <h1>${FA.esc(r.name)}</h1>
        <div class="facts">
          <span>${FA.ratingPill(r.avg_rating, r.review_count)} ${r.review_count} review${r.review_count == 1 ? '' : 's'}</span>
          <span>${FA.esc(r.cuisine_emoji)} ${FA.esc(r.cuisine)}</span>
          <span>${FA.icon('pin')} ${FA.esc(r.address)}, ${FA.esc(r.city)}</span>
          <span title="${FA.priceWords[r.price_level]}">${'₸'.repeat(r.price_level)} · ${FA.priceWords[r.price_level]}</span>
          <span>${FA.icon('clock')} ${hoursText()}</span>
        </div>
        <div class="actions">
          ${reviewButton()}
          ${r.status === 'approved' ? `<button class="btn btn-glass ${FA.fav.has(r.id) ? 'active' : ''}" data-fav="${r.id}" aria-label="Save to favourites">${FA.icon('heart')} <span class="fav-label">${FA.fav.has(r.id) ? 'Saved' : 'Save'}</span></button>` : ''}
          <button class="btn btn-glass" data-share>${FA.icon('arrow')} Share</button>
          ${manage}
        </div>
      </div>`);
    if (r.status !== 'approved') {
      const msg = r.status === 'pending'
        ? 'This restaurant is waiting for administrator approval. Only you (and admins) can see this preview.'
        : 'This restaurant was rejected by an administrator. Edit its details to resubmit it for approval.';
      $('#statusBanner').html(`<div class="alert ${r.status === 'pending' ? 'alert-warn' : 'alert-error'}" style="margin-top:20px">${FA.icon('alert')}<span>${msg}</span></div>`);
    }
  }

  function renderInfo() {
    const user = FA.auth.user();
    $('#infoCard').html(`
      <div class="map-card" style="margin-bottom:18px" aria-hidden="true"><span class="pin"><svg viewBox="0 0 24 24"><path d="M12 2a7 7 0 0 0-7 7c0 5.3 7 13 7 13s7-7.7 7-13a7 7 0 0 0-7-7zm0 9.5A2.5 2.5 0 1 1 12 6.5a2.5 2.5 0 0 1 0 5z"/></svg></span></div>
      <ul class="info-list">
        <li>${FA.icon('pin')}<div><small>Address</small>${FA.esc(r.address)}, ${FA.esc(r.city)}</div></li>
        <li>${FA.icon('clock')}<div><small>Opening hours</small>${hoursText()} ${r.opens_at ? (Number(r.is_open) ? '<span class="badge badge-green" style="margin-left:6px">Open now</span>' : '<span class="badge" style="margin-left:6px">Closed now</span>') : ''}</div></li>
        ${r.phone ? `<li>${FA.icon('phone')}<div><small>Phone</small><a href="tel:${FA.esc(r.phone.replace(/\s/g, ''))}">${FA.esc(r.phone)}</a></div></li>` : ''}
        ${r.website ? `<li>${FA.icon('globe')}<div><small>Website</small><a href="${FA.esc(r.website)}" target="_blank" rel="noopener noreferrer">${FA.esc(r.website.replace(/^https?:\/\//, ''))}</a></div></li>` : ''}
        <li>${FA.icon('tag')}<div><small>Price range</small>${'₸'.repeat(r.price_level)} · ${FA.priceWords[r.price_level]}</div></li>
        ${r.owner_name ? `<li>${FA.icon('chef')}<div><small>Managed by</small>${FA.esc(r.owner_name)}</div></li>` : ''}
      </ul>
      ${!user ? `<div class="alert alert-info" style="margin:16px 0 0">${FA.icon('info')}<span><a href="/login?next=${encodeURIComponent(location.pathname + location.search)}" style="font-weight:700;text-decoration:underline">Log in</a> to write a review and keep favourites in your account.</span></div>` : ''}`);
  }

  function dishMatches(d) {
    const q = $('#menuSearch').val().trim().toLowerCase();
    if (q && !(`${d.name} ${d.description || ''}`.toLowerCase().includes(q))) return false;
    if (menuFilter === 'veg' && !Number(d.is_vegetarian)) return false;
    if (menuFilter === 'spicy' && !Number(d.is_spicy)) return false;
    return true;
  }

  function renderMenu() {
    $('#menuCount').text(data.dishes.length);
    const groups = {};
    data.dishes.filter(dishMatches).forEach((d) => { (groups[d.category] = groups[d.category] || []).push(d); });
    const html = Object.entries(groups).map(([cat, list]) => `
      <div class="menu-cat"><h3>${FA.esc(cat)} <small>${list.length} item${list.length > 1 ? 's' : ''}</small></h3>
        <div class="d-grid">${list.map((d) => FA.dishCard(d)).join('')}</div></div>`).join('');
    $('#menu').html(html || FA.empty('🥢', 'No dishes match', data.dishes.length ? 'Try another search or filter.' : 'This restaurant has not published its menu yet.'));
  }

  function summaryHtml(compact) {
    const total = Object.values(data.ratings).reduce((a, b) => a + b, 0);
    const rows = [5, 4, 3, 2, 1].map((n) => {
      const c = data.ratings[n];
      const pct = total ? Math.round((c / total) * 100) : 0;
      return `<button type="button" class="dist-row ${ratingFilter === n ? 'active' : ''}" data-rating-filter="${n}" ${compact ? 'tabindex="-1"' : ''} aria-label="Show ${n}-star reviews (${c})">
        <span>${n} ★</span><span class="bar"><span style="width:${pct}%"></span></span><span class="n">${c}</span></button>`;
    }).join('');
    return `<div class="rating-summary">
      <div class="rating-big"><b>${total ? Number(r.avg_rating).toFixed(1) : '—'}</b>${FA.stars(r.avg_rating)}<small>${total} review${total === 1 ? '' : 's'}</small></div>
      <div>${rows}</div></div>`;
  }

  function renderOverview() {
    $('#about').text(r.description || 'No description yet.');
    const popular = data.dishes.filter((d) => d.image_url && Number(d.is_available)).slice(0, 4);
    if (popular.length) $('#popular').html(popular.map((d) => FA.dishCard(d)).join(''));
    else $('#popularWrap').hide();
    $('#overviewRating').html(summaryHtml(true));
  }

  /* ---------------- reviews ---------------- */
  async function loadReviews() {
    $('#reviews').html('<div class="skeleton" style="height:140px;margin-bottom:12px"></div><div class="skeleton" style="height:140px"></div>');
    try {
      const res = await FA.api('GET', `/restaurants/${id}/reviews`, { sort: $('#reviewSort').val(), rating: ratingFilter || '' });
      reviews = res.items;
      renderReviews();
    } catch (err) {
      $('#reviews').html(FA.empty('⚠️', 'Could not load reviews', FA.esc(err.message)));
    }
  }

  function renderReviews() {
    const user = FA.auth.user();
    $('#reviewCount').text(r.review_count);
    $('#ratingSummary').html(summaryHtml(false));
    $('#ratingFilterChip').html(ratingFilter ? `<button class="chip chip-sm" data-rating-filter="0">${ratingFilter} ★ only <span class="x">×</span></button>` : '');
    if (!reviews.length) {
      const action = r.status === 'approved' && (!user || user.role === 'customer') && !r.my_review_id ? '<button class="btn btn-primary" data-write>Write the first review</button>' : '';
      $('#reviews').html(FA.empty('💬', ratingFilter ? `No ${ratingFilter}-star reviews` : 'No reviews yet', ratingFilter ? 'Try another rating.' : 'Be the first to share your experience.', ratingFilter ? '' : action));
      return;
    }
    // my own review is always shown first
    const sorted = [...reviews].sort((a, b) => (user && b.user_id === user.id) - (user && a.user_id === user.id));
    $('#reviews').html(sorted.map((rv, i) => {
      const mine = user && rv.user_id === user.id;
      const edited = rv.updated_at && rv.updated_at !== rv.created_at;
      return `
        <article class="review ${mine ? 'mine' : ''}" style="animation-delay:${Math.min(i, 8) * 40}ms" data-review="${rv.id}">
          <div class="review-head">
            ${FA.avatar(rv.author, rv.author_avatar)}
            <div class="who"><b>${FA.esc(rv.author)} ${mine ? '<span class="badge badge-brand" style="margin-left:4px">You</span>' : ''}</b>
              <small>${rv.author_city ? FA.esc(rv.author_city) + ' · ' : ''}${rv.author_reviews} review${rv.author_reviews == 1 ? '' : 's'}</small></div>
            <div class="when">${FA.timeAgo(rv.created_at)}${edited ? '<br><small>(edited)</small>' : ''}</div>
          </div>
          <h4>${FA.stars(rv.rating)} ${FA.esc(rv.title)}</h4>
          <p>${FA.esc(rv.comment)}</p>
          ${rv.visit_date ? `<small class="muted" style="display:block;margin-top:8px">${FA.icon('calendar')} Visited ${FA.date(rv.visit_date)}</small>` : ''}
          ${rv.owner_reply ? `<div class="owner-reply"><b>${FA.icon('reply')} Response from the restaurant <small>· ${FA.timeAgo(rv.owner_reply_at)}</small></b>${FA.esc(rv.owner_reply)}</div>` : ''}
          <div class="review-actions">
            ${mine
              ? `<button class="btn btn-sm" data-edit-mine>${FA.icon('edit')} Edit</button><button class="btn btn-sm btn-soft-danger" data-delete-mine="${rv.id}">${FA.icon('trash')} Delete</button>
                 <span class="muted" style="font-size:13px;margin-left:6px">${rv.helpful_count} found this helpful</span>`
              : `<button class="btn btn-sm ${Number(rv.voted) ? 'voted' : ''}" data-helpful="${rv.id}" aria-pressed="${!!Number(rv.voted)}">${FA.icon('thumb')} Helpful <b>${rv.helpful_count}</b></button>
                 <button class="btn btn-sm btn-ghost" data-report="${rv.id}">${FA.icon('flag')} Report</button>`}
          </div>
        </article>`;
    }).join(''));
  }

  async function reloadAll() {
    data = await FA.api('GET', '/restaurants/' + id);
    Object.assign(r, data.restaurant);
    renderHero();
    renderOverview();
    await loadReviews();
  }

  function requireCustomer() {
    const user = FA.auth.user();
    if (!user) {
      FA.toast('Please log in to continue', 'info');
      setTimeout(() => { window.location.href = '/login?next=' + encodeURIComponent(location.pathname + location.search + '#reviews'); }, 600);
      return false;
    }
    if (user.role !== 'customer') { FA.toast('Only customer accounts can write reviews', 'error'); return false; }
    return true;
  }

  /* ---------------- events ---------------- */
  $(document).on('click', '[data-write]', () => {
    if (!requireCustomer()) return;
    FA.reviewModal({ restaurantId: id, restaurantName: r.name, onDone: () => { openTab('reviews'); reloadAll(); } });
  });
  $(document).on('click', '[data-edit-mine]', async () => {
    const user = FA.auth.user();
    let mine = reviews.find((x) => user && x.user_id === user.id);
    if (!mine) { // filtered out by the rating filter — fetch the list without it
      const res = await FA.api('GET', `/restaurants/${id}/reviews`);
      mine = res.items.find((x) => x.user_id === user.id);
    }
    if (mine) FA.reviewModal({ restaurantId: id, restaurantName: r.name, review: mine, onDone: reloadAll });
  });
  $(document).on('click', '[data-delete-mine]', function () { FA.deleteReview($(this).data('delete-mine'), reloadAll); });

  $(document).on('click', '[data-helpful]', async function () {
    if (!FA.auth.user()) return FA.toast('Log in to vote for helpful reviews', 'info');
    const $btn = $(this);
    try {
      const res = await FA.api('POST', `/reviews/${$btn.data('helpful')}/helpful`);
      $btn.toggleClass('voted', res.voted).attr('aria-pressed', res.voted).find('b').text(res.helpful_count);
      const rv = reviews.find((x) => x.id === $btn.data('helpful'));
      if (rv) { rv.voted = res.voted ? 1 : 0; rv.helpful_count = res.helpful_count; }
    } catch (err) { FA.toast(err.message, 'error'); }
  });

  $(document).on('click', '[data-report]', function () {
    if (!FA.auth.user()) return FA.toast('Log in to report a review', 'info');
    const reviewId = $(this).data('report');
    const reasons = [['spam', 'Spam or advertising'], ['offensive', 'Offensive or abusive'], ['fake', 'Fake or misleading'], ['off-topic', 'Not about this restaurant'], ['other', 'Something else']];
    FA.modal({
      title: 'Report this review',
      submitText: 'Send report',
      danger: true,
      body: `<p class="muted" style="margin-bottom:16px">Reports are sent to the administrators, who can hide reviews that break the community rules.</p>
        <div class="field"><span class="field-label">Reason <span class="req">*</span></span>
          <div class="rating-options">${reasons.map(([v, l]) => `<label><input type="radio" name="reason" value="${v}" required data-label="a reason"> ${l}</label>`).join('')}</div><div class="error"></div></div>
        <div class="field"><label for="rp-details">Details (optional)</label><textarea class="textarea" id="rp-details" name="details" maxlength="300" data-counter style="min-height:80px"></textarea><div class="char-count">0 / 300</div></div>`,
      async onSubmit(d) {
        const res = await FA.api('POST', `/reviews/${reviewId}/report`, d);
        FA.toast(res.message);
      },
    });
  });

  $(document).on('click', '[data-rating-filter]', function () {
    const n = Number($(this).data('rating-filter'));
    ratingFilter = ratingFilter === n ? 0 : n;
    openTab('reviews');
    loadReviews();
  });
  $('#reviewSort').on('change', loadReviews);

  $('#menuSearch').on('input', FA.debounce(renderMenu, 150));
  $('[data-menu-filter]').on('click', function () {
    menuFilter = $(this).data('menu-filter');
    $('[data-menu-filter]').removeClass('active');
    $(this).addClass('active');
    renderMenu();
  });

  $(document).on('click', '[data-share]', async () => {
    try {
      await navigator.clipboard.writeText(window.location.href.split('#')[0]);
      FA.toast('Link copied to clipboard');
    } catch (e) { FA.toast('Copy this page address to share it', 'info'); }
  });
  $(document).on('fa:favchange', (e, favId, on) => {
    if (favId === r.id) $('.r-hero [data-fav] .fav-label').text(on ? 'Saved' : 'Save');
  });

  // tabs (with #hash so links like /restaurant?id=1#menu work)
  function openTab(name) {
    if (!['overview', 'menu', 'reviews'].includes(name)) name = 'overview';
    $('[data-tab]').removeClass('active').attr('aria-selected', false).filter(`[data-tab=${name}]`).addClass('active').attr('aria-selected', true);
    $('[data-panel]').addClass('hidden').filter(`[data-panel=${name}]`).removeClass('hidden');
    history.replaceState(null, '', name === 'overview' ? location.pathname + location.search : '#' + name);
  }
  $('[data-tab]').on('click', function () { openTab($(this).data('tab')); });
  $(document).on('click', '[data-goto]', function () {
    openTab($(this).data('goto'));
    $('html, body').animate({ scrollTop: $('.tabs').offset().top - 70 }, 250);
  });

  async function loadSimilar() {
    try {
      const res = await FA.api('GET', '/restaurants', { city: r.city, sort: 'rating', limit: 5 });
      const items = res.items.filter((x) => x.id !== r.id).slice(0, 4);
      if (!items.length) return $('#similarCard').hide();
      $('#similar').html(items.map((x) => `
        <a href="/restaurant?id=${x.id}" style="display:flex;gap:12px;align-items:center;padding:8px 0">
          <span style="width:56px;height:56px;border-radius:12px;overflow:hidden;flex-shrink:0;background:var(--surface-2)">${x.image_url ? `<img src="${FA.esc(x.image_url)}" alt="" style="width:100%;height:100%;object-fit:cover" data-fallback="${FA.esc(x.cuisine_emoji)}">` : ''}</span>
          <span style="min-width:0"><b style="display:block;font-size:14px">${FA.esc(x.name)}</b><small class="muted">${FA.esc(x.cuisine)} · ${FA.ratingPill(x.avg_rating, x.review_count)}</small></span>
        </a>`).join(''));
      $('#similarCard h3').text(`More in ${r.city}`);
    } catch (e) { $('#similarCard').hide(); }
  }
});
