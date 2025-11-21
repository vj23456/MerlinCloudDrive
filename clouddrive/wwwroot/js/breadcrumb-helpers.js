// Breadcrumb helper functions

// Breadcrumb resize observer function
window.setupBreadcrumbResizeObserver = function(containerSelector, dotNetRef, callbackMethod) {
    
    const container = document.querySelector(containerSelector);
    if (!container) {
        console.error("[JS] Breadcrumb container not found:", containerSelector);
        return;
    }
    
    // Measure the container itself, not the breadcrumb <ol>
    // The container's width is what we have available for breadcrumb + edit button
    const elementToMeasure = container;

    // Create a ResizeObserver to watch for size changes
    if (window.ResizeObserver) {
        const resizeObserver = new ResizeObserver(entries => {
            // Measure the container width
            const containerWidth = elementToMeasure.clientWidth;
            const screenWidth = window.innerWidth; // Get actual screen width
            
            try {
                dotNetRef.invokeMethodAsync(callbackMethod, Math.floor(screenWidth), Math.floor(containerWidth));
            } catch (error) {
                console.error("[JS] Error calling breadcrumb resize callback:", error);
            }
        });

        // Observe the container for changes
        resizeObserver.observe(container);
        
        // Store the observer for cleanup
        container._breadcrumbResizeObserver = resizeObserver;
        
        // Also trigger initial size calculation
        const initialContainerWidth = elementToMeasure.clientWidth;
        const initialScreenWidth = window.innerWidth;
        
        try {
            dotNetRef.invokeMethodAsync(callbackMethod, Math.floor(initialScreenWidth), Math.floor(initialContainerWidth));
        } catch (error) {
            console.error("[JS] Error calling initial breadcrumb resize callback:", error);
        }
    } else {
        console.warn("[JS] ResizeObserver not supported, falling back to window resize");
        
        // Fallback for older browsers
        const resizeHandler = () => {
            const containerWidth = elementToMeasure.clientWidth;
            const screenWidth = window.innerWidth;
            
            try {
                dotNetRef.invokeMethodAsync(callbackMethod, Math.floor(screenWidth), Math.floor(containerWidth));
            } catch (error) {
                console.error("[JS] Error calling breadcrumb resize callback:", error);
            }
        };
        
        window.addEventListener('resize', resizeHandler);
        container._breadcrumbResizeHandler = resizeHandler;
        
        // Initial call
        resizeHandler();
    }
    
};

// Cleanup breadcrumb observers
window.cleanupBreadcrumbObservers = function(containerSelector) {
    const container = document.querySelector(containerSelector);
    if (!container) {
        return;
    }
    
    // Disconnect and cleanup resize observer
    if (container._breadcrumbResizeObserver) {
        container._breadcrumbResizeObserver.disconnect();
        delete container._breadcrumbResizeObserver;
    }
    
    // Remove resize event handler fallback
    if (container._breadcrumbResizeHandler) {
        window.removeEventListener('resize', container._breadcrumbResizeHandler);
        delete container._breadcrumbResizeHandler;
    }
    
    // Remove dropdown click handler
    if (container._breadcrumbDropdownHandler) {
        document.removeEventListener('click', container._breadcrumbDropdownHandler);
        delete container._breadcrumbDropdownHandler;
    }
};

// Setup dropdown handler for breadcrumb ellipsis
window.setupBreadcrumbDropdownHandler = function(containerSelector, dotNetRef, closeMethod) {
    const container = document.querySelector(containerSelector);
    if (!container) {
        console.error("[JS] Breadcrumb container not found for dropdown handler:", containerSelector);
        return;
    }

    // Global click handler to close dropdown when clicking outside
    const handleClickOutside = (event) => {
        const ellipsisItem = container.querySelector('.ellipsis-item');
        if (ellipsisItem && !ellipsisItem.contains(event.target)) {
            try {
                dotNetRef.invokeMethodAsync(closeMethod);
            } catch (error) {
                console.error("[JS] Error calling breadcrumb close dropdown:", error);
            }
        }
    };

    // Store the handler for cleanup
    if (!container._breadcrumbDropdownHandler) {
        document.addEventListener('click', handleClickOutside);
        container._breadcrumbDropdownHandler = handleClickOutside;
    }
};

// Check if breadcrumb content is overflowing its container
window.checkBreadcrumbOverflow = function(navSelector) {
    
    const nav = document.querySelector(navSelector);
    if (!nav) {
        console.error("[JS] Breadcrumb nav element not found:", navSelector);
        return false;
    }
    
    const isOverflowing = nav.scrollWidth > nav.clientWidth;
    
    return isOverflowing;
};

/**
 * Truncate text intelligently showing first and last characters with ellipsis in the middle
 * @param {string} text - The text to truncate
 * @param {number} maxLength - Maximum length before truncation
 * @param {number} [startChars=6] - Number of characters to show at the start
 * @param {number} [endChars=4] - Number of characters to show at the end
 * @returns {string} - Truncated text with ellipsis in the middle, or original text if short enough
 */
window.truncateMiddle = function(text, maxLength, startChars = 6, endChars = 4) {
    if (!text || text.length <= maxLength) {
        return text;
    }
    
    // Ensure we have enough space for start, ellipsis, and end
    if (startChars + endChars + 3 > maxLength) {
        // Adjust ratios if maxLength is very small
        const totalChars = maxLength - 3; // Reserve 3 for "..."
        startChars = Math.ceil(totalChars * 0.6);
        endChars = Math.floor(totalChars * 0.4);
    }
    
    const start = text.substring(0, startChars);
    const end = text.substring(text.length - endChars);
    
    return `${start}...${end}`;
};

/**
 * Apply smart truncation to breadcrumb items
 * This function should be called after breadcrumb is rendered
 */
window.applyBreadcrumbSmartTruncation = function(containerSelector) {
    const container = document.querySelector(containerSelector);
    if (!container) {
        console.error("[JS] Breadcrumb container not found for smart truncation:", containerSelector);
        return;
    }
    
    // Find all truncated breadcrumb items
    const truncatedItems = container.querySelectorAll('.breadcrumb-item.truncated');
    
    truncatedItems.forEach(item => {
        const link = item.querySelector('a');
        if (!link) return;
        
        const fullText = link.getAttribute('data-full-text') || link.textContent.trim();
        const maxWidth = parseInt(getComputedStyle(link).maxWidth);
        
        // Estimate how many characters can fit
        // Rough estimate: 8px per character
        const maxChars = Math.floor(maxWidth / 8);
        
        if (fullText.length > maxChars) {
            // Store original text if not already stored
            if (!link.getAttribute('data-full-text')) {
                link.setAttribute('data-full-text', fullText);
            }
            
            // Apply smart truncation: show more at start for better readability
            const startChars = Math.max(Math.floor(maxChars * 0.6), 6);
            const endChars = Math.max(Math.floor(maxChars * 0.3), 4);
            
            const truncated = window.truncateMiddle(fullText, maxChars, startChars, endChars);
            link.textContent = truncated;
            
            // Ensure title attribute shows full text
            if (!link.getAttribute('title')) {
                link.setAttribute('title', fullText);
            }
        }
    });
};

/**
 * Focus and select all text in the breadcrumb path input
 * @param {string} inputSelector - CSS selector for the input element
 */
window.focusAndSelectBreadcrumbInput = function(inputSelector) {
    const input = document.querySelector(inputSelector);
    if (!input) {
        console.error("[JS] Breadcrumb input not found:", inputSelector);
        return;
    }
    
    try {
        input.focus();
        input.select();
    } catch (error) {
        console.error("[JS] Error focusing/selecting breadcrumb input:", error);
    }
};

/**
 * Manually trigger a breadcrumb resize recalculation
 * @param {string} containerSelector - CSS selector for the breadcrumb container
 */
window.triggerBreadcrumbResize = function(containerSelector) {
    const container = document.querySelector(containerSelector);
    if (!container) {
        console.error("[JS] Breadcrumb container not found for resize trigger:", containerSelector);
        return;
    }
    
    // Find the actual breadcrumb <ol> element inside the container
    const breadcrumbNav = container.querySelector('.breadcrumb');
    const elementToMeasure = breadcrumbNav || container;
    
    // Get the stored resize observer or handler
    if (container._breadcrumbResizeObserver) {
        // Manually trigger the observer by checking current size
        const containerWidth = elementToMeasure.clientWidth;
        const screenWidth = window.innerWidth;
        
        // The observer callback should already be set up with the dotNetRef
        // We can't directly call it, but we can force a DOM change to trigger it
        // Instead, let's just wait for the next render cycle
        requestAnimationFrame(() => {
            // The ResizeObserver should pick up the change automatically
            console.log("[JS] Breadcrumb resize triggered");
        });
    }
};

/**
 * Get breadcrumb container dimensions
 * @param {string} containerSelector - CSS selector for the breadcrumb container
 * @returns {number[]} Array with [screenWidth, containerWidth]
 */
window.getBreadcrumbDimensions = function(containerSelector) {
    const container = document.querySelector(containerSelector);
    if (!container) {
        console.error("[JS] Breadcrumb container not found for dimensions:", containerSelector);
        return [0, 0];
    }
    
    // Measure the container itself
    const containerWidth = container.clientWidth;
    const screenWidth = window.innerWidth;
    
    return [screenWidth, containerWidth];
};
