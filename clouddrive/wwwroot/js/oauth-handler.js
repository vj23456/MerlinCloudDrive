// IMMEDIATE OAuth callback detection - run before Blazor loads
(function() {
    const url = new URL(window.location.href);
    const params = new URLSearchParams(url.search);
    
    // If this looks like an OAuth callback and we're in a popup, take over completely
    if (params.has('oauth_type') && params.has('refresh_token') && 
        window.opener && window.opener !== window && !window.opener.closed) {
        
        console.log('[OAuth] IMMEDIATE: OAuth callback detected in new tab - taking over completely');
        
        // Store OAuth data
        window.oauthCallbackDetected = true;
        window.oauthCallbackData = {
            oauth_type: params.get('oauth_type'),
            refresh_token: params.get('refresh_token'),
            access_token: params.get('access_token'),
            expires_in: params.get('expires_in')
        };
        
        console.log('[OAuth] IMMEDIATE: OAuth data stored:', window.oauthCallbackData);
        
        // Set flag for Blazor
        window.isOAuthCallbackTab = true;
        
        // IMMEDIATELY block navigation methods but ALLOW Blazor to load
        console.log('[OAuth] IMMEDIATE: Blocking navigation methods but allowing Blazor');
        
        // Block history API
        if (typeof history !== 'undefined') {
            history.pushState = function() { 
                console.log('[OAuth] IMMEDIATE BLOCKED pushState'); 
                return;
            };
            history.replaceState = function() { 
                console.log('[OAuth] IMMEDIATE BLOCKED replaceState'); 
                return;
            };
            history.back = function() {
                console.log('[OAuth] IMMEDIATE BLOCKED history.back');
                return;
            };
            history.forward = function() {
                console.log('[OAuth] IMMEDIATE BLOCKED history.forward');
                return;
            };
            history.go = function() {
                console.log('[OAuth] IMMEDIATE BLOCKED history.go');
                return;
            };
        }

        // Block location changes
        try {
            Object.defineProperty(window, 'location', {
                get: function() { return document.location; },
                set: function(val) { 
                    console.log('[OAuth] IMMEDIATE BLOCKED location change to:', val); 
                    return document.location;
                }
            });
        } catch (e) {
            console.log('[OAuth] Could not redefine location property immediately:', e);
        }

        // Block window.open for any potential redirects
        window.open = function() {
            console.log('[OAuth] IMMEDIATE BLOCKED window.open');
            return null;
        };

        // Wait for Blazor to load, then intercept its navigation
        let blazorIntercepted = false;
        const interceptBlazor = () => {
            if (window.Blazor && !blazorIntercepted) {
                blazorIntercepted = true;
                console.log('[OAuth] IMMEDIATE: Intercepting Blazor navigation');
                
                // Store original navigateTo
                const originalNavigateTo = window.Blazor.navigateTo;
                
                // Override Blazor navigation
                window.Blazor.navigateTo = function(uri) {
                    console.log('[OAuth] IMMEDIATE BLOCKED Blazor.navigateTo to:', uri);
                    // Don't navigate anywhere
                    return;
                };
            }
        };

        // Check for Blazor periodically
        const checkBlazor = setInterval(() => {
            interceptBlazor();
            if (blazorIntercepted) {
                clearInterval(checkBlazor);
            }
        }, 100);

        // Also try when Blazor loads
        document.addEventListener('DOMContentLoaded', () => {
            setTimeout(interceptBlazor, 100);
        });
        
        // Show processing UI immediately, but preserve #app element for Blazor
        const showProcessingUI = () => {
            // Find or create the #app element that Blazor needs
            let appElement = document.getElementById('app');
            if (!appElement) {
                appElement = document.createElement('div');
                appElement.id = 'app';
                document.body.appendChild(appElement);
            }
            
            // Replace only the #app content, not the entire body
            appElement.innerHTML = `
                <div id="oauth-processing" style="display: flex; align-items: center; justify-content: center; height: 100vh; flex-direction: column; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #f8fafc; position: fixed; top: 0; left: 0; width: 100%; z-index: 10000;">
                    <div style="text-align: center; padding: 2rem; border-radius: 12px; background: white; border: 1px solid #e2e8f0; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);">
                        <div style="width: 40px; height: 40px; border: 4px solid #e2e8f0; border-top: 4px solid #3b82f6; border-radius: 50%; animation: spin 1s linear infinite; margin: 0 auto 1rem;"></div>
                        <h2 style="color: #0f172a; margin: 0 0 0.5rem 0; font-size: 1.5rem;">Processing OAuth Authorization</h2>
                        <p style="color: #64748b; margin: 0;">Please wait while we complete your login...</p>
                        <p style="color: #64748b; margin: 0.5rem 0 0 0; font-size: 0.75rem;">Cloud: ${window.oauthCallbackData.oauth_type}</p>
                    </div>
                </div>
            `;
            
            // Add styles to the head instead of inline
            if (!document.getElementById('oauth-styles')) {
                const style = document.createElement('style');
                style.id = 'oauth-styles';
                style.textContent = `
                    @keyframes spin {
                        0% { transform: rotate(0deg); }
                        100% { transform: rotate(360deg); }
                    }
                    body { margin: 0; padding: 0; overflow: hidden; }
                `;
                document.head.appendChild(style);
            }
            
            console.log('[OAuth] IMMEDIATE: Processing UI set up in #app element');
        };
        
        // Show processing UI when DOM is ready
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', showProcessingUI);
        } else {
            showProcessingUI();
        }
        
        // Also update UI after a short delay to override any Blazor changes
        setTimeout(showProcessingUI, 100);
        
        // Override any potential navigation events
        window.addEventListener('popstate', function(e) {
            console.log('[OAuth] IMMEDIATE BLOCKED popstate');
            e.preventDefault();
            e.stopPropagation();
            return false;
        });

        window.addEventListener('hashchange', function(e) {
            console.log('[OAuth] IMMEDIATE BLOCKED hashchange');
            e.preventDefault();
            e.stopPropagation();
            return false;
        });
    }
})();
