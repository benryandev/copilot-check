// Runs before first paint (classic script in <head>): sets .dark or .light on <html> from the saved choice, the URL
// hash (#dark/#light for screenshots) or the OS preference.
(function () {
  var saved = null;
  try { saved = localStorage.getItem('theme'); } catch (e) { /* storage blocked */ }
  var h = location.hash;
  var dark = h === '#dark' ? true : h === '#light' ? false : saved ? saved === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;
  document.documentElement.classList.add(dark ? 'dark' : 'light');
})();
