(function () {
  const root = document.querySelector('[data-sf2-hero]');
  if (!root) return;
  const slides = [...root.querySelectorAll('[data-sf2-slide]')];
  const dots = [...root.querySelectorAll('[data-sf2-dot]')];
  if (!slides.length) return;

  let index = 0;
  let timer;
  const speed = Number(root.dataset.autoplay || 6.5) * 1000;
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function show(next) {
    index = (next + slides.length) % slides.length;
    slides.forEach((s, i) => s.classList.toggle('is-active', i === index));
    dots.forEach((d, i) => d.classList.toggle('is-active', i === index));
    restart();
  }

  function restart() {
    clearInterval(timer);
    if (reduced) return;
    timer = setInterval(() => show(index + 1), speed);
  }

  dots.forEach((dot) => dot.addEventListener('click', () => show(Number(dot.dataset.sf2Dot))));
  restart();
})();
