function getScrollContainer() {
  if (window.matchMedia('(min-width: 990px)').matches) {
    return document.querySelector('.page-wrapper') || document.scrollingElement || document.documentElement;
  }
  return document.scrollingElement || document.documentElement;
}

function getScrollTop() {
  return getScrollContainer().scrollTop;
}

function initHeaderScrollState() {
  const header = document.querySelector('[data-sf2-header]');
  const headerGroup = document.querySelector('#header-group');
  const scrollContainer = getScrollContainer();
  if (!header || !headerGroup || !scrollContainer) return;

  const mode = header.dataset.transparency;
  const commerceSolid = header.dataset.commerceSolid === 'true';
  const commerceScrollFixed = header.dataset.commerceScrollFixed === 'true';
  const alwaysSolid = mode === 'always_solid' || (commerceSolid && !commerceScrollFixed);
  const alwaysTransparent = mode === 'always_transparent';

  if (commerceScrollFixed) {
    headerGroup.classList.add('sf2-header-group--in-flow');
  }

  function setHeaderMetrics() {
    const nav = header.querySelector('.sf2-header__nav');
    const navHeight = nav ? nav.offsetHeight : 92;
    document.documentElement.style.setProperty('--sf2-header-nav-height', navHeight + 'px');
    document.documentElement.style.setProperty('--sf2-header-group-height', headerGroup.offsetHeight + 'px');
  }

  function updateHeaderState() {
    const scrolled = getScrollTop() > 0;

    if (commerceScrollFixed) {
      headerGroup.classList.toggle('is-scrolled', scrolled);
      headerGroup.classList.toggle('has-scrolled-header', scrolled);
      return;
    }

    if (alwaysSolid) {
      headerGroup.classList.add('is-scrolled');
      headerGroup.classList.toggle('has-scrolled-header', scrolled);
      return;
    }

    if (alwaysTransparent) {
      headerGroup.classList.remove('is-scrolled');
      headerGroup.classList.remove('has-scrolled-header');
      return;
    }

    headerGroup.classList.toggle('is-scrolled', scrolled);
    headerGroup.classList.toggle('has-scrolled-header', scrolled);
  }

  setHeaderMetrics();
  updateHeaderState();
  scrollContainer.addEventListener('scroll', updateHeaderState, { passive: true });
  window.addEventListener('scroll', updateHeaderState, { passive: true });
  window.addEventListener('resize', function () {
    setHeaderMetrics();
    updateHeaderState();
  });
  document.addEventListener('shopify:section:load', function () {
    setHeaderMetrics();
    updateHeaderState();
  });
}

function scrollToTop() {
  getScrollContainer().scrollTo({ top: 0, behavior: 'smooth' });
}

function initBackToTop() {
  const button = document.querySelector('[data-sf2-back-to-top]');
  const scrollContainer = getScrollContainer();
  if (!button || !scrollContainer) return;

  const showOffset = 320;

  function updateBackToTop() {
    const visible = getScrollTop() > showOffset;
    button.hidden = !visible;
    button.classList.toggle('is-visible', visible);
  }

  button.addEventListener('click', scrollToTop);
  scrollContainer.addEventListener('scroll', updateBackToTop, { passive: true });
  window.addEventListener('scroll', updateBackToTop, { passive: true });
  updateBackToTop();
}

function initHeaderDrawer() {
  const drawer = document.querySelector('[data-sf2-drawer]');
  const openBtns = document.querySelectorAll('[data-sf2-menu-open]');
  const closeBtns = document.querySelectorAll('[data-sf2-menu-close]');
  let lastFocus = null;

  function openDrawer() {
    if (!drawer) return;
    lastFocus = document.activeElement;
    drawer.hidden = false;
    drawer.classList.add('is-open');
    openBtns.forEach(function (btn) {
      btn.setAttribute('aria-expanded', 'true');
    });
    const first = drawer.querySelector('a, button');
    if (first) first.focus();
  }

  function closeDrawer() {
    if (!drawer) return;
    drawer.classList.remove('is-open');
    drawer.hidden = true;
    openBtns.forEach(function (btn) {
      btn.setAttribute('aria-expanded', 'false');
    });
    if (lastFocus) lastFocus.focus();
  }

  openBtns.forEach(function (btn) {
    btn.addEventListener('click', openDrawer);
  });
  closeBtns.forEach(function (btn) {
    btn.addEventListener('click', closeDrawer);
  });
  document.addEventListener('keydown', function (event) {
    if (event.key === 'Escape') closeDrawer();
  });
}

document.addEventListener('DOMContentLoaded', function () {
  initHeaderScrollState();
  initHeaderDrawer();
  initBackToTop();
});
