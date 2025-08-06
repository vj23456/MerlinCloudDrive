// Clipboard helper functions for CloudDrive2
// Provides fallback for non-secure contexts where navigator.clipboard is not available

window.clipboardHelpers = {
    // Copy text to clipboard with fallback for non-secure contexts
    copyToClipboard: async function(text) {
        try {
            // Try modern clipboard API first (works in secure contexts)
            if (navigator.clipboard && navigator.clipboard.writeText) {
                await navigator.clipboard.writeText(text);
                return true;
            }
        } catch (err) {
            console.warn('Clipboard API failed, using fallback:', err);
        }
        
        // Fallback method for non-secure contexts
        return this.fallbackCopyToClipboard(text);
    },
    
    // Fallback method using temporary textarea
    fallbackCopyToClipboard: function(text) {
        try {
            // Create a temporary textarea element
            const textarea = document.createElement('textarea');
            textarea.value = text;
            textarea.style.position = 'fixed';
            textarea.style.left = '-9999px';
            textarea.style.top = '-9999px';
            textarea.style.opacity = '0';
            textarea.setAttribute('readonly', '');
            
            // Add to DOM, select, copy, and remove
            document.body.appendChild(textarea);
            textarea.select();
            textarea.setSelectionRange(0, 99999); // For mobile devices
            
            const successful = document.execCommand('copy');
            document.body.removeChild(textarea);
            
            if (!successful) {
                throw new Error('document.execCommand("copy") failed');
            }
            
            return true;
        } catch (err) {
            console.error('Fallback clipboard copy failed:', err);
            return false;
        }
    },
    
    // Check if clipboard API is available
    isClipboardAvailable: function() {
        return !!(navigator.clipboard && navigator.clipboard.writeText);
    }
};
