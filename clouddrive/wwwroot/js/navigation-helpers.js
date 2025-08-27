// Navigation and DOM helper functions

// Internal shared scroll state to coordinate different helpers
window.__filesScrollState = window.__filesScrollState || {
    suppressTopResetUntil: 0,
    cancelTopResetUntil: 0, // hard-cancel any pending top resets while focused-item scrolling
    userScrollUntil: 0,     // short window after user scroll where auto top-resets are suppressed
    progScrollDepth: 0      // nesting counter for programmatic scrolls
};

// Internal helpers to mark programmatic scroll activity so user scroll detection doesn't fire
function _beginProgScroll() {
    try { window.__filesScrollState.progScrollDepth = (window.__filesScrollState.progScrollDepth || 0) + 1; } catch {}
}
function _endProgScroll() {
    try { window.__filesScrollState.progScrollDepth = Math.max(0, (window.__filesScrollState.progScrollDepth || 1) - 1); } catch {}
}
function _isProgScrolling() {
    try { return (window.__filesScrollState.progScrollDepth || 0) > 0; } catch { return false; }
}

// Capture user-initiated scrolls on the main files container and briefly suppress auto top resets
(function setupFilesUserScrollSuppression(){
    const markUserScroll = () => {
        if (_isProgScrolling()) return; // ignore programmatic scrolls
        try {
            const now = Date.now();
            // 1200ms grace period after a user scroll
            window.__filesScrollState.userScrollUntil = now + 1200;
            // Also extend general suppression to minimize fights with pending resets
            const maxUntil = now + 1200;
            window.__filesScrollState.suppressTopResetUntil = Math.max(window.__filesScrollState.suppressTopResetUntil || 0, maxUntil);
        } catch {}
    };

    // Use a capturing listener at document level to catch scrolls even if container re-renders
    try {
        document.addEventListener('scroll', (e) => {
            const t = e.target;
            if (!t) return;
            if (t.id === 'main-files-content' || (t.classList && t.classList.contains('files-content'))) {
                markUserScroll();
            }
        }, true);
    } catch {}
})();

// Global focus helper function for keyboard navigation
window.focusElement = function(elementSelector) {
    const element = document.querySelector(elementSelector);
    if (element) {
        element.focus();
        return true;
    }
    return false;
};

// Helper function to check if an element exists
window.elementExists = function(elementIdOrSelector) {
    // Check if it's an ID (starts with nothing, assume it's an ID) or selector (starts with . or #)
    let element;
    if (elementIdOrSelector.startsWith('.') || elementIdOrSelector.startsWith('#')) {
        element = document.querySelector(elementIdOrSelector);
    } else {
        element = document.getElementById(elementIdOrSelector);
    }
    return element !== null;
};

// Global scroll helper function for keyboard navigation
window.scrollToElement = function(elementId) {
    const element = document.getElementById(elementId);
    if (!element) return false;

    // Prefer the main files content container explicitly
    let scrollContainer = document.getElementById('main-files-content');
    if (!scrollContainer) {
        // Fall back to nearest .files-content ancestor
        scrollContainer = element.closest('.files-content');
    }
    if (!scrollContainer) return false;

    try {
        const er = element.getBoundingClientRect();
        const cr = scrollContainer.getBoundingClientRect();

        const above = er.top < cr.top;
        const below = er.bottom > cr.bottom;
        const left = er.left < cr.left;
        const right = er.right > cr.right;
        const outOfView = above || below || left || right;

        if (!outOfView) return true;

        // Compute a centered scrollTop relative to container
        const prev = scrollContainer.style.scrollBehavior;
        try { scrollContainer.style.scrollBehavior = 'auto'; } catch {}
        const desired = scrollContainer.scrollTop + (er.top - cr.top) - (scrollContainer.clientHeight/2 - element.offsetHeight/2);
        scrollContainer.scrollTo({ top: Math.max(0, desired), behavior: 'auto' });
        try { scrollContainer.style.scrollBehavior = prev || ''; } catch {}
        return true;
    } catch (e) {
        return false;
    }
};

// Helper function to wait for view container to be ready
window.waitForViewContainer = function(viewMode, maxRetries = 10) {
    return new Promise((resolve) => {
        let retries = 0;
        
        function checkContainer() {
            retries++;
            // Prefer our main files scroll container; fall back to generic files-content
            const selectorList = [
                '#main-files-content',
                '.files-content',
                '.files-list',
                '.files-grid'
            ];
            const selector = selectorList.join(', ');
            const container = document.querySelector(selector);
            
            if (container || retries >= maxRetries) {

                resolve(!!container);
            } else {
                setTimeout(checkContainer, 100);
            }
        }
        
        checkContainer();
    });
};

// Enhanced scroll function that waits for the correct view container
window.scrollToElementInView = function(elementId, viewMode, options) {
    return new Promise(async (resolve) => {
    try { console.debug('[FILES_TRACE_JS] scrollToElementInView start', { elementId, viewMode, options }); } catch {}
        const containerReady = await window.waitForViewContainer(viewMode);
        if (!containerReady) { resolve(false); return; }

        // Backward-compatible options
        const cfg = {
            align: (options && options.align) || 'center', // 'center' | 'start' | 'end'
            offset: (options && typeof options.offset === 'number') ? options.offset : 0,
            marginPx: (options && typeof options.marginPx === 'number') ? options.marginPx : 2,
            maxAttempts: (options && typeof options.maxAttempts === 'number') ? options.maxAttempts : 40,
            interval: (options && typeof options.interval === 'number') ? options.interval : 30,
            suppressTopResetMs: (options && typeof options.suppressTopResetMs === 'number') ? options.suppressTopResetMs : 800
        };

    // Suppress page top resets while we are performing a focused-item scroll
    try {
    _beginProgScroll();
        var now = Date.now();
        window.__filesScrollState.suppressTopResetUntil = now + cfg.suppressTopResetMs;
        // Also set a hard-cancel window so delayed top-reset loops abort entirely
        window.__filesScrollState.cancelTopResetUntil = now + cfg.suppressTopResetMs + 200;
    } catch {}

        const maxAttempts = cfg.maxAttempts; // ~1.2s at 30ms by default
        const interval = cfg.interval;
        let attempts = 0;

    const tryCenter = () => {
            attempts++;
            const el = document.getElementById(elementId);
            const container = document.getElementById('main-files-content') || document.querySelector('.files-content');
            // If container is missing, bail
            if (!container) { resolve(false); return; }
            // If element isn't in DOM yet, keep trying until maxAttempts
            if (!el) {
                if (attempts >= maxAttempts) { resolve(false); return; }
                if (attempts < 5 && 'requestAnimationFrame' in window) {
                    requestAnimationFrame(tryCenter);
                } else {
                    setTimeout(tryCenter, interval);
                }
                return;
            }

            // Recompute rects each attempt to account for reflow
            const er = el.getBoundingClientRect();
            const cr = container.getBoundingClientRect();
            const margin = cfg.marginPx;
            const visible = er.top >= cr.top + margin && er.bottom <= cr.bottom - margin;
            if (visible) { try { console.debug('[FILES_TRACE_JS] element already visible'); } catch {} resolve(true); return; }

            // Compute desired scrollTop based on alignment
            const prev = container.style.scrollBehavior;
            try { container.style.scrollBehavior = 'auto'; } catch {}
            let desired;
            if (cfg.align === 'start') {
                desired = container.scrollTop + (er.top - cr.top) - cfg.offset;
            } else if (cfg.align === 'end') {
                desired = container.scrollTop + (er.bottom - cr.bottom) + cfg.offset;
            } else {
                // center
                desired = container.scrollTop + (er.top - cr.top) - (container.clientHeight/2 - el.offsetHeight/2) - cfg.offset;
            }
            const maxTop = Math.max(0, container.scrollHeight - container.clientHeight);
            const clamped = Math.min(maxTop, Math.max(0, desired));
            try { console.debug('[FILES_TRACE_JS] container.scrollTo', { top: clamped }); } catch {}
            container.scrollTo({ top: clamped, behavior: 'auto' });
            try { container.style.scrollBehavior = prev || ''; } catch {}

            if (attempts >= maxAttempts) { try { console.debug('[FILES_TRACE_JS] scrollToElementInView max attempts reached'); } catch {} resolve(false); return; }
            // Use rAF for the first few frames, then fall back to setTimeout
            if (attempts < 5 && 'requestAnimationFrame' in window) {
                requestAnimationFrame(tryCenter);
            } else {
                setTimeout(tryCenter, interval);
            }
        };

        // Kick off with a small defer to ensure layout is ready
        if ('requestAnimationFrame' in window) {
            requestAnimationFrame(tryCenter);
        } else {
            setTimeout(tryCenter, interval);
        }

    // End programmatic scroll marking shortly after the sequence starts
    setTimeout(_endProgScroll, 0);
    });
};

// Pre-scroll a list container by approximate item index and item height (for Virtualize)
// containerSelector: CSS selector for scroll container (e.g., '#main-files-content')
// index: zero-based index within the current page
// itemSize: estimated row height in px
// extraOffset: extra px to account for sentinel rows or headers
window.scrollListToApproxIndex = function(containerSelector, index, itemSize, extraOffset = 0) {
    try {
        const container = document.querySelector(containerSelector);
        if (!container) return false;
        const top = Math.max(0, (index * itemSize) + (extraOffset || 0) - 8);
        const prev = container.style.scrollBehavior;
        try { container.style.scrollBehavior = 'auto'; } catch {}
    try { console.debug('[FILES_TRACE_JS] scrollListToApproxIndex', { top, index, itemSize, extraOffset }); } catch {}
        container.scrollTo({ top, behavior: 'auto' });
        try { container.style.scrollBehavior = prev || ''; } catch {}
        return true;
    } catch (e) {
        return false;
    }
};

// Wait until a scroll container has been idle (no scroll events) for a duration, or until a max timeout
// selector: CSS selector for the scroll container (e.g., '#main-files-content')
// idleMs: how long the container must be idle to resolve (default 250ms)
// maxWaitMs: maximum time to wait before resolving regardless (default 1200ms)
window.waitForScrollIdle = function(selector, idleMs = 250, maxWaitMs = 1200) {
    return new Promise((resolve) => {
        try {
            const container = document.querySelector(selector) || document.querySelector('.files-content');
            if (!container) {
                resolve(true);
                return;
            }

            let idleTimer = null;
            let resolved = false;

            const cleanup = () => {
                if (idleTimer) { clearTimeout(idleTimer); idleTimer = null; }
                container.removeEventListener('scroll', onScroll, { passive: true });
            };

            const resolveOnce = () => {
                if (resolved) return;
                resolved = true;
                cleanup();
                resolve(true);
            };

            const onScroll = () => {
                if (idleTimer) { clearTimeout(idleTimer); }
                idleTimer = setTimeout(resolveOnce, Math.max(50, idleMs));
            };

            // If container isn't currently scrolling, still wait a tiny bit to allow initial renders
            idleTimer = setTimeout(resolveOnce, Math.max(80, idleMs));
            container.addEventListener('scroll', onScroll, { passive: true });

            // Hard cap to avoid waiting too long
            setTimeout(resolveOnce, Math.max(idleMs, maxWaitMs));
        } catch (e) {
            resolve(true);
        }
    });
};

// Read current scroll state of a container for smarter scheduling
// Returns an object: { top, height, client, maxTop, atTop, atBottom, nearBottom }
window.getScrollState = function(selector, nearPx = 200) {
    try {
        const el = document.querySelector(selector) || document.querySelector('.files-content');
        if (!el) return null;
        const top = el.scrollTop || 0;
        const client = el.clientHeight || 0;
        const height = el.scrollHeight || 0;
        const maxTop = Math.max(0, height - client);
        const atTop = top <= 1;
        const atBottom = top >= maxTop - 1;
        const nearBottom = top >= Math.max(0, maxTop - (typeof nearPx === 'number' ? nearPx : 200));
    try { console.debug('[FILES_TRACE_JS] getScrollState', { top, height, client, maxTop, atTop, atBottom, nearBottom }); } catch {}
    return { top, height, client, maxTop, atTop, atBottom, nearBottom };
    } catch (e) {
        return null;
    }
};

// TreeView helper functions for finding and scrolling to nodes
window.treeViewHelpers = {
    // Find a tree node element by its data-path attribute
    findNodeElement: function(treeContainer, nodePath) {
        if (!treeContainer || !nodePath) {

            return null;
        }
        
        try {
            // Look for the node with the specific data-path attribute
            const nodeElement = treeContainer.querySelector(`[data-path="${nodePath}"]`);
            if (nodeElement) {

                return nodeElement;
            } else {

                return null;
            }
        } catch (error) {
            return null;
        }
    },
    
    // Check if an element is already visible (for lazy scrolling)
    isElementVisible: function(treeContainer, nodePath) {
        if (!treeContainer || !nodePath) {

            return false;
        }
        
        try {
            const element = treeContainer.querySelector(`[data-path="${nodePath}"]`);
            if (!element) {

                return false;
            }
            
            const containerRect = treeContainer.getBoundingClientRect();
            const elementRect = element.getBoundingClientRect();
            
            // Check if element is totally invisible (same logic as scrollToElement)
            // Add some margin to be more lenient about what's considered "visible"
            const margin = 10;
            const isAbove = elementRect.bottom < (containerRect.top - margin);
            const isBelow = elementRect.top > (containerRect.bottom + margin);
            const isLeftOf = elementRect.right < (containerRect.left - margin);
            const isRightOf = elementRect.left > (containerRect.right + margin);
            
            const isTotallyInvisible = isAbove || isBelow || isLeftOf || isRightOf;
            
            return !isTotallyInvisible; // Return true if visible
        } catch (error) {
            return false; // If we can't check, assume it's not visible and allow scroll
        }
    },

    // Scroll to a specific element within the tree container (lazy scrolling - only if totally invisible)
    scrollToElement: function(treeContainer, element) {
        if (!treeContainer || !element) {

            return false;
        }
        
        try {
            
            // Use the treeContainer directly as it should be the tree-content div
            const scrollContainer = treeContainer;
            
            // Get container and element bounds
            const containerRect = scrollContainer.getBoundingClientRect();
            const elementRect = element.getBoundingClientRect();
            
            // Check if element is totally invisible (lazy scrolling)
            // Use smaller margin for more aggressive scrolling during navigation
            const margin = 5;
            const isAbove = elementRect.bottom < (containerRect.top - margin);
            const isBelow = elementRect.top > (containerRect.bottom + margin);
            const isLeftOf = elementRect.right < (containerRect.left - margin);
            const isRightOf = elementRect.left > (containerRect.right + margin);
            
            const isTotallyInvisible = isAbove || isBelow || isLeftOf || isRightOf;
            
            if (!isTotallyInvisible) {
                return true;
            }
            
            // Use instant scrollIntoView for immediate navigation
            element.scrollIntoView({ 
                behavior: 'instant', 
                block: 'center',
                inline: 'start'
            });
            
            return true;
            
        } catch (error) {
            return false;
        }
    }
};

// Media Viewer Fullscreen Functions
window.requestFullscreen = function(elementSelector) {
    const element = document.querySelector(elementSelector);
    if (!element) {
        return false;
    }
    
    try {
        if (element.requestFullscreen) {
            element.requestFullscreen();
        } else if (element.webkitRequestFullscreen) {
            element.webkitRequestFullscreen();
        } else if (element.mozRequestFullScreen) {
            element.mozRequestFullScreen();
        } else if (element.msRequestFullscreen) {
            element.msRequestFullscreen();
        } else {
            return false;
        }
        return true;
    } catch (error) {
        return false;
    }
};

window.exitFullscreen = function() {
    try {
        if (document.exitFullscreen) {
            document.exitFullscreen();
        } else if (document.webkitExitFullscreen) {
            document.webkitExitFullscreen();
        } else if (document.mozCancelFullScreen) {
            document.mozCancelFullScreen();
        } else if (document.msExitFullscreen) {
            document.msExitFullscreen();
        } else {
            return false;
        }
        return true;
    } catch (error) {
        return false;
    }
};

// Check if currently in fullscreen mode
window.isFullscreen = function() {
    return !!(document.fullscreenElement || 
              document.webkitFullscreenElement || 
              document.mozFullScreenElement || 
              document.msFullscreenElement);
};

// Add mouse wheel, touch swipe, and drag support for media viewer
window.addViewerGestureSupport = function(elementSelector, dotNetRef) {
    const element = document.querySelector(elementSelector);
    if (!element) {
        return false;
    }
    
    // Drag state variables
    let isDragging = false;
    let dragStartX = 0;
    let dragStartY = 0;
    let currentDragX = 0;
    let currentDragY = 0;
    let dragStartTime = 0;
    let dragElement = null;
    
    // Create a visual feedback element for dragging
    const createDragFeedback = () => {
        const feedback = document.createElement('div');
        feedback.className = 'viewer-drag-feedback';
        feedback.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background: rgba(0, 0, 0, 0.3);
            z-index: 10001;
            pointer-events: none;
            transition: none;
            transform-origin: center;
        `;
        element.appendChild(feedback);
        return feedback;
    };
    
    // Mouse wheel navigation with debouncing for precise control
    let wheelDebounceTimer = null;
    let wheelAccumulation = 0;
    const wheelThreshold = 100; // Minimum accumulated delta to trigger navigation
    const wheelDebounceDelay = 150; // Delay in ms before processing accumulated wheel events
    
    const handleWheel = (event) => {
        // Only handle horizontal scrolling or when holding Shift
        if (Math.abs(event.deltaX) > Math.abs(event.deltaY) || event.shiftKey) {
            event.preventDefault();
            
            // Accumulate wheel delta
            if (event.deltaX !== 0) {
                wheelAccumulation += event.deltaX;
            } else if (event.shiftKey) {
                wheelAccumulation += event.deltaY;
            }
            
            // Clear existing timer
            if (wheelDebounceTimer) {
                clearTimeout(wheelDebounceTimer);
            }
            
            // Set new timer to process accumulated wheel events
            wheelDebounceTimer = setTimeout(() => {
                if (Math.abs(wheelAccumulation) >= wheelThreshold) {
                    if (wheelAccumulation > 0) {
                        // Scroll right or shift+scroll down = next
                        dotNetRef.invokeMethodAsync('NavigateNext');
                    } else {
                        // Scroll left or shift+scroll up = previous
                        dotNetRef.invokeMethodAsync('NavigatePrevious');
                    }
                }
                
                // Reset accumulation
                wheelAccumulation = 0;
            }, wheelDebounceDelay);
        }
    };
    
    // Start drag operation (mouse and touch)
    const startDrag = (clientX, clientY, event) => {
        // Don't start drag on buttons, toolbars, or interactive elements
        if (event.target.closest('.viewer-btn, .viewer-nav, .viewer-toolbar, .viewer-toolbar-top, .viewer-toolbar-left, .viewer-toolbar-center, .viewer-toolbar-right, button, input, select, textarea')) {
            return false;
        }
        
        isDragging = true;
        dragStartX = clientX;
        dragStartY = clientY;
        currentDragX = 0;
        currentDragY = 0;
        dragStartTime = Date.now();
        
        // Create visual feedback
        dragElement = createDragFeedback();
        
        // Add dragging class for performance optimization
        const viewerContent = element.querySelector('.viewer-content');
        if (viewerContent) {
            viewerContent.classList.add('dragging');
        }
        
        // Prevent text selection and other default behaviors
        event.preventDefault();
        document.body.style.userSelect = 'none';
        
        return true;
    };
    
    // Update drag operation
    const updateDrag = (clientX, clientY) => {
        if (!isDragging || !dragElement) return;
        
        currentDragX = clientX - dragStartX;
        currentDragY = clientY - dragStartY;
        
        // Calculate drag progress (0 to 1)
        const maxDragDistance = 150;
        const horizontalProgress = Math.min(Math.abs(currentDragX) / maxDragDistance, 1);
        const verticalProgress = Math.min(Math.abs(currentDragY) / maxDragDistance, 1);
        
        // Find the media content element (image or video)
        const mediaContent = element.querySelector('.viewer-content img, .viewer-content video');
        const viewerContent = element.querySelector('.viewer-content');
        
        // Determine primary drag direction
        if (Math.abs(currentDragX) > Math.abs(currentDragY)) {
            // Horizontal drag - navigation
            const direction = currentDragX > 0 ? 'right' : 'left';
            const opacity = Math.max(0.1, 0.3 - horizontalProgress * 0.2); // Much more subtle opacity change
            const translateX = currentDragX * 0.3; // Reduced movement for subtlety
            
            // Move the overlay feedback - make it much more subtle
            dragElement.style.transform = `translateX(${translateX}px)`;
            dragElement.style.opacity = opacity;
            
            // Move the actual media content
            if (mediaContent) {
                const mediaTranslateX = currentDragX * 0.6; // More pronounced movement for media
                mediaContent.style.transform = `translateX(${mediaTranslateX}px)`;
                mediaContent.style.transition = 'none'; // Disable transitions during drag
                mediaContent.style.opacity = '1'; // Ensure media stays fully opaque
            }
            
            // Also move the entire viewer content container slightly
            if (viewerContent) {
                const contentTranslateX = currentDragX * 0.2; // Subtle container movement
                viewerContent.style.transform = `translateX(${contentTranslateX}px)`;
                viewerContent.style.transition = 'none';
            }
            
            // Add visual hint
            if (horizontalProgress > 0.3) {
                dragElement.style.boxShadow = direction === 'right' 
                    ? 'inset -5px 0 20px rgba(0, 255, 0, 0.3)' 
                    : 'inset 5px 0 20px rgba(0, 255, 0, 0.3)';
            }
        } else {
            // Vertical drag - close
            const opacity = Math.max(0.05, 0.3 - verticalProgress * 0.25); // Very subtle opacity change
            const scale = Math.max(0.95, 1 - verticalProgress * 0.05); // Very subtle scaling
            const translateY = currentDragY * 0.5; // Reduced movement
            
            // Move the overlay feedback - make it much more subtle
            dragElement.style.transform = `translateY(${translateY}px) scale(${scale})`;
            dragElement.style.opacity = opacity;
            
            // Move and scale the actual media content
            if (mediaContent) {
                const mediaTranslateY = currentDragY * 0.7; // More pronounced movement for media
                const mediaScale = Math.max(0.8, 1 - verticalProgress * 0.2); // Scale down more aggressively
                mediaContent.style.transform = `translateY(${mediaTranslateY}px) scale(${mediaScale})`;
                mediaContent.style.transition = 'none';
                mediaContent.style.opacity = '1'; // Ensure media stays fully opaque
            }
            
            // Also move and scale the entire viewer content container
            if (viewerContent) {
                const contentTranslateY = currentDragY * 0.3; // Subtle container movement
                const contentScale = Math.max(0.95, 1 - verticalProgress * 0.05); // Very subtle scaling
                viewerContent.style.transform = `translateY(${contentTranslateY}px) scale(${contentScale})`;
                viewerContent.style.transition = 'none';
            }
            
            // Add visual hint for close
            if (verticalProgress > 0.3) {
                dragElement.style.boxShadow = 'inset 0 0 50px rgba(255, 0, 0, 0.3)';
            }
        }
    };
    
    // End drag operation
    const endDrag = () => {
        if (!isDragging) return;
        
        const dragTime = Date.now() - dragStartTime;
        
        // Calculate if drag was significant enough
        const minDragDistance = 50;
        const isHorizontalDrag = Math.abs(currentDragX) > Math.abs(currentDragY);
        const isVerticalDrag = Math.abs(currentDragY) > Math.abs(currentDragX);
        
        let actionTaken = false;
        
        // Check for significant drag distance regardless of speed
        // This allows both quick gestures and slow deliberate drags
        if (isHorizontalDrag && Math.abs(currentDragX) > minDragDistance) {
            // Horizontal drag - navigate
            if (currentDragX > 0) {
                // Drag right = previous
                dotNetRef.invokeMethodAsync('NavigatePrevious');
            } else {
                // Drag left = next
                dotNetRef.invokeMethodAsync('NavigateNext');
            }
            actionTaken = true;
        } else if (isVerticalDrag && Math.abs(currentDragY) > minDragDistance) {
            // Vertical drag - close
            dotNetRef.invokeMethodAsync('CloseViewer');
            actionTaken = true;
        }
        
        // Cleanup
        const mediaContent = element.querySelector('.viewer-content img, .viewer-content video');
        const viewerContent = element.querySelector('.viewer-content');
        
        if (dragElement) {
            if (actionTaken) {
                // Quick fade out
                dragElement.style.transition = 'opacity 0.2s ease-out';
                dragElement.style.opacity = '0';
                
                // Reset media content immediately for action
                if (mediaContent) {
                    mediaContent.style.transition = 'transform 0.2s ease-out';
                    mediaContent.style.transform = 'translateX(0) translateY(0) scale(1)';
                    mediaContent.style.opacity = '1'; // Ensure media stays fully visible
                }
                if (viewerContent) {
                    viewerContent.style.transition = 'transform 0.2s ease-out';
                    viewerContent.style.transform = 'translateX(0) translateY(0) scale(1)';
                }
                
                setTimeout(() => {
                    if (dragElement && dragElement.parentNode) {
                        dragElement.parentNode.removeChild(dragElement);
                    }
                }, 200);
            } else {
                // Animate back to original state
                dragElement.style.transition = 'all 0.3s ease-out';
                dragElement.style.transform = 'translateX(0) translateY(0) scale(1)';
                dragElement.style.opacity = '1';
                dragElement.style.boxShadow = 'none';
                
                // Animate media content back to original position
                if (mediaContent) {
                    mediaContent.style.transition = 'transform 0.3s ease-out';
                    mediaContent.style.transform = 'translateX(0) translateY(0) scale(1)';
                    mediaContent.style.opacity = '1'; // Ensure media stays fully visible
                }
                if (viewerContent) {
                    viewerContent.style.transition = 'transform 0.3s ease-out';
                    viewerContent.style.transform = 'translateX(0) translateY(0) scale(1)';
                }
                
                setTimeout(() => {
                    if (dragElement && dragElement.parentNode) {
                        dragElement.parentNode.removeChild(dragElement);
                    }
                    // Clear transitions after animation completes
                    if (mediaContent) {
                        mediaContent.style.transition = '';
                        mediaContent.style.opacity = ''; // Reset opacity
                    }
                    if (viewerContent) {
                        viewerContent.style.transition = '';
                    }
                }, 300);
            }
        }
        
        // Reset state and cleanup media transforms
        const resetMediaTransforms = () => {
            const mediaContent = element.querySelector('.viewer-content img, .viewer-content video');
            const viewerContent = element.querySelector('.viewer-content');
            
            if (mediaContent) {
                mediaContent.style.transform = '';
                mediaContent.style.transition = '';
                mediaContent.style.opacity = ''; // Reset opacity to ensure full visibility
            }
            if (viewerContent) {
                viewerContent.style.transform = '';
                viewerContent.style.transition = '';
                viewerContent.classList.remove('dragging');
            }
        };
        
        isDragging = false;
        dragElement = null;
        document.body.style.userSelect = '';
        resetMediaTransforms();
    };
    
    // Mouse events
    const handleMouseDown = (event) => {
        if (event.button === 0) { // Left mouse button only
            startDrag(event.clientX, event.clientY, event);
        }
    };
    
    const handleMouseMove = (event) => {
        if (isDragging) {
            updateDrag(event.clientX, event.clientY);
        }
    };
    
    const handleMouseUp = (event) => {
        if (isDragging) {
            endDrag();
        }
    };
    
    // Touch events
    let touchStartX = 0;
    let touchStartY = 0;
    let touchStartTime = 0;
    
    const handleTouchStart = (event) => {
        const touch = event.touches[0];
        touchStartX = touch.clientX;
        touchStartY = touch.clientY;
        touchStartTime = Date.now();
        
        // Start drag for touch
        startDrag(touch.clientX, touch.clientY, event);
    };
    
    const handleTouchMove = (event) => {
        if (isDragging && event.touches.length === 1) {
            const touch = event.touches[0];
            updateDrag(touch.clientX, touch.clientY);
            event.preventDefault(); // Prevent scrolling
        }
    };
    
    const handleTouchEnd = (event) => {
        if (isDragging) {
            endDrag();
        } else {
            // Fallback to simple swipe detection for quick gestures
            const touch = event.changedTouches[0];
            const touchEndX = touch.clientX;
            const touchEndY = touch.clientY;
            const touchEndTime = Date.now();
            
            const deltaX = touchEndX - touchStartX;
            const deltaY = touchEndY - touchStartY;
            const deltaTime = touchEndTime - touchStartTime;
            
            // Check if it's a quick swipe (minimum distance and maximum time)
            const minSwipeDistance = 50;
            const maxSwipeTime = 300;
            
            if (Math.abs(deltaX) > minSwipeDistance && 
                Math.abs(deltaX) > Math.abs(deltaY) && 
                deltaTime < maxSwipeTime) {
                
                event.preventDefault();
                
                if (deltaX > 0) {
                    // Swipe right = previous
                    dotNetRef.invokeMethodAsync('NavigatePrevious');
                } else {
                    // Swipe left = next
                    dotNetRef.invokeMethodAsync('NavigateNext');
                }
            }
        }
    };
    
    // Add event listeners
    element.addEventListener('wheel', handleWheel, { passive: false });
    element.addEventListener('mousedown', handleMouseDown, { passive: false });
    element.addEventListener('mousemove', handleMouseMove, { passive: false });
    element.addEventListener('mouseup', handleMouseUp, { passive: false });
    element.addEventListener('touchstart', handleTouchStart, { passive: false });
    element.addEventListener('touchmove', handleTouchMove, { passive: false });
    element.addEventListener('touchend', handleTouchEnd, { passive: false });
    
    // Handle mouse leave to end drag
    const handleMouseLeave = () => {
        if (isDragging) {
            endDrag();
        }
    };
    element.addEventListener('mouseleave', handleMouseLeave, { passive: false });
    
    // Return cleanup function
    return {
        remove: () => {
            // Clean up wheel debounce timer
            if (wheelDebounceTimer) {
                clearTimeout(wheelDebounceTimer);
                wheelDebounceTimer = null;
            }
            
            element.removeEventListener('wheel', handleWheel);
            element.removeEventListener('mousedown', handleMouseDown);
            element.removeEventListener('mousemove', handleMouseMove);
            element.removeEventListener('mouseup', handleMouseUp);
            element.removeEventListener('mouseleave', handleMouseLeave);
            element.removeEventListener('touchstart', handleTouchStart);
            element.removeEventListener('touchmove', handleTouchMove);
            element.removeEventListener('touchend', handleTouchEnd);
            
            // Clean up any remaining drag elements
            if (dragElement && dragElement.parentNode) {
                dragElement.parentNode.removeChild(dragElement);
            }
        }
    };
};

// Remove gesture support
window.removeViewerGestureSupport = function(elementSelector) {
    const element = document.querySelector(elementSelector);
    if (element && element._gestureSupport) {
        element._gestureSupport.remove();
        element._gestureSupport = null;
    }
}

// Media prefetching functionality
window.prefetchMedia = function(url, isImage, cancellationToken) {
    return new Promise((resolve, reject) => {
        try {
            // Check if cancellation was requested before starting
            if (cancellationToken && cancellationToken.isCancellationRequested) {
                reject(new Error('Operation was cancelled'));
                return;
            }
            
            let element;
            
            if (isImage) {
                // Create a hidden image element for prefetching
                element = document.createElement('img');
                element.style.display = 'none';
                element.style.position = 'absolute';
                element.style.left = '-9999px';
                element.style.width = '1px';
                element.style.height = '1px';
                
                element.onload = () => {
                    document.body.removeChild(element);
                    resolve();
                };
                
                element.onerror = (error) => {
                    if (document.body.contains(element)) {
                        document.body.removeChild(element);
                    }
                    // Don't reject for prefetch failures, just log them
                    resolve();
                };
                
                // Set up cancellation
                if (cancellationToken) {
                    const cancelHandler = () => {
                        if (document.body.contains(element)) {
                            document.body.removeChild(element);
                        }
                        reject(new Error('Operation was cancelled'));
                    };
                    
                    // Add to cancellation token if supported
                    if (cancellationToken.register) {
                        cancellationToken.register(cancelHandler);
                    }
                }
                
                // Add to DOM and start loading
                document.body.appendChild(element);
                element.src = url;
            } else {
                // For videos, create a hidden video element with preload="metadata"
                element = document.createElement('video');
                element.style.display = 'none';
                element.style.position = 'absolute';
                element.style.left = '-9999px';
                element.style.width = '1px';
                element.style.height = '1px';
                element.preload = 'metadata';
                element.muted = true; // Ensure it doesn't interfere with current playback
                
                element.onloadedmetadata = () => {
                    document.body.removeChild(element);
                    resolve();
                };
                
                element.onerror = (error) => {
                    if (document.body.contains(element)) {
                        document.body.removeChild(element);
                    }
                    // Don't reject for prefetch failures, just log them
                    resolve();
                };
                
                // Set up cancellation
                if (cancellationToken) {
                    const cancelHandler = () => {
                        if (document.body.contains(element)) {
                            document.body.removeChild(element);
                        }
                        reject(new Error('Operation was cancelled'));
                    };
                    
                    // Add to cancellation token if supported
                    if (cancellationToken.register) {
                        cancellationToken.register(cancelHandler);
                    }
                }
                
                // Add to DOM and start loading
                document.body.appendChild(element);
                element.src = url;
            }
            
            // Add a timeout to prevent hanging prefetch requests
            setTimeout(() => {
                if (document.body.contains(element)) {
                    document.body.removeChild(element);
                    resolve(); // Resolve even on timeout
                }
            }, 30000); // 30 second timeout
            
        } catch (error) {
            reject(error);
        }
    });
};

// Centralized localStorage helpers for all settings
window.settingsHelpers = {
    // Language settings
    getLanguage: function() {
        try {
            return localStorage.getItem('culture') || 'auto';
        } catch (error) {
            return 'auto';
        }
    },
    
    saveLanguage: function(language) {
        try {
            localStorage.setItem('culture', language);
        } catch (error) {
        }
    },
    
    // Theme settings
    getTheme: function() {
        try {
            return localStorage.getItem('theme') || 'auto';
        } catch (error) {
            return 'auto';
        }
    },
    
    saveTheme: function(theme) {
        try {
            localStorage.setItem('theme', theme);
        } catch (error) {
        }
    },
    
    // View mode settings
    getViewMode: function() {
        try {
            return localStorage.getItem('view-mode') || 'grid';
        } catch (error) {
            return 'grid';
        }
    },
    
    saveViewMode: function(viewMode) {
        try {
            localStorage.setItem('view-mode', viewMode);
        } catch (error) {
        }
    },
    
    // Initialize all settings immediately
    initializeAllSettings: function() {
        
        // Initialize theme immediately
        this.initializeThemeImmediately();
        
        // Initialize language (for future use, currently handled by Blazor)
        const savedLanguage = this.getLanguage();
        
        // Initialize view mode (will be used by Blazor components)
        const savedViewMode = this.getViewMode();
        // Initialize waterfall size (already implemented)
        if (window.waterfallSizeHelpers) {
            window.waterfallSizeHelpers.initializeCSSImmediately();
        }
    },
    
    // Apply theme immediately before Blazor renders
    initializeThemeImmediately: function() {
        try {
            const savedTheme = this.getTheme();
            let actualTheme = savedTheme;
            
            // If auto theme, detect system preference
            if (savedTheme === 'auto') {
                actualTheme = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
            }
            
            // Only set data-theme attribute since CSS uses [data-theme] selectors
            document.documentElement.setAttribute('data-theme', actualTheme);
            
            return actualTheme;
        } catch (error) {
            // Fallback to light theme
            document.documentElement.setAttribute('data-theme', 'light');
            return 'light';
        }
    }
};

// Theme manager for real-time theme switching
window.themeManager = {
    setTheme: function(theme) {
        try {
            
            // Save the theme preference first
            window.settingsHelpers.saveTheme(theme);
            
            // Apply the theme immediately
            let actualTheme = theme;
            
            // If auto theme, detect system preference
            if (theme === 'auto') {
                const isDarkMode = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
                actualTheme = isDarkMode ? 'dark' : 'light';
            }
            
            // Get current theme before change
            const currentTheme = document.documentElement.getAttribute('data-theme');
            
            // Only set data-theme attribute since CSS uses [data-theme] selectors
            document.documentElement.setAttribute('data-theme', actualTheme);
            
            // Verify the change
            const newTheme = document.documentElement.getAttribute('data-theme');
            
            // Check if CSS variables are being applied
            setTimeout(() => {
                const computedBg = getComputedStyle(document.documentElement).getPropertyValue('--bs-body-bg').trim();
                const computedColor = getComputedStyle(document.documentElement).getPropertyValue('--bs-body-color').trim();
            }, 50);
            
            return actualTheme;
        } catch (error) {
            // Fallback to light theme
            document.documentElement.setAttribute('data-theme', 'light');
            return 'light';
        }
    },
    
    getCurrentTheme: function() {
        return window.settingsHelpers.getTheme();
    },
    
    getActualTheme: function() {
        const savedTheme = this.getCurrentTheme();
        if (savedTheme === 'auto') {
            return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
        }
        return savedTheme;
    }
};

// Waterfall Size Dropdown with Preset Sizes
window.waterfallSizeHelpers = {
    currentDropdown: null,
    currentSize: null, // Will be set by getDefaultSize()
    
    // Size presets with proper values for the waterfall layout
    sizePresets: {
    // Make XS available on desktop as well
    'XS': { label: 'Extra Small', width: 180, preview: 24 },
        // Make S available on desktop as well
        'S': { label: 'Small', width: 220, preview: 32 },
        'M': { label: 'Medium', width: 280, preview: 40 },
        'L': { label: 'Large', width: 350, preview: 48 },
        'XL': { label: 'Extra Large', width: 450, preview: 56 }
    },
    
    // Immediately set CSS property based on saved size (called on page load)
    initializeCSSImmediately: function() {
        try {
            // Check if CSS property has already been set by inline script
            const currentWidth = getComputedStyle(document.documentElement).getPropertyValue('--waterfall-item-width').trim();
            if (currentWidth && currentWidth !== '') {
                // Just sync the currentSize with what was set
                const defaultSize = this.getDefaultSize();
                this.currentSize = defaultSize;
                return defaultSize;
            }
            
            // Fallback: set CSS property if not already set
            const defaultSize = this.getDefaultSize();
            const preset = this.sizePresets[defaultSize];
            
            if (preset) {
                // Set CSS custom property immediately to prevent flickering
                document.documentElement.style.setProperty('--waterfall-item-width', preset.width + 'px');
                this.currentSize = defaultSize;
                return defaultSize;
            }
        } catch (error) {
            // Fallback to M size
            document.documentElement.style.setProperty('--waterfall-item-width', '280px');
            this.currentSize = 'M';
            return 'M';
        }
    },

    // Get the default size based on device and saved preferences
    getDefaultSize: function() {
        try {
            // First check localStorage for saved preference
            const savedSize = localStorage.getItem('waterfall-size');
            
            if (savedSize && this.sizePresets[savedSize]) {
                const isMobile = window.innerWidth <= 768;
                const preset = this.sizePresets[savedSize];
                
                // If saved size is mobile-only but we're on desktop, fall back to default
                if (preset.mobileOnly && !isMobile) {
                    return 'M'; // Desktop default
                }
                
                // If saved size is not mobile-only but we're on mobile, check if XS is better
                if (!preset.mobileOnly && isMobile) {
                    // Still allow non-mobile sizes on mobile, but prefer XS if no specific preference
                    return savedSize;
                }
                
                return savedSize;
            }
            
            // No saved preference, use responsive defaults
            const isMobile = window.innerWidth <= 768;
            return isMobile ? 'XS' : 'M';
        } catch (error) {
            // Fallback to responsive defaults
            const isMobile = window.innerWidth <= 768;
            return isMobile ? 'XS' : 'M';
        }
    },
    
    // Save size preference to localStorage
    saveSize: function(sizeKey) {
        try {
            localStorage.setItem('waterfall-size', sizeKey);
        } catch (error) {
        }
    },
    
    // Initialize current size if not set and apply it to the layout
    initializeSize: function() {
        if (!this.currentSize) {
            this.currentSize = this.getDefaultSize();
        }
        
        // Only apply the size to layout if CSS property hasn't been set immediately
        const currentWidth = getComputedStyle(document.documentElement).getPropertyValue('--waterfall-item-width').trim();
        if (!currentWidth || currentWidth === '') {
            // CSS property not set yet, apply it now
            this.updateWaterfallSize(this.currentSize);
        } else {
        }
        
        return this.currentSize;
    },
    
    // Set CSS custom property immediately for the given size (without changing currentSize)
    applySizeToCSS: function(sizeKey) {
        try {
            const preset = this.sizePresets[sizeKey];
            if (!preset) {
                return false;
            }
            
            // Set CSS custom property immediately
            document.documentElement.style.setProperty('--waterfall-item-width', preset.width + 'px');
            return true;
        } catch (error) {
            return false;
        }
    },
    
    // Show dropdown with preset size options on button click
    showSizeDropdown: function(buttonElement, dotNetRef, currentSize = 'M') {
        
        // Hide any existing dropdown
        this.hideSizeDropdown();
        
        // Always use the initialized size (from localStorage or responsive default)
        const actualSize = this.initializeSize();
        this.currentSize = actualSize;
        // Create dropdown container
        const dropdown = document.createElement('div');
        dropdown.className = 'waterfall-size-dropdown';
        
        // Build size options HTML
        let optionsHtml = '';
        const isMobile = window.innerWidth <= 768; // Mobile breakpoint
        
        Object.keys(this.sizePresets).forEach(key => {
            const preset = this.sizePresets[key];
            
            // Skip XS on desktop (to avoid overlapping), show only on mobile devices
            if (preset.mobileOnly && !isMobile) {
                return;
            }
            
            const isActive = key === actualSize; // Use actual size instead of passed parameter
            optionsHtml += `
                <div class="size-option ${isActive ? 'active' : ''}" data-size="${key}">
                    <div class="option-preview">
                        <div class="preview-image" style="width: ${preset.preview}px; height: ${preset.preview}px;">
                            <i class="fas fa-image"></i>
                        </div>
                    </div>
                    <div class="option-info">
                        <div class="option-label">${key}</div>
                        <div class="option-description">${preset.label}</div>
                        <div class="option-size">${preset.width}px</div>
                    </div>
                    ${isActive ? '<div class="option-check"><i class="fas fa-check"></i></div>' : ''}
                </div>
            `;
        });
        
        dropdown.innerHTML = `
            <div class="dropdown-header">
                <i class="fas fa-image"></i>
                <span>Image Size</span>
                <button class="close-btn" type="button">
                    <i class="fas fa-times"></i>
                </button>
            </div>
            <div class="size-options-container">
                ${optionsHtml}
            </div>
        `;
        
    // Position dropdown relative to button (with safe fallback if element is not yet ready)
    this.positionDropdown(dropdown, buttonElement);
        
        // Add to DOM
        document.body.appendChild(dropdown);
        this.currentDropdown = dropdown;
        
        // Setup option click handlers
        this.setupOptionHandlers(dropdown, dotNetRef);
        
        // Add event listeners
        this.setupDropdownEvents(dropdown, dotNetRef);
        
        // Animate in
        requestAnimationFrame(() => {
            dropdown.classList.add('show');
        });
        
        return true;
    },
    
    // Hide dropdown
    hideSizeDropdown: function() {
        if (this.currentDropdown) {
            // Clean up event handlers before removing
            if (this.currentDropdown._cleanupEvents) {
                this.currentDropdown._cleanupEvents();
            }
            
            this.currentDropdown.classList.add('hiding');
            setTimeout(() => {
                if (this.currentDropdown && this.currentDropdown.parentNode) {
                    this.currentDropdown.parentNode.removeChild(this.currentDropdown);
                }
                this.currentDropdown = null;
            }, 200);
        }
    },
    
    // Position dropdown relative to button
    positionDropdown: function(dropdown, buttonElement) {
        let buttonRect = null;
        try {
            if (buttonElement && typeof buttonElement.getBoundingClientRect === 'function') {
                buttonRect = buttonElement.getBoundingClientRect();
            }
        } catch (e) {
            buttonRect = null;
        }

        const viewportWidth = window.innerWidth;
        const viewportHeight = window.innerHeight;
        const dropdownWidth = 320; // Approximate width
        const dropdownHeight = 300; // Approximate height for preset options

        // Default position (top-right corner area) if button rect unavailable
        let top = 56; // below header
        let left = Math.max(20, viewportWidth - dropdownWidth - 20);

        if (buttonRect) {
            // Default position below button
            top = buttonRect.bottom + 8;
            left = buttonRect.left;

            // Adjust if dropdown would go off screen
            if (left + dropdownWidth > viewportWidth - 20) {
                left = buttonRect.right - dropdownWidth;
            }

            if (top + dropdownHeight > viewportHeight - 20) {
                top = buttonRect.top - dropdownHeight - 8;
            }
        }

        dropdown.style.position = 'fixed';
        dropdown.style.top = top + 'px';
        dropdown.style.left = left + 'px';
        dropdown.style.zIndex = '10000';
    },
    
    // Setup option click handlers
    setupOptionHandlers: function(dropdown, dotNetRef) {
        const options = dropdown.querySelectorAll('.size-option');
        
        options.forEach(option => {
            option.addEventListener('click', () => {
                const sizeKey = option.dataset.size;
                const preset = this.sizePresets[sizeKey];
                
                if (sizeKey !== this.currentSize) {
                    // Update active state
                    options.forEach(opt => opt.classList.remove('active'));
                    option.classList.add('active');
                    
                    // Update check marks
                    dropdown.querySelectorAll('.option-check').forEach(check => check.remove());
                    const checkElement = document.createElement('div');
                    checkElement.className = 'option-check';
                    checkElement.innerHTML = '<i class="fas fa-check"></i>';
                    option.appendChild(checkElement);
                    
                    // Store new current size
                    this.currentSize = sizeKey;
                    
                    // Save to localStorage
                    this.saveSize(sizeKey);
                    
                    // Update the layout
                    this.updateWaterfallSize(sizeKey);
                    
                    // Notify Blazor component
                    dotNetRef.invokeMethodAsync('OnWaterfallSizeChanged', sizeKey);
                    
                    // Close dropdown after a brief delay for visual feedback
                    setTimeout(() => {
                        this.hideSizeDropdown();
                    }, 150);
                }
            });
            
            // Add hover effect
            option.addEventListener('mouseenter', () => {
                if (!option.classList.contains('active')) {
                    option.classList.add('hover');
                }
            });
            
            option.addEventListener('mouseleave', () => {
                option.classList.remove('hover');
            });
        });
    },
    
    // Setup dropdown event handlers
    setupDropdownEvents: function(dropdown, dotNetRef) {
        const closeBtn = dropdown.querySelector('.close-btn');
        
        // Close button
        const handleCloseClick = (e) => {
            e.stopPropagation();
            this.hideSizeDropdown();
        };
        closeBtn.addEventListener('click', handleCloseClick);
        
        // Click outside to close - with proper cleanup
        const handleClickOutside = (e) => {
            if (!dropdown.contains(e.target)) {
                this.hideSizeDropdown();
            }
        };
        
        // Add click outside handler after a brief delay to avoid immediate closure
        setTimeout(() => {
            document.addEventListener('click', handleClickOutside);
        }, 100);
        
        // Prevent dropdown from closing when clicking inside
        const handleDropdownClick = (e) => {
            e.stopPropagation();
        };
        dropdown.addEventListener('click', handleDropdownClick);
        
        // Escape key to close
        const handleKeyDown = (e) => {
            if (e.key === 'Escape') {
                this.hideSizeDropdown();
            }
        };
        document.addEventListener('keydown', handleKeyDown);
        
        // Store cleanup function on dropdown for proper removal
        dropdown._cleanupEvents = () => {
            closeBtn.removeEventListener('click', handleCloseClick);
            dropdown.removeEventListener('click', handleDropdownClick);
            document.removeEventListener('click', handleClickOutside);
            document.removeEventListener('keydown', handleKeyDown);
        };
    },
    
    // Update waterfall layout
    updateWaterfallSize: function(sizeKey) {
        try {
            const preset = this.sizePresets[sizeKey];
            if (!preset) {
                return false;
            }
            
            // Update CSS custom property
            document.documentElement.style.setProperty('--waterfall-item-width', preset.width + 'px');
            
            // Update waterfall layout using the waterfallHelper if available
            if (window.waterfallHelper && typeof window.waterfallHelper.updateSize === 'function') {
                window.waterfallHelper.updateSize('.files-waterfall', preset.width);
            }
            
            return true;
        } catch (error) {
            return false;
        }
    }
};

// Prevent browser auto scroll restoration across SPA navigations
try { if ('scrollRestoration' in history) { history.scrollRestoration = 'manual'; } } catch {}

// Page navigation scroll reset helper
window.resetPageScroll = function() {
    try {
    try { console.debug('[FILES_TRACE_JS] resetPageScroll invoked'); } catch {}
    // If a focused-item scroll is active, do not perform any top reset
    try {
        var now = Date.now();
        if (window.__filesScrollState && (now < window.__filesScrollState.suppressTopResetUntil || now < window.__filesScrollState.cancelTopResetUntil)) {
            try { console.debug('[FILES_TRACE_JS] resetPageScroll suppressed/canceled'); } catch {}
            return false;
        }
    } catch {}
    // Reset the window scroll to ensure fixed header doesn't overlap content
    try { console.debug('[FILES_TRACE_JS] window.scrollTo(0,0)'); window.scrollTo(0, 0); } catch {}
    // Also reset document-level scroll element if any
    try { console.debug('[FILES_TRACE_JS] document.scrollTop=0'); (document.scrollingElement || document.documentElement || document.body).scrollTop = 0; } catch {}
    // Reset app-content scroll if it has its own scrolling
    try { const ac = document.querySelector('.app-content'); if (ac) { console.debug('[FILES_TRACE_JS] .app-content.scrollTop=0'); ac.scrollTop = 0; } } catch {}
    // Then reset the main files scroll container
        const container = document.getElementById('main-files-content') || document.querySelector('.files-content');
        if (!container) return false;
        const prev = container.style.scrollBehavior;
        try { container.style.scrollBehavior = 'auto'; } catch {}
        try { console.debug('[FILES_TRACE_JS] files container scrollTop=0'); } catch {}
        container.scrollTop = 0;
        container.scrollLeft = 0;
        try { container.style.scrollBehavior = prev || ''; } catch {}
        return true;
    } catch (error) {
        return false;
    }
};

// Delayed scroll reset with multiple attempts for reliable page transitions
window.resetPageScrollDelayed = function() {
    return new Promise((resolve) => {
        let attempts = 0;
    const maxAttempts = 16;
    const delay = 80; // ms between attempts (~1.3s total)

        const attemptReset = () => {
            attempts++;
            try { console.debug('[FILES_TRACE_JS] resetPageScrollDelayed attempt', attempts); } catch {}
            // If a focused-item scroll is in progress, abort the reset loop to avoid fighting it
            let suppressed = false;
            let canceled = false;
            let userActive = false;
            try {
                const now = Date.now();
                suppressed = !!(window.__filesScrollState && now < window.__filesScrollState.suppressTopResetUntil);
                canceled = !!(window.__filesScrollState && now < window.__filesScrollState.cancelTopResetUntil);
                userActive = !!(window.__filesScrollState && now < window.__filesScrollState.userScrollUntil);
            } catch { suppressed = false; canceled = false; }
            if (canceled || suppressed || userActive) {
                try { console.debug('[FILES_TRACE_JS] resetPageScrollDelayed aborted (suppressed/canceled)'); } catch {}
                // Do not manipulate window/container scroll during focused-item scroll
                // End the loop early to prevent a late top reset after suppression window
                resolve(true);
                return;
            }

            // Ensure window is at top so fixed app header never overlaps Files header
            try { console.debug('[FILES_TRACE_JS] window.scrollTo({top:0})'); window.scrollTo && window.scrollTo({ top: 0, left: 0, behavior: 'auto' }); } catch {}
            
            // If a focused-item scroll is in progress, skip container reset on this attempt
            let ok = false;
            // (already computed suppressed above)
            if (!suppressed) {
                ok = window.resetPageScroll();
            }

            // Keep retrying a few times even if not yet successful (DOM may not be ready)
            if (attempts < maxAttempts) {
                setTimeout(attemptReset, delay);
            } else {
                // Resolve true if any attempt succeeded; otherwise false
                resolve(!!ok);
            }
        };

        attemptReset();
    });
};

// Files-only: reset the main files container to top immediately (no window scroll)
// selector: defaults to '#main-files-content', falls back to '.files-content'
window.resetFilesContainerScrollImmediate = function(selector = '#main-files-content') {
    try {
        const container = document.querySelector(selector) || document.querySelector('.files-content');
        if (!container) { return false; }
        // If the user just scrolled, don't fight them
        try {
            const now = Date.now();
            if (window.__filesScrollState && now < window.__filesScrollState.userScrollUntil) {
                return false;
            }
        } catch {}
        const hasScrollbar = (container.scrollHeight - container.clientHeight) > 1;
        const notAtTop = (container.scrollTop || 0) > 0;
        if (hasScrollbar && notAtTop) {
            const prev = container.style.scrollBehavior;
            try { container.style.scrollBehavior = 'auto'; } catch {}
            try { console.debug('[FILES_TRACE_JS] resetFilesContainerScrollImmediate: top=0'); } catch {}
            _beginProgScroll();
            container.scrollTop = 0;
            container.scrollLeft = 0;
            try { container.style.scrollBehavior = prev || ''; } catch {}
            // Clear programmatic mark on next tick
            setTimeout(_endProgScroll, 0);
            return true;
        }
        return false;
    } catch (e) {
        return false;
    }
};

// Focus helper with retries to ensure element is in the DOM and visible (useful for mobile overlays)
window.focusSelector = function(selector, attempts = 8, interval = 50) {
    try {
        let tries = 0;
        const tryFocus = () => {
            tries++;
            const el = document.querySelector(selector);
            if (el && typeof el.focus === 'function') {
                // Defer a tick to ensure CSS transitions finished (mobile overlays)
                setTimeout(() => {
                    try {
                        el.focus({ preventScroll: true });
                        // Move caret to end if it's an input
                        if (typeof el.setSelectionRange === 'function') {
                            const len = el.value ? el.value.length : 0;
                            try { el.setSelectionRange(len, len); } catch { /* ignore */ }
                        }
                    } catch { /* ignore */ }
                }, 0);
                return true;
            }
            if (tries < attempts) {
                setTimeout(tryFocus, interval);
                return false;
            }
            return false;
        };
        return tryFocus();
    } catch (e) {
        return false;
    }
};