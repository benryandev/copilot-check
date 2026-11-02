// The theme toggle for static pages that don't load app.js (the stops page, the guides): wires #theme-toggle
// the way app.js does on the Check page. Classic script at the end of <body>; theme.js has already set the
// starting class before paint. Does nothing on a page without the button.
(function () {
  var toggle = document.getElementById('theme-toggle');
  if (!toggle) return;
  var root = document.documentElement;
  var sync = function () {
    var dark = root.classList.contains('dark');
    toggle.setAttribute('aria-label', dark ? 'Switch to light mode' : 'Switch to dark mode');
    var path = toggle.querySelector('.theme-toggle-path');
    if (path) path.setAttribute('d', dark ? 'M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79Z' : 'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8Z');
  };
  toggle.addEventListener('click', function () {
    var dark = !root.classList.contains('dark');
    root.classList.toggle('dark', dark); root.classList.toggle('light', !dark); sync();
    try { localStorage.setItem('theme', dark ? 'dark' : 'light'); } catch (e) { /* storage blocked */ }
  });
  sync();
})();
