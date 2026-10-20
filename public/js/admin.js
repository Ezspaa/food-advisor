/* Admin panel — FR11 manage users, FR12 manage restaurants, FR13 moderate
   reviews (reports queue) + cuisines lookup data. Admin-only on the server too. */
$(async function () {
  'use strict';

  if (!(await FA.guard(['admin']))) return;
  const me = FA.auth.user();
  const state = { userPage: 1, revPage: 1, restStatus: '', reportStatus: 'open' };
  let users = [];
  let rests = [];
  let cuisines = [];

  const SECTIONS = [['overview', 'Overview', 'chart'], ['users', 'Users', 'users'], ['restaurants', 'Restaurants', 'store'], ['reviews', 'Reviews', 'message'], ['reports', 'Reports', 'flag'], ['feedback', 'Feedback', 'message'], ['cuisines', 'Cuisines', 'tag']];
  let badges = {};

  function current() { const h = location.hash.slice(1); return SECTIONS.some(([k]) => k === h) ? h : 'overview'; }
  function renderNav() {
    const cur = current();
    $('#dashNav').html(`
      <div class="who">${FA.avatar(me.name, me.avatar_url)}<div><b>${FA.esc(me.name)}</b><small>Administrator</small></div></div>
      ${SECTIONS.map(([k, l, i]) => `<a href="#${k}" data-nav="${k}" class="${cur === k ? 'active' : ''}">${FA.icon(i)} ${l}${badges[k] ? `<span class="pill">${badges[k]}</span>` : ''}</a>`).join('')}
      <a href="/profile">${FA.icon('user')} My profile</a>
      <button type="button" class="nav-item" data-logout>${FA.icon('logout')} Log out</button>`);
  }
  function show() {
    const s = current();
    $('[data-nav]').removeClass('active').filter(`[data-nav=${s}]`).addClass('active');
    $('.dash-section').removeClass('active').filter(`[data-section=${s}]`).addClass('active');
    ({ overview: loadOverview, users: loadUsers, restaurants: loadRestaurants, reviews: loadReviews, reports: loadReports, feedback: loadFeedback, cuisines: loadCuisines })[s]();
  }
  $(window).on('hashchange', show);

  const kpi = (ico, color, label, value, sub) => `<div class="kpi"><div class="top">${label}<span class="ico ${color}">${FA.icon(ico)}</span></div><b>${value}</b><small>${sub}</small></div>`;
  const pager = ($el, page, pages) => {
    if (pages <= 1) return $el.empty();
    let html = '';
    for (let p = 1; p <= pages; p++) html += `<button type="button" data-page="${p}" class="${p === page ? 'active' : ''}">${p}</button>`;
    $el.html(html);
  };
  const tableEmpty = (cols, emoji, title, text) => `<tr><td colspan="${cols}">${FA.empty(emoji, title, text)}</td></tr>`;

  /* ---------- Overview ---------- */
  async function refreshBadges() {
    const o = await FA.api('GET', '/admin/overview');
    badges = { restaurants: o.totals.pending_restaurants, reports: o.totals.open_reports, feedback: o.totals.new_feedback };
    renderNav();
    return o;
  }
  async function loadOverview() {
    const o = await refreshBadges();
    const t = o.totals;
    $('#kpis').html(
      kpi('users', 'blue', 'Users', t.users, `${t.new_users} joined in 30 days · ${t.blocked_users} blocked`) +
      kpi('store', '', 'Live restaurants', t.restaurants, `<a href="#restaurants" style="color:var(--brand);font-weight:700">${t.pending_restaurants} awaiting approval</a>`) +
      kpi('message', 'purple', 'Reviews', t.reviews, `${t.hidden_reviews} hidden · avg ★ ${t.avg_rating || '—'}`) +
      kpi('flag', 'amber', 'Open reports', t.open_reports, `<a href="#reports" style="color:var(--brand);font-weight:700">Review the queue →</a>`));

    const months = [];
    for (let i = 5; i >= 0; i--) { const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - i); months.push(d.toISOString().slice(0, 7)); }
    const byMonth = Object.fromEntries(o.monthly.map((m) => [m.month, m.count]));
    const max = Math.max(1, ...months.map((m) => byMonth[m] || 0));
    $('#monthChart').html(months.map((m) => `<div class="col"><div class="bar" style="height:0" data-h="${((byMonth[m] || 0) / max) * 100}"><span>${byMonth[m] || 0}</span></div><label>${FA.monthLabel(m)}</label></div>`).join(''));

    const colors = { customer: 'var(--blue)', owner: 'var(--purple)', admin: 'var(--brand)' };
    const total = o.roles.reduce((a, r) => a + r.count, 0);
    let acc = 0;
    const stops = o.roles.map((r) => { const from = acc; acc += (r.count / total) * 100; return `${colors[r.role]} ${from}% ${acc}%`; }).join(', ');
    $('#roleDonut').html(`<div class="donut" style="background:conic-gradient(${stops})"><div class="center"><div><b>${total}</b><small>users</small></div></div></div>
      <div class="legend">${o.roles.map((r) => `<span><i style="background:${colors[r.role]}"></i>${r.role.charAt(0).toUpperCase() + r.role.slice(1)}s <b style="margin-left:auto;padding-left:12px">${r.count}</b></span>`).join('')}</div>`);

    const cmax = Math.max(1, ...o.cuisines.map((c) => c.count));
    $('#cuisineBars').html(o.cuisines.map((c) => `<div class="row"><span>${FA.esc(c.emoji)} ${FA.esc(c.name)}</span><span class="track"><span style="width:0" data-w="${(c.count / cmax) * 100}"></span></span><span class="n">${c.count}</span></div>`).join(''));
    $('#topList').html(o.topRestaurants.map((r, i) => `
      <a href="/restaurant?id=${r.id}" style="display:flex;align-items:center;gap:12px;padding:9px 0;${i ? 'border-top:1px solid var(--line)' : ''}">
        <b style="width:22px;color:var(--muted)">${i + 1}</b><span style="flex:1"><b>${FA.esc(r.name)}</b><small class="muted" style="display:block">${FA.esc(r.city)} · ${r.review_count} reviews</small></span>${FA.ratingPill(r.avg_rating, r.review_count)}</a>`).join(''));
    requestAnimationFrame(() => {
      $('#monthChart .bar').each(function () { $(this).css('height', $(this).data('h') + '%'); });
      $('#cuisineBars [data-w]').each(function () { $(this).css('width', $(this).data('w') + '%'); });
    });
  }

  /* ---------- Users (FR11) ---------- */
  async function loadUsers() {
    $('#userRows').html('<tr><td colspan="6"><div class="skeleton" style="height:60px"></div></td></tr>');
    const res = await FA.api('GET', '/admin/users', { q: $('#userSearch').val().trim(), role: $('#userRole').val(), status: $('#userStatus').val(), page: state.userPage });
    users = res.items;
    $('#userRows').html(users.length ? users.map((u) => `
      <tr>
        <td><div class="cell-user">${FA.avatar(u.name)}<div><b>${FA.esc(u.name)} ${u.id === me.id ? '<span class="badge">You</span>' : ''}</b><small>${FA.esc(u.email)}</small></div></div></td>
        <td>${FA.roleBadge(u.role)}</td>
        <td>${FA.statusBadge(u.status)}</td>
        <td><small class="muted">${u.review_count} reviews${u.role === 'owner' ? ` · ${u.restaurant_count} restaurants` : ''}</small></td>
        <td><small class="muted">${FA.date(u.created_at)}</small></td>
        <td><div class="actions">${u.id === me.id ? '' : `
          <button class="btn btn-xs" data-user-edit="${u.id}">${FA.icon('edit')} Edit</button>
          <button class="btn btn-xs ${u.status === 'active' ? 'btn-soft-danger' : 'btn-soft'}" data-user-block="${u.id}">${FA.icon(u.status === 'active' ? 'ban' : 'check')} ${u.status === 'active' ? 'Block' : 'Unblock'}</button>
          <button class="btn btn-xs btn-soft-danger btn-icon" data-user-delete="${u.id}" aria-label="Delete ${FA.esc(u.name)}">${FA.icon('trash')}</button>`}</div></td>
      </tr>`).join('') : tableEmpty(6, '👤', 'No users found', 'Try another search.'));
    pager($('#userPages'), res.page, res.pages);
  }
  $('#userSearch').on('input', FA.debounce(() => { state.userPage = 1; loadUsers(); }, 300));
  $('#userRole, #userStatus').on('change', () => { state.userPage = 1; loadUsers(); });
  $('#userPages').on('click', '[data-page]', function () { state.userPage = $(this).data('page'); loadUsers(); });

  async function updateUser(u, changes) {
    const res = await FA.api('PUT', '/admin/users/' + u.id, { role: u.role, status: u.status, ...changes });
    FA.toast(res.message);
    loadUsers();
  }
  $(document).on('click', '[data-user-edit]', function () {
    const u = users.find((x) => x.id === $(this).data('user-edit'));
    FA.modal({
      title: `Edit ${u.name}`,
      size: 'modal-sm',
      body: `<div class="field"><label for="ue-role">Role</label><select class="select" id="ue-role" name="role">${['customer', 'owner', 'admin'].map((r) => `<option value="${r}" ${u.role === r ? 'selected' : ''}>${r.charAt(0).toUpperCase() + r.slice(1)}</option>`).join('')}</select></div>
        <div class="field"><label for="ue-status">Status</label><select class="select" id="ue-status" name="status"><option value="active" ${u.status === 'active' ? 'selected' : ''}>Active</option><option value="blocked" ${u.status === 'blocked' ? 'selected' : ''}>Blocked (cannot log in)</option></select></div>`,
      onSubmit: (d) => updateUser(u, d),
    });
  });
  $(document).on('click', '[data-user-block]', async function () {
    const u = users.find((x) => x.id === $(this).data('user-block'));
    const blocking = u.status === 'active';
    if (blocking && !(await FA.confirm({ title: `Block ${FA.esc(u.name)}?`, message: 'They will be logged out immediately and will not be able to log in until unblocked.', confirmText: 'Block user' }))) return;
    try { await updateUser(u, { status: blocking ? 'blocked' : 'active' }); } catch (e) { FA.toast(e.message, 'error'); }
  });
  $(document).on('click', '[data-user-delete]', async function () {
    const u = users.find((x) => x.id === $(this).data('user-delete'));
    if (!(await FA.confirm({ title: `Delete ${FA.esc(u.name)}?`, message: `Their account and <b>${u.review_count} reviews</b> will be removed permanently.` }))) return;
    try { FA.toast((await FA.api('DELETE', '/admin/users/' + u.id)).message); loadUsers(); } catch (e) { FA.toast(e.message, 'error'); }
  });

  /* ---------- Restaurants (FR12) ---------- */
  async function loadRestaurants() {
    $('#restRows').html('<tr><td colspan="6"><div class="skeleton" style="height:60px"></div></td></tr>');
    rests = (await FA.api('GET', '/admin/restaurants', { q: $('#restSearch').val().trim(), status: state.restStatus })).items;
    $('#restRows').html(rests.length ? rests.map((r) => `
      <tr>
        <td><div class="cell-user">${r.image_url ? `<img class="thumb" src="${FA.esc(r.image_url)}" alt="" data-fallback-hide>` : ''}<div><b><a href="/restaurant?id=${r.id}">${FA.esc(r.name)}</a></b><small>${FA.esc(r.cuisine_emoji)} ${FA.esc(r.cuisine)} · ${FA.esc(r.city)} · ${r.dish_count} dishes</small></div></div></td>
        <td class="nowrap"><small>${r.owner_name ? FA.esc(r.owner_name) : '<span class="muted">No owner</span>'}</small></td>
        <td>${FA.statusBadge(r.status)}</td>
        <td class="nowrap">${FA.ratingPill(r.avg_rating, r.review_count)} <small class="muted">(${r.review_count})</small></td>
        <td><label class="switch"><input type="checkbox" data-feature="${r.id}" ${Number(r.is_featured) ? 'checked' : ''} ${r.status !== 'approved' ? 'disabled' : ''} aria-label="Featured"><span class="track"></span></label></td>
        <td><div class="actions">
          ${r.status !== 'approved' ? `<button class="btn btn-xs btn-soft" data-approve="${r.id}">${FA.icon('check')} Approve</button>` : ''}
          ${r.status === 'pending' ? `<button class="btn btn-xs btn-soft-danger" data-reject="${r.id}">${FA.icon('x')} Reject</button>` : ''}
          <button class="btn btn-xs" data-rest-edit="${r.id}">${FA.icon('edit')} Edit</button>
          <button class="btn btn-xs btn-soft-danger btn-icon" data-rest-delete="${r.id}" aria-label="Delete ${FA.esc(r.name)}">${FA.icon('trash')}</button>
        </div></td>
      </tr>`).join('') : tableEmpty(6, '🏪', 'No restaurants found', 'Try another filter.'));
  }
  async function setStatus(id, status, featured) {
    const r = rests.find((x) => x.id === id);
    const res = await FA.api('PATCH', `/admin/restaurants/${id}/status`, { status, is_featured: featured !== undefined ? featured : Number(r.is_featured) === 1 });
    FA.toast(res.message);
    await loadRestaurants();
    refreshBadges();
  }
  $('#restSearch').on('input', FA.debounce(loadRestaurants, 300));
  $('#restStatus').on('click', 'button', function () {
    $('#restStatus button').removeClass('active'); $(this).addClass('active');
    state.restStatus = $(this).data('status');
    loadRestaurants();
  });
  $(document).on('click', '[data-approve]', function () { setStatus($(this).data('approve'), 'approved').catch((e) => FA.toast(e.message, 'error')); });
  $(document).on('click', '[data-reject]', async function () {
    const id = $(this).data('reject');
    if (await FA.confirm({ title: 'Reject this restaurant?', message: 'The owner will see it as rejected and can edit it to resubmit.', confirmText: 'Reject' })) setStatus(id, 'rejected').catch((e) => FA.toast(e.message, 'error'));
  });
  $(document).on('change', '[data-feature]', function () { setStatus($(this).data('feature'), 'approved', this.checked).catch((e) => FA.toast(e.message, 'error')); });
  $(document).on('click', '[data-rest-edit]', async function () {
    const r = rests.find((x) => x.id === $(this).data('rest-edit'));
    if (!cuisines.length) cuisines = (await FA.api('GET', '/meta')).cuisines;
    FA.restaurantModal({ restaurant: r, cuisines, title: `Edit ${r.name} (as admin)`, endpoint: '/admin/restaurants/' + r.id, method: 'PUT', onDone: loadRestaurants });
  });
  $(document).on('click', '[data-rest-delete]', async function () {
    const r = rests.find((x) => x.id === $(this).data('rest-delete'));
    if (!(await FA.confirm({ title: `Remove ${FA.esc(r.name)}?`, message: 'The restaurant, its menu and all of its reviews will be deleted permanently.' }))) return;
    try { FA.toast((await FA.api('DELETE', '/admin/restaurants/' + r.id)).message); loadRestaurants(); refreshBadges(); } catch (e) { FA.toast(e.message, 'error'); }
  });

  /* ---------- Reviews (FR13) ---------- */
  async function loadReviews() {
    $('#revRows').html('<tr><td colspan="5"><div class="skeleton" style="height:60px"></div></td></tr>');
    const res = await FA.api('GET', '/admin/reviews', { q: $('#revSearch').val().trim(), status: $('#revStatus').val(), rating: $('#revRating').val(), reported: $('#revReported').is(':checked') ? 1 : '', page: state.revPage });
    $('#revRows').html(res.items.length ? res.items.map((v) => `
      <tr>
        <td><div style="margin-bottom:4px">${FA.stars(v.rating)} <b>${FA.esc(v.title)}</b> ${v.open_reports ? `<span class="badge badge-amber">${FA.icon('flag')} ${v.open_reports} report${v.open_reports > 1 ? 's' : ''}</span>` : ''}</div><div class="text-clip">${FA.esc(v.comment)}</div></td>
        <td><a href="/restaurant?id=${v.restaurant_id}#reviews"><small>${FA.esc(v.restaurant)}</small></a></td>
        <td><small>${FA.esc(v.author)}</small><br><small class="muted">${FA.date(v.created_at)}</small></td>
        <td>${FA.statusBadge(v.status)}</td>
        <td><div class="actions">
          <button class="btn btn-xs" data-review-toggle="${v.id}" data-to="${v.status === 'visible' ? 'hidden' : 'visible'}">${FA.icon(v.status === 'visible' ? 'eyeOff' : 'eye')} ${v.status === 'visible' ? 'Hide' : 'Restore'}</button>
          <button class="btn btn-xs btn-soft-danger btn-icon" data-review-delete="${v.id}" aria-label="Delete review">${FA.icon('trash')}</button>
        </div></td>
      </tr>`).join('') : tableEmpty(5, '💬', 'No reviews found', 'Try another filter.'));
    pager($('#revPages'), res.page, res.pages);
  }
  $('#revSearch').on('input', FA.debounce(() => { state.revPage = 1; loadReviews(); }, 300));
  $('#revStatus, #revRating, #revReported').on('change', () => { state.revPage = 1; loadReviews(); });
  $('#revPages').on('click', '[data-page]', function () { state.revPage = $(this).data('page'); loadReviews(); });
  $(document).on('click', '[data-review-toggle]', async function () {
    try { FA.toast((await FA.api('PATCH', '/admin/reviews/' + $(this).data('review-toggle'), { status: $(this).data('to') })).message); loadReviews(); } catch (e) { FA.toast(e.message, 'error'); }
  });
  $(document).on('click', '[data-review-delete]', async function () {
    const id = $(this).data('review-delete');
    if (!(await FA.confirm({ title: 'Delete this review?', message: 'It will be removed permanently and the restaurant rating will be recalculated.' }))) return;
    try {
      FA.toast((await FA.api('DELETE', '/admin/reviews/' + id)).message);
      current() === 'reports' ? loadReports() : loadReviews();
      refreshBadges();
    } catch (e) { FA.toast(e.message, 'error'); }
  });

  /* ---------- Reports queue ---------- */
  const REASONS = { spam: 'Spam / advertising', offensive: 'Offensive', fake: 'Fake / misleading', 'off-topic': 'Off-topic', other: 'Other' };
  async function loadReports() {
    $('#reportList').html('<div class="skeleton" style="height:140px"></div>');
    const { items } = await FA.api('GET', '/admin/reports', { status: state.reportStatus });
    $('#reportList').html(items.length ? `<div class="card">${items.map((p) => `
      <div class="card-body" style="border-bottom:1px solid var(--line)">
        <div style="display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap;margin-bottom:10px">
          <div><span class="badge badge-red">${FA.icon('flag')} ${REASONS[p.reason]}</span> <small class="muted">reported by <b>${FA.esc(p.reporter)}</b> · ${FA.timeAgo(p.created_at)}</small></div>
          ${FA.statusBadge(p.status)}
        </div>
        ${p.details ? `<p style="margin-bottom:10px;font-style:italic">“${FA.esc(p.details)}”</p>` : ''}
        <div class="owner-reply" style="border-left-color:var(--red);margin-top:0">
          <b>${FA.stars(p.rating)} ${FA.esc(p.title)} <small>· by ${FA.esc(p.author)} on <a href="/restaurant?id=${p.restaurant_id}#reviews">${FA.esc(p.restaurant)}</a> · review is ${p.review_status}</small></b>${FA.esc(p.comment)}
        </div>
        ${p.status === 'open' ? `<div class="review-actions">
          <button class="btn btn-sm btn-danger" data-report-action="hide" data-id="${p.id}">${FA.icon('eyeOff')} Hide review</button>
          <button class="btn btn-sm" data-report-action="dismiss" data-id="${p.id}">${FA.icon('check')} Dismiss report</button>
          <button class="btn btn-sm btn-ghost" data-review-delete="${p.review_id}">${FA.icon('trash')} Delete review</button></div>` : `<small class="muted" style="display:block;margin-top:10px">Closed ${FA.timeAgo(p.resolved_at)}</small>`}
      </div>`).join('')}</div>` : `<div class="card">${FA.empty('✅', state.reportStatus === 'open' ? 'All clear!' : 'Nothing here', state.reportStatus === 'open' ? 'There are no open reports right now.' : 'No reports with this status.')}</div>`);
  }
  $('#reportStatus').on('click', 'button', function () {
    $('#reportStatus button').removeClass('active'); $(this).addClass('active');
    state.reportStatus = $(this).data('status');
    loadReports();
  });
  $(document).on('click', '[data-report-action]', async function () {
    try {
      FA.toast((await FA.api('PATCH', '/admin/reports/' + $(this).data('id'), { action: $(this).data('report-action') })).message);
      loadReports();
      refreshBadges();
    } catch (e) { FA.toast(e.message, 'error'); }
  });

  /* ---------- Site feedback ---------- */
  const FB_FACES = ['', '😞', '🙁', '😐', '🙂', '🤩'];
  const FB_CATS = { design: 'Design', usability: 'Ease of use', bug: 'Bug', idea: 'Idea', other: 'Other' };
  async function loadFeedback() {
    $('#fbList').html('<div class="card-body"><div class="skeleton" style="height:120px"></div></div>');
    const { items, summary } = await FA.api('GET', '/admin/feedback', { status: $('#fbStatus').val(), category: $('#fbCategory').val() });
    $('#fbKpis').html(
      kpi('message', 'blue', 'Responses', summary.total || 0, 'All time') +
      kpi('star', 'amber', 'Average impression', summary.avg_rating || '—', 'out of 5') +
      kpi('flag', '', 'Unread', summary.unread || 0, 'Waiting for you'));
    $('#fbList').html(items.length ? items.map((f) => `
      <div class="fb-item ${f.status === 'new' ? 'unread' : ''}">
        <div class="top">
          <span><span style="font-size:20px;vertical-align:-3px">${FB_FACES[f.rating]}</span> <b style="color:var(--ink)">${f.rating}/5</b> · <span class="badge">${FB_CATS[f.category]}</span> ${f.status === 'new' ? '<span class="badge badge-brand">New</span>' : ''}</span>
          <span>${FA.timeAgo(f.created_at)}</span>
        </div>
        <p>${FA.esc(f.message)}</p>
        <div class="top">
          <span>${f.user_name ? FA.icon('user') + ' ' + FA.esc(f.user_name) : 'Guest'}${f.email ? ' · ' + FA.esc(f.email) : ''}${f.device ? ' · ' + FA.esc(f.device) : ''}${f.page ? ` · <a href="${FA.esc(f.page)}" style="color:var(--brand)">${FA.esc(f.page)}</a>` : ''}</span>
          <span class="actions" style="display:flex;gap:6px">
            <button class="btn btn-xs" data-fb-toggle="${f.id}" data-to="${f.status === 'new' ? 'read' : 'new'}">${FA.icon(f.status === 'new' ? 'check' : 'eye')} ${f.status === 'new' ? 'Mark read' : 'Mark unread'}</button>
            <button class="btn btn-xs btn-soft-danger btn-icon" data-fb-delete="${f.id}" aria-label="Delete feedback">${FA.icon('trash')}</button>
          </span>
        </div>
      </div>`).join('') : FA.empty('💬', 'No feedback yet', 'Share the site link with testers — their feedback will appear here.'));
  }
  $('#fbStatus, #fbCategory').on('change', loadFeedback);
  $(document).on('click', '[data-fb-toggle]', async function () {
    try { FA.toast((await FA.api('PATCH', '/admin/feedback/' + $(this).data('fb-toggle'), { status: $(this).data('to') })).message); loadFeedback(); refreshBadges(); } catch (e) { FA.toast(e.message, 'error'); }
  });
  $(document).on('click', '[data-fb-delete]', async function () {
    const id = $(this).data('fb-delete');
    if (!(await FA.confirm({ title: 'Delete this feedback?', message: 'It will be removed permanently.' }))) return;
    try { FA.toast((await FA.api('DELETE', '/admin/feedback/' + id)).message); loadFeedback(); refreshBadges(); } catch (e) { FA.toast(e.message, 'error'); }
  });

  /* ---------- Cuisines ---------- */
  async function loadCuisines() {
    cuisines = (await FA.api('GET', '/meta')).cuisines;
    $('#cuisineRows').html(cuisines.map((c) => `
      <tr><td><b>${FA.esc(c.emoji)} ${FA.esc(c.name)}</b></td><td>${c.restaurant_count}</td>
      <td><div class="actions"><button class="btn btn-xs btn-soft-danger btn-icon" data-cuisine-delete="${c.id}" aria-label="Delete ${FA.esc(c.name)}" ${c.restaurant_count ? 'disabled title="In use by restaurants"' : ''}>${FA.icon('trash')}</button></div></td></tr>`).join(''));
  }
  const $cf = $('#cuisineForm');
  $cf.on('submit', async (e) => {
    e.preventDefault();
    if (!FA.validate($cf)) return;
    try {
      FA.toast((await FA.api('POST', '/admin/cuisines', FA.formData($cf))).message);
      $cf[0].reset();
      loadCuisines();
    } catch (err) { if (err.details) FA.showErrors($cf, err.details); FA.toast(err.message, 'error'); }
  });
  $(document).on('click', '[data-cuisine-delete]', async function () {
    try { FA.toast((await FA.api('DELETE', '/admin/cuisines/' + $(this).data('cuisine-delete'))).message); loadCuisines(); } catch (e) { FA.toast(e.message, 'error'); }
  });

  /* ---------- boot ---------- */
  renderNav();
  show();
  if (current() !== 'overview') refreshBadges();
});
