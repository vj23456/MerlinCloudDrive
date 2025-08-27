// Simple IntersectionObserver-based lazy loader and visibility marker
// Observes elements with class .lazy-observe. If element has data-src and is an <img>, sets src on first visibility.
// Root is the files scroll container to keep work scoped.
(function(){
  const pixel = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==';
  function isImg(el){ return el && el.tagName === 'IMG'; }

  window.lazyObserver = window.lazyObserver || {
    _observer: null,
    init: function() {
      try {
        if (!('IntersectionObserver' in window)) {
          // Fallback: immediately activate all
          this.observeAll(true);
          return;
        }
        if (this._observer) return; // already initialized
        const root = document.querySelector('.files-content') || null;
        this._observer = new IntersectionObserver((entries) => {
          entries.forEach(entry => {
            if (entry.isIntersecting || entry.intersectionRatio > 0) {
              const el = entry.target;
              try {
                // Mark visible for CSS optimizations
                el.classList.add('is-visible');
                // If it's an image with data-src, swap when visible
                if (isImg(el) && el.dataset && el.dataset.src) {
                  if (!el.getAttribute('src') || el.getAttribute('src') === pixel) {
                    el.setAttribute('src', el.dataset.src);
                  }
                  el.removeAttribute('data-src');
                }
              } catch {}
              this._observer.unobserve(el);
            }
          });
        }, { root, rootMargin: '300px 0px', threshold: 0.01 });
        this.observeAll();
      } catch (e) { /* ignore */ }
    },
    observeAll: function(force=false) {
      try {
        const nodes = document.querySelectorAll('.lazy-observe');
        nodes.forEach(n => {
          if (force) {
            // Force activation for all
            try {
              n.classList.add('is-visible');
              if (isImg(n) && n.dataset && n.dataset.src && !n.getAttribute('src')) {
                n.setAttribute('src', n.dataset.src);
                n.removeAttribute('data-src');
              }
            } catch {}
            return;
          }
          if (this._observer) {
            this._observer.observe(n);
          }
        });
      } catch {}
    },
    disconnect: function() {
      try { if (this._observer) { this._observer.disconnect(); this._observer = null; } } catch {}
    }
  };
})();
