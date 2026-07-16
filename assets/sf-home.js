(function () {
  if (window.__sfHomeInit) return;
  window.__sfHomeInit = true;

  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  function initFilmModal() {
    const triggers = document.querySelectorAll("[data-sf-open-modal]");
    triggers.forEach((trigger) => {
      trigger.addEventListener("click", () => {
        const modalId = trigger.getAttribute("data-sf-open-modal");
        const modal = document.getElementById(modalId);
        if (!modal) return;

        const frame = modal.querySelector("iframe[data-src]");
        if (frame && !frame.src) frame.src = frame.dataset.src;

        modal.showModal();
        document.body.style.overflow = "hidden";
      });
    });

    document.querySelectorAll("[data-sf-modal-close]").forEach((button) => {
      button.addEventListener("click", () => {
        const modal = button.closest("dialog");
        if (!modal) return;
        const frame = modal.querySelector("iframe");
        if (frame) frame.src = "";
        modal.close();
        document.body.style.overflow = "";
      });
    });

    document.querySelectorAll("dialog.sf-home-modal").forEach((modal) => {
      modal.addEventListener("click", (event) => {
        if (event.target === modal) {
          const frame = modal.querySelector("iframe");
          if (frame) frame.src = "";
          modal.close();
          document.body.style.overflow = "";
        }
      });
    });
  }

  function initTestimonialSlider() {
    document.querySelectorAll("[data-sf-testimonials]").forEach((wrap) => {
      const slides = Array.from(wrap.querySelectorAll("[data-sf-testimonial-item]"));
      if (!slides.length) return;
      let index = 0;
      const autoplay = wrap.dataset.autoplay === "true";
      const delay = Number(wrap.dataset.delay || 6000);
      const counter = wrap.querySelector("[data-sf-counter]");

      function show(i) {
        slides.forEach((slide, idx) => {
          slide.hidden = idx !== i;
        });
        if (counter) counter.textContent = `${i + 1} / ${slides.length}`;
      }

      wrap.querySelector("[data-sf-prev]")?.addEventListener("click", () => {
        index = (index - 1 + slides.length) % slides.length;
        show(index);
      });
      wrap.querySelector("[data-sf-next]")?.addEventListener("click", () => {
        index = (index + 1) % slides.length;
        show(index);
      });

      show(index);
      if (autoplay && !reduceMotion) {
        window.setInterval(() => {
          index = (index + 1) % slides.length;
          show(index);
        }, delay);
      }
    });
  }

  document.addEventListener("DOMContentLoaded", () => {
    initFilmModal();
    initTestimonialSlider();
  });
})();
