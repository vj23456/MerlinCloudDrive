/**
 * Remote Upload Helpers — File System Access API handle persistence
 * Stores FileSystemFileHandle objects in IndexedDB for resuming uploads after page reload.
 * Only works on localhost or HTTPS (secure contexts).
 */
(function () {
    const DB_NAME = 'remote-upload-handles';
    const DB_VERSION = 1;
    const HANDLE_STORE = 'handles';
    let dbPromise = null;

    function isSupported() {
        return typeof window !== 'undefined'
            && 'FileSystemFileHandle' in window
            && 'indexedDB' in window;
    }

    function openDb() {
        if (!isSupported()) return Promise.resolve(null);
        if (dbPromise) return dbPromise;
        dbPromise = new Promise((resolve, reject) => {
            const req = indexedDB.open(DB_NAME, DB_VERSION);
            req.onerror = () => reject(req.error);
            req.onupgradeneeded = () => {
                const db = req.result;
                if (!db.objectStoreNames.contains(HANDLE_STORE)) {
                    db.createObjectStore(HANDLE_STORE, { keyPath: 'id' });
                }
            };
            req.onsuccess = () => resolve(req.result);
        });
        return dbPromise;
    }

    async function putHandle(id, handle) {
        const db = await openDb();
        if (!db) return;
        return new Promise((resolve, reject) => {
            const tx = db.transaction(HANDLE_STORE, 'readwrite');
            tx.oncomplete = () => resolve();
            tx.onerror = () => reject(tx.error);
            tx.objectStore(HANDLE_STORE).put({ id, handle });
        });
    }

    async function getHandle(id) {
        const db = await openDb();
        if (!db) return null;
        return new Promise((resolve, reject) => {
            const tx = db.transaction(HANDLE_STORE, 'readonly');
            const req = tx.objectStore(HANDLE_STORE).get(id);
            req.onsuccess = () => resolve(req.result ? req.result.handle : null);
            req.onerror = () => reject(req.error);
            tx.onerror = () => reject(tx.error);
        });
    }

    async function deleteHandle(id) {
        const db = await openDb();
        if (!db) return;
        return new Promise((resolve, reject) => {
            const tx = db.transaction(HANDLE_STORE, 'readwrite');
            tx.oncomplete = () => resolve();
            tx.onerror = () => reject(tx.error);
            tx.objectStore(HANDLE_STORE).delete(id);
        });
    }

    // Map of handleId -> restored File object (after permission granted)
    const restoredFiles = new Map();

    window.RemoteUploadHandles = {
        /**
         * Check if File System Access API is supported (secure context).
         */
        isSupported() {
            return isSupported();
        },

        /**
         * Store a FileSystemFileHandle in IndexedDB.
         * Called from drag-drop or file picker that provides handles.
         * @param {string} handleId - Unique ID for this handle
         * @param {FileSystemFileHandle} handle - The handle to store
         */
        async storeHandle(handleId, handle) {
            if (!isSupported() || !handle) return false;
            try {
                await putHandle(handleId, handle);
                return true;
            } catch (err) {
                console.warn('[UPLOAD] storeHandle failed:', err);
                return false;
            }
        },

        /**
         * Restore a file from a stored handle. Requires user gesture for permission.
         * Returns { name, size } on success, null on failure.
         * @param {string} handleId
         * @param {boolean} interactive - Whether this is from a user gesture (can request permission)
         */
        async restoreFile(handleId, interactive) {
            if (!handleId || !isSupported()) return null;
            try {
                const handle = await getHandle(handleId);
                if (!handle || typeof handle.getFile !== 'function') {
                    try { await deleteHandle(handleId); } catch (_) {}
                    return null;
                }

                // Check/request permission
                let permission = 'granted';
                if (typeof handle.queryPermission === 'function') {
                    try {
                        permission = await handle.queryPermission({ mode: 'read' });
                    } catch (_) {
                        permission = 'denied';
                    }
                }

                if (permission !== 'granted') {
                    if (interactive && typeof handle.requestPermission === 'function') {
                        try {
                            permission = await handle.requestPermission({ mode: 'read' });
                        } catch (_) {}
                    }
                    if (permission !== 'granted') {
                        return null;
                    }
                }

                let file;
                try {
                    file = await handle.getFile();
                } catch (err) {
                    console.warn('[UPLOAD] getFile() failed, handle stale:', err);
                    try { await deleteHandle(handleId); } catch (_) {}
                    return null;
                }

                restoredFiles.set(handleId, file);
                return { name: file.name, size: file.size };
            } catch (err) {
                console.warn('[UPLOAD] restoreFile failed:', err);
                return null;
            }
        },

        /**
         * Get a restored File object for reading.
         * @param {string} handleId
         * @returns {File|null}
         */
        getRestoredFile(handleId) {
            return restoredFiles.get(handleId) || null;
        },

        /**
         * Read a slice of a restored file.
         * @param {string} handleId
         * @param {number} offset
         * @param {number} length
         * @returns {Promise<ArrayBuffer|null>}
         */
        async readSlice(handleId, offset, length) {
            const file = restoredFiles.get(handleId);
            if (!file) return null;
            const end = Math.min(offset + length, file.size);
            const blob = file.slice(offset, end);
            return await blob.arrayBuffer();
        },

        /**
         * Remove a handle from IndexedDB and clear restored file.
         * @param {string} handleId
         */
        async removeHandle(handleId) {
            if (!handleId) return;
            restoredFiles.delete(handleId);
            try { await deleteHandle(handleId); } catch (_) {}
        },

        /**
         * Store a FileSystemFileHandle from a DataTransferItem.
         * Called during drag-drop when getAsFileSystemHandle() is available.
         * @param {DataTransferItem} item
         * @returns {Promise<string|null>} handleId or null
         */
        async storeFromDataTransferItem(item) {
            if (!isSupported() || !item || typeof item.getAsFileSystemHandle !== 'function') {
                return null;
            }
            try {
                const handle = await item.getAsFileSystemHandle();
                if (!handle || handle.kind !== 'file') return null;
                const handleId = 'h-' + Math.random().toString(36).slice(2) + Date.now().toString(36);
                await putHandle(handleId, handle);
                // Also get the File and store it for immediate use
                const file = await handle.getFile();
                restoredFiles.set(handleId, file);
                return handleId;
            } catch (err) {
                console.warn('[UPLOAD] storeFromDataTransferItem failed:', err);
                return null;
            }
        },

        /**
         * Store handles for files from an input element.
         * Note: standard <input type="file"> does NOT provide FileSystemFileHandle.
         * Only showOpenFilePicker() does. This is a no-op for regular inputs.
         */
        async storeFromInput(inputEl, fileIndex) {
            // Regular <input type="file"> doesn't expose handles
            return null;
        }
    };
})();
