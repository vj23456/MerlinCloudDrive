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
            interval: options.interval || 200,       // Debounce interval
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

        // Setup auto resize
        this.autoResizeHandler(this.options.autoResize);

        // Setup image loading listeners
        this.container.addEventListener('load', this.handleImageLoad, true);
        this.container.addEventListener('error', this.handleImageLoad, true);

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
    reflow() {
        if (this.isDestroyed || this.isReflowing) return;

        this.isReflowing = true;

        try {
            const items = this.getItems();
            if (items.length === 0) {
                this.isReflowing = false;
                return;
            }

            const containerWidth = this.container.clientWidth;
            if (containerWidth === 0) {
                this.isReflowing = false;
                return;
            }

            // Calculate layout (vue-waterfall style)
            const metas = this.getMetas(items);
            this.virtualRects = metas.map(() => ({}));
            this.calculate(metas, this.virtualRects);

            // Apply layout with slight delay to avoid flashing
            setTimeout(() => {
                if (!this.isDestroyed) {
                    this.render(this.virtualRects, metas);
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
        }
    }

    // Get items from container
    getItems() {
        return Array.from(this.container.querySelectorAll(this.options.itemSelector));
    }

    // Get metadata for items (vue-waterfall style)
    getMetas(items) {
        return items.map((item, index) => {
            const img = item.querySelector('img');
            let width = this.options.lineGap;
            let height = 200; // default height

            // Check if this is a folder item (waterfall-folder class)
            const isFolder = item.querySelector('.waterfall-folder');
            
            if (isFolder) {
                // Check if it's a cloud provider folder (has cloud-provider-icon)
                const hasCloudIcon = isFolder.querySelector('.cloud-provider-icon');
                
                if (hasCloudIcon) {
                    // Cloud provider folders use fixed height for consistent layout
                    width = this.options.lineGap;
                    height = 140;
                } else {
                    // Regular folders use dynamic height based on content
                    width = this.options.lineGap;
                    height = item.offsetHeight > 0 ? item.offsetHeight : 120;
                    // Ensure minimum height for usability
                    height = Math.max(height, 120);
                }
            } else if (img && img.naturalWidth && img.naturalHeight) {
                width = this.options.lineGap;
                // Calculate height based on aspect ratio
                let calculatedHeight = (img.naturalHeight / img.naturalWidth) * width;
                
                // Only apply minimum height for extremely wide images (aspect ratio < 0.3)
                // These are panoramic images that would result in very small heights
                const aspectRatio = img.naturalHeight / img.naturalWidth;
                
                if (aspectRatio < 0.3) {
                    // For extremely wide images, ensure minimum height
                    // The 180px includes both image content and overlay space
                    height = Math.max(calculatedHeight, 180);
                } else {
                    // For normal images, use the natural calculated height
                    height = calculatedHeight;
                }
            } else if (item.offsetHeight > 0) {
                width = this.options.lineGap;
                height = item.offsetHeight;
                
                // Apply minimum height for non-image items too
                height = Math.max(height, 140); // Min height for folders/files
            }

            return {
                element: item,
                index: index,
                width: width,
                height: height
            };
        });
    }

    // Calculate layout positions (vue-waterfall style)
    calculate(metas, rects) {
        const containerWidth = this.container.clientWidth;
        
        // Calculate columns
        const columnCount = this.getColumnCount(containerWidth);
        // Store column count for external access
        this.columnCount = columnCount;
        
        const columnWidth = this.getColumnWidth(containerWidth, columnCount);
        const columnHeights = new Array(columnCount).fill(0);

        metas.forEach((meta, index) => {
            // Find shortest column
            const shortestColumnIndex = columnHeights.indexOf(Math.min(...columnHeights));
            
            // Calculate position
            const left = this.getLeft(containerWidth, columnCount, columnWidth) + 
                        (shortestColumnIndex * columnWidth);
            const top = columnHeights[shortestColumnIndex];
            
            // Calculate dimensions
            const itemWidth = columnWidth - 20; // padding
            // Use the height from meta (which already has minimum constraints applied)
            // but scale it proportionally to the actual item width
            const scaleFactor = itemWidth / meta.width;
            const itemHeight = meta.height * scaleFactor;
            
            // Store rect
            rects[index] = {
                left: left + 10, // padding
                top: top,
                width: itemWidth,
                height: itemHeight
            };

            // Update column height
            columnHeights[shortestColumnIndex] = top + itemHeight + 20; // gap
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
        // (matching the bottom padding from Files.razor.css)
        const extraPadding = 48; // Additional padding for comfortable viewing
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
                
                // Progressive visibility (vue-waterfall style)
                if (!element.classList.contains('waterfall-positioned')) {
                    element.style.opacity = '0';
                    element.style.transition = 'opacity 0.3s ease';
                    element.classList.add('waterfall-positioned');
                    
                    // Fade in
                    requestAnimationFrame(() => {
                        element.style.opacity = '1';
                    });
                }
            }
        });
    }

    // Handle image loading for progressive layout
    handleImageLoad(event) {
        if (event.target.tagName === 'IMG') {
            const imgSrc = event.target.src;
            
            if (!this.loadedImages.has(imgSrc)) {
                this.loadedImages.add(imgSrc);
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

        // Remove event listeners
        this.autoResizeHandler(false);
        this.container.removeEventListener('load', this.handleImageLoad, true);
        this.container.removeEventListener('error', this.handleImageLoad, true);

        // Reset container
        this.container.style.height = '';

        // Reset items
        const items = this.getItems();
        items.forEach(item => {
            item.style.position = '';
            item.style.left = '';
            item.style.top = '';
            item.style.width = '';
            item.style.opacity = '';
            item.style.transition = '';
            item.classList.remove('waterfall-positioned');
        });

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
            return null;
        }

        // Clean up existing instance
        this.cleanup(selector);

        // Create new instance
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
        return instance;
    },

    refreshLayout: function(selector) {
        const container = document.querySelector(selector);
        if (!container) return;

        const instance = this.instances.get(container);
        if (instance) {
            instance.refresh();
        }
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
