(function () {
  if (window.__sfDiscoveryInit) return;
  window.__sfDiscoveryInit = true;

  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  function initStoriesSlider() {
    document.querySelectorAll("[data-sf-discovery-slider]").forEach((wrap) => {
      const slides = Array.from(wrap.querySelectorAll("[data-sf-discovery-slide]"));
      if (!slides.length) return;

      let index = 0;
      const autoplay = wrap.dataset.autoplay === "true" && !reduceMotion;
      const delay = Number(wrap.dataset.delay || 6500);
      const counter = wrap.querySelector("[data-sf-discovery-counter]");

      function render(i) {
        slides.forEach((slide, idx) => {
          slide.hidden = idx !== i;
        });
        if (counter) counter.textContent = `${i + 1} / ${slides.length}`;
      }

      wrap.querySelector("[data-sf-discovery-prev]")?.addEventListener("click", () => {
        index = (index - 1 + slides.length) % slides.length;
        render(index);
      });
      wrap.querySelector("[data-sf-discovery-next]")?.addEventListener("click", () => {
        index = (index + 1) % slides.length;
        render(index);
      });

      render(index);
      if (autoplay) {
        window.setInterval(() => {
          index = (index + 1) % slides.length;
          render(index);
        }, delay);
      }
    });
  }

  document.addEventListener("DOMContentLoaded", initStoriesSlider);
})();
