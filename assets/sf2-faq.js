(function () {
  document.querySelectorAll('[data-sf2-accordion]').forEach(function (item) {
    var trigger = item.querySelector('.sf2-accordion__trigger');
    var panel = item.querySelector('.sf2-accordion__panel');
    if (!trigger || !panel) return;

    function setOpen(open) {
      item.classList.toggle('is-open', open);
      trigger.setAttribute('aria-expanded', open ? 'true' : 'false');
      panel.hidden = !open;
    }

    trigger.addEventListener('click', function () {
      setOpen(!item.classList.contains('is-open'));
    });

    trigger.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        setOpen(!item.classList.contains('is-open'));
      }
    });
  });
})();
