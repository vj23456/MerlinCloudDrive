// Ultra-aggressive cache clearing - USE ONLY when explicitly requested by user
// This is designed for the "Clear Cache and Reload" button in About page
// For normal operation, browser should use standard HTTP caching based on file modification times
window.blazorClearCacheAndReload = () => {
    // Step 1: Immediately bust all CSS cache before clearing
    bustAllCssImmediately();
    
    // Step 2: Clear all browser caches aggressively
    clearAllBrowserCaches().then(() => {
        // Step 3: Clear Service Worker caches
        return caches.keys().then(function (cacheNames) {
            return Promise.all(
                cacheNames.map(function (cacheName) {
                    return caches.delete(cacheName);
                })
            );
        });
    }).then(() => {
        
        // Step 4: Aggressively clear all CSS including Blazor scoped CSS
        return clearBlazorScopedCssCache();
        
    }).then(() => {
        // Step 5: Clear JavaScript and other static resources
        clearStaticResourceCache();
        
        // Step 6: Wait a moment then perform simple reload (no post-reload cache busting)
        setTimeout(() => {
            performSimpleReload();
        }, 500);
        
    }).catch(error => {
        // Force reload even if cache clearing fails
        setTimeout(() => {
            performSimpleReload();
        }, 500);
    });
};

// Simple file input trigger function
window.triggerFileInputClick = (elementId) => {
    try {
        const element = document.getElementById(elementId);
        if (element) {
            element.click();
            return true;
        }
        return false;
    } catch (error) {
        console.error('Error triggering file input:', error);
        return false;
    }
};

// Simple reload without aggressive post-reload cache busting
function performSimpleReload() {
    try {
        // Simple reload without cache busting parameters
        window.location.reload(true);
    } catch (e) {
        try {
            window.location.href = window.location.href;
        } catch (e2) {
            window.location.reload();
        }
    }
}

// New function to immediately bust CSS cache
function bustAllCssImmediately() {
    // Get all CSS links
    const allCssLinks = document.querySelectorAll('link[rel="stylesheet"]');
    
    allCssLinks.forEach((link, index) => {
        const originalHref = link.href.split('?')[0];
        const url = new URL(originalHref);
        
        // Add aggressive cache-busting parameters
        url.searchParams.set('v', Date.now() + index);
        url.searchParams.set('immediate-bust', 'true');
        url.searchParams.set('no-cache', Math.random().toString(36).substring(7));
        url.searchParams.set('force', '1');
        
        // Update the href immediately
        link.href = url.toString();
    });
}

// New ultra-aggressive reload function
function performUltraAggressiveReload() {
    // Step 1: Clear any remaining caches one final time
    const finalCacheClear = () => {
        if ('caches' in window) {
            return caches.keys().then(cacheNames => {
                return Promise.all(cacheNames.map(cacheName => {
                    return caches.delete(cacheName);
                }));
            });
        }
        return Promise.resolve();
    };
    
    // Step 2: Disable browser cache for this session
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.getRegistrations().then(registrations => {
            return Promise.all(registrations.map(reg => reg.unregister()));
        }).then(() => {
            proceedWithUltraReload();
        }).catch(() => {
            proceedWithUltraReload();
        });
    } else {
        proceedWithUltraReload();
    }
}

function proceedWithUltraReload() {
    // Only set cache busting flags if user explicitly wants post-reload cache busting
    // For normal operation, we want the page to load with standard caching after reload
    const enablePostReloadCacheBusting = false; // Change to true only if needed
    
    if (enablePostReloadCacheBusting) {
        const ultraTimestamp = Date.now();
        const cacheKiller = Math.random().toString(36).substring(2, 15);
        
        try {
            sessionStorage.setItem('blazor-ultra-cache-bust', ultraTimestamp);
            sessionStorage.setItem('blazor-cache-killer', cacheKiller);
            sessionStorage.setItem('blazor-force-refresh', 'true');
        } catch (e) {
        }
    }
    
    // Method 1: Try the most aggressive approach - replace current page with cache-busted URL
    try {
        const currentUrl = new URL(window.location.href);
        
        // Remove any existing cache busting params first
        currentUrl.searchParams.delete('v');
        currentUrl.searchParams.delete('force-reload');
        currentUrl.searchParams.delete('cache-bust');
        currentUrl.searchParams.delete('blazor-refresh');
        currentUrl.searchParams.delete('no-cache');
        currentUrl.searchParams.delete('disable-cache');
        currentUrl.searchParams.delete('timestamp');
        
        // Add ultra-aggressive cache busting
        currentUrl.searchParams.set('v', ultraTimestamp);
        currentUrl.searchParams.set('force-reload', 'ultra');
        currentUrl.searchParams.set('cache-bust', cacheKiller);
        currentUrl.searchParams.set('blazor-refresh', 'complete');
        currentUrl.searchParams.set('no-cache', '1');
        currentUrl.searchParams.set('disable-cache', 'true');
        currentUrl.searchParams.set('timestamp', ultraTimestamp);
        currentUrl.searchParams.set('css-force', '1');
        currentUrl.searchParams.set('browser-cache-disable', 'true');
        
        // Use window.location.replace to avoid history entry and force reload
        window.location.replace(currentUrl.toString());
        
    } catch (e) {
        
        // Backup method 1: Force reload with true flag
        try {
            window.location.reload(true);
        } catch (e2) {
            // Backup method 2: Direct href assignment with cache busting
            try {
                const baseUrl = window.location.href.split('?')[0];
                window.location.href = baseUrl + '?v=' + ultraTimestamp + '&force=ultra&no-cache=1&cache-bust=' + cacheKiller + '&css-force=1';
            } catch (e3) {
                // Last resort
                window.location.reload();
            }
        }
    }
}

// Comprehensive browser cache clearing function
function clearAllBrowserCaches() {
    const promises = [];
    
    // Clear HTTP cache if available
    if ('caches' in window) {
        promises.push(
            caches.keys().then(cacheNames => {
                return Promise.all(cacheNames.map(cacheName => caches.delete(cacheName)));
            })
        );
    }
    
    // Skip localStorage and sessionStorage clearing to preserve user data
    
    // Clear IndexedDB if available
    if ('indexedDB' in window) {
        promises.push(
            new Promise((resolve) => {
                try {
                    indexedDB.databases().then(databases => {
                        return Promise.all(databases.map(db => {
                            const deleteReq = indexedDB.deleteDatabase(db.name);
                            return new Promise((resolveDb) => {
                                deleteReq.onsuccess = () => resolveDb();
                                deleteReq.onerror = () => resolveDb();
                                deleteReq.onblocked = () => resolveDb();
                            });
                        }));
                    }).then(() => {
                        resolve();
                    }).catch(() => resolve());
                } catch (e) {
                    resolve();
                }
            })
        );
    }
    
    return Promise.all(promises);
}

// Enhanced Blazor scoped CSS cache clearing
function clearBlazorScopedCssCache() {
    return new Promise((resolve) => {
        // Find all Blazor CSS isolation files with more comprehensive patterns
        const blazorCssSelectors = [
            'link[href*=".styles.css"]',
            'link[href*="scoped.styles.css"]', 
            'link[href*="bundle.scp.css"]',
            'link[href*=".razor.rz.scp.css"]',
            'link[href*=".blazor.css"]',
            'link[href*="bundled.css"]',
            'link[href*="_content/"]', // Blazor component CSS
            'link[href*="css/app.css"]',
            'link[href*="css/site.css"]',
            'link[href*="css/modern.css"]'
        ];
        
        const blazorCssLinks = document.querySelectorAll(blazorCssSelectors.join(', '));
        
        // Step 1: Remove all existing CSS links completely
        blazorCssLinks.forEach((link) => {
            link.remove();
        });
        
        // Step 2: Wait a moment for DOM to process removal
        setTimeout(() => {
            // Step 3: Recreate all CSS links with ultra-aggressive cache busting
            const timestamp = Date.now();
            const randomId = Math.random().toString(36).substring(2, 15);
            
            blazorCssLinks.forEach((oldLink, index) => {
                const originalHref = oldLink.href.split('?')[0];
                const url = new URL(originalHref);
                
                // Add multiple layers of cache-busting parameters
                url.searchParams.set('v', timestamp + index);
                url.searchParams.set('blazor-refresh', 'ultra');
                url.searchParams.set('cache-killer', randomId + index);
                url.searchParams.set('force-reload', '1');
                url.searchParams.set('no-cache', 'true');
                url.searchParams.set('disable-cache', '1');
                url.searchParams.set('timestamp', timestamp);
                url.searchParams.set('random', Math.random().toString(36).substring(2));
                url.searchParams.set('browser-cache-kill', '1');
                url.searchParams.set('server-cache-kill', '1');
                url.searchParams.set('cdn-cache-kill', '1');
                
                // Create completely new link element
                const newLink = document.createElement('link');
                newLink.rel = 'stylesheet';
                newLink.type = 'text/css';
                newLink.href = url.toString();
                
                // Add cache control attributes
                newLink.setAttribute('data-cache-bust', timestamp);
                newLink.setAttribute('data-force-reload', 'true');
                
                // Add aggressive cache control headers via attributes
                newLink.setAttribute('data-no-cache', 'true');
                newLink.setAttribute('data-force-fresh', '1');
                
                // Add onload/onerror handlers for monitoring
                newLink.onload = () => {
                };
                
                newLink.onerror = () => {
                };
                
                // Insert into document head
                document.head.appendChild(newLink);
            });
            
            // Step 4: Also handle regular CSS files
            const regularCssLinks = document.querySelectorAll('link[rel="stylesheet"]:not([href*=".styles.css"]):not([href*="scoped.styles.css"]):not([href*="bundle.scp.css"])');
            
            regularCssLinks.forEach((link, index) => {
                const originalHref = link.href.split('?')[0];
                const url = new URL(originalHref);
                url.searchParams.set('v', timestamp + index);
                url.searchParams.set('css-refresh', 'ultra');
                url.searchParams.set('no-cache', 'true');
                url.searchParams.set('timestamp', timestamp);
                link.href = url.toString();
            });
            
            // Step 5: Force style recalculation
            document.body.offsetHeight; // Trigger reflow
            
            resolve();
        }, 100); // Small delay to ensure DOM processes the removal
    });
}
            
// Clear static resource cache
function clearStaticResourceCache() {
    // Clear JavaScript files
    const scripts = document.querySelectorAll('script[src]');
    scripts.forEach((script, index) => {
        const originalSrc = script.src.split('?')[0];
        const url = new URL(originalSrc);
        url.searchParams.set('v', Date.now() + index);
        url.searchParams.set('js-refresh', 'true');
        script.src = url.toString();
    });
    
    // Clear images
    const images = document.querySelectorAll('img[src]');
    images.forEach((img, index) => {
        const originalSrc = img.src.split('?')[0];
        const url = new URL(originalSrc);
        url.searchParams.set('v', Date.now() + index);
        img.src = url.toString();
    });
    
    // Clear fonts and other resources
    const links = document.querySelectorAll('link[href]:not([rel="stylesheet"])');
    links.forEach((link, index) => {
        const originalHref = link.href.split('?')[0];
        const url = new URL(originalHref);
        url.searchParams.set('v', Date.now() + index);
        link.href = url.toString();
    });
}

// Specialized function to clear only CSS cache without full reload
window.blazorClearCssCache = () => {
    return new Promise((resolve) => {
        // Clear CSS-related caches from service worker
        if ('caches' in window) {
            caches.keys().then(cacheNames => {
                const cssPromises = cacheNames.map(cacheName => {
                    return caches.open(cacheName).then(cache => {
                        return cache.keys().then(requests => {
                            const cssRequests = requests.filter(request => 
                                request.url.includes('.css') || 
                                request.url.includes('.styles.css') ||
                                request.url.includes('scoped.styles.css') ||
                                request.url.includes('bundle.scp.css') ||
                                request.url.includes('razor.css') ||
                                request.url.includes('.blazor.css') ||
                                request.url.includes('_content/') ||
                                request.url.includes('bundled.css')
                            );
                            return Promise.all(cssRequests.map(request => {
                                return cache.delete(request);
                            }));
                        });
                    });
                });
                return Promise.all(cssPromises);
            }).then(() => {
                
                // Force reload all CSS files with aggressive cache busting
                return clearBlazorScopedCssCache();
                
            }).then(() => {
                // Additional CSS refresh after a delay
                setTimeout(() => {
                    const allCssLinks = document.querySelectorAll('link[rel="stylesheet"]');
                    allCssLinks.forEach((link, index) => {
                        const originalHref = link.href.split('?')[0];
                        const url = new URL(originalHref);
                        url.searchParams.set('v', Date.now() + index);
                        url.searchParams.set('css-only-refresh', 'true');
                        url.searchParams.set('timestamp', new Date().getTime());
                        link.href = url.toString();
                    });
                    resolve();
                }, 300);
            }).catch(error => {
                resolve();
            });
        } else {
            // Fallback when cache API is not available
            clearBlazorScopedCssCache().then(() => {
                resolve();
            });
        }
    });
};

function performHardReload() {
    // Step 1: Clear all caches one more time before reload
    const clearFinalCaches = () => {
        if ('caches' in window) {
            return caches.keys().then(cacheNames => {
                return Promise.all(cacheNames.map(cacheName => {
                    return caches.open(cacheName).then(cache => {
                        return cache.keys().then(requests => {
                            // Clear all requests, especially CSS
                            return Promise.all(requests.map(request => {
                                return cache.delete(request);
                            }));
                        });
                    });
                }));
            });
        }
        return Promise.resolve();
    };
    
    // Step 2: Perform the actual hard reload
    clearFinalCaches().then(() => {
        // Method 1: Try location.replace with cache busting (most aggressive)
        try {
            const url = new URL(window.location.href);
            url.searchParams.set('v', Date.now());
            url.searchParams.set('force-reload', 'true');
            url.searchParams.set('cache-bust', Math.random().toString(36).substring(7));
            url.searchParams.set('blazor-refresh', 'complete');
            
            window.location.replace(url.toString());
            return;
        } catch (e) {
        }
        
        // Method 2: Try location.reload with force flag
        try {
            window.location.reload(true);
            return;
        } catch (e) {
        }
        
        // Method 3: Fallback with href assignment
        try {
            const baseUrl = window.location.href.split('?')[0];
            window.location.href = baseUrl + '?v=' + Date.now() + '&force=true&blazor-reload=complete';
        } catch (e) {
            // Last resort: simple reload
            window.location.reload();
        }
        
    }).catch(error => {
        // Force reload even if final cache clearing fails
        try {
            window.location.reload(true);
        } catch (e) {
            window.location.reload();
        }
    });
}

// Blazor-specific aggressive CSS cache clearing (can be called independently)
window.blazorForceRefreshCss = () => {
    return new Promise((resolve) => {
        // Step 1: Clear browser HTTP cache for CSS
        if ('caches' in window) {
            caches.keys().then(cacheNames => {
                return Promise.all(cacheNames.map(cacheName => {
                    return caches.delete(cacheName);
                }));
            }).then(() => {
                proceedWithCssRefresh(resolve);
            }).catch(() => {
                proceedWithCssRefresh(resolve);
            });
        } else {
            proceedWithCssRefresh(resolve);
        }
    });
};

function proceedWithCssRefresh(resolve) {
    // Step 2: Remove all existing CSS links and recreate them
    const allCssLinks = Array.from(document.querySelectorAll('link[rel="stylesheet"]'));
    
    // Collect all CSS href values
    const cssHrefs = allCssLinks.map(link => ({
        href: link.href.split('?')[0], // Remove query params
        media: link.media || 'all',
        type: link.type || 'text/css',
        originalElement: link
    }));
    
    // Remove all existing CSS links
    allCssLinks.forEach(link => link.remove());
    
    // Wait a moment to ensure browser processes the removal
    setTimeout(() => {
        // Recreate all CSS links with aggressive cache busting
        const timestamp = Date.now();
        cssHrefs.forEach((cssInfo, index) => {
            const url = new URL(cssInfo.href);
            
            // Add multiple cache-busting parameters
            url.searchParams.set('v', timestamp + index);
            url.searchParams.set('blazor-force', 'true');
            url.searchParams.set('cache-killer', Math.random().toString(36).substring(2, 15));
            url.searchParams.set('reload-id', `${timestamp}-${index}`);
            
            // Create new link element
            const newLink = document.createElement('link');
            newLink.rel = 'stylesheet';
            newLink.type = cssInfo.type;
            newLink.href = url.toString();
            newLink.media = cssInfo.media;
            
            // Add to document head
            document.head.appendChild(newLink);
        });
        
        // Wait for CSS to load before resolving
        setTimeout(() => {
            resolve();
        }, 500);
    }, 100);
}

// Function that mimics Ctrl+F5 / Cmd+Shift+R behavior
window.blazorHardRefresh = () => {
    // Skip localStorage and sessionStorage clearing to preserve user data
    
    // Step 2: Clear all HTTP caches
    const clearAllCaches = async () => {
        if ('caches' in window) {
            try {
                const cacheNames = await caches.keys();
                await Promise.all(cacheNames.map(name => caches.delete(name)));
            } catch (e) {
            }
        }
    };
    
    // Step 3: Unregister all service workers
    const unregisterServiceWorkers = async () => {
        if ('serviceWorker' in navigator) {
            try {
                const registrations = await navigator.serviceWorker.getRegistrations();
                await Promise.all(registrations.map(reg => reg.unregister()));
            } catch (e) {
            }
        }
    };
    
    // Step 4: Perform the hard refresh
    Promise.all([clearAllCaches(), unregisterServiceWorkers()]).then(() => {
        
        // Use the most aggressive reload method available
        try {
            // Method 1: Try the force reload flag (equivalent to Ctrl+F5)
            window.location.reload(true);
        } catch (e) {
            try {
                // Method 2: Replace current location with cache-busting URL
                const url = new URL(window.location.href);
                url.searchParams.set('hard-refresh', Date.now());
                url.searchParams.set('force', 'true');
                window.location.replace(url.toString());
            } catch (e2) {
                // Method 3: Last resort
                window.location.href = window.location.href;
            }
        }
    }).catch(error => {
        // Force reload anyway
        window.location.reload(true);
    });
};

// Web Share API function for referral sharing
window.shareData = async (shareData) => {
    if (navigator.share) {
        try {
            await navigator.share(shareData);
        } catch (err) {
            // Fallback to copying to clipboard
            if (navigator.clipboard && shareData.text) {
                await navigator.clipboard.writeText(shareData.text);
            }
            throw err;
        }
    } else {
        // Web Share API not supported, copy to clipboard instead
        if (navigator.clipboard && shareData.text) {
            await navigator.clipboard.writeText(shareData.text);
        }
        throw new Error('Web Share API not supported');
    }
};

// Copy text to clipboard function
window.copyToClipboard = async (text) => {
    try {
        if (navigator.clipboard && window.isSecureContext) {
            // Use modern Clipboard API
            await navigator.clipboard.writeText(text);
        } else {
            // Fallback for older browsers or non-secure contexts
            const textArea = document.createElement('textarea');
            textArea.value = text;
            textArea.style.position = 'fixed';
            textArea.style.left = '-999999px';
            textArea.style.top = '-999999px';
            document.body.appendChild(textArea);
            textArea.focus();
            textArea.select();
            
            const successful = document.execCommand('copy');
            document.body.removeChild(textArea);
            
            if (!successful) {
                throw new Error('Copy command failed');
            }
        }
    } catch (err) {
        throw err;
    }
};

// Auto cache-busting on page load if flags are set
function checkAndApplyCacheBusting() {
    try {
        const shouldForceBust = sessionStorage.getItem('blazor-force-refresh');
        const cacheTimestamp = sessionStorage.getItem('blazor-ultra-cache-bust');
        const cacheKiller = sessionStorage.getItem('blazor-cache-killer');
        
        if (shouldForceBust === 'true' && cacheTimestamp && cacheKiller) {
            // Clear the flags immediately so this only happens once
            sessionStorage.removeItem('blazor-force-refresh');
            sessionStorage.removeItem('blazor-ultra-cache-bust');
            sessionStorage.removeItem('blazor-cache-killer');
            
            // Apply aggressive cache busting to all CSS files only this one time
            setTimeout(() => {
                const allCssLinks = document.querySelectorAll('link[rel="stylesheet"]');
                
                allCssLinks.forEach((link, index) => {
                    const originalHref = link.href.split('?')[0];
                    const url = new URL(originalHref);
                    
                    // Use the same timestamp and cache killer from before reload
                    url.searchParams.set('v', cacheTimestamp + index);
                    url.searchParams.set('post-reload-bust', 'true');
                    url.searchParams.set('cache-killer', cacheKiller + index);
                    url.searchParams.set('force-fresh', '1');
                    url.searchParams.set('no-cache', 'true');
                    url.searchParams.set('disable-browser-cache', '1');
                    url.searchParams.set('timestamp', Date.now());
                    
                    // Create new link element to force reload
                    const newLink = document.createElement('link');
                    newLink.rel = 'stylesheet';
                    newLink.type = 'text/css';
                    newLink.href = url.toString();
                    
                    // Replace the old link
                    link.parentNode.insertBefore(newLink, link);
                    link.remove();
                });
                
                // Force style recalculation
                document.body.offsetHeight;
                
                // Clean up URL by removing cache busting parameters after CSS has loaded
                setTimeout(() => {
                    cleanUpUrlParameters();
                }, 1000); // Wait longer for CSS to load before cleaning URL
            }, 100); // Small delay to ensure DOM is ready
        }
    } catch (e) {
    }
}

// Apply cache busting when page loads - DISABLED for normal operation
// Only enable when explicitly requested via Clear Cache button
// if (document.readyState === 'loading') {
//     document.addEventListener('DOMContentLoaded', checkAndApplyCacheBusting);
// } else {
//     checkAndApplyCacheBusting();
// }

// Note: Cache busting is now only applied when explicitly requested

// Add aggressive cache control meta tags to prevent any caching
function addCacheControlHeaders() {
    try {
        // Remove existing cache control meta tags
        const existingMeta = document.querySelectorAll('meta[http-equiv="Cache-Control"], meta[http-equiv="Pragma"], meta[http-equiv="Expires"]');
        existingMeta.forEach(meta => meta.remove());
        
        // Add aggressive no-cache headers
        const cacheControlMeta = document.createElement('meta');
        cacheControlMeta.setAttribute('http-equiv', 'Cache-Control');
        cacheControlMeta.setAttribute('content', 'no-cache, no-store, must-revalidate, max-age=0');
        document.head.appendChild(cacheControlMeta);
        
        const pragmaMeta = document.createElement('meta');
        pragmaMeta.setAttribute('http-equiv', 'Pragma');
        pragmaMeta.setAttribute('content', 'no-cache');
        document.head.appendChild(pragmaMeta);
        
        const expiresMeta = document.createElement('meta');
        expiresMeta.setAttribute('http-equiv', 'Expires');
        expiresMeta.setAttribute('content', '0');
        document.head.appendChild(expiresMeta);
    } catch (e) {
    }
}

// Enhanced cache clearing that also adds permanent cache control
window.blazorClearCacheAndReloadPermanent = () => {
    // Add cache control headers first
    addCacheControlHeaders();
    
    // Then proceed with normal cache clearing
    window.blazorClearCacheAndReload();
};

// Lighter cache clearing for normal use (respects browser caching)
window.blazorClearCssOnlyCache = () => {
    return new Promise((resolve) => {
        // Only clear CSS from service worker cache, don't force re-download everything
        if ('caches' in window) {
            caches.keys().then(cacheNames => {
                const cssPromises = cacheNames.map(cacheName => {
                    return caches.open(cacheName).then(cache => {
                        return cache.keys().then(requests => {
                            const cssRequests = requests.filter(request => 
                                request.url.includes('.css') || 
                                request.url.includes('.styles.css') ||
                                request.url.includes('scoped.styles.css') ||
                                request.url.includes('bundle.scp.css')
                            );
                            return Promise.all(cssRequests.map(request => {
                                return cache.delete(request);
                            }));
                        });
                    });
                });
                return Promise.all(cssPromises);
            }).then(() => {
                
                // Add modest cache busting to CSS only
                const allCssLinks = document.querySelectorAll('link[rel="stylesheet"]');
                allCssLinks.forEach((link, index) => {
                    const originalHref = link.href.split('?')[0];
                    const url = new URL(originalHref);
                    
                    // Simple cache busting - just add current timestamp
                    url.searchParams.set('v', Date.now() + index);
                    link.href = url.toString();
                });
                
                resolve();
            }).catch(error => {
                resolve();
            });
        } else {
            // Fallback - just add timestamp to CSS files
            const allCssLinks = document.querySelectorAll('link[rel="stylesheet"]');
            allCssLinks.forEach((link, index) => {
                const originalHref = link.href.split('?')[0];
                const url = new URL(originalHref);
                url.searchParams.set('v', Date.now() + index);
                link.href = url.toString();
            });
            resolve();
        }
    });
};

// Clean up URL parameters after cache busting
function cleanUpUrlParameters() {
    try {
        const currentUrl = new URL(window.location.href);
        let urlChanged = false;
        
        // List of cache-busting parameters to remove
        const cacheBustingParams = [
            'v',
            'force-reload',
            'cache-bust',
            'blazor-refresh',
            'no-cache',
            'disable-cache',
            'timestamp',
            'css-force',
            'browser-cache-disable',
            'hard-refresh',
            'force',
            'blazor-reload'
        ];
        
        // Remove each cache-busting parameter
        cacheBustingParams.forEach(param => {
            if (currentUrl.searchParams.has(param)) {
                currentUrl.searchParams.delete(param);
                urlChanged = true;
            }
        });
        
        // Update the URL without reloading if parameters were removed
        if (urlChanged) {
            const cleanUrl = currentUrl.toString();
            
            // Use replaceState to update URL without reload
            window.history.replaceState(null, '', cleanUrl);
        }
    } catch (e) {
    }
}

// Public function to manually clean up URL
window.blazorCleanUpUrl = () => {
    cleanUpUrlParameters();
};

// Function to trigger file input click
window.triggerFileInput = (fileInputElement) => {
    if (fileInputElement && fileInputElement.click) {
        fileInputElement.click();
    } else {
        console.error('File input element not found or click method not available');
    }
};

// Function to scroll an element to the end horizontally
window.scrollElementToEnd = (element) => {
    if (element && element.scrollLeft !== undefined) {
        // Scroll to the rightmost position
        element.scrollLeft = element.scrollWidth - element.clientWidth;
    }
};
