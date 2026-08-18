(function () {
  var headerGroup = document.querySelector('#header-group');
  if (!headerGroup) return;

  function syncAnchorOffset() {
    var top = headerGroup.classList.contains('is-scrolled') ? headerGroup.offsetHeight : 0;
    document.documentElement.style.setProperty('--sf2-anchor-top', top + 'px');
    document.documentElement.style.setProperty('--sf2-scroll-padding', (top + 56) + 'px');
  }

  syncAnchorOffset();
  window.addEventListener('scroll', syncAnchorOffset, { passive: true });
  window.addEventListener('resize', syncAnchorOffset);
  new MutationObserver(syncAnchorOffset).observe(headerGroup, { attributes: true, attributeFilter: ['class'] });
})();
