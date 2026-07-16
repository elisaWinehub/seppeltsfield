(() => {
  function byId(id) {
    return document.getElementById(id);
  }

  function disableSfFlyToCartAnimation() {
    document
      .querySelectorAll('.sf-product-main add-to-cart-component, .sf-product-card add-to-cart-component')
      .forEach((node) => {
        node.dataset.addToCartAnimation = 'false';
      });
  }

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
    document
      .querySelectorAll('.sf-product-main .add-to-cart-button.is-loading, .sf-product-card .add-to-cart-button.is-loading')
      .forEach((button) => {
        button.classList.remove('is-loading');
        button.removeAttribute('aria-busy');
      });
  }

  function getVariantMap(picker) {
    const mapScript = byId(`${picker?.getAttribute('data-map-id')}`);
    if (!mapScript) return {};
    try {
      return JSON.parse(mapScript.textContent || '{}');
    } catch {
      return {};
    }
  }

  function syncSellingPlanInputs(planId) {
    document.querySelectorAll('[data-sf-selling-plan-input]').forEach((input) => {
      input.value = planId || '';
      input.disabled = !planId;
    });
  }

  function updateSellingPlanPanelState(panel) {
    if (!panel) return;
    const purchaseType = panel.querySelector('[data-sf-purchase-type]:checked');
    const frequency = panel.querySelector('[data-sf-selling-plan-frequency]');
    const select = panel.querySelector('[data-sf-selling-plan-select]');
    const isSubscription = purchaseType?.value === 'subscription';

    panel.querySelectorAll('[data-sf-selling-plan-option]').forEach((option) => {
      const input = option.querySelector('[data-sf-purchase-type]');
      option.classList.toggle('is-selected', input === purchaseType);
    });

    if (frequency) {
      frequency.hidden = !isSubscription;
    }

    if (isSubscription) {
      const isFallback = panel.dataset.fallbackMode === 'true';
      const planId = isFallback ? '' : select?.value || purchaseType?.dataset.sfDefaultPlan || '';
      syncSellingPlanInputs(planId);
    } else {
      syncSellingPlanInputs('');
    }
  }

  function updateSellingPlanPrices(variantId) {
    const picker = document.querySelector('[data-sf-variant-picker]');
    const map = getVariantMap(picker);
    const selected = map[variantId];
    if (!selected) return;

    document.querySelectorAll('[data-sf-one-time-price]').forEach((el) => {
      if (selected.price_text) el.textContent = selected.price_text;
    });

    document.querySelectorAll('[data-sf-selling-plan-panel]').forEach((panel) => {
      const select = panel.querySelector('[data-sf-selling-plan-select]');
      const subscriptionPrice = panel.querySelector('[data-sf-subscription-price]');
      const subscriptionCompare = panel.querySelector('[data-sf-subscription-compare]');
      const isFallback = panel.dataset.fallbackMode === 'true';
      const activePlanId = select?.value || panel.querySelector('[data-sf-purchase-type="subscription"]')?.dataset.sfDefaultPlan;
      const planData = selected.selling_plans?.[activePlanId];

      if (subscriptionPrice) {
        if (isFallback) {
          subscriptionPrice.textContent = selected.fallback_subscription_text || selected.price_text || '';
          if (subscriptionCompare) {
            subscriptionCompare.textContent = selected.price_text || '';
            subscriptionCompare.hidden = !selected.price_text;
          }
        } else {
          subscriptionPrice.textContent = planData?.price_text || selected.price_text || '';
          if (subscriptionCompare) {
            if (planData?.compare_at_text) {
              subscriptionCompare.textContent = planData.compare_at_text;
              subscriptionCompare.hidden = false;
            } else {
              subscriptionCompare.hidden = true;
            }
          }
        }
      }
    });
  }

  function initSellingPlanPanels() {
    document.querySelectorAll('[data-sf-selling-plan-panel]').forEach((panel) => {
      updateSellingPlanPanelState(panel);
    });
    syncSellingPlanInputs('');
  }

  function initReadMoreBlocks() {
    document.querySelectorAll('[data-sf-readmore]').forEach((wrap) => {
      const content = wrap.querySelector('.sf-product-description__content');
      const toggle = wrap.querySelector('[data-sf-readmore-toggle]');
      if (!content || !toggle) return;

      const paragraphs = content.querySelectorAll('p');
      const visibleCount = Number(wrap.dataset.visibleParagraphs || 1);
      if (paragraphs.length <= visibleCount) return;

      paragraphs.forEach((paragraph, index) => {
        if (index >= visibleCount) paragraph.classList.add('is-collapsed');
      });

      toggle.hidden = false;
      toggle.addEventListener('click', () => {
        const expanded = toggle.getAttribute('aria-expanded') === 'true';
        paragraphs.forEach((paragraph, index) => {
          if (index >= visibleCount) {
            paragraph.classList.toggle('is-collapsed', expanded);
          }
        });
        toggle.setAttribute('aria-expanded', expanded ? 'false' : 'true');
        toggle.textContent = expanded
          ? toggle.dataset.readMore || 'Read more'
          : toggle.dataset.readLess || 'Read less';
      });
    });
  }

  disableSfFlyToCartAnimation();
  initSellingPlanPanels();
  initReadMoreBlocks();

  document.addEventListener('click', (event) => {
    const zoomTrigger = event.target.closest('[data-sf-media-zoom]');
    if (zoomTrigger) {
      const gallery = zoomTrigger.closest('[data-sf-media-gallery]');
      const lightbox = gallery?.parentElement?.querySelector('[data-sf-media-lightbox]');
      const lightboxContent = lightbox?.querySelector('[data-sf-media-lightbox-content]');
      const image = zoomTrigger.querySelector('img');
      if (lightbox && lightboxContent && image) {
        lightboxContent.innerHTML = `<img src="${image.currentSrc || image.src}" alt="${image.alt || ''}">`;
        lightbox.hidden = false;
        document.body.style.overflow = 'hidden';
      }
      return;
    }

    const lightboxClose = event.target.closest('[data-sf-media-lightbox-close]');
    if (lightboxClose) {
      const lightbox = lightboxClose.closest('[data-sf-media-lightbox]');
      if (lightbox) {
        lightbox.hidden = true;
        document.body.style.overflow = '';
      }
      return;
    }

    if (event.target.matches('[data-sf-media-lightbox]')) {
      event.target.hidden = true;
      document.body.style.overflow = '';
      return;
    }

    const sfAddToCart = event.target.closest(
      '.sf-product-main .add-to-cart-button, .sf-product-card .add-to-cart-button, [data-sf-cart-open="true"]'
    );
    if (sfAddToCart) {
      showLoadingState(sfAddToCart);
      setTimeout(() => {
        openCartDrawer();
      }, 140);
    }

    const thumb = event.target.closest('[data-sf-media-thumb]');
    if (thumb) {
      const gallery = thumb.closest('[data-sf-media-gallery]');
      if (!gallery) return;

      const mediaId = thumb.getAttribute('data-media-id');
      gallery.querySelectorAll('[data-sf-media-main]').forEach((item) => {
        item.classList.toggle('is-active', item.getAttribute('data-media-id') === mediaId);
      });
      gallery.querySelectorAll('[data-sf-media-thumb]').forEach((item) => {
        item.classList.toggle('is-active', item.getAttribute('data-media-id') === mediaId);
        item.setAttribute('aria-selected', item.getAttribute('data-media-id') === mediaId ? 'true' : 'false');
      });
      return;
    }

    const qtyButton = event.target.closest('[data-sf-qty-change]');
    if (!qtyButton) return;
    const wrapper = qtyButton.closest('[data-sf-qty]');
    if (!wrapper) return;
    const input = wrapper.querySelector('input[name="quantity"]');
    if (!input) return;

    const min = Number(input.min || 1);
    const max = Number(input.max || 999);
    const cur = Number(input.value || min);
    const delta = Number(qtyButton.getAttribute('data-sf-qty-change'));
    const next = Math.max(min, Math.min(max, cur + delta));
    input.value = String(next);
    input.dispatchEvent(new Event('change', { bubbles: true }));
  });

  document.addEventListener('change', (event) => {
    const purchaseType = event.target.closest('[data-sf-purchase-type]');
    if (purchaseType) {
      const panel = purchaseType.closest('[data-sf-selling-plan-panel]');
      updateSellingPlanPanelState(panel);
      return;
    }

    const planSelect = event.target.closest('[data-sf-selling-plan-select]');
    if (planSelect) {
      const panel = planSelect.closest('[data-sf-selling-plan-panel]');
      const subscriptionRadio = panel?.querySelector('[data-sf-purchase-type="subscription"]');
      if (subscriptionRadio) subscriptionRadio.checked = true;
      updateSellingPlanPanelState(panel);
      const picker = document.querySelector('[data-sf-variant-picker]');
      if (picker) updateSellingPlanPrices(picker.value);
      return;
    }

    const picker = event.target.closest('[data-sf-variant-picker]');
    if (!picker) return;

    const variantId = picker.value;
    document.querySelectorAll('[data-product-variant-id]').forEach((input) => {
      input.value = variantId;
    });

    const selected = getVariantMap(picker)[variantId];
    if (!selected) return;

    document.querySelectorAll('[data-sf-price]').forEach((el) => {
      if (selected.price_text) el.textContent = selected.price_text;
    });

    if (selected.compare_at_text) {
      document.querySelectorAll('[data-sf-compare-at]').forEach((el) => {
        el.textContent = selected.compare_at_text;
        el.hidden = false;
      });
    } else {
      document.querySelectorAll('[data-sf-compare-at]').forEach((el) => {
        el.hidden = true;
      });
    }

    updateSellingPlanPrices(variantId);

    document.querySelectorAll('[data-sf-selling-plan-panel]').forEach((panel) => {
      updateSellingPlanPanelState(panel);
    });

    if (selected.featured_media_id) {
      document.querySelectorAll('[data-sf-media-gallery]').forEach((gallery) => {
        const mediaId = String(selected.featured_media_id);
        const main = gallery.querySelector(`[data-sf-media-main][data-media-id="${mediaId}"]`);
        const thumb = gallery.querySelector(`[data-sf-media-thumb][data-media-id="${mediaId}"]`);
        if (!main || !thumb) return;

        gallery.querySelectorAll('[data-sf-media-main]').forEach((item) => {
          item.classList.toggle('is-active', item.getAttribute('data-media-id') === mediaId);
        });
        gallery.querySelectorAll('[data-sf-media-thumb]').forEach((item) => {
          item.classList.toggle('is-active', item.getAttribute('data-media-id') === mediaId);
        });
      });
    }
  });

  document.addEventListener('shopify:section:load', () => {
    disableSfFlyToCartAnimation();
    initSellingPlanPanels();
    initReadMoreBlocks();
  });

  document.addEventListener('keydown', (event) => {
    const lightbox = document.querySelector('[data-sf-media-lightbox]:not([hidden])');
    if (!lightbox) return;
    if (event.key === 'Escape') {
      lightbox.hidden = true;
      document.body.style.overflow = '';
    }
  });

  document.addEventListener('theme-drawer:open', () => {
    clearLoadingStates();
  });
})();
