// Grid helper functions for calculating dynamic grid columns
window.gridHelper = {
    // Get current window size for debugging
    getWindowSize: function() {
        return {
            width: window.innerWidth,
            height: window.innerHeight
        };
    },

    // Calculate the number of columns that can fit in the container
    calculateGridColumns: function(containerSelector, itemMinWidth, itemGap) {
        const container = document.querySelector(containerSelector);
        if (!container) {
            return this.getResponsiveDefaultColumns(); // Responsive fallback
        }

        const containerWidth = container.clientWidth;
        if (containerWidth === 0) {
            return this.getResponsiveDefaultColumns();
        }

        const padding = parseFloat(getComputedStyle(container).paddingLeft) + 
                       parseFloat(getComputedStyle(container).paddingRight);
        
        const availableWidth = containerWidth - padding;
        
        // Adjust minimum width based on screen size for responsive design
        const responsiveMinWidth = this.getResponsiveMinWidth(itemMinWidth);
        
        // Calculate how many items can fit with gaps
        // Formula: (availableWidth + gap) / (itemWidth + gap)
        const columnsFloat = (availableWidth + itemGap) / (responsiveMinWidth + itemGap);
        const columns = Math.floor(columnsFloat);
        
        // Ensure at least 1 column and apply responsive max limits
        const maxColumns = this.getResponsiveMaxColumns();
        const result = Math.max(1, Math.min(columns, maxColumns));
        
        return result;
    },

    // Get responsive minimum width based on screen size
    getResponsiveMinWidth: function(baseMinWidth) {
        const screenWidth = window.innerWidth;
        
        if (screenWidth <= 576) { // Mobile
            return Math.max(100, baseMinWidth * 0.71); // Smaller items on mobile
        } else if (screenWidth <= 992) { // Tablet
            return Math.max(120, baseMinWidth * 0.86); // Medium items on tablet
        } else {
            return baseMinWidth; // Full size on desktop (140px)
        }
    },

    // Get responsive maximum columns based on screen size
    getResponsiveMaxColumns: function() {
        const screenWidth = window.innerWidth;
        
        if (screenWidth <= 576) { // Mobile
            return 3; // Max 3 columns on mobile
        } else if (screenWidth <= 768) { // Small tablet
            return 4; // Max 4 columns on small tablet
        } else if (screenWidth <= 992) { // Large tablet
            return 6; // Max 6 columns on large tablet
        } else if (screenWidth <= 1200) { // Small desktop
            return 8; // Max 8 columns on small desktop
        } else {
            return 12; // Max 12 columns on large desktop
        }
    },

    // Get responsive default columns for fallback
    getResponsiveDefaultColumns: function() {
        const screenWidth = window.innerWidth;
        
        if (screenWidth <= 576) { // Mobile
            return 2;
        } else if (screenWidth <= 992) { // Tablet
            return 4;
        } else {
            return 6; // Desktop
        }
    },

    // Get the actual width of a grid item if it exists
    getActualItemWidth: function(itemSelector) {
        const item = document.querySelector(itemSelector);
        if (!item) {
            return null;
        }
        
        const style = getComputedStyle(item);
        return item.offsetWidth + 
               parseFloat(style.marginLeft) + 
               parseFloat(style.marginRight);
    },

    // Observe container resize and notify Blazor
    observeContainerResize: function(containerSelector, dotNetObjectRef, methodName) {
        const container = document.querySelector(containerSelector);
        if (!container) {
            return null;
        }

        const resizeObserver = new ResizeObserver(entries => {
            for (let entry of entries) {
                // Debounce the resize notifications
                clearTimeout(window.gridResizeTimeout);
                window.gridResizeTimeout = setTimeout(() => {
                    dotNetObjectRef.invokeMethodAsync(methodName);
                }, 150);
            }
        });

        resizeObserver.observe(container);
        
        // Also listen for window resize for responsive breakpoint changes
        const windowResizeHandler = () => {
            clearTimeout(window.gridWindowResizeTimeout);
            window.gridWindowResizeTimeout = setTimeout(() => {
                dotNetObjectRef.invokeMethodAsync(methodName);
            }, 150);
        };
        
        window.addEventListener('resize', windowResizeHandler);
        
        // Store handlers for cleanup
        window.gridResizeHandler = windowResizeHandler;
        
        return resizeObserver;
    },

    // Clean up resize observer
    disconnectResizeObserver: function(observer) {
        if (observer) {
            observer.disconnect();
        }
        
        if (window.gridResizeHandler) {
            window.removeEventListener('resize', window.gridResizeHandler);
            window.gridResizeHandler = null;
        }
        
        if (window.gridResizeTimeout) {
            clearTimeout(window.gridResizeTimeout);
        }
        
        if (window.gridWindowResizeTimeout) {
            clearTimeout(window.gridWindowResizeTimeout);
        }
    }
};
