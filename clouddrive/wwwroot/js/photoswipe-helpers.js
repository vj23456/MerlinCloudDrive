// Modern PhotoSwipe JavaScript integration for CloudDrive2

window.photoSwipeHelpers = {
    currentGallery: null,
    subtitleLoadTimeout: null,
    loadedVideos: new Set(), // Track videos that already have subtitles loaded
    
    // Initialize PhotoSwipe gallery
    initGallery: function(dotNetRef, pswpElement, items, options) {
        console.log('PhotoSwipe initGallery called with', items.length, 'items');
        
        if (typeof PhotoSwipe === 'undefined') {
            console.error('PhotoSwipe library not loaded');
            return;
        }

        if (!pswpElement) {
            console.error('PhotoSwipe element not found');
            return;
        }

        // Destroy existing gallery if any
        this.destroyGallery();

        // Initialize PhotoSwipe
        this.currentGallery = new PhotoSwipe(pswpElement, PhotoSwipeUI_Default, items, {
            index: options.index || 0,
            bgOpacity: 0.85,
            shareEl: false,
            fullscreenEl: true,
            zoomEl: true,
            tapToClose: false,
            clickToCloseNonZoomable: false,
            closeOnScroll: false,
            history: false,
            focus: true,
            showAnimationDuration: 333,
            hideAnimationDuration: 333,
            maxSpreadZoom: 3,
            loop: false,
            arrowKeys: true,
            escKey: true,
            getDoubleTapZoom: function(isMouseClick, item) {
                if (item.initialZoomLevel < 0.7) {
                    return 1;
                } else if (item.initialZoomLevel < 1.2) {
                    return 1.5;
                } else {
                    return item.initialZoomLevel;
                }
            },
            getThumbBoundsFn: function(index) {
                return {x:0, y:0, w:0};
            }
        });

        // Event listeners
        this.currentGallery.listen('gettingData', function(index, item) {
            if (dotNetRef) {
                return dotNetRef.invokeMethodAsync('OnGettingData', index, item);
            }
        });

        this.currentGallery.listen('afterChange', function() {
            if (dotNetRef) {
                const currentItem = this.currItem;
                if (currentItem && currentItem.videoId && currentItem.subtitleFiles) {
                    // Clear any existing timeout to prevent multiple rapid calls
                    if (window.photoSwipeHelpers.subtitleLoadTimeout) {
                        clearTimeout(window.photoSwipeHelpers.subtitleLoadTimeout);
                    }
                    
                    // Debounce subtitle loading and ensure DOM is ready
                    window.photoSwipeHelpers.subtitleLoadTimeout = setTimeout(() => {
                        // Add additional delay to ensure video element is in DOM
                        setTimeout(() => {
                            window.photoSwipeHelpers.loadSubtitlesForVideo(currentItem.videoId, currentItem.subtitleFiles);
                        }, 50);
                    }, 100);
                }
                
                dotNetRef.invokeMethodAsync('OnAfterChange', 
                    this.getCurrentIndex(), 
                    this.currItem, 
                    this.items.length);
            }
        });

        this.currentGallery.listen('destroy', function() {
            if (dotNetRef) {
                dotNetRef.invokeMethodAsync('OnPhotoSwipeDestroyed');
            }
        });

        // Open the gallery
        console.log('Opening PhotoSwipe gallery...');
        this.currentGallery.init();
        console.log('PhotoSwipe gallery initialized and opened');
        
        // Initialize wheel navigation
        if (typeof enablePhotoSwipeWheelNavigation !== 'undefined') {
            enablePhotoSwipeWheelNavigation(this.currentGallery);
        }
        
        // Store globally for compatibility
        window.pswp = this.currentGallery;
    },

    // Destroy current gallery
    destroyGallery: function() {
        if (this.currentGallery) {
            this.currentGallery.close();
            this.currentGallery = null;
            window.pswp = null;
        }
        // Clear loaded videos set
        this.loadedVideos.clear();
        // Clear any pending subtitle loading
        if (this.subtitleLoadTimeout) {
            clearTimeout(this.subtitleLoadTimeout);
            this.subtitleLoadTimeout = null;
        }
    },

    // Navigate to previous item
    prev: function() {
        if (this.currentGallery) {
            this.currentGallery.prev();
        }
    },

    // Navigate to next item
    next: function() {
        if (this.currentGallery) {
            this.currentGallery.next();
        }
    },

    // Go to specific index
    goTo: function(index) {
        if (this.currentGallery) {
            this.currentGallery.goTo(index);
        }
    },

    // Update current item
    setCurrentItem: function(pswpElement, item) {
        if (this.currentGallery && this.currentGallery.currItem) {
            // Update the item properties first
            Object.assign(this.currentGallery.currItem, item);
            
            // Find and update all image elements in the current item container
            const container = this.currentGallery.currItem.container;
            if (container && item.src) {
                // Get all img elements in the container
                const imgElements = container.querySelectorAll('.pswp__img');
                
                imgElements.forEach(imgElement => {
                    console.log('Updating image src from', imgElement.src, 'to', item.src);
                    
                    // Create a new image to load the full-size version
                    const newImg = new Image();
                    newImg.onload = () => {
                        // Update the actual dimensions based on loaded image
                        this.currentGallery.currItem.w = newImg.naturalWidth;
                        this.currentGallery.currItem.h = newImg.naturalHeight;
                        
                        // Update the src
                        imgElement.src = item.src;
                        
                        // Remove placeholder class if it exists
                        if (imgElement.classList.contains('pswp__img--placeholder')) {
                            imgElement.classList.remove('pswp__img--placeholder');
                            imgElement.style.display = 'block';
                        }
                        
                        // Force PhotoSwipe to recalculate everything
                        this.currentGallery.invalidateCurrItems();
                        this.currentGallery.updateSize(true);
                        
                        // Calculate the zoom level to fit the entire image in the viewport
                        const viewportWidth = this.currentGallery.viewportSize.x;
                        const viewportHeight = this.currentGallery.viewportSize.y;
                        const imageWidth = newImg.naturalWidth;
                        const imageHeight = newImg.naturalHeight;
                        
                        // Calculate zoom to fit the entire image
                        const zoomToFitWidth = viewportWidth / imageWidth;
                        const zoomToFitHeight = viewportHeight / imageHeight;
                        const zoomToFit = Math.min(zoomToFitWidth, zoomToFitHeight);
                        
                        // Use the smaller zoom to ensure the entire image fits
                        const targetZoom = Math.min(zoomToFit, 1); // Don't zoom beyond 100%
                        
                        console.log('Fitting image:', imageWidth + 'x' + imageHeight, 'to viewport:', viewportWidth + 'x' + viewportHeight, 'with zoom:', targetZoom);
                        
                        // Zoom to fit and center the image
                        this.currentGallery.zoomTo(targetZoom, {x: 0, y: 0}, 333);
                    };
                    newImg.src = item.src;
                });
                
                // Force PhotoSwipe to reload the image reference
                if (this.currentGallery.currItem.img) {
                    this.currentGallery.currItem.img.src = item.src;
                }
            }
        }
    },

    // Get image size
    getImageSize: function(dotNetRef, url, callbackMethodName) {
        const img = new Image();
        img.onload = function() {
            dotNetRef.invokeMethodAsync(callbackMethodName, url, this.width, this.height);
        };
        img.onerror = function() {
            dotNetRef.invokeMethodAsync(callbackMethodName, url, -1, -1);
        };
        img.src = url;
    },

    // Load subtitles for a video element
    loadSubtitlesForVideo: async function(videoId, subtitleFiles) {
        if (!subtitleFiles || subtitleFiles.length === 0) {
            console.log('[PhotoSwipe] No subtitle files to load for video:', videoId);
            return;
        }

        const videoElement = document.getElementById(videoId);
        if (!videoElement) {
            console.warn('[PhotoSwipe] Video element not found:', videoId);
            return;
        }

        // Check if video element already has subtitle tracks loaded
        const existingTracks = videoElement.querySelectorAll('track');
        if (existingTracks.length > 0) {
            console.log('[PhotoSwipe] Video already has', existingTracks.length, 'subtitle tracks loaded:', videoId);
            // Ensure first track is enabled
            if (videoElement.textTracks && videoElement.textTracks.length > 0) {
                const firstTrack = videoElement.textTracks[0];
                if (firstTrack.mode !== 'showing') {
                    firstTrack.mode = 'showing';
                    console.log('[PhotoSwipe] Re-enabled first subtitle track');
                }
            }
            // Mark as loaded for future reference
            this.loadedVideos.add(videoId);
            return;
        }

        // If we've processed this video before but tracks are missing, reload them
        if (this.loadedVideos.has(videoId)) {
            console.log('[PhotoSwipe] Video was processed before but tracks are missing, reloading:', videoId);
        }

        // Mark this video as being processed
        this.loadedVideos.add(videoId);

        console.log('[PhotoSwipe] Loading subtitles for video:', videoId, 'Files:', subtitleFiles.length);

        // Remove existing track elements before adding new ones
        const currentTracks = videoElement.querySelectorAll('track');
        currentTracks.forEach(track => {
            console.log('[PhotoSwipe] Removing existing track:', track.label || 'unlabeled');
            track.remove();
        });

        let successfullyLoaded = 0;

        // Load each subtitle file
        for (let i = 0; i < subtitleFiles.length; i++) {
            const subtitle = subtitleFiles[i];
            
            try {
                console.log('[PhotoSwipe] Processing subtitle:', subtitle.name);
                
                // Get file extension
                const extension = subtitle.name.split('.').pop().toLowerCase();
                
                // Only process SRT and VTT files
                if (extension !== 'srt' && extension !== 'vtt') {
                    console.warn('[PhotoSwipe] Skipping unsupported format:', extension);
                    continue;
                }
                
                let trackSrc = subtitle.url;
                
                // For SRT files, try to convert them
                if (extension === 'srt' && window.subtitleProxy) {
                    try {
                        const content = await window.subtitleProxy.loadSubtitleContent(subtitle.url);
                        if (content && content.trim()) {
                            const vttContent = window.subtitleProxy.convertToWebVTT(content, extension);
                            if (vttContent.includes('WEBVTT')) {
                                trackSrc = window.subtitleProxy.createBlobUrl(vttContent, 'text/vtt');
                                console.log('[PhotoSwipe] Converted SRT to WebVTT for:', subtitle.name);
                            }
                        }
                    } catch (error) {
                        console.warn('[PhotoSwipe] Failed to convert SRT, using direct URL:', error.message);
                    }
                }
                
                // Create track element
                const trackElement = document.createElement('track');
                trackElement.kind = 'subtitles';
                trackElement.src = trackSrc;
                trackElement.srclang = subtitle.language || 'en';
                trackElement.label = this.getDisplayName(subtitle.name, subtitle.language);
                
                // Set first track as default
                if (successfullyLoaded === 0) {
                    trackElement.default = true;
                    console.log('[PhotoSwipe] Set as default track:', trackElement.label);
                }
                
                trackElement.addEventListener('load', function() {
                    console.log('[PhotoSwipe] Track loaded successfully:', subtitle.name);
                });
                
                trackElement.addEventListener('error', function(e) {
                    console.error('[PhotoSwipe] Track failed to load:', subtitle.name, e);
                });
                
                videoElement.appendChild(trackElement);
                console.log('[PhotoSwipe] Added subtitle track:', trackElement.label);
                successfullyLoaded++;
                
            } catch (error) {
                console.warn('[PhotoSwipe] Failed to process subtitle:', subtitle.name, error.message);
            }
        }

        console.log('[PhotoSwipe] Successfully loaded', successfullyLoaded, 'subtitle tracks');

        // Enable first track if available
        if (successfullyLoaded > 0) {
            setTimeout(() => {
                if (videoElement.textTracks && videoElement.textTracks.length > 0) {
                    const firstTrack = videoElement.textTracks[0];
                    if (firstTrack.mode !== 'showing') {
                        firstTrack.mode = 'showing';
                        console.log('[PhotoSwipe] Enabled first subtitle track');
                    }
                }
            }, 100);
        }
    },
    
    // Helper method to generate display name for subtitle
    getDisplayName: function(fileName, language) {
        const nameWithoutExt = fileName.substring(0, fileName.lastIndexOf('.'));
        const parts = nameWithoutExt.split(/[._-]/);
        
        if (parts.length > 1) {
            const lastPart = parts[parts.length - 1].toLowerCase();
            const languageNames = {
                'en': 'English',
                'zh': 'Chinese',
                'ja': 'Japanese',
                'ko': 'Korean',
                'fr': 'French',
                'de': 'German',
                'es': 'Spanish',
                'it': 'Italian',
                'pt': 'Portuguese',
                'ru': 'Russian'
            };
            
            const langName = languageNames[lastPart] || languageNames[language];
            if (langName) {
                return langName;
            }
            
            if (lastPart.match(/^[a-z]{2,3}$/)) {
                return lastPart.toUpperCase();
            }
        }
        
        return fileName;
    },
    
    // Enable wheel scrolling for file properties panel in overlay
    enablePropertiesPanelWheelScroll: function() {
        // Wait for DOM to be ready
        setTimeout(() => {
            const propertiesCard = document.querySelector('.overlay-properties .card');
            if (propertiesCard) {
                // Remove any existing wheel listeners
                propertiesCard.removeEventListener('wheel', this.handlePropertiesWheelEvent);
                
                // Add wheel event listener
                propertiesCard.addEventListener('wheel', this.handlePropertiesWheelEvent, { passive: false });
                console.log('Properties panel wheel scroll enabled');
            }
        }, 100);
    },
    
    // Handle wheel events for properties panel
    handlePropertiesWheelEvent: function(event) {
        // Stop the event from bubbling up to PhotoSwipe
        event.stopPropagation();
        event.stopImmediatePropagation();
        
        // Get the scrollable element (the card)
        const scrollElement = event.currentTarget;
        const delta = event.deltaY;
        
        // Use smaller scroll steps for smoother scrolling
        const scrollStep = Math.abs(delta) > 100 ? delta * 0.5 : delta;
        
        // Check if we can scroll in the requested direction
        const canScrollUp = scrollElement.scrollTop > 0;
        const canScrollDown = scrollElement.scrollTop < (scrollElement.scrollHeight - scrollElement.clientHeight - 1);
        
        if ((scrollStep > 0 && canScrollDown) || (scrollStep < 0 && canScrollUp)) {
            // We can scroll, so prevent PhotoSwipe from handling this event
            event.preventDefault();
            
            // Use requestAnimationFrame for smooth scrolling
            requestAnimationFrame(() => {
                scrollElement.scrollTop += scrollStep;
            });
        }
        // If we can't scroll in the requested direction, let PhotoSwipe handle it
    },
    
    // Disable wheel scrolling for properties panel
    disablePropertiesPanelWheelScroll: function() {
        const propertiesCard = document.querySelector('.overlay-properties .card');
        if (propertiesCard) {
            propertiesCard.removeEventListener('wheel', this.handlePropertiesWheelEvent);
            console.log('Properties panel wheel scroll disabled');
        }
    }
};

// Legacy support functions
function createPhotoSwipeGallery(dotnetobject, pwspElement, items, options) {
    return window.photoSwipeHelpers.initGallery(dotnetobject, pwspElement, items, options);
}

function destroyPhotoSwipeItem() {
    window.photoSwipeHelpers.destroyGallery();
}

function getImageSizeFromUrlAsyncCallBack(dotnetRef, url, callbackMethodName) {
    window.photoSwipeHelpers.getImageSize(dotnetRef, url, callbackMethodName);
}
