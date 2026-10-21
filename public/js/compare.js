/* Compare page — up to 3 restaurants chosen with the ⇄ button (ids kept in localStorage). */
$(async function () {
  'use strict';

  async function render() {
    const ids = FA.compare.ids();
    if (ids.length < 2) {
      $('#winner').empty();
      $('#compareCard').html(FA.empty('⚖️', ids.length ? 'Add one more restaurant' : 'Nothing to compare yet',
        'Tap the ⇄ button on any restaurant card (or “Compare” on a restaurant page) to add up to three restaurants.',
        '<a class="btn btn-primary" href="/restaurants">Browse restaurants</a>'));
      return;
    }
    $('#compareCard').html('<div class="card-body"><div class="skeleton" style="height:320px"></div></div>');
    const { items } = await FA.api('GET', '/restaurants/compare', { ids: ids.join(',') });
    if (items.length < 2) { FA.compare.clear(); return render(); }

    // which value is best in each row? (higher or lower wins)
    const best = (vals, higher = true) => {
      const nums = vals.map(Number).filter((v) => !Number.isNaN(v) && v !== 0);
      if (nums.length < 2) return null;
      return higher ? Math.max(...nums) : Math.min(...nums);
    };
    const row = (label, get, fmt = (v) => v, higher = true, mark = true) => {
      const vals = items.map(get);
      const b = mark ? best(vals, higher) : null;
      return `<tr><th>${label}</th>${vals.map((v) => `<td class="${b !== null && Number(v) === b ? 'best' : ''}">${v === null || v === undefined || v === '' ? '—' : fmt(v)}</td>`).join('')}</tr>`;
    };
    const head = items.map((r) => `
      <th><div class="cmp-head">
        ${r.image_url ? `<img src="${FA.esc(r.image_url)}" alt="${FA.esc(r.name)}" class="fade">` : ''}
        <h3><a href="/restaurant?id=${r.id}">${FA.esc(r.name)}</a></h3>
        <span class="muted" style="font-size:13px">${FA.esc(r.cuisine_emoji)} ${FA.esc(r.cuisine)} · ${FA.esc(r.city)}</span>
        <button class="btn btn-xs btn-ghost" data-compare="${r.id}" style="align-self:flex-start">${FA.icon('x')} Remove</button>
      </div></th>`).join('');
    const bars = (r) => {
      const total = Object.values(r.ratings).reduce((a, b) => a + b, 0) || 1;
      return `<div class="cmp-bars">${[5, 4, 3, 2, 1].map((n) => `<div class="r"><span>${n}★</span><span class="t"><span data-w="${Math.round((r.ratings[n] / total) * 100)}"></span></span></div>`).join('')}</div>`;
    };
    $('#compareCard').html(`
      <table class="cmp-table">
        <thead><tr><th></th>${head}</tr></thead>
        <tbody>
          ${row('Average rating', (r) => r.avg_rating, (v) => FA.ratingPill(v, 1))}
          ${row('Number of reviews', (r) => r.review_count)}
          <tr><th>Rating breakdown</th>${items.map((r) => `<td>${bars(r)}</td>`).join('')}</tr>
          ${row('Price level', (r) => r.price_level, (v) => `${'₸'.repeat(v)} <span class="muted">${FA.priceWords[v]}</span>`, false)}
          ${row('Average dish price', (r) => r.menu.avg_price, FA.money, false)}
          ${row('Cheapest dish', (r) => r.menu.min_price, FA.money, false)}
          ${row('Dishes on the menu', (r) => r.menu.dish_count)}
          ${row('Vegetarian dishes', (r) => r.menu.veg_count)}
          ${row('Kid-friendly dishes', (r) => r.menu.kids_count)}
          ${row('Halal dishes', (r) => r.menu.halal_count)}
          ${row('Avg. calories per dish', (r) => r.menu.avg_calories, (v) => v + ' kcal', false)}
          ${row('Opening hours', (r) => (r.opens_at ? `${r.opens_at}–${r.closes_at}` : null), (v) => v, true, false)}
          ${row('Open now', (r) => (r.opens_at ? (Number(r.is_open) ? 'Yes' : 'No') : null), (v) => (v === 'Yes' ? '<span class="badge badge-green">Open</span>' : '<span class="badge">Closed</span>'), true, false)}
          ${row('Saved by guests', (r) => r.favorite_count)}
          <tr><th></th>${items.map((r) => `<td><a class="btn btn-primary btn-sm" href="/restaurant?id=${r.id}">View restaurant</a></td>`).join('')}</tr>
        </tbody>
      </table>`);

    // simple "overall winner": rating first, then reviews, then lower price
    const win = [...items].sort((a, b) => b.avg_rating - a.avg_rating || b.review_count - a.review_count || a.price_level - b.price_level)[0];
    $('#winner').html(`<div class="winner"><span class="trophy">🏆</span><div><b>${FA.esc(win.name)}</b> looks like the best choice —
      highest rating (${Number(win.avg_rating).toFixed(1)}★ from ${win.review_count} reviews). <span class="muted">Green values with ★ are the best in each row.</span></div></div>`);
  }

  await FA.ready;
  render();
  // re-render when the selection changes (Remove buttons, other tabs)
  $(document).on('click', '[data-compare]', () => setTimeout(render, 50));
  window.addEventListener('storage', (e) => { if (e.key === 'fa.compare') render(); });
});
