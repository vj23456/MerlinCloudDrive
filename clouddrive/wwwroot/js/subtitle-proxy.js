/**
 * Subtitle Proxy Service for handling CORS issues
 * This service loads subtitle files and converts SRT to WebVTT format
 * Only supports SRT and VTT formats
 */

window.subtitleProxy = {
    cache: new Map(),
    defaultEncoding: 'gb2312', // Default encoding for non-UTF-8 files
    
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
                // Get the response as ArrayBuffer first to handle encoding detection
                const arrayBuffer = await response.arrayBuffer();
                const content = await this.decodeSubtitleContent(arrayBuffer);
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
     * Decode subtitle content from ArrayBuffer, handling character encoding
     * @param {ArrayBuffer} arrayBuffer - The raw subtitle data
     * @returns {Promise<string>} - The decoded UTF-8 string
     */
    async decodeSubtitleContent(arrayBuffer) {
        console.log('[SubtitleProxy] Decoding subtitle content, size:', arrayBuffer.byteLength);
        
        // Get encoding suggestions based on content analysis
        const suggestions = this.getEncodingSuggestions(arrayBuffer);
        
        // Try each suggested encoding
        for (const encoding of suggestions) {
            try {
                console.log('[SubtitleProxy] Attempting', encoding, 'decoding');
                const decoder = new TextDecoder(encoding, { fatal: encoding === 'utf-8' });
                const content = decoder.decode(arrayBuffer);
                
                if (this.isValidSubtitleContent(content)) {
                    console.log('[SubtitleProxy] Successfully decoded as', encoding);
                    
                    // Log Chinese character detection for debugging
                    if (this.containsChinese(content)) {
                        console.log('[SubtitleProxy] Chinese characters detected in content');
                    }
                    
                    return content;
                }
            } catch (error) {
                console.log('[SubtitleProxy]', encoding, 'decoding failed:', error.message);
            }
        }
        
        // If all suggestions fail, try remaining common encodings
        const fallbackEncodings = ['iso-8859-1', 'windows-1252'];
        for (const encoding of fallbackEncodings) {
            try {
                console.log('[SubtitleProxy] Fallback attempt with', encoding);
                const decoder = new TextDecoder(encoding);
                const content = decoder.decode(arrayBuffer);
                
                if (this.isValidSubtitleContent(content)) {
                    console.log('[SubtitleProxy] Successfully decoded as', encoding);
                    return content;
                }
            } catch (error) {
                console.log('[SubtitleProxy]', encoding, 'fallback failed:', error.message);
            }
        }
        
        // Final fallback to UTF-8 with replacement characters
        console.warn('[SubtitleProxy] All encoding attempts failed, using UTF-8 with replacement characters');
        const decoder = new TextDecoder('utf-8', { fatal: false });
        return decoder.decode(arrayBuffer);
    },

    /**
     * Check if the decoded content appears to be valid subtitle content
     * @param {string} content - The decoded content
     * @returns {boolean} - True if content appears valid
     */
    isValidSubtitleContent(content) {
        if (!content || content.length < 10) {
            return false;
        }
        
        // Check for common subtitle patterns
        const srtPattern = /^\d+\s*\n\d{2}:\d{2}:\d{2}[,\.]\d{3}\s*-->\s*\d{2}:\d{2}:\d{2}[,\.]\d{3}/m;
        const vttPattern = /^WEBVTT/i;
        const timePattern = /\d{2}:\d{2}:\d{2}[,\.]\d{3}/;
        
        return vttPattern.test(content) || srtPattern.test(content) || timePattern.test(content);
    },

    /**
     * Create a blob URL from text content with UTF-8 encoding
     * @param {string} content - The text content (UTF-8)
     * @param {string} mimeType - The MIME type (e.g., 'text/vtt')
     * @returns {string} - The blob URL
     */
    createBlobUrl(content, mimeType) {
        // Ensure content is UTF-8 and create blob with explicit charset
        const utf8Content = this.ensureUtf8(content);
        const blob = new Blob([utf8Content], { 
            type: `${mimeType}; charset=utf-8` 
        });
        console.log('[SubtitleProxy] Created blob URL with UTF-8 encoding, size:', blob.size);
        return URL.createObjectURL(blob);
    },

    /**
     * Converts subtitle formats to WebVTT (only SRT and VTT supported)
     * @param {string} content - The original subtitle content (assumed to be UTF-8)
     * @param {string} format - The subtitle format (srt, vtt)
     * @returns {string} - WebVTT formatted content in UTF-8
     */
    convertToWebVTT(content, format) {
        console.log('[SubtitleProxy] Converting format:', format);
        
        // Ensure content is properly UTF-8 encoded
        const utf8Content = this.ensureUtf8(content);
        
        if (format === 'vtt' || utf8Content.trim().startsWith('WEBVTT')) {
            console.log('[SubtitleProxy] Content is already WebVTT');
            return utf8Content;
        }
        
        if (format === 'srt') {
            return this.srtToWebVTT(utf8Content);
        }
        
        // For other formats, try SRT conversion as fallback
        console.warn('[SubtitleProxy] Unsupported format:', format, 'attempting SRT conversion');
        return this.srtToWebVTT(utf8Content);
    },

    /**
     * Ensure content is properly UTF-8 encoded
     * @param {string} content - The input content
     * @returns {string} - UTF-8 encoded content
     */
    ensureUtf8(content) {
        try {
            // Convert string to UTF-8 bytes and back to ensure proper encoding
            const encoder = new TextEncoder();
            const decoder = new TextDecoder('utf-8');
            const utf8Bytes = encoder.encode(content);
            return decoder.decode(utf8Bytes);
        } catch (error) {
            console.warn('[SubtitleProxy] UTF-8 encoding normalization failed:', error.message);
            return content; // Return original if conversion fails
        }
    },
    
    /**
     * Convert SRT format to WebVTT with UTF-8 encoding
     * @param {string} srtContent - SRT subtitle content (UTF-8)
     * @returns {string} - WebVTT content (UTF-8)
     */
    srtToWebVTT(srtContent) {
        console.log('[SubtitleProxy] Converting SRT to WebVTT with UTF-8 encoding');
        
        // Start with UTF-8 BOM-free WebVTT header
        let vttContent = 'WEBVTT\n\n';
        
        // Split by double newlines to get subtitle blocks
        const blocks = srtContent.split(/\n\s*\n/);
        
        blocks.forEach((block, index) => {
            const lines = block.trim().split('\n');
            if (lines.length >= 3) {
                // Skip the sequence number (first line)
                const timeLine = lines[1];
                const textLines = lines.slice(2);
                
                // Convert SRT time format to WebVTT format (comma to dot)
                const vttTimeLine = timeLine.replace(/,/g, '.');
                
                // Ensure text content is properly UTF-8 encoded
                const vttTextLines = textLines.map(line => this.ensureUtf8(line.trim()));
                
                vttContent += `${vttTimeLine}\n`;
                vttContent += `${vttTextLines.join('\n')}\n\n`;
            }
        });
        
        console.log('[SubtitleProxy] SRT to WebVTT conversion completed, UTF-8 encoded');
        return vttContent;
    },
    
    /**
     * Clear the cache
     */
    clearCache() {
        this.cache.clear();
        console.log('[SubtitleProxy] Cache cleared');
    },

    /**
     * Detect if content contains Chinese characters
     * @param {string} content - The content to check
     * @returns {boolean} - True if Chinese characters are detected
     */
    containsChinese(content) {
        // Unicode ranges for Chinese characters
        const chineseRegex = /[\u4e00-\u9fff\u3400-\u4dbf\uf900-\ufaff]/;
        return chineseRegex.test(content);
    },

    /**
     * Get encoding suggestions based on content analysis
     * @param {ArrayBuffer} arrayBuffer - The raw data
     * @returns {string[]} - Array of encoding names to try
     */
    getEncodingSuggestions(arrayBuffer) {
        const uint8Array = new Uint8Array(arrayBuffer);
        const suggestions = ['utf-8'];
        
        // Check for BOM (Byte Order Mark)
        if (uint8Array.length >= 3) {
            // UTF-8 BOM: EF BB BF
            if (uint8Array[0] === 0xEF && uint8Array[1] === 0xBB && uint8Array[2] === 0xBF) {
                console.log('[SubtitleProxy] UTF-8 BOM detected');
                return ['utf-8'];
            }
        }
        
        // Look for high-byte characters that suggest non-UTF8 encoding
        let hasHighBytes = false;
        for (let i = 0; i < Math.min(1000, uint8Array.length); i++) {
            if (uint8Array[i] > 127) {
                hasHighBytes = true;
                break;
            }
        }
        
        if (hasHighBytes) {
            // Add default encoding first if it's not UTF-8, then other Chinese encodings
            if (this.defaultEncoding && this.defaultEncoding !== 'utf-8') {
                suggestions.push(this.defaultEncoding);
                console.log('[SubtitleProxy] Adding user default encoding:', this.defaultEncoding);
            }
            
            // Add other Chinese encodings (avoid duplicates)
            const otherEncodings = ['gb2312', 'gbk', 'gb18030', 'big5'];
            for (const encoding of otherEncodings) {
                if (!suggestions.includes(encoding)) {
                    suggestions.push(encoding);
                }
            }
            
            console.log('[SubtitleProxy] High bytes detected, encoding suggestions:', suggestions);
        }
        
        return suggestions;
    },

    /**
     * Set the default encoding for non-UTF-8 subtitle files
     * Called from Blazor Settings component
     * @param {string} encoding - The default encoding to use (e.g., 'gb2312', 'gbk', etc.)
     */
    setDefaultEncoding(encoding) {
        this.defaultEncoding = encoding;
        console.log('[SubtitleProxy] Default encoding set to:', encoding);
    }
};
