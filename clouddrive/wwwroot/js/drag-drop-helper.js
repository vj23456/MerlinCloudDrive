// Drag and Drop Helper for InputFile elements
window.dragDropHelper = {
    init: function() {
        // Initialize drag and drop functionality
        console.log('[DRAG_DROP] Initializing drag drop helper');
        
        // Store reference to current drag data
        this.currentDragData = null;
        
        // Add global drag event listeners to capture file data
        document.addEventListener('dragover', (e) => {
            if (e.dataTransfer && e.dataTransfer.items) {
                // Store the drag data for later use
                this.currentDragData = e.dataTransfer;
            }
        });
        
        document.addEventListener('drop', (e) => {
            // Clear drag data after drop
            setTimeout(() => {
                this.currentDragData = null;
            }, 100);
        });
    },
    
    handleDrop: function(inputFileId) {
        try {
            console.log('[DRAG_DROP] Handling drop event for:', inputFileId);
            
            // Use the stored drag data
            const dataTransfer = this.currentDragData;
            if (!dataTransfer || !dataTransfer.files || dataTransfer.files.length === 0) {
                console.log('[DRAG_DROP] No files in drag data');
                return false;
            }
            
            const files = dataTransfer.files;
            
            // Get the InputFile element
            const inputFile = document.getElementById(inputFileId);
            if (!inputFile) {
                console.log('[DRAG_DROP] InputFile element not found:', inputFileId);
                return false;
            }
            
            // Create a new FileList and assign it to the input
            const dt = new DataTransfer();
            for (let i = 0; i < files.length; i++) {
                dt.items.add(files[i]);
            }
            
            // Set the files on the input element
            inputFile.files = dt.files;
            
            // Trigger the change event to notify Blazor
            const changeEvent = new Event('change', { bubbles: true });
            inputFile.dispatchEvent(changeEvent);
            
            console.log('[DRAG_DROP] Successfully triggered InputFile with', files.length, 'files');
            return true;
            
        } catch (error) {
            console.error('[DRAG_DROP] Error handling drop:', error);
            return false;
        }
    },
    
    cleanup: function() {
        console.log('[DRAG_DROP] Cleaning up drag drop helper');
        this.currentDragData = null;
    }
};

// Initialize on load
document.addEventListener('DOMContentLoaded', function() {
    window.dragDropHelper.init();
});
