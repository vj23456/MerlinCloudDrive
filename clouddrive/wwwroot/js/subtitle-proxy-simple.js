/**
 * Subtitle Proxy Service for handling CORS issues
 * This service loads subtitle files and converts SRT to WebVTT format
 * Only supports SRT and VTT formats
 */

window.subtitleProxy = {
    cache: new Map(),
    
    /**
     * Attempts to load subtitle content using multiple fallback strategies
     * @param {string} subtitleUrl - The original subtitle URL
     * @returns {Promise<string>} - The subtitle content as text
     */
    async loadSubtitleContent(subtitleUrl) {
        // Check cache first
        if (this.cache.has(subtitleUrl)) {
            console.log('[SubtitleProxy] Loading from cache:', subtitleUrl);
            return this.cache.get(subtitleUrl);
        }
        
        console.log('[SubtitleProxy] Attempting to load subtitle:', subtitleUrl);
        
        // Strategy 1: Try direct fetch without credentials (most permissive)
        try {
            const response = await fetch(subtitleUrl, {
                method: 'GET',
                mode: 'cors',
                credentials: 'omit', // Don't send credentials to avoid preflight
                headers: {
                    'Accept': 'text/plain, text/vtt, application/x-subrip, */*'
                }
            });
            
            if (response.ok) {
                const content = await response.text();
                this.cache.set(subtitleUrl, content);
                console.log('[SubtitleProxy] Strategy 1 success - Direct CORS fetch');
                return content;
            }
        } catch (error) {
            console.log('[SubtitleProxy] Strategy 1 failed:', error.message);
        }
        
        // Strategy 2: Try with no-cors mode (will get opaque response, but might work for some cases)
        try {
            const response = await fetch(subtitleUrl, {
                method: 'GET',
                mode: 'no-cors'
            });
            
            // Note: With no-cors, we can't read the response body
            // This is mainly to check if the resource is accessible
            console.log('[SubtitleProxy] Strategy 2 - no-cors mode response:', response.type);
        } catch (error) {
            console.log('[SubtitleProxy] Strategy 2 failed:', error.message);
        }
        
        // If all strategies fail, throw an error
        throw new Error('Unable to load subtitle content from: ' + subtitleUrl);
    },

    /**
     * Create a blob URL from text content
     * @param {string} content - The text content
     * @param {string} mimeType - The MIME type (e.g., 'text/vtt')
     * @returns {string} - The blob URL
     */
    createBlobUrl(content, mimeType) {
        const blob = new Blob([content], { type: mimeType });
        return URL.createObjectURL(blob);
    },

    /**
     * Converts subtitle formats to WebVTT (only SRT and VTT supported)
     * @param {string} content - The original subtitle content
     * @param {string} format - The subtitle format (srt, vtt)
     * @returns {string} - WebVTT formatted content
     */
    convertToWebVTT(content, format) {
        console.log('[SubtitleProxy] Converting format:', format);
        
        if (format === 'vtt' || content.trim().startsWith('WEBVTT')) {
            console.log('[SubtitleProxy] Content is already WebVTT');
            return content;
        }
        
        if (format === 'srt') {
            return this.srtToWebVTT(content);
        }
        
        // For other formats, try SRT conversion as fallback
        console.warn('[SubtitleProxy] Unsupported format:', format, 'attempting SRT conversion');
        return this.srtToWebVTT(content);
    },
    
    /**
     * Convert SRT format to WebVTT
     * @param {string} srtContent - SRT subtitle content
     * @returns {string} - WebVTT content
     */
    srtToWebVTT(srtContent) {
        let vttContent = 'WEBVTT\n\n';
        
        // Split by double newlines to get subtitle blocks
        const blocks = srtContent.split(/\n\s*\n/);
        
        blocks.forEach(block => {
            const lines = block.trim().split('\n');
            if (lines.length >= 3) {
                // Skip the sequence number (first line)
                const timeLine = lines[1];
                const textLines = lines.slice(2);
                
                // Convert SRT time format to WebVTT format
                const vttTimeLine = timeLine.replace(/,/g, '.');
                
                vttContent += `${vttTimeLine}\n`;
                vttContent += `${textLines.join('\n')}\n\n`;
            }
        });
        
        return vttContent;
    },
    
    /**
     * Clear the cache
     */
    clearCache() {
        this.cache.clear();
        console.log('[SubtitleProxy] Cache cleared');
    }
};
