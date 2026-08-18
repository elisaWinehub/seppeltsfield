(() => {
  const STORAGE_KEY = 'sf2-collection-view';

  function openCartDrawer() {
    const drawer = document.querySelector('theme-drawer#cart-drawer');
    if (drawer && typeof drawer.open === 'function') {
      drawer.open();
      return;
    }
    if (window.Theme && window.Theme.routes && window.Theme.routes.cart_url) {
      window.location.href = window.Theme.routes.cart_url;
    }
  }

  function disableFlyAnimation() {
    document.querySelectorAll('.sf2-product-card add-to-cart-component').forEach((node) => {
      node.dataset.addToCartAnimation = 'false';
    });
  }

  function applyView(view) {
    document.querySelectorAll('[data-sf2-products]').forEach((grid) => {
      grid.classList.toggle('is-list', view === 'list');
    });
    document.querySelectorAll('[data-sf2-view]').forEach((btn) => {
      const active = btn.getAttribute('data-sf2-view') === view;
      btn.classList.toggle('is-active', active);
      btn.setAttribute('aria-pressed', active ? 'true' : 'false');
    });
    document.querySelectorAll('.sf2-product-card').forEach((card) => {
      card.classList.toggle('sf2-product-card--list', view === 'list');
      card.classList.toggle('sf2-product-card--grid', view === 'grid');
    });
    try {
      localStorage.setItem(STORAGE_KEY, view);
    } catch (e) {}
  }

  function initViewToggle() {
    let saved = 'grid';
    try {
      saved = localStorage.getItem(STORAGE_KEY) || 'grid';
    } catch (e) {}
    applyView(saved === 'list' ? 'list' : 'grid');

    document.addEventListener('click', (event) => {
      const viewBtn = event.target.closest('[data-sf2-view]');
      if (!viewBtn) return;
      applyView(viewBtn.getAttribute('data-sf2-view'));
    });
  }

  document.addEventListener('change', (event) => {
    const sortSelect = event.target.closest('[data-sf2-collection-sort]');
    if (!sortSelect) return;
    const url = new URL(window.location.href);
    if (sortSelect.value) url.searchParams.set('sort_by', sortSelect.value);
    else url.searchParams.delete('sort_by');
    window.location.assign(url.toString());
  });

  document.addEventListener('click', (event) => {
    const addBtn = event.target.closest('.sf2-product-card .add-to-cart-button, [data-sf2-cart-open="true"]');
    if (addBtn) {
      addBtn.classList.add('is-loading');
      addBtn.setAttribute('aria-busy', 'true');
      setTimeout(openCartDrawer, 140);
    }

    const qtyBtn = event.target.closest('[data-qty-change]');
    if (!qtyBtn) return;
    const wrapper = qtyBtn.closest('[data-sf2-qty]');
    if (!wrapper) return;
    const input = wrapper.querySelector('input[name="quantity"]');
    if (!input) return;
    const min = Number(input.min || 1);
    const max = Number(input.max || 999);
    const current = Number(input.value || min);
    const delta = Number(qtyBtn.getAttribute('data-qty-change'));
    input.value = String(Math.min(max, Math.max(min, current + delta)));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  });

  document.addEventListener('theme-drawer:open', () => {
    document.querySelectorAll('.sf2-product-card .add-to-cart-button.is-loading').forEach((btn) => {
      btn.classList.remove('is-loading');
      btn.removeAttribute('aria-busy');
    });
  });

  disableFlyAnimation();
  initViewToggle();
  document.addEventListener('shopify:section:load', () => {
    disableFlyAnimation();
    initViewToggle();
  });
})();
