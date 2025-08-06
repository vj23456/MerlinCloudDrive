// QR Code generation and utility functions

// QR Code generation function
window.generateQRCode = function(elementId, text) {
    
    const element = document.getElementById(elementId);
    if (!element) {
        const error = `QR code element not found: ${elementId}`;
        console.error("[JS]", error);
        throw new Error(error);
    }
    
    // Clear existing content
    element.innerHTML = '';
    
    try {
        // Always use the local QR code generator
        if (typeof window.QRCodeLib !== 'undefined' && window.QRCodeLib.generateCanvas) {
            
            // Try with different sizes based on text length for better readability
            let qrSize = 250;
            if (text.length > 400) qrSize = 300;
            if (text.length > 600) qrSize = 350;
            
            const canvas = window.QRCodeLib.generateCanvas(text, qrSize);
            canvas.className = 'qrcode-canvas';
            canvas.style.maxWidth = '250px';
            canvas.style.maxHeight = '250px';
            canvas.style.border = '1px solid #ddd';
            canvas.style.borderRadius = '8px';
            
            element.appendChild(canvas);
        } else {
            throw new Error('Local QR code generator not available');
        }
    } catch (error) {
        console.error("[JS] Error generating QR code:", error);
        // Enhanced fallback with the actual text and length info
        element.innerHTML = `<div style="padding: 2rem; border: 2px dashed #ccc; border-radius: 8px; background: #f8f9fa; text-align: center; font-family: monospace; word-break: break-all; font-size: 0.8rem; color: #666;">
            <strong>QR Code Generation Failed</strong><br>
            <small>Text too long (${text.length} chars) or unsupported format</small><br><br>
            <div style="max-height: 100px; overflow-y: auto; text-align: left; background: white; padding: 0.5rem; border-radius: 4px;">
                ${text}
            </div>
        </div>`;
        throw error;
    }
};

// QR Code library availability check
window.checkQRCodeLibrary = function() {
    
    if (typeof window.QRCodeLib !== 'undefined' && window.QRCodeLib.generateCanvas) {
        return true;
    } else {
        console.error("[JS] Local QR code generator is NOT available");
        return false;
    }
};

// Test QR code generation (for debugging)
window.testQRCodeGeneration = function() {
    
    // Create a test element
    const testDiv = document.createElement('div');
    testDiv.id = 'qr-test-element';
    testDiv.style.display = 'none';
    document.body.appendChild(testDiv);
    
    try {
        window.generateQRCode('qr-test-element', 'Test QR Code');
        return true;
    } catch (error) {
        console.error("[JS] QR code test failed:", error);
        return false;
    } finally {
        // Clean up
        document.body.removeChild(testDiv);
    }
};

// Test QR code generation with the specific URL that was failing
window.testQRCodeWithLongURL = function() {
    
    // The URL that was causing issues
    const testURL = "http://115.com/scan/dg-15c8af7a6277c8964366fd637149d1dfb6ec0f44";
    
    // Create a test element
    const testDiv = document.createElement('div');
    testDiv.id = 'qr-long-url-test';
    testDiv.style.display = 'none';
    document.body.appendChild(testDiv);
    
    try {
        if (typeof window.QRCodeLib !== 'undefined' && window.QRCodeLib.generateCanvas) {
            const canvas = window.QRCodeLib.generateCanvas(testURL, 250);
            testDiv.appendChild(canvas);
            return true;
        } else {
            console.error("[JS] QR code library not available");
            return false;
        }
    } catch (error) {
        console.error("[JS] Long URL QR code test FAILED:", error);
        return false;
    } finally {
        // Clean up
        document.body.removeChild(testDiv);
    }
};
