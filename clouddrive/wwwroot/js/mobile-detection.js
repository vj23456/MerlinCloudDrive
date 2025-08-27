// Mobile detection utilities for CloudDrive2
window.mobileDetection = {
    // Check if current device is mobile based on screen width
    isMobile: () => window.innerWidth <= 768,
    
    // Check media query match
    matchesMedia: (query) => window.matchMedia(query).matches,
    
    // Add CSS class to body based on screen size
    updateBodyClass: () => {
        const isMobile = window.innerWidth <= 768;
        document.body.classList.toggle('mobile-device', isMobile);
        document.body.classList.toggle('desktop-device', !isMobile);
        return isMobile;
    },
    
    // Compute and set CSS var for actual header height
    setHeaderHeightVar: () => {
        const header = document.querySelector('.app-header');
        const h = header ? header.offsetHeight : null;
        if (h && h > 0) {
            document.documentElement.style.setProperty('--header-height', `${h}px`);
        }
    },

    // Detect and handle mobile browser UI (bottom toolbar, address bar, etc.)
    handleMobileBrowserUI: () => {
        // Only run on mobile devices
        if (!window.mobileDetection.isMobile()) return;
        
        // Set CSS custom properties for actual viewport dimensions
        const setViewportHeight = () => {
            // Get the actual viewport height
            const vh = window.innerHeight * 0.01;
            document.documentElement.style.setProperty('--vh', `${vh}px`);
            
            // Calculate safe areas for mobile browser UI
            const visualViewportHeight = window.visualViewport ? window.visualViewport.height : window.innerHeight;
            const browserUIHeight = window.innerHeight - visualViewportHeight;
            
            // Set custom property for browser UI offset
            document.documentElement.style.setProperty('--mobile-browser-ui-height', `${browserUIHeight}px`);
            
            // Update app container height to avoid browser UI
            const appContainer = document.querySelector('.app-container');
            if (appContainer) {
                appContainer.style.height = `${visualViewportHeight}px`;
                appContainer.style.maxHeight = `${visualViewportHeight}px`;
            }
        };
        
    // Set initial viewport height
        setViewportHeight();
    // Also set actual header height var
    window.mobileDetection.setHeaderHeightVar();
        
        // Update on resize and orientation change
        window.addEventListener('resize', () => {
            setViewportHeight();
            window.mobileDetection.setHeaderHeightVar();
        });
        window.addEventListener('orientationchange', () => {
            // Small delay to account for browser UI animation
            setTimeout(() => {
                setViewportHeight();
                window.mobileDetection.setHeaderHeightVar();
            }, 100);
        });
        
        // Handle Visual Viewport API if available (better mobile browser UI detection)
        if (window.visualViewport) {
            window.visualViewport.addEventListener('resize', () => {
                setViewportHeight();
                window.mobileDetection.setHeaderHeightVar();
            });
            window.visualViewport.addEventListener('scroll', setViewportHeight);
        }
        
        // Detect when mobile browser shows/hides UI
        let lastHeight = window.innerHeight;
        const checkBrowserUI = () => {
            const currentHeight = window.innerHeight;
            if (Math.abs(currentHeight - lastHeight) > 100) { // Significant height change
                setViewportHeight();
                lastHeight = currentHeight;
                
                // Dispatch custom event for other components to react
                window.dispatchEvent(new CustomEvent('mobileBrowserUIChanged', {
                    detail: { 
                        height: currentHeight,
                        uiVisible: currentHeight < lastHeight
                    }
                }));
            }
        };
        
        // Check for browser UI changes periodically (fallback)
        setInterval(checkBrowserUI, 500);
    },
    
    // Add padding to prevent content from being hidden behind mobile browser UI
    preventContentCovering: () => {
        if (!window.mobileDetection.isMobile()) return;
        
        // Add extra padding to scrollable containers on mobile
        const addMobilePadding = (selector, paddingBottom = '20px') => {
            const elements = document.querySelectorAll(selector);
            elements.forEach(el => {
                if (el) {
                    el.style.paddingBottom = `max(${paddingBottom}, env(safe-area-inset-bottom, 20px))`;
                    el.style.boxSizing = 'border-box';
                }
            });
        };
        
        // Apply padding to common scrollable areas
        addMobilePadding('.app-sidebar .sidebar-nav');
        addMobilePadding('.nav-menu');
        addMobilePadding('.dropdown-menu');
        addMobilePadding('.app-content');
        addMobilePadding('.content-body');
    },
    
    // Initialize mobile detection
    init: () => {
        // Set initial body class
        window.mobileDetection.updateBodyClass();
        
        // Handle mobile browser UI
        window.mobileDetection.handleMobileBrowserUI();
        
        // Prevent content covering
        window.mobileDetection.preventContentCovering();
        
        // Update on resize
        window.addEventListener('resize', () => {
            window.mobileDetection.updateBodyClass();
            window.mobileDetection.preventContentCovering();
        });
        
        // Re-apply mobile handling when DOM changes
        const observer = new MutationObserver(() => {
            window.mobileDetection.preventContentCovering();
            window.mobileDetection.setHeaderHeightVar();
        });
        
        observer.observe(document.body, {
            childList: true,
            subtree: true
        });
    }
};

// Initialize on DOM ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', window.mobileDetection.init);
} else {
    window.mobileDetection.init();
}
