class ScrollReveal {
  constructor() {
    this.items = Array.from(document.querySelectorAll("[data-reveal]"));
    if (!this.items.length) return;

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches || !("IntersectionObserver" in window)) {
      this.items.forEach((item) => item.classList.add("in"));
      return;
    }

    this.observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          entry.target.classList.add("in");
          this.observer.unobserve(entry.target);
        });
      },
      { threshold: 0.15 }
    );

    this.items.forEach((item) => this.observer.observe(item));
  }
}

if (!window.__seppeltsfieldRevealInit) {
  window.__seppeltsfieldRevealInit = true;
  document.addEventListener("DOMContentLoaded", () => new ScrollReveal());
}
