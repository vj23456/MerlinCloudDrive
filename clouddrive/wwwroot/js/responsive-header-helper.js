// Responsive Header Helper for Files.razor
// Handles header button overflow with a responsive "more" menu

window.responsiveHeaderHelper = (function() {
    let dotNetRef = null;
    let resizeObserver = null;
    let headerElement = null;
    let statusSection = null;
    let viewSection = null;
    let isInitialized = false;
    let lastWidth = 0;
    let debounceTimer = null;
    let dropdownHandler = null;
    let outsideClickHandler = null;

    // Button priorities (higher number = higher priority, shown first)
    // Note: View control buttons are never hidden - they're in the view section
    const BUTTON_PRIORITIES = {
        // Core actions
        'add-cloud-storage-btn': 90,
        'add-actions-btn': 90,
        'download-selected-btn': 85,
        'delete-selected-btn': 80,
        'rename-selected-btn': 75,
        'move-to-btn': 70,
        
        // Secondary actions
        'refresh-btn': 65,
        'search-btn': 60,
        'play-with-btn': 50,
        'play-folder-btn': 45,
        
        // Fallback for any unmatched buttons
        'default': 30
    };

    function initialize(componentRef) {
        if (isInitialized) return;
        
        try {
            dotNetRef = componentRef;
            headerElement = document.getElementById('header-controls');
            statusSection = document.getElementById('header-status-section');
            viewSection = document.querySelector('.header-view-section');
            
            if (!headerElement || !statusSection || !viewSection) {
                console.warn('[ResponsiveHeader] Required elements not found, retrying...');
                setTimeout(() => initialize(componentRef), 100);
                return;
            }
            
            setupResizeObserver();
            dropdownHandler = setupDropdownPositioning();
            isInitialized = true;
            
            // Initial check
            checkResponsiveLayout();
            
        } catch (error) {
            console.error('[ResponsiveHeader] Initialization error:', error);
        }
    }

    function setupDropdownPositioning() {
        // Handle dropdown positioning for overflow menu
        const dropdownHandler = function(e) {
            const dropdown = e.target;
            const menu = dropdown.querySelector('.dropdown-menu');
            
            if (menu && dropdown.closest('#overflow-menu')) {
                const rect = menu.getBoundingClientRect();
                const viewportWidth = window.innerWidth;
                
                // If dropdown would go off-screen to the right, position it to the left
                if (rect.right > viewportWidth - 10) {
                    menu.classList.add('dropdown-menu-end');
                }
                
                // Handle submenu positioning
                const submenus = menu.querySelectorAll('.dropdown-submenu');
                submenus.forEach(submenu => {
                    const submenuRect = submenu.getBoundingClientRect();
                    if (submenuRect.right > viewportWidth - 200) {
                        submenu.classList.add('dropstart');
                    }
                });
            }
        };
        
        // Handle outside click to close dropdown
        outsideClickHandler = function(event) {
            const overflowMenu = document.getElementById('overflow-menu');
            if (overflowMenu && !overflowMenu.contains(event.target)) {
                // Click is outside the overflow menu, close it
                const dropdown = overflowMenu.querySelector('.dropdown-menu');
                if (dropdown && dropdown.classList.contains('show')) {
                    // Notify Blazor component to close the dropdown
                    if (dotNetRef) {
                        dotNetRef.invokeMethodAsync('CloseOverflowMenu');
                    }
                }
            }
        };
        
        document.addEventListener('shown.bs.dropdown', dropdownHandler);
        document.addEventListener('click', outsideClickHandler);
        return dropdownHandler;
    }

    function setupResizeObserver() {
        if (!window.ResizeObserver) {
            console.warn('[ResponsiveHeader] ResizeObserver not supported, falling back to window resize');
            window.addEventListener('resize', debounceResize);
            return;
        }
        
        resizeObserver = new ResizeObserver(entries => {
            for (const entry of entries) {
                const newWidth = entry.contentRect.width;
                if (Math.abs(newWidth - lastWidth) > 10) { // Only trigger on significant changes
                    lastWidth = newWidth;
                    debounceResize();
                }
            }
        });
        
        resizeObserver.observe(headerElement);
    }

    function debounceResize() {
        if (debounceTimer) {
            clearTimeout(debounceTimer);
        }
        
        debounceTimer = setTimeout(() => {
            checkResponsiveLayout();
        }, 100);
    }

    function checkResponsiveLayout() {
        if (!headerElement || !statusSection || !viewSection) return;
        
        try {
            const headerWidth = headerElement.offsetWidth;
            const viewSectionWidth = viewSection.offsetWidth;
            
            // More aggressive calculation for mobile devices
            const isMobile = window.innerWidth <= 768;
            const isSmallMobile = window.innerWidth <= 576;
            
            // Adjust available width based on screen size - more conservative calculation
            let paddingAndGaps = 32; // Default padding and gaps
            if (isSmallMobile) {
                paddingAndGaps = 24; // More conservative for small mobile
            } else if (isMobile) {
                paddingAndGaps = 28; // More conservative for mobile
            }
            
            // Add extra safety margin to prevent overlapping
            const safetyMargin = 10; // Extra pixels to prevent overlap
            const availableWidth = headerWidth - viewSectionWidth - paddingAndGaps - safetyMargin;
            
            // Get all buttons in status section
            const buttons = getButtonsInPriorityOrder();
            const hiddenButtons = [];
            let usedWidth = 0;
            
            // Adjust overflow button width based on screen size - more conservative
            let overflowButtonWidth = 50; // Increased default width for safety
            if (isSmallMobile) {
                overflowButtonWidth = 44; // Increased for small mobile
            } else if (isMobile) {
                overflowButtonWidth = 46; // Increased for mobile
            }
            
            // Calculate which buttons fit - more conservative approach
            for (const button of buttons) {
                const buttonWidth = getButtonWidth(button);
                
                // Always check if we need overflow button space
                const needsOverflowSpace = hiddenButtons.length > 0;
                const requiredOverflowSpace = needsOverflowSpace ? overflowButtonWidth : 0;
                
                // Check if this button would fit considering overflow button space
                if ((usedWidth + buttonWidth + requiredOverflowSpace) > availableWidth) {
                    // This button doesn't fit, hide it
                    hiddenButtons.push(button.id);
                } else {
                    // Only if adding this button won't require overflow space OR
                    // there's enough space for both this button and potential overflow button
                    const wouldRequireOverflow = (usedWidth + buttonWidth + overflowButtonWidth) > availableWidth;
                    
                    if (!wouldRequireOverflow || hiddenButtons.length === 0) {
                        usedWidth += buttonWidth;
                    } else {
                        hiddenButtons.push(button.id);
                    }
                }
            }
            
            // Final check: if we have hidden buttons, ensure overflow button fits
            if (hiddenButtons.length > 0) {
                // Keep removing visible buttons until overflow button fits
                while ((usedWidth + overflowButtonWidth) > availableWidth && hiddenButtons.length < buttons.length) {
                    const lastVisibleButton = buttons.find(b => !hiddenButtons.includes(b.id));
                    if (lastVisibleButton) {
                        hiddenButtons.push(lastVisibleButton.id);
                        usedWidth -= getButtonWidth(lastVisibleButton);
                    } else {
                        break;
                    }
                }
            }
            
            // Update responsive state
            const isOverflow = hiddenButtons.length > 0;
            updateResponsiveState(isOverflow, hiddenButtons);
            
        } catch (error) {
            console.error('[ResponsiveHeader] Error checking layout:', error);
        }
    }

    function getButtonsInPriorityOrder() {
        const buttons = [];
        
        // Find all buttons and dropdowns in the status section ONLY
        // Never include buttons from the view section as they should always be visible
        const elements = statusSection.querySelectorAll('button, .btn-group, a.btn');
        
        elements.forEach(element => {
            // Skip elements that are inside the view section or don't have IDs
            if (element.id && !element.closest('#overflow-menu') && !element.closest('.header-view-section')) {
                const priority = BUTTON_PRIORITIES[element.id] || BUTTON_PRIORITIES.default;
                buttons.push({
                    element: element,
                    id: element.id,
                    priority: priority
                });
            }
        });
        
        // Sort by priority (higher first)
        buttons.sort((a, b) => b.priority - a.priority);
        
        return buttons;
    }

    function getButtonWidth(button) {
        const element = button.element;
        
        // If button is hidden, temporarily show it to measure
        const wasHidden = element.style.display === 'none';
        if (wasHidden) {
            element.style.display = '';
            element.style.visibility = 'hidden';
        }
        
        // Account for mobile button sizing
        const isMobile = window.innerWidth <= 768;
        const isSmallMobile = window.innerWidth <= 576;
        
        let width = element.offsetWidth;
        
        // Adjust gap based on screen size
        let gap = 4; // Default gap
        if (isSmallMobile) {
            gap = 1; // Smaller gap for small mobile
        } else if (isMobile) {
            gap = 2; // Smaller gap for mobile
        }
        
        width += gap;
        
        if (wasHidden) {
            element.style.display = 'none';
            element.style.visibility = '';
        }
        
        return width;
    }

    function updateResponsiveState(isOverflow, hiddenButtons) {
        try {
            // Update header class
            if (isOverflow) {
                headerElement.classList.add('responsive');
            } else {
                headerElement.classList.remove('responsive');
            }
            
            // Notify Blazor component
            if (dotNetRef) {
                dotNetRef.invokeMethodAsync('OnHeaderResize', isOverflow, hiddenButtons);
            }
            
        } catch (error) {
            console.error('[ResponsiveHeader] Error updating state:', error);
        }
    }

    function cleanup() {
        if (resizeObserver) {
            resizeObserver.disconnect();
            resizeObserver = null;
        }
        
        if (debounceTimer) {
            clearTimeout(debounceTimer);
            debounceTimer = null;
        }
        
        window.removeEventListener('resize', debounceResize);
        
        if (dropdownHandler) {
            document.removeEventListener('shown.bs.dropdown', dropdownHandler);
            dropdownHandler = null;
        }
        
        if (outsideClickHandler) {
            document.removeEventListener('click', outsideClickHandler);
            outsideClickHandler = null;
        }
        
        if (headerElement) {
            headerElement.classList.remove('responsive');
        }
        
        dotNetRef = null;
        headerElement = null;
        statusSection = null;
        viewSection = null;
        isInitialized = false;
        lastWidth = 0;
        
    }

    // Public API
    return {
        initialize: initialize,
        cleanup: cleanup,
        checkLayout: checkResponsiveLayout,
        recalculateLayout: function() {
            // Force immediate recalculation without debouncing
            // This is useful when button visibility changes due to selection changes
            if (isInitialized) {
                checkResponsiveLayout();
            }
        }
    };
})();
