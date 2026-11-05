// Runs before first paint (classic script in <head>): sets .dark or .light on <html> from the saved choice, the URL
// hash (#dark/#light for screenshots) or the OS preference.
(function () {
  var saved = null;
  try { saved = localStorage.getItem('theme'); } catch (e) { /* storage blocked */ }
  var h = location.hash;
  var dark = h === '#dark' ? true : h === '#light' ? false : saved ? saved === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;
  document.documentElement.classList.add(dark ? 'dark' : 'light');
  // The ecosystem portal (Task 5c): a fresh hand-off record for this very page (the rule readPortal applies: `to` is this
  // path, at most 30 s old) means it was reached through an arch, so the hold paints in the veil's sky colour from the first
  // frame instead of the page background (ecosystem.css html.is-portal, world pages only). The key is left for the world.
  try { if (portalHold(sessionStorage.getItem('eco-portal'), location.pathname, Date.now())) document.documentElement.classList.add('is-portal'); } catch (e) { /* storage blocked */ }
  function portalHold(raw, path, now) {
    if (!raw) return false;
    var rec; try { rec = JSON.parse(raw); } catch (e) { return false; }
    return !!rec && typeof rec === 'object' && rec.to === path && typeof rec.at === 'number' && now - rec.at <= 30000;
  }
})();
