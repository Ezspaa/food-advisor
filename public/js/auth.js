/* Login & registration — FR1. Client-side validation mirrors the server rules;
   the token returned by the API is stored in localStorage (Web Storage). */
$(function () {
  'use strict';

  const next = FA.param('next');
  const homeFor = (role) => (role === 'owner' ? '/owner' : role === 'admin' ? '/admin' : '/');
  const redirect = (user) => {
    const safeNext = next && next.startsWith('/') && !next.startsWith('//') ? next : null; // no open redirects
    window.location.href = safeNext || homeFor(user.role);
  };
  const showAlert = (msg) => $('#formAlert').html(`<div class="alert alert-error">${FA.icon('alert')}<span>${FA.esc(msg)}</span></div>`);

  // already logged in? go straight on (after the session has been re-checked)
  FA.ready.then(() => { if (FA.auth.token() && FA.auth.user()) redirect(FA.auth.user()); });
  if (next) $('#toRegister').attr('href', '/register?next=' + encodeURIComponent(next));

  /* ---------- Login ---------- */
  const $login = $('#loginForm');
  if ($login.length) {
    const remembered = FA.store.get('rememberEmail');
    if (remembered) { $('#email').val(remembered); $('#remember').prop('checked', true); $('#password').trigger('focus'); }
    else $('#email').trigger('focus');

    // one-click demo accounts are for the local demo only — hide them on a public link
    if (!FA.isLocal) $('.demo-accounts').remove();
    $('[data-demo]').on('click', function () {
      $('#email').val($(this).data('demo'));
      $('#password').val('Password123');
      $login.find('.field').removeClass('has-error');
      $login.trigger('submit');
    });

    $login.on('submit', async (e) => {
      e.preventDefault();
      $('#formAlert').empty();
      if (!FA.validate($login)) return;
      const $btn = $login.find('[type=submit]');
      FA.loading($btn, true);
      try {
        const { email, password, remember } = FA.formData($login);
        const res = await FA.api('POST', '/auth/login', { email, password });
        if (remember) FA.store.set('rememberEmail', email); else FA.store.remove('rememberEmail');
        FA.auth.save(res.token, res.user);
        FA.toast(`Welcome back, ${res.user.name.split(' ')[0]}!`);
        setTimeout(() => redirect(res.user), 400);
      } catch (err) {
        showAlert(err.message);
        FA.loading($btn, false);
      }
    });
  }

  /* ---------- Register ---------- */
  const $reg = $('#registerForm');
  if ($reg.length) {
    if (FA.param('role') === 'owner') $('[name=role][value=owner]').prop('checked', true);

    // password strength meter
    $('#password').on('input', function () {
      const v = this.value;
      let score = 0;
      if (v.length >= 8) score++;
      if (v.length >= 12) score++;
      if (/[a-z]/.test(v) && /[A-Z]/.test(v)) score++;
      if (/\d/.test(v)) score++;
      if (/[^A-Za-z0-9]/.test(v)) score++;
      const levels = [['0%', 'var(--red)', 'Use 8+ characters with letters and numbers.'], ['25%', 'var(--red)', 'Weak password'], ['50%', 'var(--amber)', 'Could be stronger'], ['75%', 'var(--amber)', 'Good password'], ['90%', 'var(--green)', 'Strong password'], ['100%', 'var(--green)', 'Very strong password 💪']];
      const [w, c, t] = levels[v ? score : 0];
      $('.pass-meter span').css({ width: w, background: c });
      $('#passHint').text(t);
    });

    $reg.on('submit', async (e) => {
      e.preventDefault();
      $('#formAlert').empty();
      if (!FA.validate($reg)) return;
      const $btn = $reg.find('[type=submit]');
      FA.loading($btn, true);
      try {
        const d = FA.formData($reg);
        const res = await FA.api('POST', '/auth/register', { name: d.name, email: d.email, password: d.password, role: d.role, city: d.city });
        FA.auth.save(res.token, res.user);
        FA.toast(res.user.role === 'owner' ? 'Account created! Now add your first restaurant.' : `Welcome to Food Advisor, ${res.user.name.split(' ')[0]}!`);
        setTimeout(() => redirect(res.user), 500);
      } catch (err) {
        if (err.details) FA.showErrors($reg, err.details);
        showAlert(err.message);
        FA.loading($btn, false);
      }
    });
  }
});
