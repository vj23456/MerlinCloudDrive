// Container Size Change Helper
// Handles communication between MainLayout sidebar resize and Files component

window.containerSizeHelper = {
    filesComponentRef: null,
    
    // Set the Files component reference
    setFilesComponentRef: function(dotNetRef) {
        this.filesComponentRef = dotNetRef;
    },
    
    // Clear the Files component reference
    clearFilesComponentRef: function() {
        this.filesComponentRef = null;
    },
    
    // Handle container size change event
    handleSizeChange: function(width) {
        if (this.filesComponentRef) {
            this.filesComponentRef.invokeMethodAsync('OnContainerSizeChange');
        }
    }
};

// Set up global event listener
window.addEventListener('sidebarResize', function(e) {
    window.containerSizeHelper.handleSizeChange(e.detail.width);
});
