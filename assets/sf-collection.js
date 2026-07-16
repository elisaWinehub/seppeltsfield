(() => {
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

  function disableCollectionFlyAnimation() {
    document.querySelectorAll('.sf-product-card add-to-cart-component').forEach((node) => {
      node.dataset.addToCartAnimation = 'false';
    });
  }

  function showLoadingState(button) {
    if (!button) return;
    button.classList.add('is-loading');
    button.setAttribute('aria-busy', 'true');
    if (button._sfLoadingTimeout) {
      clearTimeout(button._sfLoadingTimeout);
    }
    button._sfLoadingTimeout = setTimeout(() => {
      button.classList.remove('is-loading');
      button.removeAttribute('aria-busy');
    }, 5000);
  }

  function clearLoadingStates() {
    document.querySelectorAll('.sf-product-card .add-to-cart-button.is-loading').forEach((button) => {
      button.classList.remove('is-loading');
      button.removeAttribute('aria-busy');
    });
  }

  disableCollectionFlyAnimation();

  document.addEventListener('change', (event) => {
    const sortSelect = event.target.closest('[data-sf-collection-sort]');
    if (!sortSelect) return;

    const url = new URL(window.location.href);
    if (sortSelect.value) {
      url.searchParams.set('sort_by', sortSelect.value);
    } else {
      url.searchParams.delete('sort_by');
    }
    window.location.assign(url.toString());
  });

  document.addEventListener('click', (event) => {
    const sfAddToCart = event.target.closest('.sf-product-card .add-to-cart-button, [data-sf-cart-open="true"]');
    if (sfAddToCart) {
      showLoadingState(sfAddToCart);
      setTimeout(() => {
        openCartDrawer();
      }, 140);
    }

    const button = event.target.closest('[data-qty-change]');
    if (!button) return;

    const wrapper = button.closest('[data-sf-qty]');
    if (!wrapper) return;

    const input = wrapper.querySelector('input[name="quantity"]');
    if (!input) return;

    const min = Number(input.min || 1);
    const max = Number(input.max || 999);
    const current = Number(input.value || min);
    const delta = Number(button.getAttribute('data-qty-change'));
    const next = Math.min(max, Math.max(min, current + delta));
    input.value = String(next);
    input.dispatchEvent(new Event('change', { bubbles: true }));
  });

  document.addEventListener('shopify:section:load', () => {
    disableCollectionFlyAnimation();
  });

  document.addEventListener('theme-drawer:open', () => {
    clearLoadingStates();
  });
})();
