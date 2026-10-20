/* =====================================================================
   Reusable forms (modals) shared by several pages:
     FA.reviewModal      write / edit a review          (restaurant, profile)
     FA.restaurantModal  create / edit a restaurant     (owner, admin)
     FA.dishModal        create / edit a dish           (owner)
   ===================================================================== */
(function ($, FA) {
  'use strict';

  const RATING_WORDS = ['', 'Terrible', 'Poor', 'Average', 'Very good', 'Excellent'];
  const today = () => new Date().toISOString().slice(0, 10);

  /* ---------- Review (FR4 / FR5) ---------- */
  FA.reviewModal = function ({ restaurantId, restaurantName, review, onDone }) {
    const editing = !!review;
    // a draft of a NEW review is kept in sessionStorage so it survives a refresh
    const draftKey = 'reviewDraft';
    const draft = !editing ? (FA.session.get(draftKey) || {}) : {};
    const v = editing ? review : (draft.restaurantId === restaurantId ? draft : {});

    const stars = [5, 4, 3, 2, 1].map((n) => `
      <input type="radio" name="rating" id="rate-${n}" value="${n}" ${Number(v.rating) === n ? 'checked' : ''} required data-label="a rating">
      <label for="rate-${n}" title="${RATING_WORDS[n]}">${FA.starIcon(true)}<span class="sr-only">${n} stars</span></label>`).join('');

    FA.modal({
      title: editing ? 'Edit your review' : `Review ${restaurantName}`,
      submitText: editing ? 'Save changes' : 'Publish review',
      body: `
        <div class="field">
          <span class="field-label">Your rating <span class="req">*</span></span>
          <div style="display:flex;align-items:center"><div class="star-input" role="radiogroup" aria-label="Rating">${stars}</div><span class="star-caption">${v.rating ? RATING_WORDS[v.rating] : 'Tap a star'}</span></div>
          <div class="error"></div>
        </div>
        <div class="field">
          <label for="rv-title">Title <span class="req">*</span></label>
          <input class="input" id="rv-title" name="title" minlength="3" maxlength="100" required placeholder="Sum up your visit" value="${FA.esc(v.title || '')}">
        </div>
        <div class="field">
          <label for="rv-comment">Your review <span class="req">*</span></label>
          <textarea class="textarea" id="rv-comment" name="comment" minlength="10" maxlength="2000" required data-counter data-label="Review"
            placeholder="What did you order? How were the food, service and atmosphere?">${FA.esc(v.comment || '')}</textarea>
          <div class="char-count">${(v.comment || '').length} / 2000</div>
        </div>
        <div class="field">
          <label for="rv-date">Date of visit</label>
          <input class="input" type="date" id="rv-date" name="visit_date" max="${today()}" data-not-future value="${FA.esc((v.visit_date || '').slice(0, 10))}">
          <span class="hint">Optional — helps other diners judge how recent your experience is.</span>
        </div>
        ${!editing ? '<p class="hint muted" style="font-size:12.5px">Your draft is saved automatically in this browser tab until you publish it.</p>' : ''}`,
      onOpen($form) {
        $form.on('change', '[name=rating]', function () {
          $form.find('.star-caption').text(RATING_WORDS[this.value]);
          FA.fieldError($(this), '');
        });
        if (!editing) {
          $form.on('input change', FA.debounce(() => FA.session.set(draftKey, { restaurantId, ...FA.formData($form) }), 300));
        }
      },
      async onSubmit(data) {
        const payload = { rating: Number(data.rating), title: data.title, comment: data.comment, visit_date: data.visit_date || null };
        const res = editing
          ? await FA.api('PUT', '/reviews/' + review.id, payload)
          : await FA.api('POST', `/restaurants/${restaurantId}/reviews`, payload);
        if (!editing) FA.session.remove(draftKey);
        FA.toast(res.message);
        if (onDone) onDone();
      },
    });
  };

  FA.deleteReview = async function (id, onDone) {
    const ok = await FA.confirm({ title: 'Delete review?', message: 'Your review and its rating will be removed permanently. This cannot be undone.' });
    if (!ok) return;
    try {
      const res = await FA.api('DELETE', '/reviews/' + id);
      FA.toast(res.message);
      if (onDone) onDone();
    } catch (e) { FA.toast(e.message, 'error'); }
  };

  /* ---------- Restaurant (FR8 / FR12) ---------- */
  const CITIES = ['Aktobe', 'Almaty', 'Astana', 'Shymkent', 'Karaganda', 'Atyrau', 'Aktau'];

  FA.restaurantModal = function ({ restaurant, cuisines, endpoint, method, onDone, title }) {
    const r = restaurant || { price_level: 2 };
    const cuisineOptions = cuisines.map((c) => `<option value="${c.id}" ${Number(r.cuisine_id) === c.id ? 'selected' : ''}>${FA.esc(c.emoji)} ${FA.esc(c.name)}</option>`).join('');
    const prices = [1, 2, 3, 4].map((n) => `
      <label class="check" style="gap:6px"><input type="radio" name="price_level" value="${n}" ${Number(r.price_level) === n ? 'checked' : ''} required data-label="a price level"> <b>${'₸'.repeat(n)}</b> <span class="muted" style="font-size:12px">${FA.priceWords[n]}</span></label>`).join('');

    FA.modal({
      title: title || (restaurant ? 'Edit restaurant' : 'Add a new restaurant'),
      size: 'modal-lg',
      submitText: restaurant ? 'Save changes' : 'Submit for approval',
      body: `
        ${!restaurant ? `<div class="alert alert-info">${FA.icon('info')}<span>New restaurants are reviewed by an administrator before they appear in search results.</span></div>` : ''}
        <div class="form-row">
          <div class="field"><label for="rf-name">Restaurant name <span class="req">*</span></label>
            <input class="input" id="rf-name" name="name" required minlength="2" maxlength="100" value="${FA.esc(r.name || '')}"></div>
          <div class="field"><label for="rf-cuisine">Cuisine <span class="req">*</span></label>
            <select class="select" id="rf-cuisine" name="cuisine_id" required data-label="Cuisine"><option value="">Choose…</option>${cuisineOptions}</select></div>
        </div>
        <div class="field"><label for="rf-desc">Description <span class="req">*</span></label>
          <textarea class="textarea" id="rf-desc" name="description" required minlength="20" maxlength="1500" data-counter
            placeholder="What makes your place special? Atmosphere, signature dishes, who it is perfect for…">${FA.esc(r.description || '')}</textarea>
          <div class="char-count">${(r.description || '').length} / 1500</div></div>
        <div class="form-row">
          <div class="field"><label for="rf-city">City <span class="req">*</span></label>
            <input class="input" id="rf-city" name="city" list="rf-cities" required minlength="2" maxlength="60" value="${FA.esc(r.city || '')}">
            <datalist id="rf-cities">${CITIES.map((c) => `<option value="${c}">`).join('')}</datalist></div>
          <div class="field"><label for="rf-address">Address <span class="req">*</span></label>
            <input class="input" id="rf-address" name="address" required minlength="5" maxlength="160" value="${FA.esc(r.address || '')}"></div>
        </div>
        <div class="form-row">
          <div class="field"><label for="rf-phone">Phone</label>
            <input class="input" type="tel" id="rf-phone" name="phone" maxlength="30" pattern="[+\\d][\\d\\s()\\-]{5,24}" data-pattern-msg="Enter a valid phone number, e.g. +7 7132 55 12 34" placeholder="+7 7132 55 12 34" value="${FA.esc(r.phone || '')}"></div>
          <div class="field"><label for="rf-web">Website</label>
            <input class="input" type="url" id="rf-web" name="website" maxlength="200" placeholder="https://" value="${FA.esc(r.website || '')}"></div>
        </div>
        <div class="field"><span class="field-label">Price level <span class="req">*</span></span>
          <div style="display:flex;gap:18px;flex-wrap:wrap">${prices}</div><div class="error"></div></div>
        <div class="form-row">
          <div class="field"><label for="rf-open">Opens at</label><input class="input" type="time" id="rf-open" name="opens_at" value="${FA.esc(r.opens_at || '')}"></div>
          <div class="field"><label for="rf-close">Closes at</label><input class="input" type="time" id="rf-close" name="closes_at" value="${FA.esc(r.closes_at || '')}">
            <span class="hint">Closing after midnight is fine (e.g. 12:00 → 02:00).</span></div>
        </div>
        <div class="field"><label for="rf-img">Cover image URL</label>
          <input class="input" type="url" id="rf-img" name="image_url" maxlength="500" placeholder="https://images.unsplash.com/…" value="${FA.esc(r.image_url || '')}">
          <div class="img-preview" style="margin-top:8px;border-radius:12px;overflow:hidden;max-height:180px;${r.image_url ? '' : 'display:none'}"><img src="${FA.esc(r.image_url || '')}" alt="Cover preview" style="width:100%;height:180px;object-fit:cover"></div></div>`,
      onOpen($form) {
        $form.on('input', '[name=image_url]', FA.debounce(function () {
          const url = this.value.trim();
          const $p = $form.find('.img-preview');
          if (/^https?:\/\/\S+/.test(url)) { $p.show().find('img').attr('src', url); } else $p.hide();
        }, 400));
        $form.find('.img-preview img').on('error', function () { $(this).parent().hide(); });
      },
      async onSubmit(d) {
        const payload = { ...d, cuisine_id: Number(d.cuisine_id), price_level: Number(d.price_level) };
        const res = await FA.api(method, endpoint, payload);
        FA.toast(res.message);
        if (onDone) onDone(res);
      },
    });
  };

  /* ---------- Dish (FR9) ---------- */
  FA.dishModal = function ({ dish, endpoint, method, onDone }) {
    const d = dish || { category: 'Mains', is_available: 1 };
    const cats = ['Starters', 'Mains', 'Sides', 'Desserts', 'Drinks'].map((c) => `<option ${d.category === c ? 'selected' : ''}>${c}</option>`).join('');
    FA.modal({
      title: dish ? 'Edit dish' : 'Add a dish',
      submitText: dish ? 'Save changes' : 'Add to menu',
      body: `
        <div class="field"><label for="df-name">Dish name <span class="req">*</span></label>
          <input class="input" id="df-name" name="name" required minlength="2" maxlength="100" value="${FA.esc(d.name || '')}"></div>
        <div class="form-row">
          <div class="field"><label for="df-cat">Category <span class="req">*</span></label><select class="select" id="df-cat" name="category" required>${cats}</select></div>
          <div class="field"><label for="df-price">Price (₸) <span class="req">*</span></label>
            <input class="input" type="number" id="df-price" name="price" required min="0" max="1000000" step="50" value="${d.price !== undefined ? d.price : ''}"></div>
        </div>
        <div class="field"><label for="df-desc">Description</label>
          <textarea class="textarea" id="df-desc" name="description" maxlength="400" data-counter style="min-height:90px">${FA.esc(d.description || '')}</textarea>
          <div class="char-count">${(d.description || '').length} / 400</div></div>
        <div class="field"><label for="df-img">Photo URL</label>
          <input class="input" type="url" id="df-img" name="image_url" maxlength="500" placeholder="https://" value="${FA.esc(d.image_url || '')}"></div>
        <div style="display:flex;gap:22px;flex-wrap:wrap">
          <label class="switch"><input type="checkbox" name="is_vegetarian" ${Number(d.is_vegetarian) ? 'checked' : ''}><span class="track"></span>Vegetarian</label>
          <label class="switch"><input type="checkbox" name="is_spicy" ${Number(d.is_spicy) ? 'checked' : ''}><span class="track"></span>Spicy</label>
          <label class="switch"><input type="checkbox" name="is_available" ${Number(d.is_available) ? 'checked' : ''}><span class="track"></span>Available today</label>
        </div>`,
      async onSubmit(data) {
        const res = await FA.api(method, endpoint, { ...data, price: Number(data.price) });
        FA.toast(res.message);
        if (onDone) onDone();
      },
    });
  };
})(jQuery, window.FA);
