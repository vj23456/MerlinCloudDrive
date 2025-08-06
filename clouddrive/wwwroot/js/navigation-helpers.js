// Navigation and DOM helper functions

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
    if (!element) {
        return false;
    }
    
    // Find the scrollable container - try multiple selectors for different view modes
    let scrollContainer = element.closest('.files-content');
    if (!scrollContainer) {
        scrollContainer = element.closest('.files-list-container');
    }
    if (!scrollContainer) {
        scrollContainer = element.closest('.files-grid-container');
    }
    if (!scrollContainer) {
        scrollContainer = element.closest('.main-content');
    }
    
    if (!scrollContainer) {

        return false;
    }
    
    // Get element and container positions
    const elementRect = element.getBoundingClientRect();
    const containerRect = scrollContainer.getBoundingClientRect();
    
    // Calculate if element is out of view
    const isAboveView = elementRect.top < containerRect.top;
    const isBelowView = elementRect.bottom > containerRect.bottom;
    const isLeftOfView = elementRect.left < containerRect.left;
    const isRightOfView = elementRect.right > containerRect.right;
    
    // Only scroll if element is out of view
    if (isAboveView || isBelowView || isLeftOfView || isRightOfView) {
        element.scrollIntoView({
            behavior: 'auto',
            block: 'center',
            inline: 'nearest'
        });
        return true;
    } else {
        return true;
    }
    
    return true;
};

// Helper function to wait for view container to be ready
window.waitForViewContainer = function(viewMode, maxRetries = 10) {
    return new Promise((resolve) => {
        let retries = 0;
        
        function checkContainer() {
            retries++;
            const selectors = {
                'list': '.files-list-container',
                'grid': '.files-grid-container',
                'table': '.files-table-container'
            };
            
            const selector = selectors[viewMode] || '.files-content';
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
window.scrollToElementInView = function(elementId, viewMode) {
    return new Promise(async (resolve) => {

        
        // First wait for the view container to be ready
        const containerReady = await window.waitForViewContainer(viewMode);
        if (!containerReady) {

            resolve(false);
            return;
        }
        
        // Add a small delay to ensure the view has fully rendered
        await new Promise(resolve => setTimeout(resolve, 50));
        
        // Now try to scroll to the specific element
        const success = window.scrollToElement(elementId);
        resolve(success);
    });
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
        'XS': { label: 'Extra Small', width: 180, preview: 24, mobileOnly: true },
        'S': { label: 'Small', width: 220, preview: 32, mobileOnly: true },
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
        
        // Position dropdown relative to button
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
        const buttonRect = buttonElement.getBoundingClientRect();
        const viewportWidth = window.innerWidth;
        const viewportHeight = window.innerHeight;
        
        // Default position below button
        let top = buttonRect.bottom + 8;
        let left = buttonRect.left;
        
        // Adjust if dropdown would go off screen
        const dropdownWidth = 320; // Approximate width
        const dropdownHeight = 300; // Approximate height for preset options
        
        if (left + dropdownWidth > viewportWidth - 20) {
            left = buttonRect.right - dropdownWidth;
        }
        
        if (top + dropdownHeight > viewportHeight - 20) {
            top = buttonRect.top - dropdownHeight - 8;
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

// Page navigation scroll reset helper
window.resetPageScroll = function() {
    try {
        // First, reset window scroll
        window.scrollTo(0, 0);
        
        // Reset scroll position of main content areas
        const contentElement = document.querySelector('.app-content');
        if (contentElement) {
            contentElement.scrollTop = 0;
            contentElement.scrollLeft = 0;
        }
        
        // Reset content body scroll
        const bodyElement = document.querySelector('.content-body');
        if (bodyElement) {
            bodyElement.scrollTop = 0;
            bodyElement.scrollLeft = 0;
        }
        
        // Reset article scroll (the main content wrapper)
        const articleElement = document.querySelector('article');
        if (articleElement) {
            articleElement.scrollTop = 0;
            articleElement.scrollLeft = 0;
        }
        
        // Reset any other potential scrollable containers
        const scrollableContainers = document.querySelectorAll('.files-container, .files-content, .main-content, .app-main');
        scrollableContainers.forEach(container => {
            if (container) {
                container.scrollTop = 0;
                container.scrollLeft = 0;
            }
        });
        
        // Force a repaint to ensure changes are applied
        document.body.offsetHeight;
        
        return true;
    } catch (error) {
        return false;
    }
};

// Delayed scroll reset with multiple attempts for reliable page transitions
window.resetPageScrollDelayed = function() {
    return new Promise((resolve) => {
        let attempts = 0;
        const maxAttempts = 5;
        const delay = 50; // 50ms between attempts
        
        const attemptReset = () => {
            attempts++;
            const success = window.resetPageScroll();
            
            if (success && attempts < maxAttempts) {
                // Wait a bit and try again to ensure it sticks
                setTimeout(() => {
                    window.resetPageScroll();
                    if (attempts < maxAttempts) {
                        setTimeout(attemptReset, delay);
                    } else {
                        resolve(true);
                    }
                }, delay);
            } else {
                resolve(success);
            }
        };
        
        // Start the reset attempts
        attemptReset();
    });
};