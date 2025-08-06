// Splitter functionality for NavMenu
let dotNetReference = null;
let isResizing = false;

// Add global mouse events
window.addGlobalMouseEvents = (dotNetRef) => {
    dotNetReference = dotNetRef;
    
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    document.addEventListener('selectstart', preventSelectStart);
};

// Handle mouse move during resize
function handleMouseMove(e) {
    if (isResizing && dotNetReference) {
        e.preventDefault();
        dotNetReference.invokeMethodAsync('OnMouseMove', e.clientY);
    }
}

// Handle mouse up to stop resize
function handleMouseUp(e) {
    if (isResizing && dotNetReference) {
        e.preventDefault();
        dotNetReference.invokeMethodAsync('StopResize');
    }
}

// Prevent text selection during resize
function preventSelectStart(e) {
    if (isResizing) {
        e.preventDefault();
        return false;
    }
}

// Start splitter resize
window.startSplitterResize = () => {
    isResizing = true;
    document.body.style.cursor = 'row-resize';
    document.body.style.userSelect = 'none';
};

// Stop splitter resize
window.stopSplitterResize = () => {
    isResizing = false;
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
};

// Cleanup function
window.cleanupSplitterEvents = () => {
    document.removeEventListener('mousemove', handleMouseMove);
    document.removeEventListener('mouseup', handleMouseUp);
    document.removeEventListener('selectstart', preventSelectStart);
    dotNetReference = null;
    isResizing = false;
};

// File panel splitter functionality
let filesSplitterDotNetRef = null;
let isResizingFiles = false;

// Add splitter event listeners for files panel
window.addSplitterEventListeners = (dotNetRef) => {
    filesSplitterDotNetRef = dotNetRef;
    
    document.addEventListener('mousemove', handleFilesSplitterMove);
    document.addEventListener('mouseup', handleFilesSplitterUp);
    document.addEventListener('selectstart', preventFilesSelectStart);
    
    // Set cursor and prevent selection
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    isResizingFiles = true;
};

// Remove splitter event listeners
window.removeSplitterEventListeners = () => {
    document.removeEventListener('mousemove', handleFilesSplitterMove);
    document.removeEventListener('mouseup', handleFilesSplitterUp);
    document.removeEventListener('selectstart', preventFilesSelectStart);
    
    // Reset cursor and selection
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
    isResizingFiles = false;
    filesSplitterDotNetRef = null;
};

// Handle mouse move for files splitter
function handleFilesSplitterMove(e) {
    if (isResizingFiles && filesSplitterDotNetRef) {
        e.preventDefault();
        filesSplitterDotNetRef.invokeMethodAsync('OnSplitterMouseMove', e.clientX);
    }
}

// Handle mouse up for files splitter
function handleFilesSplitterUp(e) {
    if (isResizingFiles && filesSplitterDotNetRef) {
        e.preventDefault();
        filesSplitterDotNetRef.invokeMethodAsync('OnSplitterMouseUp');
    }
}

// Prevent text selection during files splitter resize
function preventFilesSelectStart(e) {
    if (isResizingFiles) {
        e.preventDefault();
        return false;
    }
}

// Get window width
window.getWindowWidth = () => {
    return window.innerWidth;
};

// Update files panel width dynamically
window.updateFilesPanelWidth = (width) => {
    const propertiesPanel = document.querySelector('.file-properties-panel.desktop');
    if (propertiesPanel) {
        propertiesPanel.style.width = width + 'px';
    }
};
