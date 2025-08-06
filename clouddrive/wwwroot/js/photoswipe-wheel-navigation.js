
(function() {
    'use strict';

    // Debounce utility to prevent rapid firing of navigation
    function debounce(func, wait, immediate) {
        var timeout;
        return function() {
            var context = this, args = arguments;
            var later = function() {
                timeout = null;
                if (!immediate) func.apply(context, args);
            };
            var callNow = immediate && !timeout;
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
            if (callNow) func.apply(context, args);
        };
    };

    // Function to initialize the wheel navigation
    var initPhotoSwipeWheelNavigation = function(pswp) {
        if (!pswp) {
            return;
        }

        var lastWheelTime = 0;
        var wheelDelay = 150; // Further reduced delay for more responsive navigation

        var handleMouseWheel = function(e) {
            e = e || window.event;
            
            // Check if image is zoomed in - if so, let PhotoSwipe handle panning
            var currentZoomLevel = pswp.getZoomLevel ? pswp.getZoomLevel() : 1;
            var initialZoomLevel = pswp.currItem && pswp.currItem.initialZoomLevel ? pswp.currItem.initialZoomLevel : 1;
            
            // If image is zoomed beyond initial level, don't navigate
            if (currentZoomLevel > initialZoomLevel + 0.1) { // Add small tolerance
                return;
            }

            var currentTime = new Date().getTime();
            if(currentTime - lastWheelTime < wheelDelay) {
                e.preventDefault();
                e.stopPropagation();
                return;
            }

            // Use deltaX for horizontal scroll (trackpad swipe) and deltaY for vertical scroll
            var deltaX = e.deltaX || 0;
            var deltaY = e.deltaY || 0;

            // Fallback for older browsers
            if (deltaX === 0 && deltaY === 0) {
                if (e.wheelDeltaX) {
                    deltaX = -e.wheelDeltaX / 120;
                }
                if (e.wheelDeltaY) {
                    deltaY = -e.wheelDeltaY / 120;
                }
            }

            // For macOS trackpad, prioritize horizontal swipes but also allow vertical
            var horizontalThreshold = 3; // Reduced for better sensitivity
            var verticalThreshold = 8;   // Higher threshold for vertical to avoid accidental navigation
            var shouldNavigate = false;
            var direction = 0;

            // Prioritize horizontal movement for trackpad swiping
            if (Math.abs(deltaX) > horizontalThreshold) {
                shouldNavigate = true;
                direction = deltaX > 0 ? 1 : -1;
            } else if (Math.abs(deltaY) > verticalThreshold && Math.abs(deltaX) < horizontalThreshold) {
                // Use vertical scroll only if horizontal is minimal and vertical is stronger
                shouldNavigate = true;
                direction = deltaY > 0 ? 1 : -1;
            }

            if (shouldNavigate) {
                e.preventDefault();
                e.stopPropagation();
                
                var currentIndex = pswp.getCurrentIndex();
                var numItems = pswp.items.length;
                
                if (direction > 0) {
                    // Next image - check if we're at the last item (disable loop)
                    if (currentIndex < numItems - 1) {
                        pswp.next();
                        lastWheelTime = currentTime;
                    }
                } else {
                    // Previous image - check if we're at the first item (disable loop)
                    if (currentIndex > 0) {
                        pswp.prev();
                        lastWheelTime = currentTime;
                    }
                }
            }
        };

        // We need to find the right element to attach the event to.
        // .pswp__scroll-wrap is a good candidate as it's always present.
        var scrollWrap = pswp.scrollWrap || pswp.container;
        if (scrollWrap) {
            var events = 'wheel mousewheel DOMMouseScroll';
            
            // Use native addEventListener since framework might not be available
            var addEventListener = function(element, eventNames, handler) {
                var eventList = eventNames.split(' ');
                for (var i = 0; i < eventList.length; i++) {
                    if (eventList[i]) {
                        element.addEventListener(eventList[i], handler, { passive: false });
                    }
                }
            };

            var removeEventListener = function(element, eventNames, handler) {
                var eventList = eventNames.split(' ');
                for (var i = 0; i < eventList.length; i++) {
                    if (eventList[i]) {
                        element.removeEventListener(eventList[i], handler);
                    }
                }
            };

            addEventListener(scrollWrap, events, handleMouseWheel);

            // When PhotoSwipe closes, unbind the event
            pswp.listen('destroy', function() {
                removeEventListener(scrollWrap, events, handleMouseWheel);
            });
        }
    };

    // Global function to enable wheel navigation on a PhotoSwipe instance
    window.enablePhotoSwipeWheelNavigation = function(pswp) {
        initPhotoSwipeWheelNavigation(pswp);
    };

    // We need to hook into PhotoSwipe's initialization.
    // A common way is to listen for the 'gettingData' event which is fired
    // when PhotoSwipe is about to open.
    document.addEventListener('DOMContentLoaded', function() {
        // This assumes you have a PhotoSwipe instance on the page.
        // If your PhotoSwipe is initialized dynamically, you might need to
        // call enablePhotoSwipeWheelNavigation(pswp) from your own code
        // after you create the PhotoSwipe instance.

        // Let's try a polling mechanism as a fallback if we can't find a pswp instance
        var interval = setInterval(function() {
            if (window.pswp && (window.pswp.scrollWrap || window.pswp.container)) {
                initPhotoSwipeWheelNavigation(window.pswp);
                clearInterval(interval);
            }
        }, 500);

        // Clean up the interval after a while if no PhotoSwipe is found
        setTimeout(function() {
            clearInterval(interval);
        }, 10000);
    });

})();
