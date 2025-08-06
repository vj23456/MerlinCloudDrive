// Navigation helper functions for CloudDrive
window.CloudDriveNavigation = {
    // Parse current URL query parameters
    getQueryParams: function() {
        const urlParams = new URLSearchParams(window.location.search);
        const params = {};
        for (const [key, value] of urlParams) {
            params[key] = value;
        }
        return params;
    },

    // Navigate to a specific page with optional parameters
    navigateToPage: function(page, params = {}) {
        const urlParams = new URLSearchParams();
        
        if (page && page !== 'dashboard') {
            urlParams.set('page', page);
        }
        
        for (const [key, value] of Object.entries(params)) {
            if (value) {
                urlParams.set(key, value);
            }
        }
        
        const queryString = urlParams.toString();
        const newUrl = queryString ? `/?${queryString}` : '/';
        
        // Update URL without reloading page
        window.history.pushState(null, '', newUrl);
        
        // Trigger a custom event to notify Blazor components
        window.dispatchEvent(new CustomEvent('blazor-navigation', {
            detail: { page, params }
        }));
    },

    // Navigation shortcuts for common pages
    goToFiles: function(path = null) {
        const params = {};
        if (path && path !== '/') {
            params.path = path;
        }
        this.navigateToPage('files', params);
    },

    goToTasks: function(tab = 'copy') {
        this.navigateToPage('tasks', { tab });
    },

    goToCopyTasks: function() {
        this.navigateToPage('tasks', { tab: 'copy' });
    },

    goToUploadTasks: function() {
        this.navigateToPage('tasks', { tab: 'upload' });
    },

    goToDownloadTasks: function() {
        this.navigateToPage('tasks', { tab: 'download' });
    },

    goToBackups: function() {
        this.navigateToPage('backups');
    },

    goToCloudStorages: function() {
        this.navigateToPage('cloudstorages');
    },

    goToMounts: function() {
        this.navigateToPage('mounts');
    },

    goToSettings: function() {
        this.navigateToPage('settings');
    },

    goToDashboard: function() {
        this.navigateToPage('dashboard');
    }
};

// Make it available globally for easy access from browser console
window.nav = window.CloudDriveNavigation;
