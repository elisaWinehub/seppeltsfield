(function () {
  document.querySelectorAll('[data-sf2-video-frame]').forEach(function (frame) {
    var btn = frame.querySelector('[data-sf2-video-play]');
    var embed = frame.getAttribute('data-youtube-embed');
    if (!btn || !embed) return;

    function loadVideo() {
      var iframe = document.createElement('iframe');
      iframe.src = embed + (embed.indexOf('?') > -1 ? '&' : '?') + 'autoplay=1';
      iframe.title = btn.getAttribute('aria-label') || 'Video';
      iframe.allow = 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share';
      iframe.allowFullscreen = true;
      frame.innerHTML = '';
      frame.appendChild(iframe);
      btn.hidden = true;
    }

    btn.addEventListener('click', loadVideo);
    btn.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        loadVideo();
      }
    });
  });
})();
