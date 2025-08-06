// OAuth service functions for authentication and authorization

// OAuth helper functions
window.oauthHelper = {
    // Store for OAuth windows and listeners
    oauthWindows: new Map(),
    oauthListeners: new Map(),
    storageListeners: new Map(),

    // Test function to verify localStorage events work
    testLocalStorageEvents: function() {
        console.log('[OAuth] Testing localStorage events...');
        
        const testListener = (event) => {
            console.log('[OAuth] Test storage event received:', event.key, event.newValue);
        };
        
        window.addEventListener('storage', testListener);
        
        localStorage.setItem('oauth_test', JSON.stringify({test: 'value', timestamp: Date.now()}));
        
        setTimeout(() => {
            localStorage.removeItem('oauth_test');
            window.removeEventListener('storage', testListener);
            console.log('[OAuth] Test completed');
        }, 2000);
    },

    // Setup OAuth listener with cross-tab communication
    setupOAuthListener: function(dotNetRef, cloudType) {
        const listenerId = 'oauth_' + Date.now() + '_' + cloudType;
        
        console.log(`[OAuth] Setting up listener for ${cloudType} with ID: ${listenerId}`);
        
        // STEP 1: Save current authentication token for OAuth callback to use
        try {
            // Get current token (check sessionStorage first, then localStorage)
            const sessionToken = sessionStorage.getItem('token');
            const localToken = localStorage.getItem('token');
            const currentToken = sessionToken || localToken;
            
            if (currentToken) {
                localStorage.setItem('oauth_temp_token', currentToken);
                
                // Verify it was saved
                const savedToken = localStorage.getItem('oauth_temp_token');
            } else {
                console.warn(`[OAuth] No current token found to save for ${cloudType}`);
                console.warn(`[OAuth] This will cause OAuth to fail with authentication error`);
            }
        } catch (tokenError) {
            console.error(`[OAuth] Failed to save temp token for ${cloudType}:`, tokenError);
        }
        
        // STEP 2: Clean up any existing storage items for this cloudType
        try {
            const existingSuccess = localStorage.getItem('oauth_success');
            if (existingSuccess) {
                const data = JSON.parse(existingSuccess);
                if (data.cloudType === cloudType) {
                    localStorage.removeItem('oauth_success');
                    console.log(`[OAuth] Cleaned up existing success item for ${cloudType}`);
                }
            }
            
            const existingError = localStorage.getItem('oauth_error');
            if (existingError) {
                const data = JSON.parse(existingError);
                if (data.cloudType === cloudType) {
                    localStorage.removeItem('oauth_error');
                    console.log(`[OAuth] Cleaned up existing error item for ${cloudType}`);
                }
            }
            
            // Also clean up any other OAuth-related keys for this cloud type
            this.cleanupOAuthStorage(cloudType);
        } catch (cleanupError) {
            console.warn(`[OAuth] Error during setup cleanup:`, cleanupError);
        }
        
        // Check for immediate callback (page refresh case)
        if (this.checkForOAuthCallback(dotNetRef)) {
            return listenerId;
        }
        
        // Setup storage listener for cross-tab communication
        const storageListener = (event) => {
            console.log(`[OAuth] Storage event received:`, event.key, event.newValue, event.oldValue);
            
            if (event.key === 'oauth_success' && event.newValue) {
                try {
                    const data = JSON.parse(event.newValue);
                    console.log(`[OAuth] Success data:`, data);
                    
                    if (data.cloudType === cloudType) {
                        console.log(`[OAuth] Success received from new tab for ${cloudType}`);
                        
                        // Clear the storage item immediately
                        localStorage.removeItem('oauth_success');
                        
                        // Clear the temp token since OAuth was successful
                        try {
                            localStorage.removeItem('oauth_temp_token');
                        } catch (tempTokenError) {
                            console.warn(`[OAuth] Failed to clean up oauth_temp_token:`, tempTokenError);
                        }
                        
                        // Also clean up any lingering OAuth keys for this cloud type
                        this.cleanupOAuthStorage(cloudType);
                        
                        // Notify the component
                        dotNetRef.invokeMethodAsync('HandleOAuthSuccess')
                            .then(() => {
                                console.log(`[OAuth] HandleOAuthSuccess completed for ${cloudType}`);
                            })
                            .catch(error => {
                                console.error(`[OAuth] Error calling HandleOAuthSuccess:`, error);
                            });
                        
                        // Cleanup listener
                        this.cleanup(listenerId);
                    }
                } catch (error) {
                    console.error(`[OAuth] Error parsing success data:`, error);
                }
            } else if (event.key === 'oauth_error' && event.newValue) {
                try {
                    const data = JSON.parse(event.newValue);
                    console.log(`[OAuth] Error data:`, data);
                    
                    if (data.cloudType === cloudType) {
                        console.log(`[OAuth] Error received from new tab for ${cloudType}: ${data.error}`);
                        
                        // Clear the storage item immediately
                        localStorage.removeItem('oauth_error');
                        
                        // Clear the temp token since OAuth failed
                        try {
                            localStorage.removeItem('oauth_temp_token');
                        } catch (tempTokenError) {
                            console.warn(`[OAuth] Failed to clean up oauth_temp_token:`, tempTokenError);
                        }
                        
                        // Also clean up any lingering OAuth keys for this cloud type
                        this.cleanupOAuthStorage(cloudType);
                        
                        // Notify the component
                        dotNetRef.invokeMethodAsync('HandleOAuthError', data.error)
                            .then(() => {
                                console.log(`[OAuth] HandleOAuthError completed for ${cloudType}`);
                            })
                            .catch(error => {
                                console.error(`[OAuth] Error calling HandleOAuthError:`, error);
                            });
                        
                        // Cleanup listener
                        this.cleanup(listenerId);
                    }
                } catch (error) {
                    console.error(`[OAuth] Error parsing error data:`, error);
                }
            }
        };
        
        window.addEventListener('storage', storageListener);
        this.storageListeners.set(listenerId, storageListener);
        
        // Also listen for postMessage events as backup
        const messageListener = (event) => {
            console.log(`[OAuth] Message event received:`, event.data);
            
            if (event.data && event.data.type === 'oauth_success' && event.data.cloudType === cloudType) {
                console.log(`[OAuth] Success received via postMessage for ${cloudType}`);
                
                dotNetRef.invokeMethodAsync('HandleOAuthSuccess')
                    .then(() => {
                        console.log(`[OAuth] HandleOAuthSuccess completed via postMessage for ${cloudType}`);
                    })
                    .catch(error => {
                        console.error(`[OAuth] Error calling HandleOAuthSuccess via postMessage:`, error);
                    });
                
                // Don't cleanup here as storage might still fire
            } else if (event.data && event.data.type === 'oauth_error' && event.data.cloudType === cloudType) {
                console.log(`[OAuth] Error received via postMessage for ${cloudType}: ${event.data.error}`);
                
                dotNetRef.invokeMethodAsync('HandleOAuthError', event.data.error)
                    .then(() => {
                        console.log(`[OAuth] HandleOAuthError completed via postMessage for ${cloudType}`);
                    })
                    .catch(error => {
                        console.error(`[OAuth] Error calling HandleOAuthError via postMessage:`, error);
                    });
                
                // Don't cleanup here as storage might still fire
            }
        };
        
        window.addEventListener('message', messageListener);
        
        console.log(`[OAuth] Storage and message listeners registered for ${cloudType}`);
        
        // Also add a polling mechanism as backup (storage events don't always fire reliably)
        // Poll more frequently and add immediate check
        let pollCount = 0;
        const maxPolls = 600; // 10 minutes at 1 second intervals
        
        const pollInterval = setInterval(() => {
            pollCount++;
            try {
                const successData = localStorage.getItem('oauth_success');
                if (successData) {
                    const data = JSON.parse(successData);
                    if (data.cloudType === cloudType) {
                        console.log(`[OAuth] Success detected via polling for ${cloudType} (poll #${pollCount})`);
                        localStorage.removeItem('oauth_success');
                        
                        // Clear the temp token since OAuth was successful
                        try {
                            localStorage.removeItem('oauth_temp_token');
                        } catch (tempTokenError) {
                            console.warn(`[OAuth] Failed to clean up oauth_temp_token via polling:`, tempTokenError);
                        }
                        
                        // Also clean up any lingering OAuth keys for this cloud type
                        this.cleanupOAuthStorage(cloudType);
                        
                        dotNetRef.invokeMethodAsync('HandleOAuthSuccess')
                            .then(() => {
                                console.log(`[OAuth] HandleOAuthSuccess completed via polling for ${cloudType}`);
                            })
                            .catch(error => {
                                console.error(`[OAuth] Error calling HandleOAuthSuccess via polling:`, error);
                            });
                        
                        clearInterval(pollInterval);
                        this.cleanup(listenerId);
                        return;
                    }
                }
                
                const errorData = localStorage.getItem('oauth_error');
                if (errorData) {
                    const data = JSON.parse(errorData);
                    if (data.cloudType === cloudType) {
                        console.log(`[OAuth] Error detected via polling for ${cloudType}: ${data.error} (poll #${pollCount})`);
                        localStorage.removeItem('oauth_error');
                        
                        // Clear the temp token since OAuth failed
                        try {
                            localStorage.removeItem('oauth_temp_token');
                        } catch (tempTokenError) {
                            console.warn(`[OAuth] Failed to clean up oauth_temp_token via polling after error:`, tempTokenError);
                        }
                        
                        // Also clean up any lingering OAuth keys for this cloud type
                        this.cleanupOAuthStorage(cloudType);
                        
                        dotNetRef.invokeMethodAsync('HandleOAuthError', data.error)
                            .then(() => {
                                console.log(`[OAuth] HandleOAuthError completed via polling for ${cloudType}`);
                            })
                            .catch(error => {
                                console.error(`[OAuth] Error calling HandleOAuthError via polling:`, error);
                            });
                        
                        clearInterval(pollInterval);
                        this.cleanup(listenerId);
                        return;
                    }
                }
                
                // Stop polling after max attempts
                if (pollCount >= maxPolls) {
                    console.log(`[OAuth] Polling timeout for ${cloudType} after ${pollCount} attempts`);
                    clearInterval(pollInterval);
                    this.cleanup(listenerId);
                }
            } catch (error) {
                console.error(`[OAuth] Error in polling:`, error);
            }
        }, 1000); // Poll every second
        
        // Store poll interval for cleanup
        this.oauthListeners.set(listenerId, pollInterval);
        
        return listenerId;
    },

    // Check if current URL contains OAuth callback parameters
    checkForOAuthCallback: function(dotNetRef) {
        console.log(`[OAuth] checkForOAuthCallback called`);
        console.log(`[OAuth] isOAuthCallbackTab: ${window.isOAuthCallbackTab}`);
        console.log(`[OAuth] oauthCallbackDetected: ${window.oauthCallbackDetected}`);
        
        // Check if we detected OAuth callback during page load
        if (window.isOAuthCallbackTab && window.oauthCallbackDetected && window.oauthCallbackData) {
            console.log('[OAuth] Processing stored OAuth callback data');
            
            // Show processing UI immediately
            document.body.innerHTML = `
                <div style="display: flex; align-items: center; justify-content: center; height: 100vh; flex-direction: column; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;">
                    <div style="text-align: center; padding: 2rem; border-radius: 8px; background: #f8fafc; border: 1px solid #e2e8f0;">
                        <div style="width: 40px; height: 40px; border: 4px solid #e2e8f0; border-top: 4px solid #3b82f6; border-radius: 50%; animation: spin 1s linear infinite; margin: 0 auto 1rem;"></div>
                        <h2 style="color: #0f172a; margin: 0 0 0.5rem 0;">Processing OAuth Authorization...</h2>
                        <p style="color: #64748b; margin: 0;">Please wait while we complete your login.</p>
                        <p style="color: #64748b; margin: 0.5rem 0 0 0; font-size: 0.75rem;">OAuth Type: ${window.oauthCallbackData.oauth_type}</p>
                    </div>
                </div>
                <style>
                    @keyframes spin {
                        0% { transform: rotate(0deg); }
                        100% { transform: rotate(360deg); }
                    }
                </style>
            `;
            
            // Block navigation after showing UI
            const originalPushState = history.pushState;
            const originalReplaceState = history.replaceState;
            
            history.pushState = function() {
                console.log('[OAuth] BLOCKED pushState after processing start');
                return;
            };
            
            history.replaceState = function() {
                console.log('[OAuth] BLOCKED replaceState after processing start');
                return;
            };
            
            // Process the OAuth callback immediately
            this.processOAuthCallback(dotNetRef, window.oauthCallbackData);
            
            return true;
        }
        
        // Fallback: check URL parameters directly
        const url = new URL(window.location.href);
        const params = new URLSearchParams(url.search);
        
        console.log(`[OAuth] Checking URL parameters. Has oauth_type: ${params.has('oauth_type')}`);
        console.log(`[OAuth] Has window.opener: ${!!window.opener}`);
        
        if (params.has('oauth_type') && 
            params.has('refresh_token') && 
            params.has('access_token') && 
            params.has('expires_in')) {
            
            // Check if this is a new tab (popup) by checking the window.opener
            if (window.opener && window.opener !== window && !window.opener.closed) {
                // This is the callback page (new tab/popup)
                console.log('[OAuth] Callback detected in new tab via URL parameters');
                
                // Extract OAuth data
                const oauthData = {
                    oauth_type: params.get('oauth_type'),
                    refresh_token: params.get('refresh_token'),
                    access_token: params.get('access_token'),
                    expires_in: params.get('expires_in')
                };
                
                // Show processing UI
                document.body.innerHTML = `
                    <div style="display: flex; align-items: center; justify-content: center; height: 100vh; flex-direction: column; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;">
                        <div style="text-align: center; padding: 2rem; border-radius: 8px; background: #f8fafc; border: 1px solid #e2e8f0;">
                            <div style="width: 40px; height: 40px; border: 4px solid #e2e8f0; border-top: 4px solid #3b82f6; border-radius: 50%; animation: spin 1s linear infinite; margin: 0 auto 1rem;"></div>
                            <h2 style="color: #0f172a; margin: 0 0 0.5rem 0;">Processing OAuth Authorization...</h2>
                            <p style="color: #64748b; margin: 0;">Please wait while we complete your login.</p>
                            <p style="color: #64748b; margin: 0.5rem 0 0 0; font-size: 0.75rem;">OAuth Type: ${oauthData.oauth_type}</p>
                        </div>
                    </div>
                    <style>
                        @keyframes spin {
                            0% { transform: rotate(0deg); }
                            100% { transform: rotate(360deg); }
                        }
                    </style>
                `;
                
                // Block navigation
                history.pushState = function() {
                    console.log('[OAuth] BLOCKED pushState during processing');
                    return;
                };
                
                history.replaceState = function() {
                    console.log('[OAuth] BLOCKED replaceState during processing');
                    return;
                };
                
                // Process OAuth in the new tab immediately
                this.processOAuthCallback(dotNetRef, oauthData);
                
                return true;
            } else {
                // This is the main page with OAuth callback - let the page handle it normally
                console.log('[OAuth] Callback detected in main page - will be handled by page');
                return false;
            }
        }
        
        return false;
    },

    // Process OAuth callback in the new tab
    processOAuthCallback: async function(dotNetRef, oauthData) {
        try {
            console.log(`[OAuth] Processing callback for ${oauthData.oauth_type} in new tab`);
            
            // IMMEDIATELY show processing UI to prevent user from seeing navigation
            document.body.innerHTML = `
                <div style="display: flex; align-items: center; justify-content: center; height: 100vh; flex-direction: column; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;">
                    <div style="text-align: center; padding: 2rem; border-radius: 8px; background: #f8fafc; border: 1px solid #e2e8f0;">
                        <div style="width: 40px; height: 40px; border: 4px solid #e2e8f0; border-top: 4px solid #3b82f6; border-radius: 50%; animation: spin 1s linear infinite; margin: 0 auto 1rem;"></div>
                        <h2 style="color: #0f172a; margin: 0 0 0.5rem 0;">Processing Authorization...</h2>
                        <p style="color: #64748b; margin: 0;">Please wait while we complete your login.</p>
                        <p style="color: #64748b; margin: 0.5rem 0 0 0; font-size: 0.75rem;">OAuth Type: ${oauthData.oauth_type}</p>
                    </div>
                </div>
                <style>
                    @keyframes spin {
                        0% { transform: rotate(0deg); }
                        100% { transform: rotate(360deg); }
                    }
                </style>
            `;
            
            // Block any further navigation attempts
            window.addEventListener('popstate', function(e) {
                console.log('[OAuth] Blocking popstate in OAuth callback tab');
                e.preventDefault();
                e.stopPropagation();
                return false;
            });
            
            // Call the OAuth handler
            await dotNetRef.invokeMethodAsync('HandleOAuthCallbackInNewTab', 
                oauthData.oauth_type,
                oauthData.refresh_token, 
                oauthData.access_token, 
                oauthData.expires_in);
                
            console.log(`[OAuth] OAuth callback processed successfully for ${oauthData.oauth_type}`);
                
        } catch (error) {
            console.error('[OAuth] Error processing callback:', error);
            
            // Notify original tab of error and close this tab
            const errorMessage = error.message || 'OAuth processing failed';
            console.log(`[OAuth] Notifying error and closing tab: ${errorMessage}`);
            
            localStorage.setItem('oauth_error', JSON.stringify({
                cloudType: oauthData.oauth_type,
                error: errorMessage
            }));
            
            // Show error message and close tab
            document.body.innerHTML = `
                <div style="display: flex; align-items: center; justify-content: center; height: 100vh; flex-direction: column; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;">
                    <div style="text-align: center; padding: 2rem; border-radius: 8px; background: #fef2f2; border: 1px solid #ef4444;">
                        <div style="color: #ef4444; font-size: 3rem; margin-bottom: 1rem;">✗</div>
                        <h2 style="color: #0f172a; margin: 0 0 1rem 0;">OAuth Processing Failed</h2>
                        <p style="color: #64748b; margin: 0;">${errorMessage}</p>
                        <p style="color: #64748b; margin: 1rem 0 0 0; font-size: 0.875rem;">Closing this tab...</p>
                    </div>
                </div>
            `;
            
            // Close the tab after delay
            setTimeout(() => {
                window.close();
            }, 3000);
        }
    },

    // Notify original tab of success and close new tab
    notifySuccessAndClose: function(cloudType) {
        console.log(`[OAuth] Notifying success for ${cloudType} and closing tab`);
        
        try {
            // Use a more unique key to avoid conflicts
            const successKey = `oauth_success_${cloudType}_${Date.now()}`;
            const successData = JSON.stringify({
                cloudType: cloudType,
                timestamp: Date.now(),
                id: successKey
            });
            
            // Try multiple notification methods
            console.log(`[OAuth] Setting localStorage with key: oauth_success`);
            localStorage.setItem('oauth_success', successData);
            console.log(`[OAuth] Success notification stored:`, successData);
            
            // Also try triggering a custom event
            try {
                window.dispatchEvent(new CustomEvent('oauth_success', {
                    detail: { cloudType: cloudType, timestamp: Date.now() }
                }));
                console.log(`[OAuth] Custom event dispatched for ${cloudType}`);
            } catch (eventError) {
                console.error(`[OAuth] Error dispatching custom event:`, eventError);
            }
            
            // Try to notify parent window if this is a popup
            if (window.opener && !window.opener.closed) {
                try {
                    console.log(`[OAuth] Attempting to notify opener window for ${cloudType}`);
                    window.opener.postMessage({
                        type: 'oauth_success',
                        cloudType: cloudType,
                        timestamp: Date.now()
                    }, '*');
                    console.log(`[OAuth] PostMessage sent to opener for ${cloudType}`);
                } catch (postMessageError) {
                    console.error(`[OAuth] Error sending postMessage:`, postMessageError);
                }
            }
            
            // Force a storage event by setting and removing a trigger
            const triggerKey = `oauth_trigger_${Date.now()}`;
            localStorage.setItem(triggerKey, 'trigger');
            setTimeout(() => {
                localStorage.removeItem(triggerKey);
            }, 100);
            
            // Clean up OAuth storage in this tab (the popup) after notification
            setTimeout(() => {
                // Clean up all OAuth storage for this cloud type in the popup tab
                console.log(`[OAuth] Cleaning up OAuth storage in popup tab for ${cloudType}`);
                this.cleanupOAuthStorage(cloudType);
            }, 200);
            
            // Show brief success message and immediately attempt to close
            document.body.innerHTML = `
                <div style="display: flex; align-items: center; justify-content: center; height: 100vh; flex-direction: column; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #f0f9ff;">
                    <div style="text-align: center; padding: 2rem; border-radius: 12px; background: white; border: 1px solid #059669; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);">
                        <div style="color: #059669; font-size: 4rem; margin-bottom: 1rem;">✓</div>
                        <h2 style="color: #065f46; margin: 0 0 1rem 0; font-size: 1.5rem;">Authorization Successful!</h2>
                        <p style="color: #6b7280; margin: 0;">This window will close automatically.</p>
                        <p style="color: #9ca3af; margin: 0.5rem 0 0 0; font-size: 0.875rem;">Cloud: ${cloudType}</p>
                    </div>
                </div>
            `;
            
            // IMMEDIATE window close attempts - try multiple methods
            console.log(`[OAuth] Attempting immediate window close for ${cloudType}`);
            
            // Try immediate close
            try {
                window.close();
            } catch (e) {
                console.log(`[OAuth] Immediate close failed:`, e);
            }
            
            // Try with minimal delay
            setTimeout(() => {
                try {
                    console.log(`[OAuth] Attempting delayed close (50ms) for ${cloudType}`);
                    window.close();
                } catch (e) {
                    console.log(`[OAuth] Delayed close (50ms) failed:`, e);
                }
            }, 50);
            
            // Multiple close attempts with increasing delays as fallback
            [100, 250, 500, 1000, 2000].forEach((delay, index) => {
                setTimeout(() => {
                    try {
                        console.log(`[OAuth] Close attempt ${index + 3} (${delay}ms) for ${cloudType}`);
                        window.close();
                        
                        // Check if window is still open
                        setTimeout(() => {
                            if (!window.closed) {
                                console.log(`[OAuth] Window still open after close attempt ${index + 3}`);
                                if (delay === 2000) { // Last attempt
                                    document.body.innerHTML = `
                                        <div style="display: flex; align-items: center; justify-content: center; height: 100vh; flex-direction: column; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #fef3c7;">
                                            <div style="text-align: center; padding: 2rem; border-radius: 12px; background: white; border: 1px solid #f59e0b;">
                                                <div style="color: #f59e0b; font-size: 3rem; margin-bottom: 1rem;">⚠️</div>
                                                <h2 style="color: #92400e; margin: 0 0 1rem 0;">Authorization Complete</h2>
                                                <p style="color: #6b7280; margin: 0;">Please close this tab manually.</p>
                                                <button onclick="window.close()" style="margin-top: 1rem; padding: 0.5rem 1rem; background: #f59e0b; color: white; border: none; border-radius: 6px; cursor: pointer;">Close Tab</button>
                                            </div>
                                        </div>
                                    `;
                                }
                            }
                        }, 100);
                    } catch (closeError) {
                        console.error(`[OAuth] Close attempt ${index + 3} failed:`, closeError);
                    }
                }, delay);
            });
            
        } catch (error) {
            console.error(`[OAuth] Error in notifySuccessAndClose:`, error);
            // Force close on error
            setTimeout(() => {
                window.close();
            }, 500);
        }
    },

    // Notify original tab of error and close new tab
    notifyErrorAndClose: function(cloudType, error) {
        console.log(`[OAuth] Notifying error for ${cloudType}: ${error}`);
        
        try {
            // Notify original tab
            const errorData = JSON.stringify({
                cloudType: cloudType,
                error: error,
                timestamp: Date.now()
            });
            localStorage.setItem('oauth_error', errorData);
            console.log(`[OAuth] Error notification stored:`, errorData);
            
            // Clean up OAuth storage in this tab (the popup) after notification
            setTimeout(() => {
                console.log(`[OAuth] Cleaning up OAuth storage in popup tab after error for ${cloudType}`);
                this.cleanupOAuthStorage(cloudType);
            }, 200);
            
            // Show brief error message before closing
            document.body.innerHTML = `
                <div style="display: flex; align-items: center; justify-content: center; height: 100vh; flex-direction: column; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;">
                    <div style="text-align: center; padding: 2rem; border-radius: 8px; background: #fef2f2; border: 1px solid #ef4444;">
                        <div style="color: #ef4444; font-size: 3rem; margin-bottom: 1rem;">✗</div>
                        <h2 style="color: #0f172a; margin: 0 0 1rem 0;">Authorization Failed</h2>
                        <p style="color: #64748b; margin: 0;">${error}</p>
                        <p style="color: #64748b; margin: 1rem 0 0 0; font-size: 0.875rem;">Closing this tab...</p>
                    </div>
                </div>
            `;
            
            // Close the tab after a longer delay for error case
            setTimeout(() => {
                console.log(`[OAuth] Attempting to close tab after error for ${cloudType}`);
                try {
                    window.close();
                } catch (closeError) {
                    console.error(`[OAuth] Failed to close tab:`, closeError);
                }
            }, 3000);
            
        } catch (error) {
            console.error(`[OAuth] Error in notifyErrorAndClose:`, error);
            // Force close on error
            setTimeout(() => {
                window.close();
            }, 1000);
        }
    },

    // Remove OAuth parameters from URL
    cleanupUrlParams: function() {
        const url = new URL(window.location.href);
        const params = new URLSearchParams(url.search);
        
        // Remove OAuth-specific parameters
        params.delete('oauth_type');
        params.delete('refresh_token');
        params.delete('access_token');
        params.delete('expires_in');
        params.delete('code');
        params.delete('state');
        params.delete('error');
        params.delete('error_description');
        
        // Update URL without page reload
        const newUrl = url.pathname + (params.toString() ? '?' + params.toString() : '');
        window.history.replaceState({}, '', newUrl);
    },

    // Comprehensive cleanup of OAuth-related localStorage keys
    cleanupOAuthStorage: function(cloudType) {
        console.log(`[OAuth] Cleaning up OAuth storage keys for ${cloudType || 'all cloud types'}`);
        
        try {
            // Get all localStorage keys
            const keys = Object.keys(localStorage);
            
            // Remove OAuth-specific keys
            let oauthKeys;
            if (cloudType) {
                // Clean up for specific cloud type
                oauthKeys = keys.filter(key => 
                    key.startsWith('oauth_') || 
                    key.includes(cloudType) ||
                    key.startsWith('oauth_success') ||
                    key.startsWith('oauth_error') ||
                    key.startsWith('oauth_trigger')
                );
            } else {
                // Clean up all OAuth keys
                oauthKeys = keys.filter(key => 
                    key.startsWith('oauth_') ||
                    key.includes('_success') ||
                    key.includes('_error') ||
                    key.includes('_trigger')
                );
            }
            
            oauthKeys.forEach(key => {
                try {
                    localStorage.removeItem(key);
                    console.log(`[OAuth] Removed localStorage key: ${key}`);
                } catch (error) {
                    console.warn(`[OAuth] Failed to remove key ${key}:`, error);
                }
            });
            
            // Also remove any temporary trigger keys
            const triggerKeys = keys.filter(key => key.startsWith('oauth_trigger_'));
            triggerKeys.forEach(key => {
                try {
                    localStorage.removeItem(key);
                    console.log(`[OAuth] Removed trigger key: ${key}`);
                } catch (error) {
                    console.warn(`[OAuth] Failed to remove trigger key ${key}:`, error);
                }
            });
            
            console.log(`[OAuth] Cleanup completed for ${cloudType || 'all'}. Removed ${oauthKeys.length + triggerKeys.length} keys.`);
        } catch (error) {
            console.error(`[OAuth] Error during storage cleanup:`, error);
        }
    },

    // Cleanup OAuth listeners and windows
    cleanup: function(listenerId) {
        console.log(`[OAuth] Cleaning up listener: ${listenerId}`);
        
        if (this.oauthListeners.has(listenerId)) {
            const interval = this.oauthListeners.get(listenerId);
            clearInterval(interval);
            this.oauthListeners.delete(listenerId);
            console.log(`[OAuth] Cleared polling interval for: ${listenerId}`);
        }
        
        if (this.storageListeners.has(listenerId)) {
            window.removeEventListener('storage', this.storageListeners.get(listenerId));
            this.storageListeners.delete(listenerId);
            console.log(`[OAuth] Removed storage listener for: ${listenerId}`);
        }
        
        if (this.oauthWindows.has(listenerId)) {
            const oauthWindow = this.oauthWindows.get(listenerId);
            if (!oauthWindow.closed) {
                oauthWindow.close();
            }
            this.oauthWindows.delete(listenerId);
            console.log(`[OAuth] Closed OAuth window for: ${listenerId}`);
        }
        
        // Also clean up any residual OAuth storage
        try {
            // Extract cloudType from listenerId if possible
            const cloudTypeMatch = listenerId.match(/_([^_]+)$/);
            if (cloudTypeMatch) {
                const cloudType = cloudTypeMatch[1];
                console.log(`[OAuth] Performing final storage cleanup for extracted cloudType: ${cloudType}`);
                this.cleanupOAuthStorage(cloudType);
            } else {
                // Fallback: clean up all OAuth keys
                console.log(`[OAuth] Performing general OAuth storage cleanup`);
                this.cleanupOAuthStorage('');
            }
        } catch (cleanupError) {
            console.warn(`[OAuth] Error during final cleanup:`, cleanupError);
        }
    }
};

// Global function for manual OAuth storage cleanup
window.cleanupOAuthStorage = function(cloudType) {
    return window.oauthHelper.cleanupOAuthStorage(cloudType || '');
};

// Global function for comprehensive OAuth cleanup (all cloud types)
window.cleanupAllOAuthStorage = function() {
    console.log('[OAuth] Cleaning up ALL OAuth storage');
    try {
        const keys = Object.keys(localStorage);
        const oauthKeys = keys.filter(key => 
            key.startsWith('oauth_') || 
            key.includes('_success') ||
            key.includes('_error') ||
            key.includes('_trigger')
        );
        
        oauthKeys.forEach(key => {
            try {
                localStorage.removeItem(key);
                console.log(`[OAuth] Removed global OAuth key: ${key}`);
            } catch (error) {
                console.warn(`[OAuth] Failed to remove global key ${key}:`, error);
            }
        });
        
        console.log(`[OAuth] Global cleanup completed. Removed ${oauthKeys.length} keys.`);
        return oauthKeys.length;
    } catch (error) {
        console.error(`[OAuth] Error during global cleanup:`, error);
        return 0;
    }
};

// Global function for backward compatibility
window.setupOAuthListener = function(dotNetRef, cloudType) {
    return window.oauthHelper.setupOAuthListener(dotNetRef, cloudType);
};

// Debug function for testing OAuth flow
window.debugOAuth = function(cloudType) {
    console.log(`[OAuth Debug] Testing OAuth flow for ${cloudType}`);
    
    // Simulate success
    const successData = JSON.stringify({
        cloudType: cloudType || 'onedrive',
        timestamp: Date.now()
    });
    
    console.log(`[OAuth Debug] Setting localStorage: oauth_success =`, successData);
    localStorage.setItem('oauth_success', successData);
    
    // Check if it was set
    const stored = localStorage.getItem('oauth_success');
    console.log(`[OAuth Debug] Retrieved from localStorage:`, stored);
    
    // Clean up
    setTimeout(() => {
        localStorage.removeItem('oauth_success');
        console.log(`[OAuth Debug] Cleaned up oauth_success`);
    }, 5000);
};
