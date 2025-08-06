// File drag and drop functionality for CloudDrive
window.fileDragDrop = {
    dotNetRef: null,
    dragCounter: 0,
    
    initialize: function(dotNetRef) {
        this.dotNetRef = dotNetRef;
        this.setupDragAndDrop();
    },
    
    dispose: function() {
        this.removeDragAndDrop();
        this.dotNetRef = null;
    },
    
    setupDragAndDrop: function() {
        const filesContent = document.querySelector('.files-content');
        if (!filesContent) return;
        
        // Prevent default drag behaviors
        ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
            filesContent.addEventListener(eventName, this.preventDefaults, false);
            document.body.addEventListener(eventName, this.preventDefaults, false);
        });
        
        // Highlight drop area when item is dragged over it
        ['dragenter', 'dragover'].forEach(eventName => {
            filesContent.addEventListener(eventName, this.handleDragEnter.bind(this), false);
        });
        
        ['dragleave', 'drop'].forEach(eventName => {
            filesContent.addEventListener(eventName, this.handleDragLeave.bind(this), false);
        });
        
        // Handle dropped files
        filesContent.addEventListener('drop', this.handleDrop.bind(this), false);
    },
    
    removeDragAndDrop: function() {
        const filesContent = document.querySelector('.files-content');
        if (!filesContent) return;
        
        ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
            filesContent.removeEventListener(eventName, this.preventDefaults, false);
            document.body.removeEventListener(eventName, this.preventDefaults, false);
        });
        
        ['dragenter', 'dragover'].forEach(eventName => {
            filesContent.removeEventListener(eventName, this.handleDragEnter.bind(this), false);
        });
        
        ['dragleave', 'drop'].forEach(eventName => {
            filesContent.removeEventListener(eventName, this.handleDragLeave.bind(this), false);
        });
        
        filesContent.removeEventListener('drop', this.handleDrop.bind(this), false);
    },
    
    preventDefaults: function(e) {
        e.preventDefault();
        e.stopPropagation();
    },
    
    handleDragEnter: function(e) {
        this.dragCounter++;
        if (this.dotNetRef) {
            this.dotNetRef.invokeMethodAsync('OnDragEnter');
        }
    },
    
    handleDragLeave: function(e) {
        this.dragCounter--;
        if (this.dragCounter === 0) {
            if (this.dotNetRef) {
                this.dotNetRef.invokeMethodAsync('OnDragLeave');
            }
        }
    },
    
    handleDrop: function(e) {
        this.dragCounter = 0;
        if (this.dotNetRef) {
            this.dotNetRef.invokeMethodAsync('OnDragLeave');
        }
        
        // Don't handle file upload here - let InputFile handle it
        // Just reset the visual state
        console.log('[DRAG-DROP] Drop event handled, letting InputFile process files');
    }
};
