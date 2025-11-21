// Modern PhotoSwipe JavaScript integration for CloudDrive2

window.photoSwipeHelpers = {
    currentGallery: null,
    subtitleLoadTimeout: null,
    loadedVideos: new Set(), // Track videos that already have subtitles loaded
    _imgSrcDescriptor: null,
    _imgSrcsetDescriptor: null,
    _imgPatched: false,
    dotNetRef: null,
    _isNavigating: false, // Track if we're currently navigating between items
    _isTransitioning: false, // True only during actual PhotoSwipe slide transitions
    _slideshowAdvancing: false, // Track if slideshow is auto-advancing (should not stop slideshow)
    // Slideshow state
    slideshowActive: false,
    slideshowTimer: null,
    slideshowSeconds: 5,
    _userStopHandlersInstalled: false,
    _boundUserStopHandler: null,
    _currentMediaEl: null,
    _currentMediaEndedHandler: null,
    _immersiveCssInjected: false,
    _fullscreenChangeHandlers: null,
    _immersiveUiHideTimer: null,
    _immersiveResizeHandler: null,
    _mediaClickGuardEl: null,
    _mediaClickGuardHandler: null,
    _slideshowLoadWaitCleanup: null,
    _slideshowToken: 0,
    _wakeLock: null,
    
    // Check if fullscreen API is supported
    _isFullscreenSupported: function() {
        try {
            const doc = document.documentElement;
            const isSupported = !!(
                doc.requestFullscreen ||
                doc.webkitRequestFullscreen ||
                doc.mozRequestFullScreen ||
                doc.msRequestFullscreen
            );
            
            // Additional check for iOS - even if API exists, it's very limited
            const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || 
                         (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
            const isIPad = /iPad/.test(navigator.userAgent) || 
                          (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
            
            if (isIOS) {
                // Only show fullscreen button on iPad (has better support)
                return isIPad;
            }
            
            if (!isSupported) {
                console.log('[PhotoSwipe] Fullscreen API not supported - hiding fullscreen button');
            }
            
            return isSupported;
        } catch (e) {
            console.warn('[PhotoSwipe] Error checking fullscreen support:', e.message);
            return false;
        }
    },
    
    // Initialize PhotoSwipe gallery
    initGallery: function(dotNetRef, pswpElement, items, options) {
        
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

    // Ensure image loads do not send Referrer header while gallery is active
    this._applyNoReferrerImagePatch();

    // Initialize PhotoSwipe
    this.currentGallery = new PhotoSwipe(pswpElement, PhotoSwipeUI_Default, items, {
            index: options.index || 0,
            bgOpacity: 0.85,
            shareEl: false,
            fullscreenEl: this._isFullscreenSupported(),
            zoomEl: true,
            tapToClose: true,
            clickToCloseNonZoomable: true,
            closeOnScroll: false,
            history: false,
            focus: true,
            // Keep toolbar/caption always visible in non-fullscreen (use huge values; falsy values are overridden by UI defaults)
            timeToIdle: 99999999,
            timeToIdleOutside: 99999999,
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

    // Store .NET reference for callbacks
    this.dotNetRef = dotNetRef;

    // Event listeners
        this.currentGallery.listen('gettingData', function(index, item) {
            if (dotNetRef) {
                return dotNetRef.invokeMethodAsync('OnGettingData', index, item);
            }
        });

    // Listen for beforeChange to stop media before transitioning
    this.currentGallery.listen('beforeChange', function() {
        // Set navigation state to prevent media autoplay
        window.photoSwipeHelpers._isNavigating = true;
        window.photoSwipeHelpers._isTransitioning = true;
        
        // Stop all currently playing media when about to change slides
        window.photoSwipeHelpers.stopAllMedia();
        
        // Prevent any autoplay during navigation
        window.photoSwipeHelpers.preventMediaAutoplay();
    });

    this.currentGallery.listen('afterChange', function() {
        // Clear navigation/transition state immediately after slide change so media clicks and autoplay aren't blocked
        window.photoSwipeHelpers._isNavigating = false;
        window.photoSwipeHelpers._isTransitioning = false;
        // Clear slideshow advancing flag after navigation completes
        window.photoSwipeHelpers._slideshowAdvancing = false;
            
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
            // Reschedule slideshow on slide change
            try {
                if (window.photoSwipeHelpers.slideshowActive) {
                    window.photoSwipeHelpers._scheduleNextAdvance();
                }
            } catch (e) {}
            // Enforce no-referrer on current item's images
            try {
                const container = this.currItem && this.currItem.container;
                if (container) {
                    container.querySelectorAll('img').forEach(img => {
                        try {
                            img.referrerPolicy = 'no-referrer';
                            img.setAttribute('referrerpolicy', 'no-referrer');
                        } catch (e) {}
                    });
                }
            } catch (e) {}
            
            // Install media click guard in non-fullscreen to keep controls visible and allow bringing them back
            try {
                // Detach previous guard if any
                if (window.photoSwipeHelpers._mediaClickGuardEl && window.photoSwipeHelpers._mediaClickGuardHandler) {
                    const prev = window.photoSwipeHelpers._mediaClickGuardEl;
                    const h = window.photoSwipeHelpers._mediaClickGuardHandler;
                    const preventNav = window.photoSwipeHelpers._mediaClickPreventNav;
                    try { prev.removeEventListener('click', preventNav, true); } catch(_) {}
                    try { prev.removeEventListener('click', h, true); } catch(_) {}
                    try { prev.removeEventListener('pswpTap', h, true); } catch(_) {}
                    try { prev.removeEventListener('touchend', h, true); } catch(_) {}
                }
                window.photoSwipeHelpers._mediaClickGuardEl = null;
                window.photoSwipeHelpers._mediaClickGuardHandler = null;
                window.photoSwipeHelpers._mediaClickPreventNav = null;

                const isFs = !!(document.fullscreenElement || document.webkitFullscreenElement || document.mozFullScreenElement || document.msFullscreenElement);
                if (!isFs) {
                    const curr = this.currItem;
                    let mediaEl = null;
                    if (curr) {
                        if (curr.videoId) mediaEl = document.getElementById(curr.videoId);
                        if (!mediaEl && curr.container) mediaEl = curr.container.querySelector('video, audio');
                    }
                    if (mediaEl) {
                        const ui = this.ui;
                        const handler = (e) => {
                            const target = e.target;
                            const tag = target && target.tagName ? target.tagName.toLowerCase() : '';
                            const isMedia = tag === 'video' || tag === 'audio';
                            const navigating = window.photoSwipeHelpers && (window.photoSwipeHelpers._isTransitioning === true);

                            // If navigating, guard against UI toggles
                            if (navigating) {
                                try { e.stopPropagation && e.stopPropagation(); } catch(_) {}
                                try { e.stopImmediatePropagation && e.stopImmediatePropagation(); } catch(_) {}
                                return;
                            }

                            // Not navigating: allow click to pass to media for play/pause
                            if (isMedia) {
                                // Temporarily allow autoplay/prevent-play bypass for this direct user interaction
                                try {
                                    target.dataset.cdAllowPlay = '1';
                                    setTimeout(() => { try { delete target.dataset.cdAllowPlay; } catch(_) {} }, 1200);
                                    if (target._cdPreventPlayHandler) {
                                        target.removeEventListener('play', target._cdPreventPlayHandler);
                                        target.removeEventListener('playing', target._cdPreventPlayHandler);
                                        delete target._cdPreventPlayHandler;
                                    }
                                } catch(_) {}
                            }
                            try { ui && ui.showControls && ui.showControls(); } catch(_) {}
                        };
                        
                        // Add click prevention during navigation
                        const preventClickDuringNav = (e) => {
                            if (window.photoSwipeHelpers._isNavigating) {
                                e.preventDefault();
                                e.stopPropagation();
                                e.stopImmediatePropagation();
                                return false;
                            }
                        };
                        
                        mediaEl.addEventListener('click', preventClickDuringNav, true);
                        mediaEl.addEventListener('click', handler, true);
                        mediaEl.addEventListener('pswpTap', handler, true);
                        mediaEl.addEventListener('touchend', handler, true);
                        window.photoSwipeHelpers._mediaClickGuardEl = mediaEl;
                        window.photoSwipeHelpers._mediaClickGuardHandler = handler;
                        window.photoSwipeHelpers._mediaClickPreventNav = preventClickDuringNav;
                    }
                }
            } catch (e) {}
        });

    // Add beforeClose listener to prevent closing when video is playing
    this.currentGallery.listen('beforeClose', function() {
        try {
            const currentItem = this.currItem;
            if (!currentItem) return true; // Allow close if no item

            // Check if current item is a video
            let videoElement = null;
            if (currentItem.videoId) {
                videoElement = document.getElementById(currentItem.videoId);
            }
            if (!videoElement && currentItem.container) {
                videoElement = currentItem.container.querySelector('video');
            }

            if (videoElement) {
                // For videos: only allow close if video is not playing
                if (videoElement.paused || videoElement.ended) {
                    return true; // Allow close
                } else {
                    return false; // Prevent close
                }
            } else {
                // For images and other content: always allow close
                return true; // Allow close
            }
        } catch (error) {
            console.warn('[PhotoSwipe] Error in beforeClose handler:', error.message);
            return true; // Allow close on error to prevent stuck gallery
        }
    });

    // Add direct background click handler for closing when clicking outside video
    this.currentGallery.listen('initialZoomIn', function() {
        try {
            const template = this.template;
            if (!template) return;

            // Find the background and content areas
            const background = template.querySelector('.pswp__bg');
            const scrollWrap = template.querySelector('.pswp__scroll-wrap');

            if (!background || !scrollWrap) return;

            // Track drag state to prevent click-to-close after drag operations
            let isDragging = false;
            let dragStartX = 0;
            let dragStartY = 0;
            const DRAG_THRESHOLD = 10; // pixels - minimum movement to consider it a drag

            const onPointerDown = (e) => {
                isDragging = false;
                // Handle both pointer and touch events
                if (e.touches && e.touches.length > 0) {
                    dragStartX = e.touches[0].clientX;
                    dragStartY = e.touches[0].clientY;
                } else {
                    dragStartX = e.clientX;
                    dragStartY = e.clientY;
                }
            };

            const onPointerMove = (e) => {
                if (!isDragging) {
                    let currentX, currentY;
                    // Handle both pointer and touch events
                    if (e.touches && e.touches.length > 0) {
                        currentX = e.touches[0].clientX;
                        currentY = e.touches[0].clientY;
                    } else {
                        currentX = e.clientX;
                        currentY = e.clientY;
                    }

                    const deltaX = Math.abs(currentX - dragStartX);
                    const deltaY = Math.abs(currentY - dragStartY);
                    if (deltaX > DRAG_THRESHOLD || deltaY > DRAG_THRESHOLD) {
                        isDragging = true;
                    }
                }
            };

            const onPointerUp = () => {
                // Reset drag state after a brief delay to ensure click handler sees the correct state
                setTimeout(() => {
                    isDragging = false;
                }, 50);
            };

            const backgroundClickHandler = (e) => {
                // Don't close if this was the end of a drag operation
                if (isDragging) {
                    return;
                }

                // Check if click is on background areas or overlay content (outside video)
                const isOnBackground = e.target === background;
                const isOnScrollWrap = e.target === scrollWrap;
                const isOnContainer = e.target.classList && e.target.classList.contains('pswp__container');
                const isOnItem = e.target.classList && e.target.classList.contains('pswp__item');
                const isOnOverlayContent = e.target.classList && e.target.classList.contains('overlay-content');
                const isOnZoomWrap = e.target.classList && e.target.classList.contains('pswp__zoom-wrap');

                // Handle clicks on background areas OR overlay content (which is the area around the video)
                if (!isOnBackground && !isOnScrollWrap && !isOnContainer && !isOnItem && !isOnOverlayContent && !isOnZoomWrap) {
                    return;
                }

                // Additional check: if clicking on overlay-content, make sure we're not clicking directly on the video element
                if (isOnOverlayContent) {
                    // Check if the click target is a video/audio element or child of one
                    const clickedElement = e.target;
                    const isVideoOrAudio = clickedElement.tagName && (clickedElement.tagName.toLowerCase() === 'video' || clickedElement.tagName.toLowerCase() === 'audio');
                    const isChildOfVideo = clickedElement.closest && clickedElement.closest('video, audio');

                    if (isVideoOrAudio || isChildOfVideo) {
                        return;
                    }
                }

                try {
                    const currentItem = this.currItem;
                    if (!currentItem) return;

                    // Check if current item is a video
                    let videoElement = null;
                    if (currentItem.videoId) {
                        videoElement = document.getElementById(currentItem.videoId);
                    }
                    if (!videoElement && currentItem.container) {
                        videoElement = currentItem.container.querySelector('video');
                    }

                    if (videoElement) {
                        // For videos: only close if video is not playing
                        if (videoElement.paused || videoElement.ended) {
                            this.close();
                        }
                        // If playing, do nothing (don't close)
                    } else {
                        // For images and other content: close immediately
                        this.close();
                    }
                } catch (error) {
                    console.warn('[PhotoSwipe] Error in background click handler:', error.message);
                }
            };

            // Add drag tracking listeners to the template
            template.addEventListener('pointerdown', onPointerDown, { passive: true });
            template.addEventListener('pointermove', onPointerMove, { passive: true });
            template.addEventListener('pointerup', onPointerUp, { passive: true });
            template.addEventListener('pointercancel', onPointerUp, { passive: true });

            // Add touch support for mobile
            template.addEventListener('touchstart', onPointerDown, { passive: true });
            template.addEventListener('touchmove', onPointerMove, { passive: true });
            template.addEventListener('touchend', onPointerUp, { passive: true });
            template.addEventListener('touchcancel', onPointerUp, { passive: true });

            // Add click listeners to background areas
            background.addEventListener('click', backgroundClickHandler);
            scrollWrap.addEventListener('click', backgroundClickHandler);

            // Also add listener to overlay-content elements (this is where clicks outside video actually land)
            const overlayContents = template.querySelectorAll('.overlay-content');
            overlayContents.forEach(overlay => {
                overlay.addEventListener('click', backgroundClickHandler);
            });

            // Store references for cleanup
            this._backgroundClickHandler = backgroundClickHandler;
            this._dragHandlers = { onPointerDown, onPointerMove, onPointerUp };
            this._backgroundElements = [background, scrollWrap, ...overlayContents];

        } catch (e) {
            console.warn('[PhotoSwipe] Failed to add background click handler:', e.message);
        }
    });

        // Prevent PhotoSwipe from hijacking inputs inside custom toolbar controls
        try {
            const tmpl = this.currentGallery.template;
            const isInControls = (el) => !!(
                el && el.closest && (
                    el.closest('.pswp__slideshow-controls') ||
                    el.closest('.pswp__slideshow-input') ||
                    el.closest('.pswp__button') ||        // All PhotoSwipe buttons
                    el.closest('.pswp__top-bar') ||       // Top bar controls
                    el.closest('.pswp__caption') ||       // Caption area controls
                    el.closest('.pswp__counter')          // Counter area
                )
            );
            if (tmpl) {
        const stopIfInControls = (e) => {
                    const el = e.target;
                    if (isInControls(el)) {
            if (e.stopImmediatePropagation) e.stopImmediatePropagation();
                    }
                };
                ['pointerdown','pointerup','mousedown','mouseup','touchstart','touchend','click','wheel'].forEach(evt => {
            tmpl.addEventListener(evt, stopIfInControls, true);
                });
        const keyBlocker = (e) => {
                    const ae = document.activeElement;
                    if (isInControls(ae) || isInControls(e.target)) {
            if (e.stopImmediatePropagation) e.stopImmediatePropagation();
                    }
                };
        window.addEventListener('keydown', keyBlocker, true);
                // Store to remove on destroy
                this._controlsGuards = { stopIfInControls, keyBlocker };
            }
        } catch (e) {}

        // Also set referrer policy right after an image finishes loading
        this.currentGallery.listen('imageLoadComplete', function(index, item) {
            try {
                const container = item && item.container;
                if (container) {
                    container.querySelectorAll('img').forEach(img => {
                        try {
                            img.referrerPolicy = 'no-referrer';
                            img.setAttribute('referrerpolicy', 'no-referrer');
                        } catch (e) {}
                    });
                }
                if (item && item.img) {
                    try {
                        item.img.referrerPolicy = 'no-referrer';
                        item.img.setAttribute('referrerpolicy', 'no-referrer');
                    } catch (e) {}
                }
                // If in fullscreen, just reflow size; do not override zoom to avoid flicker
                try {
                    const isFs = !!(document.fullscreenElement || document.webkitFullscreenElement || document.mozFullScreenElement || document.msFullscreenElement);
                    if (isFs && this && this.updateSize) {
                        this.updateSize(true);
                    }
                } catch (_) {}
            } catch (e) {}
        });

    this.currentGallery.listen('destroy', function() {
            // Clean up referrer patch and other state when gallery is destroyed
            try {
        // Stop all media playback when gallery is destroyed
        window.photoSwipeHelpers.stopAllMedia();
        // Clean up media event listeners
        window.photoSwipeHelpers.cleanupMediaEventListeners();
        // Clean up background click handler
        window.photoSwipeHelpers._removeBackgroundClickHandler();
        // Ensure slideshow is stopped
        window.photoSwipeHelpers._stopSlideshowInternal(true);
        // Remove global spacebar handler
        window.photoSwipeHelpers._removeGlobalSpacebarHandler();
                window.photoSwipeHelpers._removeNoReferrerImagePatch();
                window.photoSwipeHelpers.loadedVideos.clear();
                if (window.photoSwipeHelpers.subtitleLoadTimeout) {
                    clearTimeout(window.photoSwipeHelpers.subtitleLoadTimeout);
                    window.photoSwipeHelpers.subtitleLoadTimeout = null;
                }
                // Remove media click guard if present
                try {
                    if (window.photoSwipeHelpers._mediaClickGuardEl && window.photoSwipeHelpers._mediaClickGuardHandler) {
                        const prev = window.photoSwipeHelpers._mediaClickGuardEl;
                        const h = window.photoSwipeHelpers._mediaClickGuardHandler;
                        const preventNav = window.photoSwipeHelpers._mediaClickPreventNav;
                        try { prev.removeEventListener('click', preventNav, true); } catch(_) {}
                        try { prev.removeEventListener('click', h, true); } catch(_) {}
                        try { prev.removeEventListener('pswpTap', h, true); } catch(_) {}
                        try { prev.removeEventListener('touchend', h, true); } catch(_) {}
                    }
                } catch(_) {}
                window.photoSwipeHelpers._mediaClickGuardEl = null;
                window.photoSwipeHelpers._mediaClickGuardHandler = null;
                window.photoSwipeHelpers._mediaClickPreventNav = null;
                // Remove control guards
                try {
                    const g = window.photoSwipeHelpers._controlsGuards;
                    if (g) {
                        const tmpl = window.photoSwipeHelpers.currentGallery && window.photoSwipeHelpers.currentGallery.template;
                        if (tmpl) {
                            ['pointerdown','mousedown','touchstart','click','wheel'].forEach(evt => {
                                tmpl.removeEventListener(evt, g.stopIfInControls, true);
                            });
                        }
                        window.removeEventListener('keydown', g.keyBlocker, true);
                        window.photoSwipeHelpers._controlsGuards = null;
                    }
                } catch (e2) {}
                // Clean up gesture handlers
                try {
                    const gh = window.photoSwipeHelpers._gestureHandlers;
                    if (gh && gh.template) {
                        gh.template.removeEventListener('pointerdown', gh.onPointerStart);
                        gh.template.removeEventListener('pointermove', gh.onPointerMove);
                        gh.template.removeEventListener('pointerup', gh.onPointerEnd);
                        gh.template.removeEventListener('pointercancel', gh.onPointerEnd);
                        gh.template.removeEventListener('touchstart', gh.onPointerStart);
                        gh.template.removeEventListener('touchmove', gh.onPointerMove);
                        gh.template.removeEventListener('touchend', gh.onPointerEnd);
                        gh.template.removeEventListener('touchcancel', gh.onPointerEnd);
                        window.photoSwipeHelpers._gestureHandlers = null;
                    }
                } catch (e3) {}
            } catch (e) {}
            if (dotNetRef) {
                dotNetRef.invokeMethodAsync('OnPhotoSwipeDestroyed');
            }
        });

    // Open the gallery
        this.currentGallery.init();

        // Initialize wheel navigation
        if (typeof enablePhotoSwipeWheelNavigation !== 'undefined') {
            enablePhotoSwipeWheelNavigation(this.currentGallery);
        }

        // Add global spacebar handler for slideshow toggle (always active when PhotoSwipe is open)
        this._installGlobalSpacebarHandler();
        
        // Add gesture listeners to detect navigation attempts
        try {
            const template = this.currentGallery.template;
            if (template) {
                // Listen for mouse/touch events that might trigger navigation
                const onPointerStart = (e) => {
                    // Start drag tracking
                    this._dragStartTime = Date.now();
                    try {
                        const pt = (e.touches && e.touches[0]) || e;
                        this._dragStartX = pt.clientX;
                        this._dragStartY = pt.clientY;
                    } catch(_) { this._dragStartX = this._dragStartY = undefined; }
                    this._dragMoved = false;
                    // Avoid slideshow auto-advance racing with user navigation
                    try { if (this.slideshowActive) { this._clearSlideshowTimer(); this._slideshowAdvancing = false; this._slideshowPausedForUserNav = true; } } catch(_) {}
                };
                
                const onPointerMove = (e) => {
                    // Only treat as navigation when actual movement exceeds threshold
                    let moved = false;
                    try {
                        const pt = (e.touches && e.touches[0]) || e;
                        if (typeof this._dragStartX === 'number' && typeof this._dragStartY === 'number') {
                            const dx = Math.abs(pt.clientX - this._dragStartX);
                            const dy = Math.abs(pt.clientY - this._dragStartY);
                            moved = (dx > 6 || dy > 6);
                        }
                    } catch(_) {}
                    if (!this._dragMoved && moved) {
                        this._dragMoved = true;
                        this._isNavigating = true;
                        // Do not pause media or install autoplay prevention on pointer move; beforeChange handles media stopping safely
                    }
                };
                
                const onPointerEnd = (e) => {
                    // If there was a drag movement, suppress the immediate next click so it doesn't stop slideshow
                    if (this._dragMoved) {
                        this._suppressClickUntil = Date.now() + 300; // 300ms window to ignore click
                    }
                    // Clear drag state
                    this._dragStartTime = null;
                    this._dragMoved = false;
                    // If there was no drag movement, ensure navigating is cleared so clicks aren't blocked
                    if (!this._dragMoved) {
                        this._isNavigating = false;
                    }
                    // If slideshow was paused due to user nav, reschedule next advance after brief settle
                    if (this.slideshowActive && this._slideshowPausedForUserNav) {
                        setTimeout(() => {
                            try { if (this.slideshowActive) this._scheduleNextAdvance(); } catch(_) {}
                            this._slideshowPausedForUserNav = false;
                        }, 350);
                    }
                    // Don't immediately clear _isNavigating here, let afterChange handle it
                    // However, in case no slide change occurs (edge swipe), ensure we reset navigating state
                    setTimeout(() => { this._isNavigating = false; }, 400);
                };
                
                template.addEventListener('pointerdown', onPointerStart, { passive: true });
                template.addEventListener('pointermove', onPointerMove, { passive: true });
                template.addEventListener('pointerup', onPointerEnd, { passive: true });
                template.addEventListener('pointercancel', onPointerEnd, { passive: true });
                
                // Also handle touch events for better mobile support
                template.addEventListener('touchstart', onPointerStart, { passive: true });
                template.addEventListener('touchmove', onPointerMove, { passive: true });
                template.addEventListener('touchend', onPointerEnd, { passive: true });
                template.addEventListener('touchcancel', onPointerEnd, { passive: true });
                
                // Store references for cleanup
                this._gestureHandlers = {
                    template,
                    onPointerStart,
                    onPointerMove,
                    onPointerEnd
                };
            }
        } catch (e) {
            console.warn('[PhotoSwipe] Failed to add gesture listeners:', e);
        }
        
        // Store globally for compatibility
        window.pswp = this.currentGallery;

        // Ensure controls never auto-hide in non-fullscreen: override UI idle handler
        try {
            const ui = this.currentGallery && this.currentGallery.ui;
            if (ui && !this._uiSetIdlePatched) {
                this._uiSetIdlePatched = true;
                this._origUiSetIdle = ui.setIdle && ui.setIdle.bind(ui);
                ui.setIdle = (isIdle) => {
                    const isFs = !!(document.fullscreenElement || document.webkitFullscreenElement || document.mozFullScreenElement || document.msFullscreenElement);
                    if (isFs && this._origUiSetIdle) {
                        // Allow default idle behavior in fullscreen if needed
                        this._origUiSetIdle(isIdle);
                    } else {
                        // In non-fullscreen, keep controls visible
                        try { ui.showControls && ui.showControls(); } catch(_) {}
                    }
                };
                // Restore on destroy
                this.currentGallery.listen('destroy', () => {
                    try {
                        if (ui && this._origUiSetIdle) ui.setIdle = this._origUiSetIdle;
                    } catch(_) {}
                    this._origUiSetIdle = null;
                    this._uiSetIdlePatched = false;
                });
            }
        } catch (_) {}

        // Inject slideshow toolbar button next to zoom/fullscreen
        try {
            this._injectSlideshowToolbarButton();
        } catch (e) {
            console.warn('[PhotoSwipe] Failed to inject slideshow button:', e);
        }

        // Attach media click guard on first open (non-fullscreen)
        try {
            const g = this.currentGallery;
            const attachGuard = () => {
                try {
                    const isFs = !!(document.fullscreenElement || document.webkitFullscreenElement || document.mozFullScreenElement || document.msFullscreenElement);
                    if (isFs) return;
                    const curr = g && g.currItem;
                    let mediaEl = null;
                    if (curr) {
                        if (curr.videoId) mediaEl = document.getElementById(curr.videoId);
                        if (!mediaEl && curr.container) mediaEl = curr.container.querySelector('video, audio');
                    }
                    if (mediaEl) {
                        const ui = g.ui;
                        const handler = (e) => {
                            const target = e.target;
                            const tag = target && target.tagName ? target.tagName.toLowerCase() : '';
                            const isMedia = tag === 'video' || tag === 'audio';
                            const navigating = window.photoSwipeHelpers && (window.photoSwipeHelpers._isTransitioning === true);
                            if (navigating) {
                                try { e.stopPropagation && e.stopPropagation(); } catch(_) {}
                                try { e.stopImmediatePropagation && e.stopImmediatePropagation(); } catch(_) {}
                                return;
                            }
                            if (isMedia) {
                                try {
                                    target.dataset.cdAllowPlay = '1';
                                    setTimeout(() => { try { delete target.dataset.cdAllowPlay; } catch(_) {} }, 1200);
                                    if (target._cdPreventPlayHandler) {
                                        target.removeEventListener('play', target._cdPreventPlayHandler);
                                        target.removeEventListener('playing', target._cdPreventPlayHandler);
                                        delete target._cdPreventPlayHandler;
                                    }
                                } catch(_) {}
                            }
                            try { ui && ui.showControls && ui.showControls(); } catch(_) {}
                        };
                        // Cleanup previous
                        if (window.photoSwipeHelpers._mediaClickGuardEl && window.photoSwipeHelpers._mediaClickGuardHandler) {
                            const prev = window.photoSwipeHelpers._mediaClickGuardEl;
                            const h = window.photoSwipeHelpers._mediaClickGuardHandler;
                            try { prev.removeEventListener('click', h, true); } catch(_) {}
                            try { prev.removeEventListener('pswpTap', h, true); } catch(_) {}
                            try { prev.removeEventListener('touchend', h, true); } catch(_) {}
                        }
                        mediaEl.addEventListener('click', handler, true);
                        mediaEl.addEventListener('pswpTap', handler, true);
                        mediaEl.addEventListener('touchend', handler, true);
                        window.photoSwipeHelpers._mediaClickGuardEl = mediaEl;
                        window.photoSwipeHelpers._mediaClickGuardHandler = handler;
                    }
                } catch(_) {}
            };
            // Try right away and shortly after to handle delayed render
            attachGuard();
            setTimeout(attachGuard, 100);
            setTimeout(attachGuard, 250);
        } catch(_) {}

        // Enable immersive fullscreen UI (hide top toolbar and bottom caption in fullscreen)
        try {
            this._enableImmersiveFullscreen();
        } catch (e) {
            console.warn('[PhotoSwipe] Failed to enable immersive fullscreen:', e);
        }

        // Fullscreen-only: stop pointer/touch/click bubbling from toolbar/caption/buttons (capture-phase)
        try {
            const tmpl = this.currentGallery && this.currentGallery.template;
            if (tmpl && !this._fsClickGuards) {
                const isFullscreen = () => !!(document.fullscreenElement || document.webkitFullscreenElement || document.mozFullScreenElement || document.msFullscreenElement);
                const inUiNonButton = (el) => !!(el && el.closest && (
                    el.closest('.pswp__button') ? false : (
                        el.closest('.pswp__top-bar') ||
                        el.closest('.pswp__caption') ||
                        el.closest('.pswp__counter')
                    )
                ));
                const handler = (e) => {
                    if (!isFullscreen()) return;
                    const t = e.target;
                    if (inUiNonButton(t)) {
                        try { e.stopImmediatePropagation && e.stopImmediatePropagation(); } catch(_) {}
                        try { e.stopPropagation && e.stopPropagation(); } catch(_) {}
                        // Do not preventDefault so button actions (e.g., close) still work
                    }
                };
                const types = ['click'];
                types.forEach(type => { try { tmpl.addEventListener(type, handler, true); } catch(_) {} });
                this._fsClickGuards = { handler, types };
                // Cleanup on destroy
                this.currentGallery.listen('destroy', () => {
                    try {
                        const g = this._fsClickGuards;
                        if (g && g.types) {
                            g.types.forEach(type => {
                                try { tmpl.removeEventListener(type, g.handler, true); } catch(_) {}
                            });
                        }
                    } catch(_) {}
                    this._fsClickGuards = null;
                });
            }
        } catch (_) {}
    },

    _enableImmersiveFullscreen: function() {
        const gallery = this.currentGallery;
        if (!gallery || !gallery.template) return;
        // Inject CSS once
        if (!this._immersiveCssInjected) {
            try {
                const style = document.createElement('style');
                style.setAttribute('data-cd-immersive', '1');
                style.textContent = [
                    // In fullscreen, position toolbar/caption as overlays without reserving space
                    '.pswp.cd-immersive .pswp__top-bar,',
                    '.pswp.cd-immersive .pswp__caption,',
                    '.pswp.cd-immersive .pswp__counter{',
                    '  position:absolute; left:0; right:0;',
                    '  transition:opacity .2s ease;',
                    '}',
                    // Overlays are visible but do not block drags/swipes by default; re-enable for buttons
                    '.pswp.cd-immersive .pswp__top-bar{ top:0; background:rgba(0,0,0,.35); pointer-events:none; }',
                    '.pswp.cd-immersive .pswp__top-bar .pswp__button, .pswp.cd-immersive .pswp__top-bar button, .pswp.cd-immersive .pswp__top-bar input, .pswp.cd-immersive .pswp__top-bar select{ pointer-events:auto; }',
                    '.pswp.cd-immersive .pswp__caption{ bottom:0; background:rgba(0,0,0,.35); pointer-events:none; }',
                    '.pswp.cd-immersive .pswp__counter{ pointer-events:none; }',
                    '.pswp.cd-immersive .pswp__caption a, .pswp.cd-immersive .pswp__caption button{ pointer-events:auto; }',
                    // Make video truly fill the viewport in fullscreen
                    '.pswp.cd-immersive .pswp__item video{',
                    '  position:absolute; top:0; left:0; width:100% !important; height:100% !important;',
                    '  object-fit:cover; background:#000;',
                    '}',
                    // Ensure overlay sits on top
                    '.pswp.cd-immersive .pswp__top-bar, .pswp.cd-immersive .pswp__caption{ z-index: 10005; }',
                    // No extra hover zones; we use mousemove threshold detection
                ].join('\n');
                document.head.appendChild(style);
                this._immersiveCssInjected = true;
            } catch (_) {}
        }

    const tmpl = gallery.template;
        const self = this;
        const applyState = () => {
            const isFs = !!(document.fullscreenElement || document.webkitFullscreenElement || document.mozFullScreenElement || document.msFullscreenElement);
            try {
                if (isFs) {
                    tmpl.classList.add('cd-immersive');
            // Hide controls by default when entering fullscreen; rely on PhotoSwipe UI toggling
            try { if (gallery.ui && gallery.ui.hideControls) gallery.ui.hideControls(); } catch(_) {}
                    // In fullscreen do not reserve space for controls; overlays float on top
                    try {
                        if (!gallery.options) gallery.options = {};
                        if (typeof self._prevBarsSize === 'undefined') self._prevBarsSize = gallery.options.barsSize;
                        if (typeof self._prevFitControlsInViewport === 'undefined') self._prevFitControlsInViewport = gallery.options.fitControlsInViewport;
                        gallery.options.barsSize = { top: 0, bottom: 0 };
                        gallery.options.fitControlsInViewport = false;
                    } catch(_) {}
                    try { gallery.updateSize(true); } catch(_) {}
                    // Reduced timeout for faster response in fullscreen
                    setTimeout(() => { try { gallery.updateSize(true); } catch(_) {} }, 50);
                    // Request wake lock and maximize brightness when entering fullscreen
                    try { self._requestWakeLock(); } catch(_) {}
                } else {
                    tmpl.classList.remove('cd-immersive');
            // Restore control visibility state on exit
            try { if (gallery.ui && gallery.ui.showControls) gallery.ui.showControls(); } catch(_) {}
                    // Clear any pending auto-hide timer when exiting fullscreen
                    try { if (uiHideTimer && uiHideTimer.current) { clearTimeout(uiHideTimer.current); uiHideTimer.current = null; } } catch(_) {}
                    // Restore option overrides
                    try {
                        if (!gallery.options) gallery.options = {};
                        if (typeof self._prevBarsSize !== 'undefined') { gallery.options.barsSize = self._prevBarsSize; self._prevBarsSize = undefined; }
                        if (typeof self._prevFitControlsInViewport !== 'undefined') { gallery.options.fitControlsInViewport = self._prevFitControlsInViewport; self._prevFitControlsInViewport = undefined; }
                        gallery.updateSize(true);
                    } catch(_) {}
                    // Release wake lock and restore brightness when exiting fullscreen
                    try { self._releaseWakeLock(); } catch(_) {}
                }
            } catch (_) {}
        };

        // Setup listeners
        const onFsChange = () => applyState();
        const onWebkitFsChange = () => applyState();
        const onMozFsChange = () => applyState();
        const onMsFsChange = () => applyState();
        document.addEventListener('fullscreenchange', onFsChange);
        document.addEventListener('webkitfullscreenchange', onWebkitFsChange);
        document.addEventListener('mozfullscreenchange', onMozFsChange);
        document.addEventListener('MSFullscreenChange', onMsFsChange);
        // When slide changes in fullscreen, just refresh layout
        const onAfterChange = () => {
            const isFs = !!(document.fullscreenElement || document.webkitFullscreenElement || document.mozFullScreenElement || document.msFullscreenElement);
            if (isFs) { try { gallery.updateSize(true); } catch(_) {} }
        };
        try { gallery.listen('afterChange', onAfterChange); } catch (_) {}
        // On window resize during fullscreen, just refresh layout
        const onWindowResize = () => { try { gallery.updateSize(true); } catch(_) {} };
        window.addEventListener('resize', onWindowResize);
        // Input behavior by device type - use improved mobile detection
        const isTouch = window.mobileDetection ? window.mobileDetection.isMobile() : 
                        (('ontouchstart' in window) || (navigator.maxTouchPoints > 0) || (navigator.msMaxTouchPoints > 0));
        let clickToggle = null;
        let mouseMoveHandler = null;
        let mouseEnterHandler = null;
        // Store timer reference on self so it persists across closures and can be properly cleaned up
        let uiHideTimer = { current: null };
        
        if (isTouch) {
            // Mobile/tablet: rely on PhotoSwipe's built-in tap-to-toggle controls
            // No extra handlers needed; we only changed default state on entering fullscreen via ui.hideControls()
        } else {
            // Desktop: show UI on any mouse move or click, auto-hide after 3 seconds idle
            const showUI = () => { 
                try {
                    // Force controls to show by directly manipulating the UI classes and calling showControls
                    if (gallery.ui) {
                        // Reset PhotoSwipe's internal idle state
                        if (gallery.ui._isIdle !== undefined) {
                            gallery.ui._isIdle = false;
                        }
                        
                        // Call showControls
                        if (gallery.ui.showControls) {
                            gallery.ui.showControls();
                        }
                        
                        // Also directly remove the hidden class from UI elements as a backup
                        try {
                            const uiElement = gallery.template.querySelector('.pswp__ui');
                            if (uiElement) {
                                uiElement.classList.remove('pswp__ui--hidden');
                                uiElement.classList.remove('pswp__ui--idle');
                                
                                // Force visibility of child elements (top-bar and caption)
                                const topBar = gallery.template.querySelector('.pswp__top-bar');
                                const caption = gallery.template.querySelector('.pswp__caption');
                                
                                if (topBar) {
                                    topBar.style.opacity = '1';
                                    topBar.style.transform = 'none';
                                }
                                
                                if (caption) {
                                    caption.style.opacity = '1';
                                    caption.style.transform = 'none';
                                }
                            }
                        } catch (e) {}
                    }
                    
                    // Clear existing hide timer
                    if (uiHideTimer.current) {
                        clearTimeout(uiHideTimer.current);
                        uiHideTimer.current = null;
                    }
                    // Set new hide timer for 3 seconds
                    uiHideTimer.current = setTimeout(() => {
                        try { 
                            if (gallery.ui && gallery.ui.hideControls) {
                                gallery.ui.hideControls();
                            }
                        } catch (_) {}
                    }, 3000);
                } catch (e) {}
            };
            const isFullscreen = () => !!(document.fullscreenElement || document.webkitFullscreenElement || document.mozFullScreenElement || document.msFullscreenElement);
            
            // Show UI on any mouse movement in fullscreen
            mouseMoveHandler = (e) => {
                if (!isFullscreen()) return;
                // Don't toggle UI while a drag/selection is in progress
                if ((typeof e.buttons === 'number' && e.buttons !== 0)) return;
                showUI();
            };
            tmpl.addEventListener('mousemove', mouseMoveHandler, { capture: false, passive: true });
            
            // Show UI when mouse enters the viewer area (e.g., returning from outside browser window)
            mouseEnterHandler = (e) => {
                if (!isFullscreen()) return;
                showUI();
            };
            tmpl.addEventListener('mouseenter', mouseEnterHandler, { capture: false, passive: true });
            
            // Show UI on click in fullscreen
            clickToggle = (e) => {
                if (!isFullscreen()) return;
                showUI();
            };
            tmpl.addEventListener('click', clickToggle, { capture: false, passive: true });
            // Keep UI visible while hovering overlays themselves
            const topBar = tmpl.querySelector('.pswp__top-bar');
            const caption = tmpl.querySelector('.pswp__caption');
            if (topBar) {
                const onTopEnter = () => { 
                    if (isFullscreen()) {
                        // Clear any pending hide timer when entering toolbar area
                        if (uiHideTimer.current) {
                            clearTimeout(uiHideTimer.current);
                            uiHideTimer.current = null;
                        }
                        showUI(); 
                    }
                };
                const onTopLeave = () => { 
                    if (isFullscreen()) {
                        // Start auto-hide timer when leaving toolbar area
                        if (uiHideTimer.current) {
                            clearTimeout(uiHideTimer.current);
                        }
                        uiHideTimer.current = setTimeout(() => {
                            try { if (gallery.ui && gallery.ui.hideControls) gallery.ui.hideControls(); } catch (_) {}
                        }, 3000);
                    }
                };
                topBar.addEventListener('mouseenter', onTopEnter);
                topBar.addEventListener('mouseleave', onTopLeave);
                // Track for cleanup
                if (!self._fullscreenChangeHandlers) self._fullscreenChangeHandlers = {};
                self._fullscreenChangeHandlers.topBarEl = topBar;
                self._fullscreenChangeHandlers.topBarEnter = onTopEnter;
                self._fullscreenChangeHandlers.topBarLeave = onTopLeave;
            }
            if (caption) {
                const onCapEnter = () => { 
                    if (isFullscreen()) {
                        // Clear any pending hide timer when entering caption area
                        if (uiHideTimer.current) {
                            clearTimeout(uiHideTimer.current);
                            uiHideTimer.current = null;
                        }
                        showUI(); 
                    }
                };
                const onCapLeave = () => { 
                    if (isFullscreen()) {
                        // Start auto-hide timer when leaving caption area
                        if (uiHideTimer.current) {
                            clearTimeout(uiHideTimer.current);
                        }
                        uiHideTimer.current = setTimeout(() => {
                            try { if (gallery.ui && gallery.ui.hideControls) gallery.ui.hideControls(); } catch (_) {}
                        }, 3000);
                    }
                };
                caption.addEventListener('mouseenter', onCapEnter);
                caption.addEventListener('mouseleave', onCapLeave);
                // Track for cleanup
                if (!self._fullscreenChangeHandlers) self._fullscreenChangeHandlers = {};
                self._fullscreenChangeHandlers.captionEl = caption;
                self._fullscreenChangeHandlers.captionEnter = onCapEnter;
                self._fullscreenChangeHandlers.captionLeave = onCapLeave;
            }
        }

    // Track handlers for cleanup
    this._fullscreenChangeHandlers = { onFsChange, onWebkitFsChange, onMozFsChange, onMsFsChange, onAfterChange, onWindowResize, clickToggle, mouseMoveHandler, mouseEnterHandler, uiHideTimer };

    // Clean up on destroy
        try {
            gallery.listen('destroy', function() {
                try {
                    const h = window.photoSwipeHelpers._fullscreenChangeHandlers;
                    if (h) {
                        document.removeEventListener('fullscreenchange', h.onFsChange);
                        document.removeEventListener('webkitfullscreenchange', h.onWebkitFsChange);
                        document.removeEventListener('mozfullscreenchange', h.onMozFsChange);
                        document.removeEventListener('MSFullscreenChange', h.onMsFsChange);
                        try { gallery.unlisten('afterChange', h.onAfterChange); } catch (_) {}
                        try { gallery.unlisten('doubleTap', h.onDoubleTap); } catch (_) {}
                        try { gallery.unlisten('zoomAnimationEnded', h.onZoomEnd); } catch (_) {}
                        try { window.removeEventListener('resize', h.onWindowResize); } catch(_) {}
                        // Remove UI auto-hide timer
                        try { if (h.uiHideTimer && h.uiHideTimer.current) { clearTimeout(h.uiHideTimer.current); h.uiHideTimer.current = null; } } catch (_) {}
                        // Remove mouse and click handlers
                        try { if (h.mouseMoveHandler) tmpl.removeEventListener('mousemove', h.mouseMoveHandler, false); } catch (_) {}
                        try { if (h.mouseEnterHandler) tmpl.removeEventListener('mouseenter', h.mouseEnterHandler, false); } catch (_) {}
                        try { if (h.clickToggle) tmpl.removeEventListener('click', h.clickToggle, false); } catch (_) {}
                        // Remove overlay hover handlers if present
                        try {
                            if (h.topBarEl) {
                                if (h.topBarEnter) h.topBarEl.removeEventListener('mouseenter', h.topBarEnter);
                                if (h.topBarLeave) h.topBarEl.removeEventListener('mouseleave', h.topBarLeave);
                            }
                            if (h.captionEl) {
                                if (h.captionEnter) h.captionEl.removeEventListener('mouseenter', h.captionEnter);
                                if (h.captionLeave) h.captionEl.removeEventListener('mouseleave', h.captionLeave);
                            }
                        } catch (_) {}
                        window.photoSwipeHelpers._fullscreenChangeHandlers = null;
                    }
                } catch (_) {}
                try { tmpl.classList.remove('cd-immersive'); } catch (_) {}
                try { if (window.photoSwipeHelpers._immersiveUiHideTimer) { clearTimeout(window.photoSwipeHelpers._immersiveUiHideTimer); window.photoSwipeHelpers._immersiveUiHideTimer = null; } } catch(_) {}
                // Release wake lock and restore brightness on destroy
                try { window.photoSwipeHelpers._releaseWakeLock(); } catch(_) {}
            });
        } catch (_) {}

        // Initialize state
        applyState();
    },

    // Request wake lock to keep screen on - system brightness control not available via web APIs
    _requestWakeLock: async function() {
        let wakeLockSuccess = false;
        
        try {
            // Request screen wake lock to prevent screen from dimming/turning off
            if ('wakeLock' in navigator) {
                this._wakeLock = await navigator.wakeLock.request('screen');
                wakeLockSuccess = true;
                
                // Listen for wake lock release (e.g., when tab becomes hidden)
                this._wakeLock.addEventListener('release', () => {
                    this._wakeLock = null;
                });
            } else {
                console.log('[PhotoSwipe] ❌ Wake Lock API not supported in this browser');
            }
        } catch (err) {
            console.warn('[PhotoSwipe] ❌ Failed to acquire wake lock:', err.message);
        }

        // Check if we're in a PWA or installed app context where more control might be available
        try {
            if (window.matchMedia('(display-mode: standalone)').matches) {
                console.log('[PhotoSwipe] 📱 Running in PWA mode - some devices may offer additional brightness control');
            }
        } catch (err) {
            // Ignore display-mode query errors
        }

        // Inform about platform-specific brightness control
        try {
            const userAgent = navigator.userAgent.toLowerCase();
            const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || 
                         (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
            const isIPad = /iPad/.test(navigator.userAgent) || 
                          (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
                          
            if (userAgent.includes('android')) {
                console.log('[PhotoSwipe] 🤖 Android: Use device brightness controls or notification panel');
            } else if (isIOS) {
                if (isIPad) {
                    console.log('[PhotoSwipe] 📱 iPad: Swipe down from top-right corner or use Control Center to adjust brightness');
                } else {
                    console.log('[PhotoSwipe] 🍎 iPhone: Swipe down from top-right corner or use Control Center to adjust brightness');
                }
            } else if (userAgent.includes('mac') || navigator.platform.includes('Mac')) {
                console.log('[PhotoSwipe] 🖥️ macOS: Use brightness keys (F1/F2) or System Preferences');
            } else if (userAgent.includes('windows')) {
                console.log('[PhotoSwipe] 🪟 Windows: Use brightness keys or Action Center');
            }
        } catch (err) {
            // Ignore user agent detection errors
        }
    },

    // Release wake lock 
    _releaseWakeLock: async function() {
        try {
            // Release screen wake lock
            if (this._wakeLock) {
                await this._wakeLock.release();
                this._wakeLock = null;
            }
        } catch (err) {
            console.warn('[PhotoSwipe] Failed to release wake lock:', err.message);
        }
    },

    _fitScaleForCurrent: function() {
        try {
            const g = this.currentGallery;
            if (!g || !g.currItem) return null;
            const item = g.currItem;
            // Prefer PhotoSwipe's own computed initial zoom level for exact "fit"
            if (item && typeof item.initialZoomLevel === 'number' && isFinite(item.initialZoomLevel) && item.initialZoomLevel > 0) {
                return item.initialZoomLevel;
            }
            if (!item.w || !item.h || item.w <= 0 || item.h <= 0) return null;
            const vw = g.viewportSize && g.viewportSize.x ? g.viewportSize.x : (window.innerWidth || 0);
            const vh = g.viewportSize && g.viewportSize.y ? g.viewportSize.y : (window.innerHeight || 0);
            if (!vw || !vh) return null;
            const scale = Math.min(vw / item.w, vh / item.h);
            const maxZoom = (typeof g.options.maxSpreadZoom === 'number' && g.options.maxSpreadZoom > 0) ? g.options.maxSpreadZoom : 3;
            return Math.min(scale, maxZoom);
        } catch (_) { return null; }
    },

    _applyFullscreenFitGuarded: function() {
        try {
            const g = this.currentGallery;
            if (!g) return;
            const isFs = !!(document.fullscreenElement || document.webkitFullscreenElement || document.mozFullScreenElement || document.msFullscreenElement);
            if (!isFs) return;
            const fit = this._fitScaleForCurrent();
            if (!fit) return;
            const getLevel = (g.getZoomLevel && g.getZoomLevel.bind(g)) || null;
            const curr = getLevel ? getLevel() : null;
            // If at-or-below fit (or very close), snap exactly to fit
            const eps = 0.005;
            if (curr == null || curr <= fit + eps) {
                const vw = g.viewportSize && g.viewportSize.x ? g.viewportSize.x : (window.innerWidth || 0);
                const vh = g.viewportSize && g.viewportSize.y ? g.viewportSize.y : (window.innerHeight || 0);
                try { g.updateSize(true); } catch (_) {}
                // Apply a tiny negative bias so PhotoSwipe treats it as <= fit and enables swipe navigation
                const bias = 1e-4;
                const target = Math.max(fit - bias, 0);
                g.zoomTo(target, { x: vw / 2, y: vh / 2 }, 150);
            }
        } catch (_) {}
    },

    _scheduleFullscreenFitAdjustments: function() {
        try {
            const g = this.currentGallery;
            if (!g) return;
            // Force size update, then apply fit a few times as fullscreen settles
            const attempt = (delay) => setTimeout(() => {
                try { g.updateSize(true); } catch (_) {}
                this._applyFullscreenFitGuarded();
            }, delay);
            attempt(0);
            attempt(120);
            attempt(300);
        } catch (_) {}
    },

    // Removed cover-based helpers to align fullscreen with non-fullscreen fit behavior.

    _injectSlideshowToolbarButton: function() {
        const gallery = this.currentGallery;
        if (!gallery || !gallery.template) return;
        const ui = gallery.template.querySelector('.pswp__top-bar');
        if (!ui) return;

        // If a slideshow button already exists (from Blazor markup), wire it up and keep icons in sync
        const existingBtn = ui.querySelector('.pswp__button--slideshow');
        if (existingBtn) {
            const btn = existingBtn;
            const updateTitleAndIcon = () => {
                const startTitle = 'Start slideshow';
                const stopTitle = 'Stop slideshow';
                btn.title = this.slideshowActive ? stopTitle : startTitle;
                btn.setAttribute('aria-label', this.slideshowActive ? stopTitle : startTitle);
                // Prefer toggling Font Awesome <i> if present
                const iEl = btn.querySelector('i');
                if (iEl) {
                    // Support both 'fa' and 'fas' prefixes
                    try { iEl.classList.remove('fa-play'); iEl.classList.remove('fa-pause'); } catch(_) {}
                    try { iEl.classList.remove('fas'); iEl.classList.add('fa'); } catch(_) {}
                    iEl.classList.add(this.slideshowActive ? 'fa-pause' : 'fa-play');
                } else {
                    // Fallback to SVG swap if an <svg> exists
                    const icon = btn.querySelector('svg');
                    if (icon) {
                        while (icon.firstChild) icon.removeChild(icon.firstChild);
                        if (this.slideshowActive) {
                            const pathPause1 = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
                            pathPause1.setAttribute('x', '6'); pathPause1.setAttribute('y', '5'); pathPause1.setAttribute('width', '4'); pathPause1.setAttribute('height', '14');
                            const pathPause2 = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
                            pathPause2.setAttribute('x', '14'); pathPause2.setAttribute('y', '5'); pathPause2.setAttribute('width', '4'); pathPause2.setAttribute('height', '14');
                            icon.appendChild(pathPause1); icon.appendChild(pathPause2);
                        } else {
                            const pathPlay = document.createElementNS('http://www.w3.org/2000/svg', 'path');
                            pathPlay.setAttribute('d', 'M8 5v14l11-7z');
                            icon.appendChild(pathPlay);
                        }
                    }
                }
            };

            // Wrap start/stop so any trigger updates the icon
            const originalStop = this.stopSlideshow.bind(this);
            const originalStart = this.startSlideshow.bind(this);
            this.stopSlideshow = () => { originalStop(); updateTitleAndIcon(); };
            this.startSlideshow = (seconds) => { originalStart(seconds); updateTitleAndIcon(); };

            // Expose updater and refresh on slide change
            this._updateSlideshowButtonIcon = updateTitleAndIcon;
            try { gallery.listen('afterChange', updateTitleAndIcon); } catch (_) {}

            // Initial sync
            updateTitleAndIcon();
            return; // We're done; don't create a duplicate button
        }

        // Create button when not provided by Blazor markup
    const btn = document.createElement('button');
    btn.className = 'pswp__button pswp__button--action pswp__button--slideshow';
    btn.setAttribute('type', 'button');
    btn.setAttribute('aria-label', this.slideshowActive ? 'Stop slideshow' : 'Start slideshow');
    // Match default toolbar button sizing/positioning; place to the left of the leftmost existing abs-positioned button
    btn.style.width = '44px';
    btn.style.height = '44px';
    btn.style.position = 'absolute';
    btn.style.top = '0';
    // Ensure visibility (PhotoSwipe may hide text via text-indent/background sprite)
    btn.style.background = 'none';
    btn.style.textIndent = '0';
    btn.style.overflow = 'visible';
    btn.style.lineHeight = '44px';
    const positionBtn = () => {
            try {
        const target = ui.querySelector('.pswp__button--close') || ui.querySelector('.pswp__button--zoom') || ui.querySelector('.pswp__button--fs');
                if (target) {
                    const containerRect = ui.getBoundingClientRect();
                    const targetRect = target.getBoundingClientRect();
                    const cs = window.getComputedStyle(target);
                    const leftStr = cs.left;
                    const rightStr = cs.right;
                    const hasLeft = leftStr && leftStr !== 'auto' && !isNaN(parseFloat(leftStr));
                    const hasRight = rightStr && rightStr !== 'auto' && !isNaN(parseFloat(rightStr));

                    if (hasLeft) {
                        // Toolbar anchored from left: put our button immediately to the right of target
                        const leftVal = (targetRect.left - containerRect.left) + 44; // one slot to the right
                        btn.style.left = leftVal + 'px';
                        btn.style.right = 'auto';
                    } else {
                        // Toolbar anchored from right (default): put our button immediately to the left of target
            const rightVal = containerRect.right - targetRect.left; // one slot to the left
                        btn.style.right = rightVal + 'px';
                        btn.style.left = 'auto';
                    }
                } else {
                    // Fallback to a safe default when buttons are missing
                    btn.style.right = '176px';
                    btn.style.left = 'auto';
                }
            } catch (_) {
                btn.style.right = '176px';
                btn.style.left = 'auto';
            }
        };
    // Boost visibility stacking just in case
    btn.style.zIndex = '10001';
    positionBtn();
    // Also position after a short delay to wait for layout stabilization
    setTimeout(positionBtn, 0);
    setTimeout(positionBtn, 50);
        // Reposition on resize to keep alignment
        const resizeHandler = () => positionBtn();
        window.addEventListener('resize', resizeHandler);
        // Clean up on destroy
        try {
            gallery.listen('destroy', function() {
                window.removeEventListener('resize', resizeHandler);
            });
        } catch (_) {}
        // Use a simple icon with Font Awesome if available
    // Inline SVG icon to avoid dependency on fonts/sprites
    const svgNS = 'http://www.w3.org/2000/svg';
    const icon = document.createElementNS(svgNS, 'svg');
    icon.setAttribute('viewBox', '0 0 24 24');
    icon.setAttribute('width', '20');
    icon.setAttribute('height', '20');
    icon.style.position = 'absolute';
    icon.style.top = '50%';
    icon.style.left = '50%';
    icon.style.transform = 'translate(-50%, -50%)';
    icon.style.fill = 'currentColor';
    icon.style.color = '#fff';
    icon.style.pointerEvents = 'none';
    const pathPlay = document.createElementNS(svgNS, 'path');
    pathPlay.setAttribute('d', 'M8 5v14l11-7z');
    const pathPauseG = document.createElementNS(svgNS, 'g');
    const pathPause1 = document.createElementNS(svgNS, 'rect');
    pathPause1.setAttribute('x', '6');
    pathPause1.setAttribute('y', '5');
    pathPause1.setAttribute('width', '4');
    pathPause1.setAttribute('height', '14');
    const pathPause2 = document.createElementNS(svgNS, 'rect');
    pathPause2.setAttribute('x', '14');
    pathPause2.setAttribute('y', '5');
    pathPause2.setAttribute('width', '4');
    pathPause2.setAttribute('height', '14');
    pathPauseG.appendChild(pathPause1);
    pathPauseG.appendChild(pathPause2);
    // Default to play icon
    icon.appendChild(pathPlay);
    btn.appendChild(icon);

        const updateTitleAndIcon = () => {
            // Title: fallback to English; Razor handles localization for in-viewer strings, but this is JS-only
            const startTitle = 'Start slideshow';
            const stopTitle = 'Stop slideshow';
            btn.title = this.slideshowActive ? stopTitle : startTitle;
            btn.setAttribute('aria-label', this.slideshowActive ? stopTitle : startTitle);
            // Swap SVG content
            while (icon.firstChild) icon.removeChild(icon.firstChild);
            if (this.slideshowActive) {
                icon.appendChild(pathPauseG);
            } else {
                icon.appendChild(pathPlay);
            }
        };
        updateTitleAndIcon();

        btn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            try {
                if (!this.slideshowActive) {
                    let seconds = 5;
                    try {
                        const saved = localStorage.getItem('cd.slideshowSeconds');
                        const n = parseInt(saved, 10);
                        if (!isNaN(n) && n >= 1 && n <= 3600) seconds = n;
                    } catch(_) {}
                    this.startSlideshow(seconds);
                } else {
                    this.stopSlideshow();
                }
            } finally {
                updateTitleAndIcon();
            }
        });

    // Append to toolbar; absolute "right" handles final placement robustly
    ui.appendChild(btn);

    // Keep icon in sync when slideshow state changes
        const originalStop = this.stopSlideshow.bind(this);
        const originalStart = this.startSlideshow.bind(this);

        this.stopSlideshow = () => {
            originalStop();
            updateTitleAndIcon();
        };

        this.startSlideshow = (seconds) => {
            originalStart(seconds);
            updateTitleAndIcon();
        };

    // Store the update function globally so other handlers can call it
        this._updateSlideshowButtonIcon = updateTitleAndIcon;

        // Also update on slide change in case state toggled elsewhere
        try {
            gallery.listen('afterChange', updateTitleAndIcon);
        } catch (_) {}
    },

    // Destroy current gallery
    destroyGallery: function() {
        if (this.currentGallery) {
            // Stop all media before destroying
            this.stopAllMedia();
            // Clean up media event listeners
            this.cleanupMediaEventListeners();
            // Reset navigation state
            this._isNavigating = false;
                    // Also stop bubbling from actual UI buttons/controls in fullscreen (bubble-phase)
                    const buttonGuardHandler = (e) => {
                        if (!isFullscreen()) return;
                        try { e.stopImmediatePropagation && e.stopImmediatePropagation(); } catch(_) {}
                        try { e.stopPropagation && e.stopPropagation(); } catch(_) {}
                    };
                    const attachButtonGuards = () => {
                        try {
                            const controls = tmpl.querySelectorAll('.pswp__top-bar .pswp__button, .pswp__top-bar button, .pswp__top-bar input, .pswp__top-bar select, .pswp__caption a, .pswp__caption button');
                            const list = Array.prototype.slice.call(controls);
                            list.forEach(el => {
                                try { el.addEventListener('click', buttonGuardHandler, false); } catch(_) {}
                                try { el.addEventListener('touchend', buttonGuardHandler, false); } catch(_) {}
                                try { el.addEventListener('pointerup', buttonGuardHandler, false); } catch(_) {}
                                try { el.addEventListener('mouseup', buttonGuardHandler, false); } catch(_) {}
                                // PhotoSwipe custom tap event may bubble on template; belt-and-suspenders
                                try { el.addEventListener('pswpTap', buttonGuardHandler, false); } catch(_) {}
                            });
                            this._fsButtonGuards = { elements: list, handler: buttonGuardHandler };
                        } catch(_) {}
                    };
                    attachButtonGuards();
                    // Re-attach shortly after to catch async-inserted controls (e.g., slideshow button)
                    setTimeout(attachButtonGuards, 0);
                    setTimeout(attachButtonGuards, 50);
                    this.currentGallery.listen('destroy', () => {
                        try {
                            const g2 = this._fsButtonGuards;
                            if (g2 && g2.elements) {
                                g2.elements.forEach(el => {
                                    try { el.removeEventListener('click', g2.handler, false); } catch(_) {}
                                    try { el.removeEventListener('touchend', g2.handler, false); } catch(_) {}
                                    try { el.removeEventListener('pointerup', g2.handler, false); } catch(_) {}
                                    try { el.removeEventListener('mouseup', g2.handler, false); } catch(_) {}
                                    try { el.removeEventListener('pswpTap', g2.handler, false); } catch(_) {}
                                });
                            }
                        } catch(_) {}
                        this._fsButtonGuards = null;
                    });
            this.currentGallery.close();
            this.currentGallery = null;
            window.pswp = null;
        }
        // Release wake lock and restore brightness
        try { this._releaseWakeLock(); } catch(_) {}
        // Clear loaded videos set
        this.loadedVideos.clear();
        // Clear any pending subtitle loading
        if (this.subtitleLoadTimeout) {
            clearTimeout(this.subtitleLoadTimeout);
            this.subtitleLoadTimeout = null;
        }
        // Restore native image behavior
        this._removeNoReferrerImagePatch();
    },

    // Navigate to previous item
    prev: function() {
        if (this.currentGallery) {
            // Set navigation state and stop media before navigation
            this._isNavigating = true;
            // Prevent slideshow timer from firing mid-transition
            this._clearSlideshowTimer();
            this.stopAllMedia();
            // Extra: pause any stray media elements
            try { const t = this.currentGallery.template; t && t.querySelectorAll && t.querySelectorAll('video,audio').forEach(m=>{ try{ m.pause && m.pause(); }catch(_){} }); } catch(_) {}
            this.preventMediaAutoplay();
            this.currentGallery.prev();
        }
    },

    // Navigate to next item
    next: function() {
        if (this.currentGallery) {
            // Set navigation state and stop media before navigation
            this._isNavigating = true;
            this._clearSlideshowTimer();
            this.stopAllMedia();
            try { const t = this.currentGallery.template; t && t.querySelectorAll && t.querySelectorAll('video,audio').forEach(m=>{ try{ m.pause && m.pause(); }catch(_){} }); } catch(_) {}
            this.preventMediaAutoplay();
            this.currentGallery.next();
        }
    },

    // Go to specific index
    goTo: function(index) {
        if (this.currentGallery) {
            // Set navigation state and stop media before navigation
            this._isNavigating = true;
            this._clearSlideshowTimer();
            this.stopAllMedia();
            try { const t = this.currentGallery.template; t && t.querySelectorAll && t.querySelectorAll('video,audio').forEach(m=>{ try{ m.pause && m.pause(); }catch(_){} }); } catch(_) {}
            this.preventMediaAutoplay();
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
                    try {
                        imgElement.referrerPolicy = 'no-referrer';
                        imgElement.setAttribute('referrerpolicy', 'no-referrer');
                    } catch (e) {}
                    
                    // Create a new image to load the full-size version
                    const newImg = new Image();
                    try {
                        newImg.referrerPolicy = 'no-referrer';
                    } catch (e) {}
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
                        
                        // Check if we're in fullscreen mode
                        const isFs = !!(document.fullscreenElement || document.webkitFullscreenElement || document.mozFullScreenElement || document.msFullscreenElement);
                        
                        if (isFs) {
                            // In fullscreen mode, use a more efficient approach to avoid delays
                            
                            // Calculate zoom before any DOM operations to avoid layout thrashing
                            const viewportWidth = this.currentGallery.viewportSize.x;
                            const viewportHeight = this.currentGallery.viewportSize.y;
                            const imageWidth = newImg.naturalWidth;
                            const imageHeight = newImg.naturalHeight;
                            
                            const zoomToFit = Math.min(viewportWidth / imageWidth, viewportHeight / imageHeight);
                            const initialZoomLevel = this.currentGallery.currItem.initialZoomLevel;
                            const targetZoom = (initialZoomLevel && initialZoomLevel <= zoomToFit) ? initialZoomLevel : zoomToFit;
                            
                            // Update PhotoSwipe item properties before any operations
                            this.currentGallery.currItem.initialZoomLevel = targetZoom;
                            this.currentGallery.currItem.fitRatio = targetZoom;
                            
                            // Single invalidation without immediate updateSize to avoid double layout
                            this.currentGallery.invalidateCurrItems();
                            
                            // Use a single requestAnimationFrame to batch all operations
                            requestAnimationFrame(() => {
                                // Update size only once after all calculations
                                this.currentGallery.updateSize(true);
                                
                                // Set zoom without animation to avoid delay, centered properly
                                const centerX = viewportWidth / 2;
                                const centerY = viewportHeight / 2;
                                
                                // Use zoomTo with 0 duration for instant positioning
                                this.currentGallery.zoomTo(targetZoom, {x: centerX, y: centerY}, 0);
                                
                                // Force recalculation of zoom bounds to fix click-to-zoom positioning
                                // This fixes the issue where clicks zoom to wrong position after loading original size
                                requestAnimationFrame(() => {
                                    try {
                                        // Reset all positioning-related properties to force clean recalculation
                                        const item = this.currentGallery.currItem;
                                        if (item) {
                                            // Clear cached bounds and position data
                                            item.bounds = null;
                                            item.vGap = null;
                                            item.fitRatio = targetZoom;
                                            item.initialZoomLevel = targetZoom;
                                            
                                            // Reset positioning
                                            item.initialPosition = { x: 0, y: 0 };
                                            
                                            // Force PhotoSwipe to recalculate everything
                                            this.currentGallery.updateSize(false); // false = no event trigger, just recalc
                                            
                                            // Reset pan position to ensure click-to-zoom works from correct reference point
                                            if (this.currentGallery.panX !== undefined) {
                                                this.currentGallery.panX = 0;
                                            }
                                            if (this.currentGallery.panY !== undefined) {
                                                this.currentGallery.panY = 0;
                                            }
                                            
                                            // Additional fix: ensure the image is properly centered after bounds recalculation
                                            const currentZoom = this.currentGallery.getZoomLevel();
                                            if (Math.abs(currentZoom - targetZoom) > 0.001) {
                                                // Re-center if zoom drifted during recalculation
                                                this.currentGallery.zoomTo(targetZoom, {x: centerX, y: centerY}, 0);
                                            }
                                        }
                                    } catch (e) {
                                        console.warn('Error recalculating zoom bounds:', e);
                                    }
                                });
                            });
                        } else {
                            // Non-fullscreen mode - use the original logic
                            this.currentGallery.invalidateCurrItems();
                            this.currentGallery.updateSize(true);
                            
                            const viewportWidth = this.currentGallery.viewportSize.x;
                            const viewportHeight = this.currentGallery.viewportSize.y;
                            const imageWidth = newImg.naturalWidth;
                            const imageHeight = newImg.naturalHeight;
                            
                            const zoomToFitWidth = viewportWidth / imageWidth;
                            const zoomToFitHeight = viewportHeight / imageHeight;
                            const zoomToFit = Math.min(zoomToFitWidth, zoomToFitHeight);
                            
                            const initialZoomLevel = this.currentGallery.currItem.initialZoomLevel;
                            let targetZoom = initialZoomLevel || zoomToFit;
                            
                            if (targetZoom > zoomToFit) {
                                targetZoom = zoomToFit;
                            }
                            
                            const centerX = viewportWidth / 2;
                            const centerY = viewportHeight / 2;
                            this.currentGallery.zoomTo(targetZoom, {x: centerX, y: centerY}, 333);
                        }
                    };
                    newImg.src = item.src;
                });
                
                // Force PhotoSwipe to reload the image reference
                if (this.currentGallery.currItem.img) {
                    try {
                        this.currentGallery.currItem.img.referrerPolicy = 'no-referrer';
                        this.currentGallery.currItem.img.setAttribute('referrerpolicy', 'no-referrer');
                    } catch (e) {}
                    this.currentGallery.currItem.img.src = item.src;
                }
            }
        }
    },

    // Start slideshow from current item
    startSlideshow: function(seconds) {
        if (!this.currentGallery) return;
        if (!seconds || seconds < 1) seconds = 5;
        this.slideshowSeconds = seconds;
        if (this.slideshowActive) {
            // Restart timing with new seconds
            this._clearSlideshowTimer();
        }
        this.slideshowActive = true;
        this._installUserStopHandlers();
        this._scheduleNextAdvance();

        // On slideshow start (user gesture), try to prime current media for autoplay on iOS
        try {
            const currentItem = this.currentGallery && this.currentGallery.currItem;
            const container = currentItem && currentItem.container;
            if (container) {
                let mediaEl = null;
                if (currentItem.videoId) mediaEl = document.getElementById(currentItem.videoId);
                if (!mediaEl) mediaEl = container.querySelector('video, audio');
                if (mediaEl) {
                    // Remove any navigation prevent handlers for current media
                    try {
                        if (mediaEl._cdPreventPlayHandler) {
                            mediaEl.removeEventListener('play', mediaEl._cdPreventPlayHandler);
                            mediaEl.removeEventListener('playing', mediaEl._cdPreventPlayHandler);
                            delete mediaEl._cdPreventPlayHandler;
                        }
                    } catch(_) {}
                    this._prepareAndPlayMediaForSlideshow(mediaEl);
                }
            }
        } catch (_) {}
    },

    // Stop slideshow
    stopSlideshow: function() {
        this._stopSlideshowInternal(false);
    },

    _stopSlideshowInternal: function(silent) {
        if (!this.slideshowActive && !this.slideshowTimer && !this._userStopHandlersInstalled) return;
        this.slideshowActive = false;
        this._clearSlideshowTimer();
    // Cancel any pending image-load waiters
    try { if (this._slideshowLoadWaitCleanup) { this._slideshowLoadWaitCleanup(); } } catch(_) {}
    this._slideshowLoadWaitCleanup = null;
        this._removeMediaEndedHandler();
        // Best-effort: unmute current media after stopping, only if we muted it for autoplay
        try {
            if (this._currentMediaEl && this._currentMediaEl.dataset && this._currentMediaEl.dataset.cdMutedForAutoplay === '1') {
                this._currentMediaEl.muted = false;
                delete this._currentMediaEl.dataset.cdMutedForAutoplay;
            }
        } catch(_) {}
        this._removeUserStopHandlers();
        if (!silent && this.dotNetRef) {
            try { this.dotNetRef.invokeMethodAsync('OnSlideshowStopped'); } catch (e) {}
        }
    },

    _clearSlideshowTimer: function() {
        if (this.slideshowTimer) {
            clearTimeout(this.slideshowTimer);
            this.slideshowTimer = null;
        }
    },

    _removeMediaEndedHandler: function() {
        try {
            if (this._currentMediaEl && this._currentMediaEndedHandler) {
                this._currentMediaEl.removeEventListener('ended', this._currentMediaEndedHandler);
            }
        } catch (e) {}
        this._currentMediaEl = null;
        this._currentMediaEndedHandler = null;
    },

    // Detect if a specific element is currently in native fullscreen
    _isElementInNativeFullscreen: function(el) {
        try {
            return !!(el && (
                document.fullscreenElement === el ||
                document.webkitFullscreenElement === el ||
                document.mozFullScreenElement === el ||
                document.msFullscreenElement === el
            ));
        } catch (_) { return false; }
    },

    // Attempt to exit native fullscreen (document or element), returns a thenable
    _exitNativeFullscreen: function(el) {
        try {
            // Try element-level exit first if available (WebKit on iOS)
            if (el && typeof el.webkitExitFullscreen === 'function') {
                try { el.webkitExitFullscreen(); } catch(_) {}
            }
            if (document.exitFullscreen) return document.exitFullscreen();
            if (document.webkitExitFullscreen) return document.webkitExitFullscreen();
            if (document.mozCancelFullScreen) return document.mozCancelFullScreen();
            if (document.msExitFullscreen) return document.msExitFullscreen();
        } catch (_) {}
        // Fallback to a resolved promise-like
        return { then: (fn) => { try { fn && fn(); } catch(_) {} } };
    },

    // Prepare media for autoplay and attempt playback; only mute if autoplay is blocked
    _prepareAndPlayMediaForSlideshow: function(mediaEl) {
        try {
            // Ensure inline playback for video
            if (mediaEl.tagName === 'VIDEO') {
                mediaEl.setAttribute('playsinline', '');
                mediaEl.setAttribute('webkit-playsinline', '');
            }
            mediaEl.setAttribute('autoplay', '');

            const tryPlay = () => {
                try {
                    const p = mediaEl.play && mediaEl.play();
                    if (p && typeof p.then === 'function') {
                        p.catch(() => {
                            // Autoplay likely blocked; retry with muted
                            try {
                                if (!mediaEl.muted) {
                                    mediaEl.muted = true;
                                }
                                mediaEl.dataset && (mediaEl.dataset.cdMutedForAutoplay = '1');
                                const p2 = mediaEl.play && mediaEl.play();
                                if (p2 && typeof p2.then === 'function') {
                                    p2.catch(() => {});
                                }
                            } catch (_) {}
                        });
                    }
                } catch (_) {
                    // As a last resort, retry muted
                    try {
                        if (!mediaEl.muted) mediaEl.muted = true;
                        mediaEl.dataset && (mediaEl.dataset.cdMutedForAutoplay = '1');
                        const p2 = mediaEl.play && mediaEl.play();
                        if (p2 && typeof p2.then === 'function') {
                            p2.catch(() => {});
                        }
                    } catch (__) {}
                }
            };

            // If media not loaded at all, attempt a light load before playing
            try {
                if (mediaEl.readyState === 0 && mediaEl.load) mediaEl.load();
            } catch (_) {}
            tryPlay();
        } catch (_) {}
    },

    _scheduleNextAdvance: function() {
        this._clearSlideshowTimer();
    // Cancel previous pending image load waits
    try { if (this._slideshowLoadWaitCleanup) { this._slideshowLoadWaitCleanup(); } } catch(_) {}
    this._slideshowLoadWaitCleanup = null;
        this._removeMediaEndedHandler();
        if (!this.currentGallery || !this.slideshowActive) return;

        const currentItem = this.currentGallery.currItem;
        if (!currentItem) return;

        // If current slide contains a video or audio, play and advance on end
    const container = currentItem.container;
        if (container) {
            // Prefer specific video id if provided
            let mediaEl = null;
            if (currentItem.videoId) {
                mediaEl = document.getElementById(currentItem.videoId);
            }
            if (!mediaEl) {
                mediaEl = container.querySelector('video, audio');
            }

            if (mediaEl) {
                this._currentMediaEl = mediaEl;
                // Pause any other media elements currently playing in the gallery to ensure only one plays at a time
                try {
                    const all = this.currentGallery && this.currentGallery.template ? this.currentGallery.template.querySelectorAll('video, audio') : [];
                    all && all.forEach && all.forEach(el => { if (el !== mediaEl) { try { el.pause && el.pause(); } catch(_) {} } });
                } catch(_) {}
                const handler = () => {
                    if (!this.slideshowActive) return;
                    // If user used the player's own fullscreen, exit it first to avoid frozen last frame overlay
                    const wasFs = this._isElementInNativeFullscreen(mediaEl);
                    if (wasFs) {
                        let exited = false;
                        const proceed = () => { 
                            if (this.slideshowActive) {
                                // Stop any playing media before advancing
                                window.photoSwipeHelpers.stopAllMedia();
                                this.next(); 
                            }
                        };
                        const onFsChange = () => {
                            exited = true;
                            try {
                                document.removeEventListener('fullscreenchange', onFsChange);
                                document.removeEventListener('webkitfullscreenchange', onFsChange);
                                document.removeEventListener('mozfullscreenchange', onFsChange);
                                document.removeEventListener('MSFullscreenChange', onFsChange);
                                // iOS-specific end event on video element
                                mediaEl.removeEventListener('webkitendfullscreen', onFsChange);
                            } catch(_) {}
                            proceed();
                        };
                        document.addEventListener('fullscreenchange', onFsChange);
                        document.addEventListener('webkitfullscreenchange', onFsChange);
                        document.addEventListener('mozfullscreenchange', onFsChange);
                        document.addEventListener('MSFullscreenChange', onFsChange);
                        // iOS Safari fires this on the video element
                        try { mediaEl.addEventListener('webkitendfullscreen', onFsChange, { once: true }); } catch(_) {}
                        try { this._exitNativeFullscreen(mediaEl); } catch(_) {}
                        // Fallback if no event fires
                        setTimeout(() => {
                            if (!exited) {
                                try {
                                    document.removeEventListener('fullscreenchange', onFsChange);
                                    document.removeEventListener('webkitfullscreenchange', onFsChange);
                                    document.removeEventListener('mozfullscreenchange', onFsChange);
                                    document.removeEventListener('MSFullscreenChange', onFsChange);
                                    mediaEl.removeEventListener('webkitendfullscreen', onFsChange);
                                } catch(_) {}
                                proceed();
                            }
                        }, 400);
                        return;
                    }
                    // Stop any playing media before advancing
                    window.photoSwipeHelpers.stopAllMedia();
                    this.next();
                };
                this._currentMediaEndedHandler = handler;
                try { mediaEl.removeEventListener('ended', handler); } catch (e) {}
                mediaEl.addEventListener('ended', handler, { once: true });
                // Avoid any stale preventPlay handlers that could pause autoplay on slideshow
                try {
                    if (mediaEl._cdPreventPlayHandler) {
                        mediaEl.removeEventListener('play', mediaEl._cdPreventPlayHandler);
                        mediaEl.removeEventListener('playing', mediaEl._cdPreventPlayHandler);
                        delete mediaEl._cdPreventPlayHandler;
                    }
                } catch(_) {}
                // Prepare element for iOS autoplay and try to play
                this._prepareAndPlayMediaForSlideshow(mediaEl);
                return; // Do not set timeout; advance when media ends
            }
        }

        // Fallback: image or no media - advance after configured seconds,
        // but only start counting once the image is fully rendered.
        this._scheduleImageAdvanceAfterRendered();
    },

    _scheduleImageAdvanceAfterRendered: function() {
        const g = this.currentGallery;
        if (!g || !this.slideshowActive) return;
        const token = ++this._slideshowToken;

        const advanceAfterDelay = () => {
            if (!this.slideshowActive || !this.currentGallery || token !== this._slideshowToken) return;
            // Do not advance while user is navigating (e.g., mid-drag)
            if (this._isNavigating) { this._scheduleImageAdvanceAfterRendered(); return; }
            this.slideshowTimer = setTimeout(() => {
                if (!this.slideshowActive || !this.currentGallery || token !== this._slideshowToken) return;
                const g2 = this.currentGallery;
                const isLast = g2.getCurrentIndex && (g2.getCurrentIndex() >= g2.items.length - 1);
                if (isLast) {
                    let loop = false;
                    try {
                        const v = localStorage.getItem('cd.slideshowLoop');
                        loop = (v === '1' || v === 'true');
                    } catch (e) {}
                    if (loop) {
                        // Set slideshow advancing flag before navigation
                        this._slideshowAdvancing = true;
                        g2.goTo(0);
                    } else {
                        this.stopSlideshow();
                    }
                } else {
                    // Stop any playing media before advancing in slideshow
                    window.photoSwipeHelpers.stopAllMedia();
                    // Set slideshow advancing flag before navigation
                    this._slideshowAdvancing = true;
                    this.next();
                }
            }, this.slideshowSeconds * 1000);
        };

    const item = g.currItem;
    const readyNow = () => {
            try {
                if (!item) return false;
        if (item.loadComplete === true || item.loaded === true) return true; // PhotoSwipe marks when image is loaded
        const img = item.container && item.container.querySelector && item.container.querySelector('.pswp__img');
                return !!(img && img.complete && img.naturalWidth > 0);
            } catch (_) { return false; }
        };

        const cleanup = () => {
            try { if (imgEl && onImgLoad) imgEl.removeEventListener('load', onImgLoad, true); } catch(_) {}
            try { if (offPswp) offPswp(); } catch(_) {}
            try { if (fallbackTimer) clearTimeout(fallbackTimer); } catch(_) {}
            this._slideshowLoadWaitCleanup = null;
        };

        if (readyNow()) {
            // One RAF to yield to paint
            requestAnimationFrame(advanceAfterDelay);
            return;
        }

        let imgEl = null;
        try { imgEl = item && item.container && item.container.querySelector && item.container.querySelector('.pswp__img'); } catch(_) {}
        const onImgLoad = () => {
            if (!this.slideshowActive || token !== this._slideshowToken) { cleanup(); return; }
            cleanup();
            requestAnimationFrame(advanceAfterDelay);
        };
        if (imgEl) { try { imgEl.addEventListener('load', onImgLoad, true); } catch(_) {} }

        let offPswp = null;
        try {
            const idx = g.getCurrentIndex ? g.getCurrentIndex() : -1;
            const listener = (i) => {
                if (!this.slideshowActive || token !== this._slideshowToken) return;
                const same = (g.getCurrentIndex && g.getCurrentIndex() === i);
                if (same) onImgLoad();
            };
            g.listen('imageLoadComplete', listener);
            offPswp = () => { try { g.unlisten('imageLoadComplete', listener); } catch(_) {} };
        } catch(_) {}

        const fallbackTimer = setTimeout(() => {
            if (!this.slideshowActive || token !== this._slideshowToken) { cleanup(); return; }
            cleanup();
            advanceAfterDelay();
        }, 6000);
        this._slideshowLoadWaitCleanup = cleanup;
    },

    _installUserStopHandlers: function() {
        if (this._userStopHandlersInstalled) return;
        const root = (this.currentGallery && this.currentGallery.template) || document;
        const isInControls = (el) => !!(
            el && el.closest && (
                el.closest('.pswp__slideshow-controls') ||
                el.closest('.pswp__slideshow-input') ||
                el.closest('.pswp__button') ||        // All PhotoSwipe buttons (next, prev, close, zoom, etc.)
                el.closest('.pswp__top-bar') ||       // Top bar controls
                el.closest('.pswp__caption') ||       // Caption area controls
                el.closest('.pswp__counter')          // Counter area
            )
        );
        const stop = (e) => {
            const t = e && (e.target || document.activeElement);
            if (isInControls(t)) return;

            // Don't stop slideshow during programmatic navigation (slideshow auto-advance)
            if (this._slideshowAdvancing) return;

            // More selective about what stops slideshow:
            // NOTE: Wheel events are NOT included - they should continue slideshow like other navigation

            // 2. Handle specific key presses
            if (e && e.type === 'keydown') {
                // Navigation keys should NOT stop slideshow - they just navigate and continue
                if (e.key === 'ArrowLeft' || e.key === 'ArrowRight' ||
                    e.key === 'ArrowUp' || e.key === 'ArrowDown' ||
                    e.key === 'PageUp' || e.key === 'PageDown') {
                    return; // Don't stop slideshow
                }
                // Enter and Space can be navigation in PhotoSwipe, don't stop
                // Note: Spacebar is handled by global handler for slideshow toggle
                if (e.key === 'Enter' || e.key === ' ') {
                    return;
                }
                // ESC and other keys should stop slideshow
                this.stopSlideshow();
                return;
            }

            // 3. Click on media/background should stop slideshow only if it's not a navigation click
            if (e && (e.type === 'click' || e.type === 'touchend' || e.type === 'pointerup' || e.type === 'mouseup')) {
                // If click is during navigation transition, or immediately after a drag/swipe, don't stop slideshow
                if (this._isNavigating) return;
                if (this._suppressClickUntil && Date.now() < this._suppressClickUntil) return;
                this.stopSlideshow();
                return;
            }

            // 4. Pointer move: don't stop slideshow for swipe navigation.
            // Only stop if it's clearly a pan on a zoomed-in item (zoom level > fit).
            if (e && e.type === 'pointermove') {
                // Only consider mouse drags (not touch) with button pressed
                if (typeof e.buttons === 'number' && e.buttons !== 0 && e.pointerType !== 'touch') {
                    try {
                        const g = this.currentGallery;
                        const fit = this._fitScaleForCurrent();
                        const level = g && g.getZoomLevel ? g.getZoomLevel() : null;

                        // If zoomed-in beyond fit, treat as panning => stop slideshow; otherwise assume swipe navigation
                        if (fit && level && level > fit + 0.01) {
                            this.stopSlideshow();
                        }
                    } catch (_) { /* ignore */ }
                }
                return;
            }
            // Remove touchmove stopping entirely - these are navigation gestures
        };
        this._boundUserStopHandler = stop.bind(this);
        // Attach specific events: click, pointermove (selective), keydown (selective)
        // NOTE: wheel events removed - they should continue slideshow like other navigation
        root.addEventListener('click', this._boundUserStopHandler, { capture: true });
        root.addEventListener('pointermove', this._boundUserStopHandler, { capture: true });
        window.addEventListener('keydown', this._boundUserStopHandler, { capture: true });
        // Note: removed touchmove and wheel - they're navigation and should not stop slideshow
        this._userStopHandlersInstalled = true;
    },

    _removeUserStopHandlers: function() {
        if (!this._userStopHandlersInstalled) return;
        const root = (this.currentGallery && this.currentGallery.template) || document;
        try {
            root.removeEventListener('click', this._boundUserStopHandler, { capture: true });
            root.removeEventListener('pointermove', this._boundUserStopHandler, { capture: true });
            window.removeEventListener('keydown', this._boundUserStopHandler, { capture: true });
            // Note: no touchmove or wheel to remove since we don't listen for them anymore
        } catch (e) {}
        this._boundUserStopHandler = null;
        this._userStopHandlersInstalled = false;
    },

    _installGlobalSpacebarHandler: function() {
        if (this._globalSpacebarInstalled) return;

        const spacebarHandler = (e) => {
            // Only handle spacebar and only when PhotoSwipe is active
            if (e.key === ' ' && this.currentGallery) {
                e.preventDefault(); // Prevent page scrolling

                const updateSlideshowButtonIcon = () => {
                    // Find the slideshow button and update its icon
                    const slideshowBtn = this.currentGallery.template.querySelector('.pswp__button--slideshow');
                    if (slideshowBtn) {
                        // Prefer FA <i> icon if present
                        const iEl = slideshowBtn.querySelector('i');
                        if (iEl) {
                            try { iEl.classList.remove('fa-play'); iEl.classList.remove('fa-pause'); } catch(_) {}
                            try { iEl.classList.remove('fas'); iEl.classList.add('fa'); } catch(_) {}
                            iEl.classList.add(this.slideshowActive ? 'fa-pause' : 'fa-play');
                        } else {
                            const icon = slideshowBtn.querySelector('svg');
                            if (icon) {
                                while (icon.firstChild) icon.removeChild(icon.firstChild);
                                if (this.slideshowActive) {
                                    const pathPause1 = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
                                    pathPause1.setAttribute('x', '6'); pathPause1.setAttribute('y', '5'); pathPause1.setAttribute('width', '4'); pathPause1.setAttribute('height', '14');
                                    const pathPause2 = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
                                    pathPause2.setAttribute('x', '14'); pathPause2.setAttribute('y', '5'); pathPause2.setAttribute('width', '4'); pathPause2.setAttribute('height', '14');
                                    icon.appendChild(pathPause1); icon.appendChild(pathPause2);
                                } else {
                                    const pathPlay = document.createElementNS('http://www.w3.org/2000/svg', 'path');
                                    pathPlay.setAttribute('d', 'M8 5v14l11-7z');
                                    icon.appendChild(pathPlay);
                                }
                            }
                        }

                        // Update title and aria-label
                        const startTitle = 'Start slideshow';
                        const stopTitle = 'Stop slideshow';
                        slideshowBtn.title = this.slideshowActive ? stopTitle : startTitle;
                        slideshowBtn.setAttribute('aria-label', this.slideshowActive ? stopTitle : startTitle);
                    }
                };

                if (this.slideshowActive) {
                    this.stopSlideshow();
                    // If we have a shared updater from injection, use it; else fallback
                    if (typeof this._updateSlideshowButtonIcon === 'function') {
                        try { this._updateSlideshowButtonIcon(); } catch(_) { updateSlideshowButtonIcon(); }
                    } else {
                        updateSlideshowButtonIcon();
                    }
                } else {
                    // Start slideshow with default or saved interval
                    let seconds = 5;
                    try {
                        const saved = localStorage.getItem('cd.slideshowSeconds');
                        const n = parseInt(saved, 10);
                        if (!isNaN(n) && n >= 1 && n <= 3600) seconds = n;
                    } catch(_) {}
                    this.startSlideshow(seconds);
                    // Update immediately via shared updater if available, else local
                    if (typeof this._updateSlideshowButtonIcon === 'function') {
                        try { this._updateSlideshowButtonIcon(); } catch(_) { updateSlideshowButtonIcon(); }
                    } else {
                        updateSlideshowButtonIcon();
                    }
                }
            }
        };

        this._boundGlobalSpacebarHandler = spacebarHandler.bind(this);
        window.addEventListener('keydown', this._boundGlobalSpacebarHandler, { capture: true });
        this._globalSpacebarInstalled = true;
    },

    _removeGlobalSpacebarHandler: function() {
        if (!this._globalSpacebarInstalled) return;
        try {
            window.removeEventListener('keydown', this._boundGlobalSpacebarHandler, { capture: true });
        } catch (e) {}
        this._boundGlobalSpacebarHandler = null;
        this._globalSpacebarInstalled = false;
    },

    // Get image size
    getImageSize: function(dotNetRef, url, callbackMethodName) {
        const img = new Image();
        try {
            img.referrerPolicy = 'no-referrer';
        } catch (e) {}
        img.onload = function() {
            dotNetRef.invokeMethodAsync(callbackMethodName, url, this.width, this.height);
        };
        img.onerror = function() {
            dotNetRef.invokeMethodAsync(callbackMethodName, url, -1, -1);
        };
        img.src = url;
    },

    // Internal: patch HTMLImageElement to default referrerPolicy before any src/srcset assignment
    _applyNoReferrerImagePatch: function() {
        if (this._imgPatched) return;
        try {
            const proto = HTMLImageElement.prototype;
            if (!this._imgSrcDescriptor) {
                this._imgSrcDescriptor = Object.getOwnPropertyDescriptor(proto, 'src');
            }
            if (!this._imgSrcsetDescriptor) {
                this._imgSrcsetDescriptor = Object.getOwnPropertyDescriptor(proto, 'srcset');
            }

            if (this._imgSrcDescriptor && this._imgSrcDescriptor.set) {
                const originalSet = this._imgSrcDescriptor.set;
                const originalGet = this._imgSrcDescriptor.get;
                Object.defineProperty(proto, 'src', {
                    configurable: true,
                    enumerable: true,
                    get: function() { return originalGet.call(this); },
                    set: function(value) {
                        try {
                            this.referrerPolicy = 'no-referrer';
                            this.setAttribute && this.setAttribute('referrerpolicy', 'no-referrer');
                        } catch (e) {}
                        return originalSet.call(this, value);
                    }
                });
            }

            if (this._imgSrcsetDescriptor && this._imgSrcsetDescriptor.set) {
                const originalSet = this._imgSrcsetDescriptor.set;
                const originalGet = this._imgSrcsetDescriptor.get;
                Object.defineProperty(proto, 'srcset', {
                    configurable: true,
                    enumerable: true,
                    get: function() { return originalGet.call(this); },
                    set: function(value) {
                        try {
                            this.referrerPolicy = 'no-referrer';
                            this.setAttribute && this.setAttribute('referrerpolicy', 'no-referrer');
                        } catch (e) {}
                        return originalSet.call(this, value);
                    }
                });
            }

            this._imgPatched = true;
        } catch (e) {
            console.warn('[PhotoSwipe] Failed to apply image referrer patch:', e.message);
        }
    },

    // Internal: restore original HTMLImageElement descriptors
    _removeNoReferrerImagePatch: function() {
        if (!this._imgPatched) return;
        try {
            const proto = HTMLImageElement.prototype;
            if (this._imgSrcDescriptor) {
                Object.defineProperty(proto, 'src', this._imgSrcDescriptor);
            }
            if (this._imgSrcsetDescriptor) {
                Object.defineProperty(proto, 'srcset', this._imgSrcsetDescriptor);
            }
            this._imgPatched = false;
        } catch (e) {
            console.warn('[PhotoSwipe] Failed to remove image referrer patch:', e.message);
        }
    },

    // Load subtitles for a video element
    loadSubtitlesForVideo: async function(videoId, subtitleFiles) {
        if (!subtitleFiles || subtitleFiles.length === 0) {
            return;
        }

        const videoElement = document.getElementById(videoId);
        if (!videoElement) {
            return;
        }

        // Check if video element already has subtitle tracks loaded
        const existingTracks = videoElement.querySelectorAll('track');
        if (existingTracks.length > 0) {
            // Ensure first track is enabled
            if (videoElement.textTracks && videoElement.textTracks.length > 0) {
                const firstTrack = videoElement.textTracks[0];
                if (firstTrack.mode !== 'showing') {
                    firstTrack.mode = 'showing';
                }
            }
            // Mark as loaded for future reference
            this.loadedVideos.add(videoId);
            return;
        }


        // Mark this video as being processed
        this.loadedVideos.add(videoId);


        // Remove existing track elements before adding new ones
        const currentTracks = videoElement.querySelectorAll('track');
        currentTracks.forEach(track => {
            track.remove();
        });

        let successfullyLoaded = 0;

        // Load each subtitle file
        for (let i = 0; i < subtitleFiles.length; i++) {
            const subtitle = subtitleFiles[i];
            
            try {
                
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
                }
                
                trackElement.addEventListener('error', function(e) {
                    console.error('[PhotoSwipe] Track failed to load:', subtitle.name, e);
                });
                
                videoElement.appendChild(trackElement);
                successfullyLoaded++;
                
            } catch (error) {
                console.warn('[PhotoSwipe] Failed to process subtitle:', subtitle.name, error.message);
            }
        }


        // Enable first track if available
        if (successfullyLoaded > 0) {
            setTimeout(() => {
                if (videoElement.textTracks && videoElement.textTracks.length > 0) {
                    const firstTrack = videoElement.textTracks[0];
                    if (firstTrack.mode !== 'showing') {
                        firstTrack.mode = 'showing';
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
        }
    },

    // Stop all currently playing media (videos and audio)
    stopAllMedia: function() {
        try {
            // Find all video and audio elements in the PhotoSwipe gallery
            if (this.currentGallery && this.currentGallery.template) {
                const mediaElements = this.currentGallery.template.querySelectorAll('video, audio');
                mediaElements.forEach(media => {
                    try {
                        // Always pause media when stopping (e.g., before navigation) so previous videos don't continue playing
                        if (!media.paused) {
                            media.pause();
                        }
                        // Only reset playback position and remove autoplay when slideshow is not active
                        if (!this.slideshowActive) {
                            media.currentTime = 0;
                            media.removeAttribute('autoplay');
                        }
                    } catch (e) {
                        console.warn('[PhotoSwipe] Failed to pause media element:', e.message);
                    }
                });
            }
        } catch (e) {
            console.warn('[PhotoSwipe] Error stopping media:', e.message);
        }
    },

    // Prevent media autoplay during navigation
    preventMediaAutoplay: function() {
        try {
            if (this.currentGallery && this.currentGallery.template) {
                const mediaElements = this.currentGallery.template.querySelectorAll('video, audio');
                mediaElements.forEach(media => {
                    try {
                        // Add event listeners to prevent autoplay
                        const preventPlay = (e) => {
                            // Do not prevent autoplay when slideshow is active; allow next/prev video to auto-play
                            if (this._isNavigating && !this.slideshowActive) {
                                // If this media has a temporary user-allow flag, let it play
                                if (media.dataset && media.dataset.cdAllowPlay === '1') {
                                    return;
                                }
                                e.preventDefault();
                                e.stopPropagation();
                                media.pause();
                            }
                        };
                        
                        // Remove existing listeners to avoid duplicates
                        media.removeEventListener('play', preventPlay);
                        media.removeEventListener('playing', preventPlay);
                        
                        // Add new listeners
                        media.addEventListener('play', preventPlay);
                        media.addEventListener('playing', preventPlay);
                        
                        // Store reference for cleanup
                        media._cdPreventPlayHandler = preventPlay;
                    } catch (e) {
                        console.warn('[PhotoSwipe] Failed to add prevent play handler:', e.message);
                    }
                });
            }
        } catch (e) {
            console.warn('[PhotoSwipe] Error preventing media autoplay:', e.message);
        }
    },

    // Clean up media event listeners
    cleanupMediaEventListeners: function() {
        try {
            if (this.currentGallery && this.currentGallery.template) {
                const mediaElements = this.currentGallery.template.querySelectorAll('video, audio');
                mediaElements.forEach(media => {
                    try {
                        if (media._cdPreventPlayHandler) {
                            media.removeEventListener('play', media._cdPreventPlayHandler);
                            media.removeEventListener('playing', media._cdPreventPlayHandler);
                            delete media._cdPreventPlayHandler;
                        }
                    } catch (e) {
                        console.warn('[PhotoSwipe] Failed to remove prevent play handler:', e.message);
                    }
                });
            }
        } catch (e) {
            console.warn('[PhotoSwipe] Error cleaning up media event listeners:', e.message);
        }
    },

    // Remove background click handler
    _removeBackgroundClickHandler: function() {
        try {
            if (this.currentGallery && this.currentGallery._backgroundClickHandler && this.currentGallery._backgroundElements) {
                const handler = this.currentGallery._backgroundClickHandler;
                const elements = this.currentGallery._backgroundElements;
                const dragHandlers = this.currentGallery._dragHandlers;

                // Remove click listeners
                elements.forEach(element => {
                    if (element) {
                        element.removeEventListener('click', handler);
                    }
                });

                // Remove drag tracking listeners from template
                if (dragHandlers && this.currentGallery.template) {
                    const template = this.currentGallery.template;
                    template.removeEventListener('pointerdown', dragHandlers.onPointerDown);
                    template.removeEventListener('pointermove', dragHandlers.onPointerMove);
                    template.removeEventListener('pointerup', dragHandlers.onPointerUp);
                    template.removeEventListener('pointercancel', dragHandlers.onPointerUp);
                    template.removeEventListener('touchstart', dragHandlers.onPointerDown);
                    template.removeEventListener('touchmove', dragHandlers.onPointerMove);
                    template.removeEventListener('touchend', dragHandlers.onPointerUp);
                    template.removeEventListener('touchcancel', dragHandlers.onPointerUp);
                }

                this.currentGallery._backgroundClickHandler = null;
                this.currentGallery._dragHandlers = null;
                this.currentGallery._backgroundElements = null;
            }
        } catch (e) {
            console.warn('[PhotoSwipe] Failed to remove background click handler:', e.message);
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
