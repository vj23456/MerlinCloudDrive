
export function xunlei_new_task(json) {
    if (window.thunderLink) {
        thunderLink.newTask(JSON.parse(json));
    } else {
        alert('Xunlei is not available');
    }
}

// Recursively read all files from DataTransfer items (handles directories).
// Returns a Promise that resolves to an Array of {path: string, file: File}.
export function read_dropped_entries(dataTransfer) {
    const items = dataTransfer.items;
    if (!items || items.length === 0) return Promise.resolve([]);

    const results = [];

    function readEntry(entry, basePath) {
        return new Promise((resolve) => {
            if (entry.isFile) {
                entry.file((file) => {
                    results.push({ path: basePath + file.name, file });
                    resolve();
                }, () => resolve());
            } else if (entry.isDirectory) {
                const reader = entry.createReader();
                const allEntries = [];
                // readEntries may return partial results; must call repeatedly until empty
                function readAll() {
                    reader.readEntries((entries) => {
                        if (entries.length === 0) {
                            Promise.all(allEntries.map(e => readEntry(e, basePath + entry.name + "/")))
                                .then(() => resolve());
                        } else {
                            allEntries.push(...entries);
                            readAll();
                        }
                    }, () => resolve());
                }
                readAll();
            } else {
                resolve();
            }
        });
    }

    const promises = [];
    for (let i = 0; i < items.length; i++) {
        const entry = items[i].webkitGetAsEntry ? items[i].webkitGetAsEntry() : null;
        if (entry) {
            promises.push(readEntry(entry, ""));
        }
    }
    return Promise.all(promises).then(() => results);
}

// Recursively read all files from DataTransfer items using File System Access API.
// Returns a Promise that resolves to an Array of {path: string, file: File, handleId: string|null}.
// Uses getAsFileSystemHandle() for directories to get FileSystemFileHandle for each file inside.
export function read_dropped_entries_with_handles(dataTransfer) {
    const items = dataTransfer.items;
    if (!items || items.length === 0) return Promise.resolve([]);

    const H = window.RemoteUploadHandles;
    const fsaSupported = H && H.isSupported();
    const results = [];

    // FSA recursive traversal using FileSystemDirectoryHandle
    async function readDirHandle(dirHandle, basePath) {
        for await (const [name, handle] of dirHandle.entries()) {
            if (handle.kind === 'file') {
                try {
                    const file = await handle.getFile();
                    let handleId = null;
                    if (fsaSupported) {
                        handleId = 'h-' + Math.random().toString(36).slice(2) + Date.now().toString(36);
                        try { await H.storeHandle(handleId, handle); } catch(_) { handleId = null; }
                    }
                    results.push({ path: basePath + name, file, handleId });
                } catch(_) {}
            } else if (handle.kind === 'directory') {
                await readDirHandle(handle, basePath + name + '/');
            }
        }
    }

    // Fallback: webkitGetAsEntry-based traversal (no handles)
    function readEntryLegacy(entry, basePath) {
        return new Promise((resolve) => {
            if (entry.isFile) {
                entry.file((file) => {
                    results.push({ path: basePath + file.name, file, handleId: null });
                    resolve();
                }, () => resolve());
            } else if (entry.isDirectory) {
                const reader = entry.createReader();
                const allEntries = [];
                function readAll() {
                    reader.readEntries((entries) => {
                        if (entries.length === 0) {
                            Promise.all(allEntries.map(e => readEntryLegacy(e, basePath + entry.name + "/")))
                                .then(() => resolve());
                        } else {
                            allEntries.push(...entries);
                            readAll();
                        }
                    }, () => resolve());
                }
                readAll();
            } else {
                resolve();
            }
        });
    }

    // Synchronously capture handles/entries before event expires
    const tasks = [];
    for (let i = 0; i < items.length; i++) {
        const item = items[i];
        if (item.kind !== 'file') continue;

        // Try FSA handle first (must call synchronously during event)
        let fsaHandlePromise = null;
        if (fsaSupported && typeof item.getAsFileSystemHandle === 'function') {
            fsaHandlePromise = item.getAsFileSystemHandle().catch(() => null);
        }
        // Also get legacy entry as fallback
        const legacyEntry = item.webkitGetAsEntry ? item.webkitGetAsEntry() : null;
        const file = item.getAsFile();
        tasks.push({ fsaHandlePromise, legacyEntry, file });
    }

    return (async () => {
        for (const task of tasks) {
            const handle = task.fsaHandlePromise ? await task.fsaHandlePromise : null;
            if (handle && handle.kind === 'directory') {
                // Directory with FSA handle — recursive with handles
                // Include the directory name so the folder itself is preserved
                await readDirHandle(handle, handle.name + '/');
            } else if (handle && handle.kind === 'file') {
                // Single file with FSA handle
                try {
                    const file = await handle.getFile();
                    let handleId = null;
                    if (fsaSupported) {
                        handleId = 'h-' + Math.random().toString(36).slice(2) + Date.now().toString(36);
                        try { await H.storeHandle(handleId, handle); } catch(_) { handleId = null; }
                    }
                    results.push({ path: file.name, file, handleId });
                } catch(_) {
                    if (task.file) results.push({ path: task.file.name, file: task.file, handleId: null });
                }
            } else if (task.legacyEntry) {
                // Fallback to legacy entry traversal (no handles)
                await readEntryLegacy(task.legacyEntry, '');
            } else if (task.file) {
                results.push({ path: task.file.name, file: task.file, handleId: null });
            }
        }
        return results;
    })();
}

// Check if any dropped item is a directory.
export function has_dropped_directory(dataTransfer) {
    const items = dataTransfer.items;
    if (!items) return false;
    for (let i = 0; i < items.length; i++) {
        const entry = items[i].webkitGetAsEntry ? items[i].webkitGetAsEntry() : null;
        if (entry && entry.isDirectory) return true;
    }
    return false;
}

// Capture FileSystemFileHandle objects from DataTransferItems synchronously during drop event.
// Must be called synchronously in the drop handler — items become invalid after the event.
// Returns a Promise that resolves to an Array of {file: File, handleId: string|null}.
export function capture_drop_handles(dataTransfer) {
    const items = dataTransfer.items;
    if (!items || items.length === 0) return Promise.resolve([]);

    const H = window.RemoteUploadHandles;
    const fsaSupported = H && H.isSupported();

    // Synchronously start all handle promises before any await
    const pending = [];
    for (let i = 0; i < items.length; i++) {
        const item = items[i];
        if (item.kind !== 'file') continue;
        const file = item.getAsFile();
        if (!file) continue;

        let handlePromise = null;
        if (fsaSupported && typeof item.getAsFileSystemHandle === 'function') {
            // Must call getAsFileSystemHandle synchronously during the event
            handlePromise = item.getAsFileSystemHandle()
                .then(async (handle) => {
                    if (!handle || handle.kind !== 'file') return null;
                    const handleId = 'h-' + Math.random().toString(36).slice(2) + Date.now().toString(36);
                    try {
                        await H.storeHandle(handleId, handle);
                        return handleId;
                    } catch (e) {
                        return null;
                    }
                })
                .catch(() => null);
        }
        pending.push({ file, handlePromise });
    }

    return Promise.all(pending.map(async (p) => {
        const handleId = p.handlePromise ? await p.handlePromise : null;
        return { file: p.file, handleId };
    }));
}
