/**
 * Client-side metadata extraction for various file types
 * Supports: Images (EXIF, resolution), Videos (resolution, duration, codec), Audio (duration, bitrate), PDFs
 */

window.MetadataExtractor = {
    /**
     * Extract metadata from a file by downloading from URL
     * @param {string} downloadUrl - The URL to download the file from
     * @param {string} fileName - The name of the file
     * @param {Function} progressCallback - Optional callback for progress updates (percentage)
     * @returns {Promise<object>} Metadata object with various properties
     */
    async extractMetadata(downloadUrl, fileName, progressCallback = null) {
        try {
            console.log(`[MetadataExtractor] Extracting metadata for: ${fileName}`);
            
            const fileExtension = this.getFileExtension(fileName).toLowerCase();
            const fileType = this.getFileType(fileExtension);
            
            if (progressCallback) progressCallback(10);
            
            switch (fileType) {
                case 'image':
                    return await this.extractImageMetadata(downloadUrl, fileName, progressCallback);
                case 'video':
                    return await this.extractVideoMetadata(downloadUrl, fileName, progressCallback);
                case 'audio':
                    return await this.extractAudioMetadata(downloadUrl, fileName, progressCallback);
                case 'pdf':
                    return await this.extractPdfMetadata(downloadUrl, fileName, progressCallback);
                default:
                    return await this.extractBasicMetadata(downloadUrl, fileName, progressCallback);
            }
        } catch (error) {
            console.error(`[MetadataExtractor] Error extracting metadata:`, error);
            return {
                error: error.message,
                fileName: fileName
            };
        }
    },

    /**
     * Extract metadata from an image file (EXIF, dimensions, etc.)
     */
    async extractImageMetadata(downloadUrl, fileName, progressCallback = null) {
        const metadata = {
            type: 'image',
            fileName: fileName
        };

        try {
            if (progressCallback) progressCallback(20);

            // Create an image element to load the file
            const img = new Image();
            img.crossOrigin = 'anonymous';

            const imageLoadPromise = new Promise((resolve, reject) => {
                img.onload = () => resolve(img);
                img.onerror = () => reject(new Error('Failed to load image'));
                img.src = downloadUrl;
            });

            const loadedImg = await imageLoadPromise;
            
            if (progressCallback) progressCallback(50);

            // Basic image properties
            metadata.width = loadedImg.naturalWidth;
            metadata.height = loadedImg.naturalHeight;
            metadata.resolution = `${metadata.width} × ${metadata.height}`;
            metadata.aspectRatio = this.calculateAspectRatio(metadata.width, metadata.height);

            if (progressCallback) progressCallback(70);

            // Try to extract EXIF data
            try {
                const exifData = await this.extractExifData(downloadUrl);
                if (exifData && Object.keys(exifData).length > 0) {
                    metadata.exif = exifData;
                    
                    // Extract common EXIF fields
                    if (exifData.Make) metadata.cameraMake = exifData.Make;
                    if (exifData.Model) metadata.cameraModel = exifData.Model;
                    if (exifData.DateTime) metadata.dateTaken = exifData.DateTime;
                    if (exifData.DateTimeOriginal) metadata.dateOriginal = exifData.DateTimeOriginal;
                    if (exifData.ExposureTime) metadata.exposureTime = exifData.ExposureTime;
                    if (exifData.FNumber) metadata.fNumber = `f/${exifData.FNumber}`;
                    if (exifData.ISO || exifData.ISOSpeedRatings) {
                        metadata.iso = exifData.ISO || exifData.ISOSpeedRatings;
                    }
                    if (exifData.FocalLength) metadata.focalLength = `${exifData.FocalLength}mm`;
                    if (exifData.LensModel) metadata.lensModel = exifData.LensModel;
                    if (exifData.GPSLatitude && exifData.GPSLongitude) {
                        metadata.gps = {
                            latitude: exifData.GPSLatitude,
                            longitude: exifData.GPSLongitude
                        };
                    }
                    if (exifData.Orientation) metadata.orientation = exifData.Orientation;
                }
            } catch (exifError) {
                console.warn('[MetadataExtractor] EXIF extraction failed:', exifError);
            }

            if (progressCallback) progressCallback(100);

            return metadata;
        } catch (error) {
            console.error('[MetadataExtractor] Image metadata extraction failed:', error);
            return { ...metadata, error: error.message };
        }
    },

    /**
     * Extract EXIF data from image using EXIF.js library or native browser APIs
     */
    async extractExifData(imageUrl) {
        try {
            // Check if EXIF.js library is available
            if (typeof EXIF !== 'undefined' && EXIF.getData) {
                return new Promise((resolve, reject) => {
                    const img = new Image();
                    img.crossOrigin = 'anonymous';
                    img.onload = function() {
                        EXIF.getData(img, function() {
                            const allTags = EXIF.getAllTags(this);
                            resolve(allTags);
                        });
                    };
                    img.onerror = () => reject(new Error('Failed to load image for EXIF'));
                    img.src = imageUrl;
                });
            } else {
                // Fallback: try to read EXIF using manual parsing
                return await this.extractExifManually(imageUrl);
            }
        } catch (error) {
            console.warn('[MetadataExtractor] EXIF extraction failed:', error);
            return {};
        }
    },

    /**
     * Manual EXIF extraction (basic implementation)
     */
    async extractExifManually(imageUrl) {
        try {
            const response = await fetch(imageUrl);
            const arrayBuffer = await response.arrayBuffer();
            const view = new DataView(arrayBuffer);

            // Check for JPEG signature
            if (view.getUint16(0, false) !== 0xFFD8) {
                return {}; // Not a JPEG
            }

            // This is a simplified EXIF parser - for production, use a library
            // Just return empty for now as full implementation is complex
            return {};
        } catch (error) {
            return {};
        }
    },

    /**
     * Extract metadata from a video file
     */
    async extractVideoMetadata(downloadUrl, fileName, progressCallback = null) {
        const metadata = {
            type: 'video',
            fileName: fileName
        };

        try {
            if (progressCallback) progressCallback(20);

            const video = document.createElement('video');
            video.crossOrigin = 'anonymous';
            video.preload = 'metadata';

            const videoLoadPromise = new Promise((resolve, reject) => {
                video.onloadedmetadata = () => resolve(video);
                video.onerror = () => reject(new Error('Failed to load video'));
                video.src = downloadUrl;
            });

            const loadedVideo = await videoLoadPromise;
            
            if (progressCallback) progressCallback(70);

            // Video properties
            metadata.width = loadedVideo.videoWidth;
            metadata.height = loadedVideo.videoHeight;
            metadata.resolution = `${metadata.width} × ${metadata.height}`;
            metadata.duration = loadedVideo.duration;
            metadata.durationFormatted = this.formatDuration(metadata.duration);
            metadata.aspectRatio = this.calculateAspectRatio(metadata.width, metadata.height);

            // Get video tracks info if available
            if (loadedVideo.videoTracks && loadedVideo.videoTracks.length > 0) {
                const track = loadedVideo.videoTracks[0];
                metadata.videoTrack = {
                    label: track.label,
                    language: track.language,
                    enabled: track.enabled
                };
            }

            // Get audio tracks info if available
            if (loadedVideo.audioTracks && loadedVideo.audioTracks.length > 0) {
                const track = loadedVideo.audioTracks[0];
                metadata.audioTrack = {
                    label: track.label,
                    language: track.language,
                    enabled: track.enabled
                };
            }

            // Clean up
            video.src = '';
            video.load();

            if (progressCallback) progressCallback(100);

            return metadata;
        } catch (error) {
            console.error('[MetadataExtractor] Video metadata extraction failed:', error);
            return { ...metadata, error: error.message };
        }
    },

    /**
     * Extract metadata from an audio file
     */
    async extractAudioMetadata(downloadUrl, fileName, progressCallback = null) {
        const metadata = {
            type: 'audio',
            fileName: fileName
        };

        try {
            if (progressCallback) progressCallback(20);

            const audio = new Audio();
            audio.crossOrigin = 'anonymous';
            audio.preload = 'metadata';

            const audioLoadPromise = new Promise((resolve, reject) => {
                audio.onloadedmetadata = () => resolve(audio);
                audio.onerror = () => reject(new Error('Failed to load audio'));
                audio.src = downloadUrl;
            });

            const loadedAudio = await audioLoadPromise;
            
            if (progressCallback) progressCallback(70);

            // Audio properties
            metadata.duration = loadedAudio.duration;
            metadata.durationFormatted = this.formatDuration(metadata.duration);

            // Get audio tracks info if available
            if (loadedAudio.audioTracks && loadedAudio.audioTracks.length > 0) {
                const track = loadedAudio.audioTracks[0];
                metadata.audioTrack = {
                    label: track.label,
                    language: track.language,
                    enabled: track.enabled
                };
            }

            // Clean up
            audio.src = '';
            audio.load();

            if (progressCallback) progressCallback(100);

            return metadata;
        } catch (error) {
            console.error('[MetadataExtractor] Audio metadata extraction failed:', error);
            return { ...metadata, error: error.message };
        }
    },

    /**
     * Extract metadata from a PDF file
     */
    async extractPdfMetadata(downloadUrl, fileName, progressCallback = null) {
        const metadata = {
            type: 'pdf',
            fileName: fileName
        };

        try {
            if (progressCallback) progressCallback(20);

            // For PDF metadata, we'd need PDF.js library
            // This is a placeholder for basic PDF info
            const response = await fetch(downloadUrl);
            const arrayBuffer = await response.arrayBuffer();
            
            if (progressCallback) progressCallback(50);

            metadata.size = arrayBuffer.byteLength;
            metadata.sizeFormatted = this.formatBytes(metadata.size);

            // Check if it's a valid PDF
            const view = new DataView(arrayBuffer);
            const header = new Uint8Array(arrayBuffer.slice(0, 5));
            const headerString = String.fromCharCode(...header);
            
            if (headerString === '%PDF-') {
                metadata.isValidPdf = true;
                
                // Try to read version
                const versionByte = new Uint8Array(arrayBuffer.slice(5, 8));
                metadata.pdfVersion = String.fromCharCode(...versionByte);
            } else {
                metadata.isValidPdf = false;
            }

            if (progressCallback) progressCallback(100);

            return metadata;
        } catch (error) {
            console.error('[MetadataExtractor] PDF metadata extraction failed:', error);
            return { ...metadata, error: error.message };
        }
    },

    /**
     * Extract basic metadata (file size, type, etc.)
     */
    async extractBasicMetadata(downloadUrl, fileName, progressCallback = null) {
        const metadata = {
            type: 'unknown',
            fileName: fileName
        };

        try {
            if (progressCallback) progressCallback(50);

            // Use HEAD request to get file size without downloading
            const response = await fetch(downloadUrl, { method: 'HEAD' });
            const contentLength = response.headers.get('content-length');
            const contentType = response.headers.get('content-type');
            
            if (contentLength) {
                metadata.size = parseInt(contentLength, 10);
                metadata.sizeFormatted = this.formatBytes(metadata.size);
            }
            
            if (contentType) {
                metadata.mimeType = contentType;
            }

            if (progressCallback) progressCallback(100);

            return metadata;
        } catch (error) {
            console.error('[MetadataExtractor] Basic metadata extraction failed:', error);
            return { ...metadata, error: error.message };
        }
    },

    /**
     * Helper: Get file extension
     */
    getFileExtension(fileName) {
        const lastDot = fileName.lastIndexOf('.');
        return lastDot !== -1 ? fileName.substring(lastDot + 1) : '';
    },

    /**
     * Helper: Determine file type from extension
     */
    getFileType(extension) {
        const ext = extension.toLowerCase();
        
        const imageExtensions = ['jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp', 'tiff', 'tif', 'raw', 'cr2', 'nef', 'arw', 'orf', 'rw2', 'heic', 'heif'];
        const videoExtensions = ['mp4', 'mkv', 'avi', 'mov', 'webm', 'flv', 'wmv', 'm4v', 'mpg', 'mpeg', '3gp'];
        const audioExtensions = ['mp3', 'wav', 'ogg', 'flac', 'm4a', 'aac', 'wma', 'opus'];
        const pdfExtensions = ['pdf'];
        
        if (imageExtensions.includes(ext)) return 'image';
        if (videoExtensions.includes(ext)) return 'video';
        if (audioExtensions.includes(ext)) return 'audio';
        if (pdfExtensions.includes(ext)) return 'pdf';
        
        return 'unknown';
    },

    /**
     * Helper: Calculate aspect ratio
     */
    calculateAspectRatio(width, height) {
        if (!width || !height) return '';
        
        const gcd = this.gcd(width, height);
        const ratioW = width / gcd;
        const ratioH = height / gcd;
        
        // Check for common aspect ratios
        if (ratioW === 16 && ratioH === 9) return '16:9';
        if (ratioW === 4 && ratioH === 3) return '4:3';
        if (ratioW === 1 && ratioH === 1) return '1:1';
        if (ratioW === 21 && ratioH === 9) return '21:9';
        if (ratioW === 3 && ratioH === 2) return '3:2';
        
        return `${ratioW}:${ratioH}`;
    },

    /**
     * Helper: Greatest common divisor
     */
    gcd(a, b) {
        return b === 0 ? a : this.gcd(b, a % b);
    },

    /**
     * Helper: Format duration in seconds to HH:MM:SS
     */
    formatDuration(seconds) {
        if (!seconds || isNaN(seconds)) return '00:00';
        
        const hours = Math.floor(seconds / 3600);
        const minutes = Math.floor((seconds % 3600) / 60);
        const secs = Math.floor(seconds % 60);
        
        if (hours > 0) {
            return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
        }
        return `${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    },

    /**
     * Helper: Format bytes to human-readable format
     */
    formatBytes(bytes) {
        if (bytes === 0) return '0 B';
        
        const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
        const i = Math.floor(Math.log(bytes) / Math.log(1024));
        
        return `${(bytes / Math.pow(1024, i)).toFixed(2)} ${sizes[i]}`;
    }
};
