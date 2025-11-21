// Waterfall Layout - Vue-Waterfall Inspired Implementation
// Version 3.0 - Robust, Reactive, and Progressive

class WaterfallLayout {
    constructor(container, options = {}) {
        this.container = typeof container === 'string' 
            ? document.querySelector(container)
            : container;
            
        if (!this.container) {
            throw new Error('Waterfall container not found');
        }

        // Vue-waterfall inspired configuration
        this.options = {
            lineGap: options.lineGap || 250,          // Column width (vue-waterfall terminology)
            minLineGap: options.minLineGap || 200,    // Min column width
            maxLineGap: options.maxLineGap || 300,    // Max column width
            align: options.align || 'left',           // Layout alignment
            autoResize: options.autoResize !== false, // Auto resize on window resize
            interval: options.interval || 250,       // Debounce interval (slightly higher to reduce churn)
            // Vertical spacing between stacked items (in px)
            verticalGap: typeof options.verticalGap === 'number' ? options.verticalGap : 10,
            itemSelector: options.itemSelector || '.waterfall-item',
            ...options
        };

        // State management (vue-waterfall inspired)
        this.virtualRects = [];
        this.token = null;
        this.isReflowing = false;
        this.isDestroyed = false;
        this.loadedImages = new Set();
        this.columnCount = 1; // Track current column count for navigation
    this.hasRendered = false; // Track if first render happened
    this.initialImagesReady = false; // Gate first reveal until images ready or timeout
    this.initialImageWaitTimer = null;
    this.chunkSize = typeof options.chunkSize === 'number' ? options.chunkSize : 100; // Measure in chunks to avoid long blocks
    this.firstRevealComplete = false; // After first stable reveal, don't re-add loading to avoid flicker

        // Bind methods
        this.reflowHandler = this.reflowHandler.bind(this);
        this.reflow = this.reflow.bind(this);
        this.autoResizeHandler = this.autoResizeHandler.bind(this);
        this.handleImageLoad = this.handleImageLoad.bind(this);

        this.init();
    }

    init() {
        if (this.isDestroyed) return;

        // Set container styles
        this.container.style.position = 'relative';
        this.container.style.width = '100%';
    // Mark container as JS-masonry active for CSS overrides
    this.container.classList.add('js-masonry');
    // Hide items while first layout computes
    this.container.classList.add('loading');

        // Setup auto resize
        this.autoResizeHandler(this.options.autoResize);

        // Setup image loading listeners
        this.container.addEventListener('load', this.handleImageLoad, true);
        this.container.addEventListener('error', this.handleImageLoad, true);

        // If there are no images or all are already complete, we're ready
        const imgs = Array.from(this.container.querySelectorAll('img'));
        if (imgs.length === 0 || imgs.every(img => img.complete && img.naturalWidth > 0)) {
            this.initialImagesReady = true;
        } else {
            // Fallback timeout to avoid long blank states
            this.initialImageWaitTimer = setTimeout(() => {
                this.initialImagesReady = true;
                this.reflowHandler();
            }, 450);
        }

        // Initial reflow
        this.reflowHandler();
    }

    // Vue-waterfall style auto resize handler
    autoResizeHandler(enable) {
        if (enable && !this.isDestroyed) {
            window.addEventListener('resize', this.reflowHandler);
        } else {
            window.removeEventListener('resize', this.reflowHandler);
        }
    }

    // Vue-waterfall style debounced reflow handler
    reflowHandler() {
        if (this.isDestroyed) return;

        clearTimeout(this.token);
        this.token = setTimeout(this.reflow, this.options.interval);
    }

    // Main reflow function (vue-waterfall inspired)
    async reflow() {
        if (this.isDestroyed || this.isReflowing) return;

        this.isReflowing = true;

        try {
            const items = this.getItems();
            if (items.length === 0) {
                this.isReflowing = false;
                // Nothing to layout; ensure loading overlay is cleared
                try { this.container.classList.remove('loading'); } catch {}
                return;
            }

            const containerWidth = this.container.clientWidth;
            if (containerWidth === 0) {
                this.isReflowing = false;
                return;
            }

            // Hide items while computing for first render OR when many items/unpositioned to avoid stacked flash
            const anyPositioned = this.container.querySelector('.waterfall-item.waterfall-positioned');
            // Only use loading overlay until the first stable reveal completes to avoid flicker
            const shouldShowLoading = !this.firstRevealComplete && (!this.hasRendered || !anyPositioned || items.length > 40);
            if (shouldShowLoading) {
                this.container.classList.add('loading');
            }

            // Compute target item width so we can measure metas at final width
            const preColumnCount = this.getColumnCount(containerWidth);
            const preColumnWidth = this.getColumnWidth(containerWidth, preColumnCount);
            const targetItemWidth = preColumnWidth - 20; // subtract inner padding used in calculate()

            // Calculate layout metas at target width (avoid later scaling mismatches)
            const metas = await this.getMetasChunked(items, targetItemWidth);
            this.virtualRects = metas.map(() => ({}));
            this.calculate(metas, this.virtualRects);

            // Apply layout with slight delay to avoid flashing
            setTimeout(() => {
                if (!this.isDestroyed) {
            this.render(this.virtualRects, metas);
            // Stop hiding after styles are applied (double rAF)
        if (this.hasRendered || this.initialImagesReady) {
                        requestAnimationFrame(() => {
                            requestAnimationFrame(() => {
                                if (!this.isDestroyed) {
                                    this.container.classList.remove('loading');
                    // Mark first reveal complete so we don't toggle loading again on subsequent reflows
                    this.firstRevealComplete = true;
                                }
                            });
                        });
                    }
                    this.isReflowing = false;
                    this.emit('reflowed', { 
                        itemCount: items.length,
                        containerWidth: containerWidth 
                    });
                }
            }, 0);

        } catch (error) {
            console.error('Waterfall reflow error:', error);
            this.isReflowing = false;
        try { this.container.classList.remove('loading'); } catch {}
        }
    }

    // Get items from container
    getItems() {
        return Array.from(this.container.querySelectorAll(this.options.itemSelector));
    }

    // Get metadata for items (vue-waterfall style) in small chunks to avoid blocking the main thread
    async getMetasChunked(items, targetItemWidth) {
        const measureWidth = Math.max(0, targetItemWidth || this.options.lineGap);
        const metas = new Array(items.length);

        const computeMeta = (item, index) => {
            // Only treat preview images inside .waterfall-image as image tiles
            const previewImg = item.querySelector('.waterfall-image img');
            let width = measureWidth;
            let height = 200; // default height

            // Check if this is a folder-like item
            const isFolder = !!item.querySelector('.waterfall-folder');
            const isFileFolder = !!item.querySelector('.waterfall-file-folder');

            if (isFolder || isFileFolder) {
                // Measure folder cards by actual DOM height at target width
                const prevWidth = item.style.width;
                const prevHeight = item.style.height;
                item.style.width = width + 'px';
                item.style.height = 'auto';
                height = Math.max(item.scrollHeight || item.offsetHeight || 0, 120);
                item.style.width = prevWidth;
                item.style.height = prevHeight;
            } else if (previewImg && previewImg.naturalWidth && previewImg.naturalHeight) {
                // Use natural aspect ratio
                width = measureWidth;
                const aspectRatio = previewImg.naturalHeight / previewImg.naturalWidth;
                const calculatedHeight = aspectRatio * width;
                height = aspectRatio < 0.3 ? Math.max(calculatedHeight, 180) : calculatedHeight;
            } else if (item.offsetHeight > 0) {
                // Other non-image items: measure similarly at target width
                const prevWidth = item.style.width;
                const prevHeight = item.style.height;
                item.style.width = width + 'px';
                item.style.height = 'auto';
                height = Math.max(item.scrollHeight || item.offsetHeight || 0, 120);
                item.style.width = prevWidth;
                item.style.height = prevHeight;
            }

            metas[index] = { element: item, index, width, height };
        };

        for (let i = 0; i < items.length; i += this.chunkSize) {
            if (this.isDestroyed) return metas.filter(Boolean);
            const end = Math.min(i + this.chunkSize, items.length);
            for (let j = i; j < end; j++) {
                computeMeta(items[j], j);
            }
            // Yield to the browser to keep UI responsive
            await new Promise(requestAnimationFrame);
        }

        return metas;
    }

    // Calculate layout positions (vue-waterfall style)
    calculate(metas, rects) {
        const containerWidth = this.container.clientWidth;
    const topOffset = this.options.verticalGap; // top spacing similar to vertical gap
        
        // Calculate columns
        const columnCount = this.getColumnCount(containerWidth);
        // Store column count for external access
        this.columnCount = columnCount;
        
        const columnWidth = this.getColumnWidth(containerWidth, columnCount);
    const columnHeights = new Array(columnCount).fill(topOffset);

        metas.forEach((meta, index) => {
            // Find shortest column
            const shortestColumnIndex = columnHeights.indexOf(Math.min(...columnHeights));
            
            // Calculate position
            const left = this.getLeft(containerWidth, columnCount, columnWidth) + 
                        (shortestColumnIndex * columnWidth);
            const top = columnHeights[shortestColumnIndex];
            
            // Calculate dimensions
            const itemWidth = columnWidth - 20; // padding
            // Metas are already measured at target width; no scaling needed
            const itemHeight = meta.height;
            
            // Store rect
            rects[index] = {
                left: left + 10, // padding
                top: top,
                width: itemWidth,
                height: itemHeight
            };

            // Update column height (apply configurable vertical gap)
            columnHeights[shortestColumnIndex] = top + itemHeight + this.options.verticalGap;
        });

        // Set container height
    const maxHeight = Math.max(...columnHeights);
        
        // Calculate responsive bottom padding based on screen size
        let bottomPadding = 16; // Default padding
        const screenWidth = window.innerWidth;
        
        if (screenWidth >= 1200) {
            bottomPadding = 20;
        } else if (screenWidth <= 480) {
            bottomPadding = 8;
        } else if (screenWidth <= 768) {
            bottomPadding = 12;
        }
        
    // Add extra padding to ensure last row is fully visible
    // Tuned lower to match reduced vertical gap
    const extraPadding = 36; // Additional padding for comfortable viewing
        this.container.style.height = (maxHeight + bottomPadding + extraPadding) + 'px';
    }

    // Get number of columns
    getColumnCount(containerWidth) {
        const idealColumns = Math.floor(containerWidth / this.options.lineGap);
        return Math.max(1, Math.min(6, idealColumns));
    }

    // Get column width
    getColumnWidth(containerWidth, columnCount) {
        return Math.floor(containerWidth / columnCount);
    }

    // Get left offset for alignment (vue-waterfall style)
    getLeft(containerWidth, columnCount, columnWidth) {
        const contentWidth = columnCount * columnWidth;
        
        switch (this.options.align) {
            case 'right':
                return containerWidth - contentWidth;
            case 'center':
                return (containerWidth - contentWidth) / 2;
            default:
                return 0;
        }
    }

    // Render layout (vue-waterfall style)
    render(rects, metas) {
        metas.forEach((meta, index) => {
            const rect = rects[index];
            const element = meta.element;
            
            if (rect && element) {
                // Apply positioning
                element.style.position = 'absolute';
                element.style.left = rect.left + 'px';
                element.style.top = rect.top + 'px';
                element.style.width = rect.width + 'px';
                // Explicitly set height so DOM box matches computed rect
                // This prevents CSS-driven content height from altering the
                // intended vertical rhythm and ensures consistent gaps
                element.style.height = rect.height + 'px';
                
                // Visibility
                if (!element.classList.contains('waterfall-positioned')) {
                    // Mark positioned first so CSS can reveal only positioned items
                    element.classList.add('waterfall-positioned');
                    if (!this.hasRendered) {
                        // First render: show immediately, no animation
                        element.style.transition = '';
                        element.style.opacity = '1';
                    } else {
                        // Subsequent renders: soft fade-in for new items only
                        element.style.transition = 'opacity 0.2s ease';
                        element.style.opacity = '0';
                        requestAnimationFrame(() => {
                            element.style.opacity = '1';
                        });
                    }
                }
            }
        });
        // Mark first render completed
        if (!this.hasRendered) this.hasRendered = true;
    }

    // Handle image loading for progressive layout
    handleImageLoad(event) {
        if (event.target.tagName === 'IMG') {
            const imgSrc = event.target.src;
            
            if (!this.loadedImages.has(imgSrc)) {
                this.loadedImages.add(imgSrc);
                // If all images are ready for the first reveal, mark and reflow
                if (!this.hasRendered && !this.initialImagesReady) {
                    const imgs = Array.from(this.container.querySelectorAll('img'));
                    if (imgs.length === 0 || imgs.every(i => i.complete && i.naturalWidth > 0)) {
                        this.initialImagesReady = true;
                    }
                }
                this.reflowHandler();
            }
        }
    }

    // Public API
    refresh() {
        this.reflowHandler();
    }

    addItem(element) {
        if (this.isDestroyed) return;
        
        this.container.appendChild(element);
        this.reflowHandler();
    }

    removeItem(element) {
        if (this.isDestroyed) return;
        
        if (element && element.parentNode === this.container) {
            this.container.removeChild(element);
            this.reflowHandler();
        }
    }

    emit(eventName, detail = {}) {
        const event = new CustomEvent(eventName, { detail });
        this.container.dispatchEvent(event);
    }

    destroy() {
        if (this.isDestroyed) return;

        this.isDestroyed = true;

        // Clear timers
        clearTimeout(this.token);
        if (this.initialImageWaitTimer) {
            clearTimeout(this.initialImageWaitTimer);
            this.initialImageWaitTimer = null;
        }

        // Remove event listeners
        this.autoResizeHandler(false);
        this.container.removeEventListener('load', this.handleImageLoad, true);
        this.container.removeEventListener('error', this.handleImageLoad, true);

        // Reset container
        this.container.style.height = '';
    this.container.classList.remove('js-masonry');
    this.container.classList.remove('loading');
    this.container.classList.remove('calculating');
    this.firstRevealComplete = false;

        // Reset items
        const items = this.getItems();
        items.forEach(item => {
            item.style.position = '';
            item.style.left = '';
            item.style.top = '';
            item.style.width = '';
            item.style.height = '';
            item.style.opacity = '';
            item.style.transition = '';
            item.classList.remove('waterfall-positioned');
        });

    // Reset flags
    this.hasRendered = false;

        this.emit('destroyed');
    }
}

// Enhanced global helper with vue-waterfall patterns
window.waterfallHelper = {
    instances: new Map(),

    // Initialize with vue-waterfall style configuration
    initializeLayout: function(selector, options = {}) {
        const container = document.querySelector(selector);
        if (!container) {
            console.warn('Waterfall container not found:', selector);
            return false;
        }

        // Clean up existing instance
        this.cleanup(selector);

        try {
            const instance = new WaterfallLayout(container, {
                lineGap: 280,
                minLineGap: 200,
                maxLineGap: 350,
                align: 'center',
                interval: 200,
                itemSelector: '.waterfall-item',
                ...options
            });

            this.instances.set(container, instance);
            return true;
        } catch (error) {
            console.error('Waterfall initialization failed:', error);
            return false;
        }
    },

    refreshLayout: function(selector) {
        const container = document.querySelector(selector);
        if (!container) return;

        let instance = this.instances.get(container);

        // Detect a "stacked" bad state: JS-masonry active with items but none positioned yet
        // This can happen if a reflow was interrupted by navigation/cleanup timing
        const items = container.querySelectorAll('.waterfall-item');
        const anyPositioned = container.querySelector('.waterfall-item.waterfall-positioned');
        const hasRendered = !!(instance && instance.hasRendered);
        const isStacked = hasRendered && container.classList.contains('js-masonry') && items.length > 0 && !anyPositioned;
        const firstRevealComplete = !!(instance && instance.firstRevealComplete);

        if (!instance) {
            // No instance tracked; re-initialize if we have content or container is marked for masonry
            if (isStacked) {
                // Ensure items don't visibly overlap while we recover
                container.classList.add('loading');
            }
            this.initializeLayout(selector);
            return;
        }

    if (isStacked) {
            // Try a quick reflow first while hiding items to prevent visible stacking
            container.classList.add('loading');
            try { instance.refresh(); } catch {}

            // If still not positioned shortly after, force a clean re-init with the same options
            setTimeout(() => {
                const stillUnpositioned = !container.querySelector('.waterfall-item.waterfall-positioned');
                if (stillUnpositioned) {
                    try {
                        const opts = { ...instance.options };
                        instance.destroy();
                        this.instances.delete(container);
                        const newInstance = new WaterfallLayout(container, opts);
                        this.instances.set(container, newInstance);
                    } catch (e) {
                        console.error('Waterfall re-init after stacked state failed:', e);
                    }
                }
            }, 120);
            return;
        }

        // For large refreshes, show loading to avoid stacked flash even when some items are positioned
    if (!firstRevealComplete && items.length > 40) {
            container.classList.add('loading');
        }

        // Normal refresh path
        instance.refresh();
    },

    // Update waterfall item size
    updateSize: function(selector, size) {
        const container = document.querySelector(selector);
        if (!container) return;

        const instance = this.instances.get(container);
        if (instance) {
            // Update the lineGap (item width) and related options
            instance.options.lineGap = size;
            instance.options.minLineGap = Math.max(120, size - 50);
            instance.options.maxLineGap = size + 50;
            
            // Update CSS variable
            document.documentElement.style.setProperty('--waterfall-item-width', size + 'px');
            
            // Reflow the layout with new size
            instance.reflow();
            
        }
    },

    cleanup: function(selector) {
        const container = document.querySelector(selector);
        if (!container) return;

        const instance = this.instances.get(container);
        if (instance) {
            instance.destroy();
            this.instances.delete(container);
        }
    },

    getColumnCount: function(selector) {
        const container = document.querySelector(selector);
        if (!container) return 1;

        const instance = this.instances.get(container);
        if (instance && instance.columnCount) {
            return instance.columnCount;
        }

        // Fallback: calculate columns based on layout
        const items = container.querySelectorAll('.waterfall-item');
        if (items.length === 0) return 1;

        const containerRect = container.getBoundingClientRect();
        const firstItemRect = items[0].getBoundingClientRect();
        
        if (containerRect.width === 0 || firstItemRect.width === 0) return 1;

        // Estimate columns based on container width and item width
        const itemWidth = firstItemRect.width;
        const containerWidth = containerRect.width;
        const estimatedColumns = Math.floor(containerWidth / itemWidth);
        
        return Math.max(1, estimatedColumns);
    },

    // Spatial navigation for waterfall layout
    findNearestInDirection: function(selector, currentItemSelector, direction) {
        const container = document.querySelector(selector);
        if (!container) return null;

        const currentItem = document.querySelector(currentItemSelector);
        if (!currentItem) return null;

        const items = Array.from(container.querySelectorAll('.waterfall-item'));
        if (items.length === 0) return null;

        const currentIndex = items.indexOf(currentItem);
        if (currentIndex === -1) return null;

        const currentRect = currentItem.getBoundingClientRect();
        const containerRect = container.getBoundingClientRect();
        
        // Calculate relative position within container
        const currentX = currentRect.left - containerRect.left + (currentRect.width / 2);
        const currentY = currentRect.top - containerRect.top + (currentRect.height / 2);

        let bestItem = null;
        let bestDistance = Infinity;

        items.forEach((item, index) => {
            if (index === currentIndex) return; // Skip current item

            const itemRect = item.getBoundingClientRect();
            const itemX = itemRect.left - containerRect.left + (itemRect.width / 2);
            const itemY = itemRect.top - containerRect.top + (itemRect.height / 2);

            // Check if item is in the correct direction
            if (direction === 'up' && itemY >= currentY) return;
            if (direction === 'down' && itemY <= currentY) return;

            // Calculate distances
            const horizontalDistance = Math.abs(itemX - currentX);
            const verticalDistance = Math.abs(itemY - currentY);

            // Prioritize items in the same column (small horizontal distance)
            // but also consider vertical distance
            const distance = horizontalDistance * 2 + verticalDistance;

            // For same column preference, use a threshold
            const columnThreshold = 50; // pixels
            const isInSameColumn = horizontalDistance <= columnThreshold;

            // If we found an item in the same column, prefer it
            if (isInSameColumn) {
                if (verticalDistance < bestDistance) {
                    bestDistance = verticalDistance;
                    bestItem = item;
                }
            } else if (!bestItem || (!bestItem.classList.contains('same-column') && distance < bestDistance)) {
                // If no same-column item found yet, or this is better than non-same-column item
                bestDistance = distance;
                bestItem = item;
                if (isInSameColumn) {
                    bestItem.classList.add('same-column'); // Mark for comparison
                }
            }
        });

        // Clean up temporary class
        items.forEach(item => item.classList.remove('same-column'));

        return bestItem;
    },

    // Get the file ID from a waterfall item element
    getFileIdFromElement: function(element) {
        if (!element) return null;
        
        // Get the ID from the element and extract the hash code part
        const id = element.id;
        if (id && id.startsWith('file-item-')) {
            return id.replace('file-item-', '');
        }

        return null;
    },

    // Navigate in waterfall layout using spatial navigation
    navigateWaterfall: function(selector, currentFileId, direction) {
        try {
            // The file ID might be just the hash code or prefixed with "file-item-"
            let currentItemSelector = `#file-item-${currentFileId}`;
            
            // Check if element exists, if not, try alternative selector
            if (!document.querySelector(currentItemSelector)) {
                currentItemSelector = `[id$="-${currentFileId}"]`;
            }
            
            const nearestItem = this.findNearestInDirection(selector, currentItemSelector, direction);
            
            if (nearestItem) {
                const nearestFileId = this.getFileIdFromElement(nearestItem);
                return nearestFileId;
            }
        } catch (error) {
            console.error('Waterfall navigation error:', error);
        }
        
        return null;
    }
};

// Scroll helpers that synchronize with waterfall layout
window.waterfallScrollHelpers = {
    // Scroll to item using event-based approach - wait for layout to complete
    // selector: container selector (e.g., '.files-waterfall')
    // elementId: DOM id of the waterfall item element
    // options: { align?: 'center'|'start'|'end', maxWaitMs?: number }
    scrollToItemDirectly: function(selector, elementId, options = {}) {
        const align = options.align || 'center';
        const maxWaitMs = options.maxWaitMs || 8000; // Generous timeout for very large folders
        const filesContent = document.querySelector('.files-content');
        const container = document.querySelector(selector);
        
        if (!filesContent || !container) {
            console.log('[WATERFALL_SCROLL] Container not found');
            return Promise.resolve(false);
        }

        return new Promise((resolve) => {
            const startTime = performance.now();
            let reflowListener = null;
            let checkInterval = null;

            const cleanup = () => {
                if (reflowListener) {
                    container.removeEventListener('reflowed', reflowListener);
                }
                if (checkInterval) {
                    clearInterval(checkInterval);
                }
            };

            const doScroll = () => {
                const element = document.getElementById(elementId);

                if (!element) {
                    return false;
                }

                // Check if element is positioned
                const isPositioned = element.classList.contains('waterfall-positioned');
                const hasOffsetTop = element.offsetTop > 0 || element.offsetParent !== null;

                if (isPositioned && hasOffsetTop) {
                    try {
                        const elementTop = element.offsetTop;
                        const viewHeight = filesContent.clientHeight;
                        const elementHeight = element.offsetHeight || 0;
                        let targetTop = 0;

                        if (align === 'center') {
                            targetTop = elementTop - (viewHeight / 2) + (elementHeight / 2);
                        } else if (align === 'start') {
                            targetTop = elementTop - 16;
                        } else {
                            targetTop = Math.max(0, elementTop - viewHeight + elementHeight + 16);
                        }

                        const elapsed = Math.round(performance.now() - startTime);
                        filesContent.scrollTo({ top: Math.max(0, targetTop), behavior: 'auto' });
                        cleanup();
                        resolve(true);
                        return true;
                    } catch (e) {
                        console.error('[WATERFALL_SCROLL] Error scrolling:', e);
                        cleanup();
                        resolve(false);
                        return true;
                    }
                }

                return false;
            };
            
            // Listen for reflow completion events
            reflowListener = () => {
                if (doScroll()) {
                    // Successfully scrolled
                    return;
                }
                // Element not ready yet, wait for next reflow
            };
            
            container.addEventListener('reflowed', reflowListener);
            
            // Also periodically check in case element is already positioned
            // or gets positioned between reflow events
            let checkCount = 0;
            checkInterval = setInterval(() => {
                checkCount++;

                if (doScroll()) {
                    // Successfully scrolled
                    return;
                }

                // Check timeout
                const elapsed = performance.now() - startTime;
                if (elapsed > maxWaitMs) {
                    const element = document.getElementById(elementId);
                    console.log(`[WATERFALL_SCROLL] Timeout after ${Math.round(elapsed)}ms (${checkCount} checks). Element ${element ? 'found' : 'not found'}, positioned: ${element ? element.classList.contains('waterfall-positioned') : 'N/A'}`);
                    cleanup();
                    resolve(false);
                }
            }, 100); // Check every 100ms
            
            // Try immediate scroll in case element is already ready
            if (doScroll()) {
                // Successfully scrolled immediately
            }
        });
    },

    // Wait until the target element is positioned by the waterfall layout and scroll it into view within .files-content
    // selector: container selector (e.g., '.files-waterfall')
    // elementId: DOM id of the waterfall item element
    // options: { timeoutMs?: number, fastFallbackMs?: number, align?: 'center'|'start'|'end' }
    scrollToItemAfterLayout: function(selector, elementId, options = {}) {
        // Lower default timeout and add a fast provisional scroll to reduce wait
        const timeoutMs = typeof options.timeoutMs === 'number' ? options.timeoutMs : 1200;
        const fastFallbackMs = typeof options.fastFallbackMs === 'number' ? options.fastFallbackMs : 200;
        const align = options.align || 'center';

        return new Promise((resolve) => {
            const container = document.querySelector(selector);
            const filesContent = document.querySelector('.files-content');
            const element = document.getElementById(elementId);
            if (!container || !filesContent || !element) {
                resolve(false);
                return;
            }

            const start = performance.now();
            let provisionalDone = false;

            const doScroll = () => {
                // Ensure element has been positioned by the layout
                const positioned = element.classList.contains('waterfall-positioned');
                const containerHeight = parseFloat(container.style.height) || 0;
                if (positioned && containerHeight > 0) {
                    const elementTop = element.offsetTop;
                    const viewHeight = filesContent.clientHeight;
                    const elementHeight = element.offsetHeight || 0;
                    let targetTop = 0;
                    if (align === 'center') {
                        targetTop = elementTop - (viewHeight / 2) + (elementHeight / 2);
                    } else if (align === 'start') {
                        targetTop = elementTop - 16; // small padding
                    } else {
                        targetTop = Math.max(0, elementTop - viewHeight + elementHeight + 16);
                    }
                    filesContent.scrollTo({ top: Math.max(0, targetTop), behavior: 'auto' });
                    cleanup();
                    resolve(true);
                    return true;
                }
                return false;
            };

            let rafId = null;
            let provisionalTimer = null;
            const tick = () => {
                if (doScroll()) return;
                if (performance.now() - start > timeoutMs) {
                    cleanup();
                    resolve(false);
                    return;
                }
                rafId = requestAnimationFrame(tick);
            };

            const onReflow = () => {
                doScroll();
            };

            const cleanup = () => {
                if (rafId) cancelAnimationFrame(rafId);
                if (provisionalTimer) clearTimeout(provisionalTimer);
                container.removeEventListener('reflowed', onReflow);
            };

            // Provisional early scroll so users don't wait for layout to finish
            const doProvisional = () => {
                if (provisionalDone) return;
                provisionalDone = true;
                try {
                    const elementTop = element.offsetTop;
                    const viewHeight = filesContent.clientHeight;
                    const elementHeight = element.offsetHeight || 0;
                    let targetTop = 0;
                    if (align === 'center') {
                        targetTop = elementTop - (viewHeight / 2) + (elementHeight / 2);
                    } else if (align === 'start') {
                        targetTop = elementTop - 16;
                    } else {
                        targetTop = Math.max(0, elementTop - viewHeight + elementHeight + 16);
                    }
                    filesContent.scrollTo({ top: Math.max(0, targetTop), behavior: 'auto' });
                } catch {}
            };

            container.addEventListener('reflowed', onReflow);
            provisionalTimer = setTimeout(doProvisional, fastFallbackMs);
            rafId = requestAnimationFrame(tick);
        });
    }
};

// Auto-initialize
document.addEventListener('DOMContentLoaded', function() {
    const waterfallContainer = document.querySelector('.files-waterfall');
    if (waterfallContainer) {
        window.waterfallHelper.initializeLayout('.files-waterfall');
    }
});

// Export
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { WaterfallLayout, waterfallHelper: window.waterfallHelper };
}
