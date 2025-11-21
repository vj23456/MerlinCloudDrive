// Long-press handler for touch devices
window.setupLongPressHandler = function(elementSelector, dotNetRef, callbackMethod) {
    const element = document.querySelector(elementSelector);
    if (!element) {
        console.warn(`[LongPress] Element not found: "${elementSelector}"`);
        return null;
    }

    let longPressTimer = null;
    let touchStartX = 0;
    let touchStartY = 0;
    const longPressDuration = 500; // 500ms for long press
    const movementThreshold = 10; // 10px movement threshold

    const handleTouchStart = (e) => {
        // Only handle single touch
        if (e.touches.length !== 1) {
            clearTimeout(longPressTimer);
            return;
        }

        const touch = e.touches[0];
        touchStartX = touch.clientX;
        touchStartY = touch.clientY;

        // Start long-press timer
        longPressTimer = setTimeout(() => {
            // Trigger the callback with touch coordinates
            if (dotNetRef && callbackMethod) {
                try {
                    dotNetRef.invokeMethodAsync(callbackMethod, {
                        clientX: touch.clientX,
                        clientY: touch.clientY,
                        button: 0,
                        buttons: 0
                    });
                } catch (err) {
                    console.error(`[LongPress] Error invoking method: ${err}`);
                }
            }
            
            // Prevent default context menu on long press
            e.preventDefault();
        }, longPressDuration);
    };

    const handleTouchMove = (e) => {
        if (!longPressTimer) return;

        const touch = e.touches[0];
        const deltaX = Math.abs(touch.clientX - touchStartX);
        const deltaY = Math.abs(touch.clientY - touchStartY);

        // Cancel long-press if user moves finger too much
        if (deltaX > movementThreshold || deltaY > movementThreshold) {
            clearTimeout(longPressTimer);
            longPressTimer = null;
        }
    };

    const handleTouchEnd = () => {
        // Cancel long-press on touch end
        clearTimeout(longPressTimer);
        longPressTimer = null;
    };

    const handleTouchCancel = () => {
        // Cancel long-press on touch cancel
        clearTimeout(longPressTimer);
        longPressTimer = null;
    };

    // Add event listeners
    element.addEventListener('touchstart', handleTouchStart, { passive: false });
    element.addEventListener('touchmove', handleTouchMove, { passive: true });
    element.addEventListener('touchend', handleTouchEnd);
    element.addEventListener('touchcancel', handleTouchCancel);

    // Return handler identifier (we'll store it globally)
    const handlerId = 'longPressHandler_' + Date.now();
    window[handlerId] = {
        element: element,
        dispose: () => {
            clearTimeout(longPressTimer);
            element.removeEventListener('touchstart', handleTouchStart);
            element.removeEventListener('touchmove', handleTouchMove);
            element.removeEventListener('touchend', handleTouchEnd);
            element.removeEventListener('touchcancel', handleTouchCancel);
            delete window[handlerId];
        }
    };
    
    return handlerId;
};

window.disposeLongPressHandler = function(handlerId) {
    if (handlerId && window[handlerId] && window[handlerId].dispose) {
        window[handlerId].dispose();
    }
};
