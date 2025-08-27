// Simple drag handler for the toast overlay. Allows dragging by grabbing the header of any toast.
// Persists position in localStorage and clamps within viewport.

const STORAGE_KEY = 'toastOverlayPos/v1';

function clamp(val, min, max) {
  return Math.max(min, Math.min(max, val));
}

export function initToastOverlayDrag(overlayEl) {
  if (!overlayEl) return;

  // Restore saved position if any
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      const pos = JSON.parse(saved);
      overlayEl.style.left = (pos.left ?? 0) + 'px';
      overlayEl.style.top = (pos.top ?? 0) + 'px';
      overlayEl.style.right = 'auto';
      overlayEl.style.bottom = 'auto';
    }
  } catch {}

  let dragging = false;
  let startX = 0, startY = 0;
  let startLeft = 0, startTop = 0;

  const onPointerDown = (e) => {
    const header = e.currentTarget?.closest?.('.toast-header') || e.target?.closest?.('.toast-header');
    if (!header) return;

    // If the user is clicking interactive controls inside the header, don't start dragging
    const tgt = e.target;
    if (tgt && (tgt.closest('.toast-close') || tgt.closest('.toast-action-button') || tgt.closest('a,button,input,select,textarea,label')))
      return; // allow the click to propagate normally (no preventDefault)

    // Determine starting box
    const rect = overlayEl.getBoundingClientRect();
    // If still anchored to bottom/right, convert to left/top once
    if (overlayEl.style.left === '' && overlayEl.style.top === '') {
      overlayEl.style.left = rect.left + 'px';
      overlayEl.style.top = rect.top + 'px';
      overlayEl.style.right = 'auto';
      overlayEl.style.bottom = 'auto';
    }

    dragging = true;
    startX = e.clientX;
    startY = e.clientY;
    startLeft = parseFloat(overlayEl.style.left || rect.left);
    startTop = parseFloat(overlayEl.style.top || rect.top);

  header.setPointerCapture?.(e.pointerId);
  e.preventDefault();
  };

  const onPointerMove = (e) => {
    if (!dragging) return;
    const dx = e.clientX - startX;
    const dy = e.clientY - startY;

    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const box = overlayEl.getBoundingClientRect();

    let nextLeft = startLeft + dx;
    let nextTop = startTop + dy;

    // Clamp within viewport (leave ~8px margin)
    nextLeft = clamp(nextLeft, 8 - box.width, vw - 8);
    nextTop = clamp(nextTop, 8 - box.height, vh - 8);

    overlayEl.style.left = nextLeft + 'px';
    overlayEl.style.top = nextTop + 'px';
  };

  const onPointerUp = () => {
    if (!dragging) return;
    dragging = false;
    try {
      const left = parseFloat(overlayEl.style.left || '0');
      const top = parseFloat(overlayEl.style.top || '0');
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ left, top }));
    } catch {}
  };

  // Attach listeners directly on toast headers for reliability
  const headerListeners = new Set();
  const attachHeaderListeners = () => {
    overlayEl.querySelectorAll('.toast-header').forEach(h => {
      if (headerListeners.has(h)) return;
      h.addEventListener('pointerdown', onPointerDown, { passive: false });
      h.style.cursor = 'move';
      headerListeners.add(h);
    });
  };
  attachHeaderListeners();
  window.addEventListener('pointermove', onPointerMove);
  window.addEventListener('pointerup', onPointerUp);

  // MutationObserver to wire up future headers
  const mo = new MutationObserver(() => attachHeaderListeners());
  mo.observe(overlayEl, { childList: true, subtree: true });

  // Return a tiny interop object with a dispose() function for .NET to call
  return {
    dispose: () => {
      headerListeners.forEach(h => h.removeEventListener('pointerdown', onPointerDown));
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      mo.disconnect();
    }
  };
}
