// Generate a QR code from text and return it as a data URL (PNG base64).
// Uses the bundled QRCodeLib (qrcode-generator.js).
window.generateQRCodeDataUrl = function(text) {
    if (typeof window.QRCodeLib === 'undefined' || !window.QRCodeLib.generateCanvas) {
        console.error("[JS] QR code library not available");
        return null;
    }
    try {
        var size = 250;
        if (text.length > 400) size = 300;
        if (text.length > 600) size = 350;
        var canvas = window.QRCodeLib.generateCanvas(text, size);
        return canvas.toDataURL("image/png");
    } catch (error) {
        console.error("[JS] Error generating QR code:", error);
        return null;
    }
};
