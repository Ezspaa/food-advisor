/* Runs in <head> before the page is painted so there is no light/dark flash.
   The chosen theme is remembered in localStorage (Web Storage). */
(function () {
  try {
    var saved = JSON.parse(localStorage.getItem('fa.theme'));
    var theme = saved || (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    document.documentElement.setAttribute('data-theme', theme);
  } catch (e) {
    document.documentElement.setAttribute('data-theme', 'light');
  }
})();
