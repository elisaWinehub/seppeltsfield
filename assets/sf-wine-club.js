(function () {
  if (window.__sfWineClubInit) return;
  window.__sfWineClubInit = true;

  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  function initStoriesSlider() {
    document.querySelectorAll("[data-sf-stories-slider]").forEach((wrap) => {
      const slides = Array.from(wrap.querySelectorAll("[data-sf-story-slide]"));
      if (!slides.length) return;

      let index = 0;
      const autoplay = wrap.dataset.autoplay === "true" && !reduceMotion;
      const delay = Number(wrap.dataset.delay || 6000);
      const counter = wrap.querySelector("[data-sf-stories-counter]");

      function render(i) {
        slides.forEach((slide, slideIndex) => {
          slide.hidden = slideIndex !== i;
        });
        if (counter) counter.textContent = `${i + 1} / ${slides.length}`;
      }

      wrap.querySelector("[data-sf-stories-prev]")?.addEventListener("click", () => {
        index = (index - 1 + slides.length) % slides.length;
        render(index);
      });
      wrap.querySelector("[data-sf-stories-next]")?.addEventListener("click", () => {
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
