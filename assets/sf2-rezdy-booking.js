(function () {
  document.querySelectorAll('[data-sf2-rezdy]').forEach(function (root) {
    var iframe = root.querySelector('[data-sf2-rezdy-iframe]');
    var loading = root.querySelector('[data-sf2-rezdy-loading]');
    var url = root.getAttribute('data-iframe-url');
    var height = root.getAttribute('data-iframe-height') || '1000';
    if (!iframe || !url) return;

    function mountIframe() {
      if (iframe.getAttribute('src')) return;
      iframe.setAttribute('src', url);
      iframe.setAttribute('height', height);
      iframe.removeAttribute('hidden');
      iframe.addEventListener('load', function onLoad() {
        if (loading) {
          loading.hidden = true;
          loading.setAttribute('aria-hidden', 'true');
        }
        iframe.removeEventListener('load', onLoad);
      });
    }

    if ('IntersectionObserver' in window) {
      var observer = new IntersectionObserver(function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) {
            mountIframe();
            observer.disconnect();
          }
        });
      }, { rootMargin: '200px 0px' });
      observer.observe(root);
    } else {
      mountIframe();
    }
  });
})();
