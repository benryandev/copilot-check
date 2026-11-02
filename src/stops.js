// The stops page: the district list is a <details> so phones get one 44 px row; wide screens open it and keep it
// open, and the rail marks the district on screen. Does nothing a reader without JS needs.
(function () {
  var jump = document.getElementById('stops-jump');
  if (!jump) return;
  var wide = matchMedia('(min-width: 1024px)');
  var apply = function () { if (wide.matches) jump.open = true; };
  apply(); wide.addEventListener('change', apply);
  jump.addEventListener('toggle', function () { if (wide.matches && !jump.open) jump.open = true; });
  var links = Array.prototype.slice.call(jump.querySelectorAll('a[href^="#district-"]'));
  var sections = links.map(function (a) { return document.getElementById(a.getAttribute('href').slice(1)); }).filter(Boolean);
  if (!('IntersectionObserver' in window) || !sections.length) return;
  var current = null;
  var mark = function (id) {
    if (id === current) return; current = id;
    links.forEach(function (a) { if (a.getAttribute('href') === '#' + id) a.setAttribute('aria-current', 'true'); else a.removeAttribute('aria-current'); });
  };
  var visible = new Map();
  var io = new IntersectionObserver(function (entries) {
    entries.forEach(function (e) { visible.set(e.target.id, e.isIntersecting ? e.boundingClientRect.top : null); });
    var best = null, bestTop = Infinity;
    visible.forEach(function (top, id) { if (top !== null && top < bestTop) { best = id; bestTop = top; } });
    if (best) mark(best);
  }, { rootMargin: '-10% 0px -70% 0px' });
  mark(sections[0].id); // the first district reads as current at the top of the page
  sections.forEach(function (s) { io.observe(s); });
})();
