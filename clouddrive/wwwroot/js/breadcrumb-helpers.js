// Breadcrumb helper functions

// Breadcrumb resize observer function
window.setupBreadcrumbResizeObserver = function(containerSelector, dotNetRef, callbackMethod) {
    
    const container = document.querySelector(containerSelector);
    if (!container) {
        console.error("[JS] Breadcrumb container not found:", containerSelector);
        return;
    }

    // Create a ResizeObserver to watch for size changes
    if (window.ResizeObserver) {
        const resizeObserver = new ResizeObserver(entries => {
            for (let entry of entries) {
                const containerWidth = entry.contentRect.width;
                const screenWidth = window.innerWidth; // Get actual screen width
                
                try {
                    dotNetRef.invokeMethodAsync(callbackMethod, Math.floor(containerWidth), Math.floor(screenWidth));
                } catch (error) {
                    console.error("[JS] Error calling breadcrumb resize callback:", error);
                }
            }
        });

        resizeObserver.observe(container);
        
        // Store the observer for cleanup
        container._breadcrumbResizeObserver = resizeObserver;
        
        // Also trigger initial size calculation
        const initialContainerWidth = container.clientWidth;
        const initialScreenWidth = window.innerWidth;
        
        try {
            dotNetRef.invokeMethodAsync(callbackMethod, Math.floor(initialContainerWidth), Math.floor(initialScreenWidth));
        } catch (error) {
            console.error("[JS] Error calling initial breadcrumb resize callback:", error);
        }
    } else {
        console.warn("[JS] ResizeObserver not supported, falling back to window resize");
        
        // Fallback for older browsers
        const resizeHandler = () => {
            const containerWidth = container.clientWidth;
            const screenWidth = window.innerWidth;
            
            try {
                dotNetRef.invokeMethodAsync(callbackMethod, Math.floor(containerWidth), Math.floor(screenWidth));
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
