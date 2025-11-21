// Video Thumbnail Generation Helper
// This module provides client-side video thumbnail generation functionality

window.videoThumbnailHelper = {
    // Cache for generated thumbnails to avoid re-processing
    thumbnailCache: new Map(),
    
    // Currently loading videos to avoid duplicate requests
    loadingPromises: new Map(),
    
    // Configurable concurrent processing queue
    processingQueue: [],
    activeProcesses: 0,
    maxConcurrency: 2, // Default concurrency, can be updated via updateConcurrency()
    enabled: true, // Default enabled, can be updated via updateEnabled()
    
    // Sequential queue specifically for waterfall view to maintain order
    waterfallQueue: [],
    waterfallPriorityQueue: [], // Priority queue for visible items
    activeWaterfallProcesses: 0,

    /**
     * Generate a thumbnail from a video URL
     * @param {string} videoUrl - The URL of the video file
     * @param {number} timeInSeconds - Time position to capture (default: 1 second)
     * @param {number} maxWidth - Maximum width for the thumbnail (default: no limit)
     * @param {number} maxHeight - Maximum height for the thumbnail (default: no limit)
     * @returns {Promise<string>} - Promise that resolves to a blob URL of the thumbnail
     */
    async generateThumbnail(videoUrl, timeInSeconds = 1, maxWidth = null, maxHeight = null) {
        // Create cache key
        const cacheKey = `${videoUrl}_${timeInSeconds}_${maxWidth}_${maxHeight}`;
        
        // Return cached thumbnail if available
        if (this.thumbnailCache.has(cacheKey)) {
            return this.thumbnailCache.get(cacheKey);
        }

        // Return existing promise if already loading
        if (this.loadingPromises.has(cacheKey)) {
            return this.loadingPromises.get(cacheKey);
        }

        // Create new loading promise
        const loadingPromise = this._createThumbnail(videoUrl, timeInSeconds, maxWidth, maxHeight);
        this.loadingPromises.set(cacheKey, loadingPromise);

        try {
            const result = await loadingPromise;
            this.thumbnailCache.set(cacheKey, result);
            return result;
        } catch (error) {
            console.error('Video thumbnail generation failed:', error);
            throw error;
        } finally {
            this.loadingPromises.delete(cacheKey);
        }
    },

    /**
     * Internal method to create thumbnail from video
     * @private
     */
    async _createThumbnail(videoUrl, timeInSeconds, maxWidth, maxHeight) {
        return new Promise((resolve, reject) => {
            const video = document.createElement('video');
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');
            
            // Set up video element
            video.crossOrigin = 'anonymous';
            video.currentTime = timeInSeconds;
            video.muted = true; // Ensure muted to avoid autoplay issues
            video.preload = 'metadata';

            let timeoutId;
            let hasLoaded = false;

            // Clean up function
            const cleanup = () => {
                if (timeoutId) clearTimeout(timeoutId);
                video.removeEventListener('loadeddata', onLoadedData);
                video.removeEventListener('error', onError);
                video.removeEventListener('canplay', onCanPlay);
                video.src = '';
                video.load();
            };

            // Success handler
            const onLoadedData = () => {
                if (hasLoaded) return;
                hasLoaded = true;
                
                try {
                    // Get original video dimensions
                    const videoWidth = video.videoWidth;
                    const videoHeight = video.videoHeight;
                    
                    if (videoWidth === 0 || videoHeight === 0) {
                        cleanup();
                        reject(new Error('Invalid video dimensions'));
                        return;
                    }

                    let thumbnailWidth, thumbnailHeight;

                    // Use original video dimensions or apply max constraints if specified
                    if (maxWidth && maxHeight) {
                        const aspectRatio = videoWidth / videoHeight;
                        const maxAspectRatio = maxWidth / maxHeight;

                        if (aspectRatio > maxAspectRatio) {
                            // Video is wider than max ratio, limit by width
                            thumbnailWidth = Math.min(maxWidth, videoWidth);
                            thumbnailHeight = thumbnailWidth / aspectRatio;
                        } else {
                            // Video is taller than max ratio, limit by height
                            thumbnailHeight = Math.min(maxHeight, videoHeight);
                            thumbnailWidth = thumbnailHeight * aspectRatio;
                        }
                    } else if (maxWidth && !maxHeight) {
                        // Only width constraint
                        thumbnailWidth = Math.min(maxWidth, videoWidth);
                        thumbnailHeight = thumbnailWidth * (videoHeight / videoWidth);
                    } else if (maxHeight && !maxWidth) {
                        // Only height constraint
                        thumbnailHeight = Math.min(maxHeight, videoHeight);
                        thumbnailWidth = thumbnailHeight * (videoWidth / videoHeight);
                    } else {
                        // No constraints - use original video dimensions
                        thumbnailWidth = videoWidth;
                        thumbnailHeight = videoHeight;
                    }

                    // Set canvas to exact dimensions needed
                    canvas.width = Math.floor(thumbnailWidth);
                    canvas.height = Math.floor(thumbnailHeight);

                    // Enable high-quality rendering
                    ctx.imageSmoothingEnabled = true;
                    ctx.imageSmoothingQuality = 'high';

                    // Draw video frame to canvas with high quality
                    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

                    // Convert to high-quality JPEG
                    canvas.toBlob((blob) => {
                        if (blob) {
                            const thumbnailUrl = URL.createObjectURL(blob);
                            cleanup();
                            resolve(thumbnailUrl);
                        } else {
                            cleanup();
                            reject(new Error('Failed to create thumbnail blob'));
                        }
                    }, 'image/jpeg', 0.92); // Higher quality (0.92 instead of 0.8)
                    
                } catch (error) {
                    cleanup();
                    reject(error);
                }
            };

            // Error handler
            const onError = (error) => {
                cleanup();
                reject(new Error(`Video load error: ${error.message || 'Unknown error'}`));
            };

            // Backup handler for when loadeddata doesn't fire but canplay does
            const onCanPlay = () => {
                // Small delay to ensure video is ready
                setTimeout(() => {
                    if (!hasLoaded) {
                        onLoadedData();
                    }
                }, 100);
            };

            // Set up event listeners
            video.addEventListener('loadeddata', onLoadedData);
            video.addEventListener('error', onError);
            video.addEventListener('canplay', onCanPlay);

            // Timeout after 10 seconds
            timeoutId = setTimeout(() => {
                cleanup();
                reject(new Error('Video thumbnail generation timeout'));
            }, 10000);

            // Start loading the video
            video.src = videoUrl;
        });
    },

    /**
     * Clear thumbnail cache to free memory
     * @param {string} videoUrl - Optional specific video URL to clear, if not provided clears all
     */
    clearCache(videoUrl = null) {
        if (videoUrl) {
            // Clear specific video from cache
            for (const [key, url] of this.thumbnailCache.entries()) {
                if (key.startsWith(videoUrl + '_')) {
                    URL.revokeObjectURL(url);
                    this.thumbnailCache.delete(key);
                }
            }
        } else {
            // Clear all cache
            for (const url of this.thumbnailCache.values()) {
                URL.revokeObjectURL(url);
            }
            this.thumbnailCache.clear();
        }
    },

    /**
     * Check if browser supports video thumbnail generation for the given video type
     * @param {string} videoUrl - Video URL to check
     * @returns {boolean} - True if supported
     */
    isVideoTypeSupported(videoUrl) {
        const video = document.createElement('video');
        const extension = videoUrl.split('.').pop()?.toLowerCase();
        
        // Basic MIME type check
        const mimeTypes = {
            'mp4': 'video/mp4',
            'webm': 'video/webm',
            'mov': 'video/quicktime',
            'm4v': 'video/mp4',
            'mkv': 'video/x-matroska'
        };

        const mimeType = mimeTypes[extension];
        if (!mimeType) return false;

        return video.canPlayType(mimeType) !== '';
    },

    /**
     * Check if an element is visible in the viewport
     * @param {string} elementId - The ID of the element to check
     * @returns {boolean} - True if element is visible in viewport
     */
    isElementInViewport(elementId) {
        const element = document.getElementById(elementId);
        if (!element) return false;

        const rect = element.getBoundingClientRect();
        const windowHeight = window.innerHeight || document.documentElement.clientHeight;
        const windowWidth = window.innerWidth || document.documentElement.clientWidth;

        // Consider element visible if any part is in viewport
        return (
            rect.bottom > 0 &&
            rect.right > 0 &&
            rect.top < windowHeight &&
            rect.left < windowWidth
        );
    },

    /**
     * Add thumbnail generation task to concurrent queue
     */
    addToQueue(task) {
        // Don't queue tasks if video thumbnails are disabled
        if (!this.enabled) {
            return;
        }
        this.processingQueue.push(task);
        this.processQueue();
    },

    /**
     * Add thumbnail generation task to sequential waterfall queue
     */
    addToWaterfallQueue(task) {
        // Don't queue tasks if video thumbnails are disabled
        if (!this.enabled) {
            return;
        }
        this.waterfallQueue.push(task);
        this.processWaterfallQueue();
    },

    /**
     * Add thumbnail generation task to priority waterfall queue (for visible items)
     */
    addToWaterfallPriorityQueue(task) {
        // Don't queue tasks if video thumbnails are disabled
        if (!this.enabled) {
            return;
        }
        this.waterfallPriorityQueue.push(task);
        this.processWaterfallQueue();
    },

    /**
     * Process the waterfall queue with concurrency control to maintain order while allowing parallel processing
     * Priority queue items are processed first, but multiple items can be processed concurrently
     */
    async processWaterfallQueue() {
        // Start as many concurrent processes as allowed for waterfall
        while (this.activeWaterfallProcesses < this.maxConcurrency && 
               (this.waterfallPriorityQueue.length > 0 || this.waterfallQueue.length > 0)) {
            
            // Prioritize visible items first
            let task;
            if (this.waterfallPriorityQueue.length > 0) {
                task = this.waterfallPriorityQueue.shift();
            } else if (this.waterfallQueue.length > 0) {
                task = this.waterfallQueue.shift();
            }
            
            if (task) {
                this.activeWaterfallProcesses++;
                // Process task concurrently but maintain order by starting them in sequence
                this._processWaterfallTask(task);
            }
        }
    },

    /**
     * Process individual waterfall task and manage waterfall concurrency counter
     */
    async _processWaterfallTask(task) {
        try {
            await task();
        } catch (error) {
            console.error('Waterfall video thumbnail task failed:', error);
        } finally {
            this.activeWaterfallProcesses--;
            // Check if there are more tasks to process
            if (this.waterfallPriorityQueue.length > 0 || this.waterfallQueue.length > 0) {
                // Small delay before processing next task to avoid overwhelming
                setTimeout(() => this.processWaterfallQueue(), 50);
            }
        }
    },

    /**
     * Process the concurrent queue with configurable concurrency
     */
    async processQueue() {
        // Start as many concurrent processes as allowed
        while (this.activeProcesses < this.maxConcurrency && this.processingQueue.length > 0) {
            const task = this.processingQueue.shift();
            this.activeProcesses++;
            
            // Process task concurrently
            this._processTask(task);
        }
    },

    /**
     * Process individual task and manage concurrency counter
     */
    async _processTask(task) {
        try {
            await task();
        } catch (error) {
            console.error('Video thumbnail queue task failed:', error);
        } finally {
            this.activeProcesses--;
            // Check if there are more tasks to process
            if (this.processingQueue.length > 0) {
                // Small delay before processing next task
                setTimeout(() => this.processQueue(), 50);
            }
        }
    },

    /**
     * Update the maximum concurrency setting
     */
    updateConcurrency(newConcurrency) {
        if (newConcurrency >= 1 && newConcurrency <= 5) {
            this.maxConcurrency = newConcurrency;
            console.log(`Video thumbnail concurrency updated to: ${newConcurrency}`);
            // If we can now process more tasks, trigger queue processing
            if (this.activeProcesses < this.maxConcurrency && this.processingQueue.length > 0) {
                this.processQueue();
            }
            // Also check waterfall queues
            if (this.activeWaterfallProcesses < this.maxConcurrency && 
                (this.waterfallQueue.length > 0 || this.waterfallPriorityQueue.length > 0)) {
                this.processWaterfallQueue();
            }
        }
    },

    /**
     * Update the enabled state for video thumbnail generation
     */
    updateEnabled(enabled) {
        this.enabled = enabled;
        console.log(`Video thumbnail generation ${enabled ? 'enabled' : 'disabled'}`);
        
        // If disabled, clear all queues and stop processing
        if (!enabled) {
            this.processingQueue = [];
            this.waterfallQueue = [];
            this.waterfallPriorityQueue = [];
            // Note: we don't interrupt active processes as they may be nearly complete
            // Process counters will naturally decrement as active tasks complete
        }
        // If enabled and there are queued tasks, start processing
        else {
            if (this.processingQueue.length > 0) {
                this.processQueue();
            }
            if (this.waterfallQueue.length > 0 || this.waterfallPriorityQueue.length > 0) {
                this.processWaterfallQueue();
            }
        }
    },

    /**
     * Cancel all pending video thumbnail generation tasks
     * Used when folder changes to stop loading previous folder's videos
     */
    cancelAllTasks() {
        // Clear all queues
        this.processingQueue = [];
        this.waterfallQueue = [];
        this.waterfallPriorityQueue = [];
        
        // Clear loading promises to allow new requests for same URLs
        this.loadingPromises.clear();
        
        // Note: Active processes will complete but won't be queued again
        // Process counters will naturally decrement as active tasks complete
    }
};

// Clean up cache when page unloads
window.addEventListener('beforeunload', () => {
    window.videoThumbnailHelper.clearCache();
});

// Helper functions for Blazor integration
window.videoThumbnailHelper.generateThumbnailForElement = async function(containerId, filePath, fileName, isWaterfall = false, dotNetRef = null) {
    const task = async () => {
        await window.videoThumbnailHelper._processThumbnailForElement(containerId, filePath, fileName, isWaterfall, dotNetRef);
    };
    
    if (isWaterfall) {
        // Use sequential waterfall queue to maintain order
        window.videoThumbnailHelper.addToWaterfallQueue(task);
    } else {
        // Use concurrent queue for grid view
        window.videoThumbnailHelper.addToQueue(task);
    }
};

// Internal method that does the actual processing
window.videoThumbnailHelper._processThumbnailForElement = async function(containerId, filePath, fileName, isWaterfall = false, dotNetRef = null) {
    const container = document.getElementById(containerId);
    if (!container) return;
    
    const iconSelector = isWaterfall ? '.waterfall-img-fallback' : 'i';
    const spinnerSelector = '.video-thumbnail-loading';
    
    const icon = container.querySelector(iconSelector);
    const spinner = container.querySelector(spinnerSelector);
    
    try {
        if (spinner) spinner.style.display = 'block';
        if (icon) icon.style.display = 'none';
        
        // Use the instance reference if provided, otherwise fall back to global Files page instance
        const filesInstance = dotNetRef || (window.filesPageInstance ? window.filesPageInstance.dotNetRef : null);
        if (!filesInstance) {
            throw new Error('No Files page instance available');
        }
        
        const thumbnailUrl = await filesInstance.invokeMethodAsync('GenerateVideoThumbnailAsync', filePath);
        
        if (thumbnailUrl) {
            const img = document.createElement('img');
            img.src = thumbnailUrl;
            img.alt = fileName + (isWaterfall ? '' : ' thumbnail');
            img.className = isWaterfall ? 'waterfall-img' : 'thumbnail-image';
            img.loading = 'lazy';
            img.referrerPolicy = 'no-referrer';
            
            img.onerror = function() {
                this.style.display = 'none';
                if (icon) {
                    icon.style.display = isWaterfall ? 'flex' : 'block';
                }
                if (spinner) spinner.style.display = 'none';
            };
            
            img.onload = function() {
                if (spinner) spinner.style.display = 'none';
                if (isWaterfall && icon) icon.style.display = 'none';
            };
            
            container.appendChild(img);
        } else {
            if (icon) {
                icon.style.display = isWaterfall ? 'flex' : 'block';
            }
        }
    } catch (error) {
        console.log('Video thumbnail generation failed:', error);
        if (icon) {
            icon.style.display = isWaterfall ? 'flex' : 'block';
        }
    } finally {
        if (spinner) spinner.style.display = 'none';
    }
};

// Queue thumbnail generation (now uses concurrent queue instead of delay)
window.videoThumbnailHelper.queueThumbnailGeneration = function(containerId, filePath, fileName, isWaterfall = false, dotNetRef = null) {
    // Note: delay parameter is kept for backward compatibility but ignored since we now use concurrent processing
    window.videoThumbnailHelper.generateThumbnailForElement(containerId, filePath, fileName, isWaterfall, dotNetRef);
};

// Queue thumbnail generation with priority (for visible items)
window.videoThumbnailHelper.queueThumbnailGenerationPriority = function(containerId, filePath, fileName, isWaterfall = false, dotNetRef = null) {
    const task = async () => {
        await window.videoThumbnailHelper._processThumbnailForElement(containerId, filePath, fileName, isWaterfall, dotNetRef);
    };
    
    if (isWaterfall) {
        // Add to priority waterfall queue for visible items
        window.videoThumbnailHelper.addToWaterfallPriorityQueue(task);
    } else {
        // Use regular concurrent queue for grid view
        window.videoThumbnailHelper.addToQueue(task);
    }
};