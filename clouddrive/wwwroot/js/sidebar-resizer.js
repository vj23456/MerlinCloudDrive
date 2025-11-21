// Sidebar Resizer - Handle draggable sidebar splitter
window.sidebarResizer = {
    isResizing: false,
    startX: 0,
    startWidth: 0,
    dotNetRef: null,

    startDrag: function(dotNetReference, clientX, currentWidth) {
        this.isResizing = true;
        this.startX = clientX;
        this.startWidth = currentWidth;
        this.dotNetRef = dotNetReference;

        // Add event listeners to document for mouse and touch events
        document.addEventListener('mousemove', this.onMouseMove);
        document.addEventListener('mouseup', this.onMouseUp);
        document.addEventListener('touchmove', this.onTouchMove, { passive: false });
        document.addEventListener('touchend', this.onTouchEnd);
        
        // Prevent default drag behavior
        document.addEventListener('selectstart', this.preventSelect);
        document.addEventListener('dragstart', this.preventSelect);
        
        // Add dragging class to splitter for visual feedback
        const splitter = document.querySelector('.sidebar-splitter');
        if (splitter) {
            splitter.classList.add('dragging');
        }
    },

    onMouseMove: function(e) {
        if (!window.sidebarResizer.isResizing) return;

        const clientX = e.clientX;
        const deltaX = clientX - window.sidebarResizer.startX;
        const newWidth = window.sidebarResizer.startWidth + deltaX;

        // Constrain width between min and max values (these will be enforced on the C# side too)
        const constrainedWidth = Math.max(200, Math.min(500, newWidth));

        // Update the sidebar width immediately for smooth visual feedback
        const sidebar = document.querySelector('.app-sidebar');
        if (sidebar && !sidebar.classList.contains('collapsed')) {
            sidebar.style.width = constrainedWidth + 'px';
        }

        // Call the .NET method to update the width (throttled)
        if (window.sidebarResizer.dotNetRef) {
            // Use requestAnimationFrame to throttle updates for performance
            if (!window.sidebarResizer.rafId) {
                window.sidebarResizer.rafId = requestAnimationFrame(() => {
                    window.sidebarResizer.dotNetRef.invokeMethodAsync('OnSidebarResize', constrainedWidth);
                    window.sidebarResizer.rafId = null;
                });
            }
        }
    },

    onTouchMove: function(e) {
        if (!window.sidebarResizer.isResizing) return;

        e.preventDefault(); // Prevent scrolling while dragging
        const touch = e.touches[0];
        const clientX = touch.clientX;
        const deltaX = clientX - window.sidebarResizer.startX;
        const newWidth = window.sidebarResizer.startWidth + deltaX;

        // Constrain width between min and max values
        const constrainedWidth = Math.max(200, Math.min(500, newWidth));

        // Update the sidebar width immediately for smooth visual feedback
        const sidebar = document.querySelector('.app-sidebar');
        if (sidebar && !sidebar.classList.contains('collapsed')) {
            sidebar.style.width = constrainedWidth + 'px';
        }

        // Call the .NET method to update the width (throttled)
        if (window.sidebarResizer.dotNetRef) {
            // Use requestAnimationFrame to throttle updates for performance
            if (!window.sidebarResizer.rafId) {
                window.sidebarResizer.rafId = requestAnimationFrame(() => {
                    window.sidebarResizer.dotNetRef.invokeMethodAsync('OnSidebarResize', constrainedWidth);
                    window.sidebarResizer.rafId = null;
                });
            }
        }
    },

    onMouseUp: function(e) {
        if (!window.sidebarResizer.isResizing) return;

        window.sidebarResizer.isResizing = false;

        // Remove event listeners
        document.removeEventListener('mousemove', window.sidebarResizer.onMouseMove);
        document.removeEventListener('mouseup', window.sidebarResizer.onMouseUp);
        document.removeEventListener('touchmove', window.sidebarResizer.onTouchMove);
        document.removeEventListener('touchend', window.sidebarResizer.onTouchEnd);
        document.removeEventListener('selectstart', window.sidebarResizer.preventSelect);
        document.removeEventListener('dragstart', window.sidebarResizer.preventSelect);

        // Remove dragging class from splitter
        const splitter = document.querySelector('.sidebar-splitter');
        if (splitter) {
            splitter.classList.remove('dragging');
        }

        // Cancel any pending RAF
        if (window.sidebarResizer.rafId) {
            cancelAnimationFrame(window.sidebarResizer.rafId);
            window.sidebarResizer.rafId = null;
        }

        // Call the .NET method to signal resize end
        if (window.sidebarResizer.dotNetRef) {
            window.sidebarResizer.dotNetRef.invokeMethodAsync('OnSidebarResizeEnd');
        }
    },

    onTouchEnd: function(e) {
        if (!window.sidebarResizer.isResizing) return;

        window.sidebarResizer.isResizing = false;

        // Remove event listeners
        document.removeEventListener('mousemove', window.sidebarResizer.onMouseMove);
        document.removeEventListener('mouseup', window.sidebarResizer.onMouseUp);
        document.removeEventListener('touchmove', window.sidebarResizer.onTouchMove);
        document.removeEventListener('touchend', window.sidebarResizer.onTouchEnd);
        document.removeEventListener('selectstart', window.sidebarResizer.preventSelect);
        document.removeEventListener('dragstart', window.sidebarResizer.preventSelect);

        // Remove dragging class from splitter
        const splitter = document.querySelector('.sidebar-splitter');
        if (splitter) {
            splitter.classList.remove('dragging');
        }

        // Cancel any pending RAF
        if (window.sidebarResizer.rafId) {
            cancelAnimationFrame(window.sidebarResizer.rafId);
            window.sidebarResizer.rafId = null;
        }

        // Call the .NET method to signal resize end
        if (window.sidebarResizer.dotNetRef) {
            window.sidebarResizer.dotNetRef.invokeMethodAsync('OnSidebarResizeEnd');
        }
    },

    preventSelect: function(e) {
        e.preventDefault();
        return false;
    }
};

// CSS Custom Properties Helper
window.setCSSCustomProperty = function(property, value) {
    document.documentElement.style.setProperty(property, value);
};

// Clean up on page unload
window.addEventListener('beforeunload', function() {
    if (window.sidebarResizer.isResizing) {
        window.sidebarResizer.onMouseUp();
    }
});
