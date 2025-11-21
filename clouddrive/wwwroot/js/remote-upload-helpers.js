/**
 * Remote Upload JavaScript Helpers
 * Clean, unified implementation for Blazor interop.
 * - Stores file buffers per session
 * - readData returns base64 + isLast for reliable marshalling
 * - computeHash supports MD5 (with optional block hashing), SHA1, and PikPakSha1
 */
(function () {
    const sessions = new Map();
    const drops = new Map(); // batchId -> { files: File[], rels: string[], emptyDirs: string[] }
    const globalCrypto = (typeof self !== 'undefined' && self.crypto) ? self.crypto : (typeof window !== 'undefined' ? window.crypto : undefined);
    const subtle = globalCrypto ? globalCrypto.subtle : null;
    const now = () => (self.performance && performance.now) ? performance.now() : Date.now();
    const inputDrops = new Map(); // inputId -> { batchId, count, emptyDirs } | Promise
    const surfaceDrops = new Map(); // surfaceId -> batchId | Promise
    const isPromiseLike = (value) => !!value && typeof value.then === 'function';
    const DEVICE_ID_STORAGE_KEY = 'remote-upload-device-id';
    let inMemoryDeviceId = null;
    const INDEXED_DB_NAME = 'remote-upload-handles';
    const INDEXED_DB_VERSION = 3;
    const INDEXED_DB_STORE = 'handles';
    const UPLOADS_STORE = 'uploads';
    const METADATA_STORE = 'uploads-meta';
    const DEVICE_META_KEY = 'device';
    const LEGACY_UPLOADS_STORAGE_KEY = 'remote-upload-ongoing';
    const HANDLE_ID_PREFIX = 'handle-';
    let indexedDbPromise = null;
    const permissionGrantedHandles = new WeakSet(); // Track handles that have been granted permission

    function isFileSystemAccessSupported() {
        if (typeof window === 'undefined') {
            return false;
        }
        const hasPicker = 'showOpenFilePicker' in window || 'showDirectoryPicker' in window;
        return hasPicker && 'FileSystemFileHandle' in window && 'indexedDB' in window;
    }

    function isIndexedDBSupported() {
        return typeof window !== 'undefined' && 'indexedDB' in window;
    }

    function makeHandleId() {
        try {
            if (globalCrypto && typeof globalCrypto.randomUUID === 'function') {
                return `${HANDLE_ID_PREFIX}${globalCrypto.randomUUID()}`;
            }
            if (globalCrypto && typeof globalCrypto.getRandomValues === 'function') {
                const bytes = new Uint8Array(16);
                globalCrypto.getRandomValues(bytes);
                return `${HANDLE_ID_PREFIX}${Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')}`;
            }
        } catch (_) { /* fall through */ }
        return `${HANDLE_ID_PREFIX}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
    }

    async function ensureHandlePermission(handle, skipForFiles = false) {
        if (!handle || typeof handle.queryPermission !== 'function') return 'granted';

        // If we've already granted permission for this handle (tracked via WeakSet), skip the check
        if (permissionGrantedHandles.has(handle)) {
            return 'granted';
        }

        try {
            // For file handles, optionally skip permission request (no dialog, not resumable)
            // For directory handles, always request read permission (shows dialog, resumable)
            const isFile = handle.kind === 'file';

            // If skipForFiles is true and this is a file, just mark as granted without requesting
            if (skipForFiles && isFile) {
                // File picker already granted temporary read permission
                permissionGrantedHandles.add(handle);
                return 'granted';
            }

            const mode = 'read'; // Only use read mode

            let current = 'prompt';
            try {
                current = await handle.queryPermission({ mode });
            } catch (err) {
                console.warn('[UPLOAD] queryPermission failed:', err);
                current = 'prompt';
            }

            if (current === 'granted') {
                permissionGrantedHandles.add(handle);
                return 'granted';
            }

            // For new sites or when permission is 'prompt', we must request it explicitly
            if (typeof handle.requestPermission === 'function') {
                try {
                    const result = await handle.requestPermission({ mode });
                    if (result === 'granted') {
                        permissionGrantedHandles.add(handle);
                    }
                    return result;
                } catch (err) {
                    console.warn('[UPLOAD] requestPermission failed:', err);
                    return 'denied';
                }
            }
            return current;
        } catch (err) {
            console.warn('[UPLOAD] ensureHandlePermission failed', err);
            return 'denied';
        }
    }

    function openIndexedDb() {
        if (!isIndexedDBSupported()) {
            return Promise.resolve(null);
        }
        if (indexedDbPromise) return indexedDbPromise;
        indexedDbPromise = new Promise((resolve, reject) => {
            const request = indexedDB.open(INDEXED_DB_NAME, INDEXED_DB_VERSION);
            request.onerror = () => reject(request.error);
            request.onupgradeneeded = () => {
                const db = request.result;
                if (!db.objectStoreNames.contains(INDEXED_DB_STORE)) {
                    db.createObjectStore(INDEXED_DB_STORE, { keyPath: 'id' });
                }
                if (!db.objectStoreNames.contains(UPLOADS_STORE)) {
                    db.createObjectStore(UPLOADS_STORE, { keyPath: 'id' });
                }
                if (!db.objectStoreNames.contains(METADATA_STORE)) {
                    db.createObjectStore(METADATA_STORE, { keyPath: 'id' });
                }
            };
            request.onsuccess = () => resolve(request.result);
        });
        return indexedDbPromise;
    }

    async function idbPutHandle(id, handle) {
        const db = await openIndexedDb();
        if (!db) return;
        return new Promise((resolve, reject) => {
            const tx = db.transaction(INDEXED_DB_STORE, 'readwrite');
            const store = tx.objectStore(INDEXED_DB_STORE);
            tx.oncomplete = () => resolve();
            tx.onerror = () => reject(tx.error);
            try {
                store.put({ id, handle });
            } catch (err) {
                reject(err);
            }
        });
    }

    async function idbGetHandle(id) {
        const db = await openIndexedDb();
        if (!db) return null;
        return new Promise((resolve, reject) => {
            const tx = db.transaction(INDEXED_DB_STORE, 'readonly');
            const store = tx.objectStore(INDEXED_DB_STORE);
            const request = store.get(id);
            request.onsuccess = () => {
                const value = request.result;
                resolve(value ? value.handle : null);
            };
            request.onerror = () => reject(request.error);
            tx.onerror = () => reject(tx.error);
        });
    }

    async function idbDeleteHandle(id) {
        const db = await openIndexedDb();
        if (!db) return;
        return new Promise((resolve, reject) => {
            const tx = db.transaction(INDEXED_DB_STORE, 'readwrite');
            const store = tx.objectStore(INDEXED_DB_STORE);
            tx.oncomplete = () => resolve();
            tx.onerror = () => reject(tx.error);
            try {
                store.delete(id);
            } catch (err) {
                reject(err);
            }
        });
    }

    async function idbClearHandles() {
        const db = await openIndexedDb();
        if (!db) return;
        return new Promise((resolve, reject) => {
            const tx = db.transaction(INDEXED_DB_STORE, 'readwrite');
            const store = tx.objectStore(INDEXED_DB_STORE);
            tx.oncomplete = () => resolve();
            tx.onerror = () => reject(tx.error);
            try {
                store.clear();
            } catch (err) {
                reject(err);
            }
        });
    }

    const DEFAULT_STREAM_READ = 512 * 1024; // 512KB default chunk when server length is missing or zero

    async function idbReplaceUploads(uploads, deviceId) {
        const db = await openIndexedDb();
        if (!db) return false;
        return new Promise((resolve) => {
            const tx = db.transaction([UPLOADS_STORE, METADATA_STORE], 'readwrite');
            const uploadStore = tx.objectStore(UPLOADS_STORE);
            const metaStore = tx.objectStore(METADATA_STORE);
            uploadStore.clear();
            try {
                if (Array.isArray(uploads)) {
                    for (const entry of uploads) {
                        if (entry && entry.UploadId) {
                            uploadStore.put({ id: entry.UploadId, payload: entry, updatedAt: Date.now() });
                        }
                    }
                }
                if (deviceId !== undefined) {
                    if (deviceId) {
                        metaStore.put({ id: DEVICE_META_KEY, value: deviceId, updatedAt: Date.now() });
                    } else {
                        metaStore.delete(DEVICE_META_KEY);
                    }
                }
            } catch (err) {
                console.warn('[UPLOAD] Error writing uploads to IndexedDB', err);
                resolve(false);
                return;
            }
            tx.oncomplete = () => resolve(true);
            tx.onerror = () => {
                console.warn('[UPLOAD] Failed to persist uploads in IndexedDB', tx.error);
                resolve(false);
            };
        });
    }

    async function idbReadUploads() {
        const db = await openIndexedDb();
        if (!db) return null;
        return new Promise((resolve) => {
            const tx = db.transaction([UPLOADS_STORE, METADATA_STORE], 'readonly');
            const uploadStore = tx.objectStore(UPLOADS_STORE);
            const metaStore = tx.objectStore(METADATA_STORE);
            const uploads = [];
            let deviceId = null;

            const uploadsRequest = uploadStore.getAll();
            uploadsRequest.onsuccess = () => {
                const records = uploadsRequest.result || [];
                for (const record of records) {
                    if (record && record.payload && record.payload.UploadId) {
                        uploads.push(record.payload);
                    }
                }
            };
            uploadsRequest.onerror = () => {
                console.warn('[UPLOAD] Failed to read uploads from IndexedDB', uploadsRequest.error);
            };

            const deviceRequest = metaStore.get(DEVICE_META_KEY);
            deviceRequest.onsuccess = () => {
                const rec = deviceRequest.result;
                if (rec && (typeof rec.value === 'string')) {
                    deviceId = rec.value;
                } else if (rec && typeof rec.deviceId === 'string') {
                    deviceId = rec.deviceId;
                }
            };
            deviceRequest.onerror = () => {
                console.warn('[UPLOAD] Failed to read metadata from IndexedDB', deviceRequest.error);
            };

            tx.oncomplete = () => resolve({ uploads, deviceId });
            tx.onerror = () => {
                console.warn('[UPLOAD] Transaction error reading uploads from IndexedDB', tx.error);
                resolve(null);
            };
        });
    }

    async function idbClearUploads() {
        const db = await openIndexedDb();
        if (!db) return false;
        return new Promise((resolve) => {
            const tx = db.transaction([UPLOADS_STORE, METADATA_STORE], 'readwrite');
            const uploadStore = tx.objectStore(UPLOADS_STORE);
            const metaStore = tx.objectStore(METADATA_STORE);
            try {
                uploadStore.clear();
                metaStore.clear();
            } catch (err) {
                console.warn('[UPLOAD] Error clearing uploads from IndexedDB', err);
                resolve(false);
                return;
            }
            tx.oncomplete = () => resolve(true);
            tx.onerror = () => {
                console.warn('[UPLOAD] Failed to clear uploads in IndexedDB', tx.error);
                resolve(false);
            };
        });
    }

    async function persistHandleForEntry(entry, handle, skipPermissionCheck, fromDirectory = false) {
        if (!entry || !isFileSystemAccessSupported() || !handle) {
            return null;
        }
        try {
            // Store all file handles (individual files and directory files)
            // Individual files: skip permission on first upload (no dialog), request on restore (resumable)
            // Directory files: request permission on first upload (shows dialog, resumable)

            let permission = 'granted';
            if (!skipPermissionCheck) {
                permission = await ensureHandlePermission(handle);
            }

            if (permission !== 'granted') {
                // Still store the handle even if permission not granted
                // This allows us to request permission on restore
            }
            const handleId = makeHandleId();
            await idbPutHandle(handleId, handle);
            entry.handleId = handleId;
            return handleId;
        } catch (err) {
            console.warn('[UPLOAD] persistHandleForEntry failed', err);
            return null;
        }
    }

    function toHex(buffer) {
        const bytes = new Uint8Array(buffer);
        return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
    }

    // Little-endian 32-bit number to hex
    function toHexLE(num) {
        let s = '';
        for (let i = 0; i < 4; i++) {
            s += ('0' + ((num >> (i * 8)) & 0xff).toString(16)).slice(-2);
        }
        return s;
    }

    async function sha1(buffer) {
        if (!subtle) {
            // Fallback to pure JS implementation for non-secure contexts (HTTP)
            const ctx = new SHA1Ctx();
            ctx.update(new Uint8Array(buffer));
            return ctx.finalizeHex();
        }
        return toHex(await subtle.digest('SHA-1', buffer));
    }

    async function sha1Binary(buffer) {
        if (!subtle) {
            // Fallback to pure JS implementation for non-secure contexts (HTTP)
            const ctx = new SHA1Ctx();
            ctx.update(new Uint8Array(buffer));
            const hex = ctx.finalizeHex();
            // Convert hex string to binary (ArrayBuffer)
            const bytes = new Uint8Array(hex.length / 2);
            for (let i = 0; i < hex.length; i += 2) {
                bytes[i / 2] = parseInt(hex.substr(i, 2), 16);
            }
            return bytes.buffer;
        }
        return await subtle.digest('SHA-1', buffer);
    }

    // Streaming SHA1 implementation for large files
    class SHA1Ctx {
        constructor() {
            this.h0 = 0x67452301;
            this.h1 = 0xEFCDAB89;
            this.h2 = 0x98BADCFE;
            this.h3 = 0x10325476;
            this.h4 = 0xC3D2E1F0;
            this.buf = new Uint8Array(64);
            this.bufLen = 0;
            this.bytesLo = 0;
            this.bytesHi = 0;
        }

        addLength(n) {
            const lo = (this.bytesLo + (n >>> 0)) >>> 0;
            const carry = (lo < this.bytesLo) ? 1 : 0;
            this.bytesLo = lo >>> 0;
            this.bytesHi = (this.bytesHi + carry) >>> 0;
        }

        static rol(v, s) { return ((v << s) | (v >>> (32 - s))) >>> 0; }
        static add(a, b) { return (a + b) >>> 0; }

        processBlock(block) {
            const w = new Uint32Array(80);
            const dv = new DataView(block.buffer, block.byteOffset);
            
            // Load block into first 16 words (big-endian) - use DataView for faster access
            for (let i = 0; i < 16; i++) {
                w[i] = dv.getUint32(i * 4, false); // false = big-endian
            }
            
            // Extend to 80 words
            for (let i = 16; i < 80; i++) {
                const x = w[i - 3] ^ w[i - 8] ^ w[i - 14] ^ w[i - 16];
                w[i] = (x << 1 | x >>> 31) >>> 0;
            }

            let a = this.h0, b = this.h1, c = this.h2, d = this.h3, e = this.h4;

            // Unrolled loop for better performance
            for (let i = 0; i < 20; i++) {
                const t = ((a << 5 | a >>> 27) + ((b & c) | (~b & d)) + e + w[i] + 0x5A827999) >>> 0;
                e = d; d = c; c = (b << 30 | b >>> 2) >>> 0; b = a; a = t;
            }
            for (let i = 20; i < 40; i++) {
                const t = ((a << 5 | a >>> 27) + (b ^ c ^ d) + e + w[i] + 0x6ED9EBA1) >>> 0;
                e = d; d = c; c = (b << 30 | b >>> 2) >>> 0; b = a; a = t;
            }
            for (let i = 40; i < 60; i++) {
                const t = ((a << 5 | a >>> 27) + ((b & c) | (b & d) | (c & d)) + e + w[i] + 0x8F1BBCDC) >>> 0;
                e = d; d = c; c = (b << 30 | b >>> 2) >>> 0; b = a; a = t;
            }
            for (let i = 60; i < 80; i++) {
                const t = ((a << 5 | a >>> 27) + (b ^ c ^ d) + e + w[i] + 0xCA62C1D6) >>> 0;
                e = d; d = c; c = (b << 30 | b >>> 2) >>> 0; b = a; a = t;
            }

            this.h0 = (this.h0 + a) >>> 0;
            this.h1 = (this.h1 + b) >>> 0;
            this.h2 = (this.h2 + c) >>> 0;
            this.h3 = (this.h3 + d) >>> 0;
            this.h4 = (this.h4 + e) >>> 0;
        }

        update(u8) {
            if (!(u8 instanceof Uint8Array)) u8 = new Uint8Array(u8);
            let pos = 0;
            const len = u8.length;
            if (len === 0) return;
            this.addLength(len);

            if (this.bufLen) {
                const take = Math.min(64 - this.bufLen, len);
                this.buf.set(u8.subarray(0, take), this.bufLen);
                this.bufLen += take;
                pos += take;
                if (this.bufLen === 64) {
                    this.processBlock(this.buf);
                    this.bufLen = 0;
                }
            }

            while (pos + 64 <= len) {
                this.processBlock(u8.subarray(pos, pos + 64));
                pos += 64;
            }

            if (pos < len) {
                this.buf.set(u8.subarray(pos, len), 0);
                this.bufLen = len - pos;
            }
        }

        finalizeHex() {
            const origLo = this.bytesLo;
            const origHi = this.bytesHi;

            const padLen = (this.bufLen < 56) ? (56 - this.bufLen) : (64 - this.bufLen + 56);
            const pad = new Uint8Array(padLen + 8);
            pad[0] = 0x80;

            // SHA1 uses big-endian length in bits
            const bitsHi = ((origHi << 3) | (origLo >>> 29)) >>> 0;
            const bitsLo = (origLo << 3) >>> 0;
            const dv = new DataView(pad.buffer);
            dv.setUint32(padLen + 0, bitsHi, false); // big-endian
            dv.setUint32(padLen + 4, bitsLo, false);

            this.update(pad);

            // Output hash (big-endian)
            const toHexBE = (num) => {
                let s = '';
                for (let i = 3; i >= 0; i--) {
                    s += ('0' + ((num >> (i * 8)) & 0xff).toString(16)).slice(-2);
                }
                return s;
            };

            return toHexBE(this.h0) + toHexBE(this.h1) + toHexBE(this.h2) + toHexBE(this.h3) + toHexBE(this.h4);
        }
    }

    function calculatePikPakBlockSize(fileSize) {
        if (fileSize <= 128 * 1024 * 1024) {
            return 256 * 1024; // 256KB
        }
        if (fileSize <= 256 * 1024 * 1024) {
            return 512 * 1024; // 512KB
        }
        if (fileSize <= 512 * 1024 * 1024) {
            return 1024 * 1024; // 1MB
        }
        return 2048 * 1024; // 2MB
    }

    async function computePikPakSha1(buffer) {
        const total = buffer.byteLength;
        const blockSize = calculatePikPakBlockSize(total);
        const ctx = new SHA1Ctx();
        for (let offset = 0; offset < total; offset += blockSize) {
            const end = Math.min(offset + blockSize, total);
            const slice = buffer.slice(offset, end);
            // Hash the segment
            const segmentHash = await sha1Binary(slice);
            // Feed the binary hash (not hex) into the final hasher
            ctx.update(new Uint8Array(segmentHash));
        }
        return ctx.finalizeHex().toUpperCase();
    }

    // MD5 helper using the streaming context for correctness and simplicity
    function md5HexFromBytes(bytes) {
        const ctx = new MD5Ctx();
        ctx.update(bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes));
        return ctx.finalizeHex();
    }

    // Streaming/incremental MD5 context for faster hashing without full buffering
    class MD5Ctx {
        constructor() {
            this.a = 0x67452301 >>> 0;
            this.b = 0xefcdab89 >>> 0;
            this.c = 0x98badcfe >>> 0;
            this.d = 0x10325476 >>> 0;
            this.buf = new Uint8Array(64); // 512-bit block buffer
            this.bufLen = 0;
            this.bytesLo = 0 >>> 0; // total length in bytes (low 32)
            this.bytesHi = 0 >>> 0; // total length in bytes (high 32)
        }

        addLength(n) {
            // 64-bit little-endian increment
            const lo = (this.bytesLo + (n >>> 0)) >>> 0;
            const carry = (lo < this.bytesLo) ? 1 : 0;
            this.bytesLo = lo >>> 0;
            this.bytesHi = (this.bytesHi + carry) >>> 0;
        }

        // Core MD5 functions
        static rol(v, s) { return ((v << s) | (v >>> (32 - s))) >>> 0; }
        static add(a, b) { return (a + b) >>> 0; }
        static F(x, y, z) { return (x & y) | (~x & z); }
        static G(x, y, z) { return (x & z) | (y & ~z); }
        static H(x, y, z) { return x ^ y ^ z; }
        static I(x, y, z) { return y ^ (x | ~z); }

        processBlock(block) {
            // block: Uint8Array length 64
            const x = new Uint32Array(16);
            for (let i = 0, j = 0; i < 16; i++, j += 4) {
                x[i] = (block[j]) | (block[j + 1] << 8) | (block[j + 2] << 16) | (block[j + 3] << 24);
            }

            let a = this.a, b = this.b, c = this.c, d = this.d;
            const { rol, add, F, G, H, I } = MD5Ctx;

            // Round 1
            a = add(rol(add(add(a, F(b, c, d)), add(x[0], 0xd76aa478)), 7), b);
            d = add(rol(add(add(d, F(a, b, c)), add(x[1], 0xe8c7b756)), 12), a);
            c = add(rol(add(add(c, F(d, a, b)), add(x[2], 0x242070db)), 17), d);
            b = add(rol(add(add(b, F(c, d, a)), add(x[3], 0xc1bdceee)), 22), c);
            a = add(rol(add(add(a, F(b, c, d)), add(x[4], 0xf57c0faf)), 7), b);
            d = add(rol(add(add(d, F(a, b, c)), add(x[5], 0x4787c62a)), 12), a);
            c = add(rol(add(add(c, F(d, a, b)), add(x[6], 0xa8304613)), 17), d);
            b = add(rol(add(add(b, F(c, d, a)), add(x[7], 0xfd469501)), 22), c);
            a = add(rol(add(add(a, F(b, c, d)), add(x[8], 0x698098d8)), 7), b);
            d = add(rol(add(add(d, F(a, b, c)), add(x[9], 0x8b44f7af)), 12), a);
            c = add(rol(add(add(c, F(d, a, b)), add(x[10], 0xffff5bb1)), 17), d);
            b = add(rol(add(add(b, F(c, d, a)), add(x[11], 0x895cd7be)), 22), c);
            a = add(rol(add(add(a, F(b, c, d)), add(x[12], 0x6b901122)), 7), b);
            d = add(rol(add(add(d, F(a, b, c)), add(x[13], 0xfd987193)), 12), a);
            c = add(rol(add(add(c, F(d, a, b)), add(x[14], 0xa679438e)), 17), d);
            b = add(rol(add(add(b, F(c, d, a)), add(x[15], 0x49b40821)), 22), c);

            // Round 2
            a = add(rol(add(add(a, G(b, c, d)), add(x[1], 0xf61e2562)), 5), b);
            d = add(rol(add(add(d, G(a, b, c)), add(x[6], 0xc040b340)), 9), a);
            c = add(rol(add(add(c, G(d, a, b)), add(x[11], 0x265e5a51)), 14), d);
            b = add(rol(add(add(b, G(c, d, a)), add(x[0], 0xe9b6c7aa)), 20), c);
            a = add(rol(add(add(a, G(b, c, d)), add(x[5], 0xd62f105d)), 5), b);
            d = add(rol(add(add(d, G(a, b, c)), add(x[10], 0x02441453)), 9), a);
            c = add(rol(add(add(c, G(d, a, b)), add(x[15], 0xd8a1e681)), 14), d);
            b = add(rol(add(add(b, G(c, d, a)), add(x[4], 0xe7d3fbc8)), 20), c);
            a = add(rol(add(add(a, G(b, c, d)), add(x[9], 0x21e1cde6)), 5), b);
            d = add(rol(add(add(d, G(a, b, c)), add(x[14], 0xc33707d6)), 9), a);
            c = add(rol(add(add(c, G(d, a, b)), add(x[3], 0xf4d50d87)), 14), d);
            b = add(rol(add(add(b, G(c, d, a)), add(x[8], 0x455a14ed)), 20), c);
            a = add(rol(add(add(a, G(b, c, d)), add(x[13], 0xa9e3e905)), 5), b);
            d = add(rol(add(add(d, G(a, b, c)), add(x[2], 0xfcefa3f8)), 9), a);
            c = add(rol(add(add(c, G(d, a, b)), add(x[7], 0x676f02d9)), 14), d);
            b = add(rol(add(add(b, G(c, d, a)), add(x[12], 0x8d2a4c8a)), 20), c);

            // Round 3
            a = add(rol(add(add(a, H(b, c, d)), add(x[5], 0xfffa3942)), 4), b);
            d = add(rol(add(add(d, H(a, b, c)), add(x[8], 0x8771f681)), 11), a);
            c = add(rol(add(add(c, H(d, a, b)), add(x[11], 0x6d9d6122)), 16), d);
            b = add(rol(add(add(b, H(c, d, a)), add(x[14], 0xfde5380c)), 23), c);
            a = add(rol(add(add(a, H(b, c, d)), add(x[1], 0xa4beea44)), 4), b);
            d = add(rol(add(add(d, H(a, b, c)), add(x[4], 0x4bdecfa9)), 11), a);
            c = add(rol(add(add(c, H(d, a, b)), add(x[7], 0xf6bb4b60)), 16), d);
            b = add(rol(add(add(b, H(c, d, a)), add(x[10], 0xbebfbc70)), 23), c);
            a = add(rol(add(add(a, H(b, c, d)), add(x[13], 0x289b7ec6)), 4), b);
            d = add(rol(add(add(d, H(a, b, c)), add(x[0], 0xeaa127fa)), 11), a);
            c = add(rol(add(add(c, H(d, a, b)), add(x[3], 0xd4ef3085)), 16), d);
            b = add(rol(add(add(b, H(c, d, a)), add(x[6], 0x04881d05)), 23), c);
            a = add(rol(add(add(a, H(b, c, d)), add(x[9], 0xd9d4d039)), 4), b);
            d = add(rol(add(add(d, H(a, b, c)), add(x[12], 0xe6db99e5)), 11), a);
            c = add(rol(add(add(c, H(d, a, b)), add(x[15], 0x1fa27cf8)), 16), d);
            b = add(rol(add(add(b, H(c, d, a)), add(x[2], 0xc4ac5665)), 23), c);

            // Round 4
            a = add(rol(add(add(a, I(b, c, d)), add(x[0], 0xf4292244)), 6), b);
            d = add(rol(add(add(d, I(a, b, c)), add(x[7], 0x432aff97)), 10), a);
            c = add(rol(add(add(c, I(d, a, b)), add(x[14], 0xab9423a7)), 15), d);
            b = add(rol(add(add(b, I(c, d, a)), add(x[5], 0xfc93a039)), 21), c);
            a = add(rol(add(add(a, I(b, c, d)), add(x[12], 0x655b59c3)), 6), b);
            d = add(rol(add(add(d, I(a, b, c)), add(x[3], 0x8f0ccc92)), 10), a);
            c = add(rol(add(add(c, I(d, a, b)), add(x[10], 0xffeff47d)), 15), d);
            b = add(rol(add(add(b, I(c, d, a)), add(x[1], 0x85845dd1)), 21), c);
            a = add(rol(add(add(a, I(b, c, d)), add(x[8], 0x6fa87e4f)), 6), b);
            d = add(rol(add(add(d, I(a, b, c)), add(x[15], 0xfe2ce6e0)), 10), a);
            c = add(rol(add(add(c, I(d, a, b)), add(x[6], 0xa3014314)), 15), d);
            b = add(rol(add(add(b, I(c, d, a)), add(x[13], 0x4e0811a1)), 21), c);
            a = add(rol(add(add(a, I(b, c, d)), add(x[4], 0xf7537e82)), 6), b);
            d = add(rol(add(add(d, I(a, b, c)), add(x[11], 0xbd3af235)), 10), a);
            c = add(rol(add(add(c, I(d, a, b)), add(x[2], 0x2ad7d2bb)), 15), d);
            b = add(rol(add(add(b, I(c, d, a)), add(x[9], 0xeb86d391)), 21), c);

            this.a = (this.a + a) >>> 0;
            this.b = (this.b + b) >>> 0;
            this.c = (this.c + c) >>> 0;
            this.d = (this.d + d) >>> 0;
        }

        update(u8) {
            if (!(u8 instanceof Uint8Array)) u8 = new Uint8Array(u8);
            let pos = 0;
            const len = u8.length;
            if (len === 0) return;
            this.addLength(len);
            // Fill leftover buffer first
            if (this.bufLen) {
                const take = Math.min(64 - this.bufLen, len);
                this.buf.set(u8.subarray(0, take), this.bufLen);
                this.bufLen += take;
                pos += take;
                if (this.bufLen === 64) {
                    this.processBlock(this.buf);
                    this.bufLen = 0;
                }
            }
            // Process full 64-byte blocks directly from input
            while (pos + 64 <= len) {
                this.processBlock(u8.subarray(pos, pos + 64));
                pos += 64;
            }
            // Store remaining bytes
            if (pos < len) {
                this.buf.set(u8.subarray(pos, len), 0);
                this.bufLen = len - pos;
            }
        }

        finalizeHex() {
            // Snapshot message length before appending padding/length
            const origLo = this.bytesLo;
            const origHi = this.bytesHi;

            // Pad: 0x80 followed by zeros until message length ≡ 56 (mod 64)
            const padLen = (this.bufLen < 56) ? (56 - this.bufLen) : (64 - this.bufLen + 56);
            const pad = new Uint8Array(padLen + 8); // include space for length encoding
            pad[0] = 0x80;

            // Append original length in bits as little-endian 64-bit at the end of pad buffer
            const bitsLo = ((origLo << 3) >>> 0);
            const bitsHi = ((origHi << 3) | (origLo >>> 29)) >>> 0;
            const dv = new DataView(pad.buffer);
            dv.setUint32(padLen + 0, bitsLo, true);
            dv.setUint32(padLen + 4, bitsHi, true);

            this.update(pad);

            // Produce hex digest
            return toHexLE(this.a) + toHexLE(this.b) + toHexLE(this.c) + toHexLE(this.d);
        }
    }

    function toBase64(arrayBuffer) {
        // Convert ArrayBuffer to base64 efficiently
        const bytes = new Uint8Array(arrayBuffer);
        // Prefer TextDecoder('latin1') which maps bytes 1:1 to string code units
        try {
            if (typeof TextDecoder !== 'undefined') {
                const decoder = new TextDecoder('latin1');
                const binary = decoder.decode(bytes);
                return btoa(binary);
            }
        } catch (_) { /* fallback */ }
        // Fallback: chunked String.fromCharCode.apply to avoid deep argument lists
    const chunkSize = 0x20000; // 128KB for better throughput
        let binary = '';
        for (let i = 0; i < bytes.length; i += chunkSize) {
            const chunk = bytes.subarray(i, i + chunkSize);
            binary += String.fromCharCode.apply(null, chunk);
        }
        return btoa(binary);
    }

    const MAX_IN_MEMORY_HASH = 128 * 1024 * 1024;

    function makeSessionId(prefix = 'sess') {
        return `${prefix}-${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
    }

    async function createSessionForFile(file, relativePath, handle, skipPermissionCheck, fromDirectory = false) {
        if (!file) throw new Error('file is required');
        const sessionId = makeSessionId('upl');
        const entry = {
            file,
            size: file.size,
            canceled: false,
            handleId: null
        };
        if (file.size <= MAX_IN_MEMORY_HASH) {
            try {
                entry.buffer = await file.arrayBuffer();
            } catch (err) {
                console.warn('[UPLOAD] failed to buffer file for hashing', err);
            }
        }
        if (handle) {
            const persistedId = await persistHandleForEntry(entry, handle, skipPermissionCheck, fromDirectory);
            if (!persistedId) {
                entry.handleError = true;
            }
        }
        sessions.set(sessionId, entry);
        return {
            sessionKey: sessionId,
            fileName: file.name,
            size: file.size,
            relativePath: relativePath || '',
            handleId: entry.handleId,
            hasHandle: !!entry.handleId
        };
    }

    async function createSessionsForFiles(files, rels, fileHandles) {
        if (!files || files.length === 0) return [];

        // For file handles: skip permission request (no dialog, not resumable on first upload)
        // For directory handles: request permission (shows dialog, resumable)
        // This provides a better UX - users don't get bombarded with dialogs for each file
        if (fileHandles && fileHandles.length > 0) {
            // Check if we have any directory handles
            const hasDirectoryHandles = fileHandles.some(h => h && h.kind === 'directory');

            for (let i = 0; i < fileHandles.length; i++) {
                const handle = fileHandles[i];
                if (handle) {
                    // Only skip permission for individual file handles
                    // Directory handles will still show permission dialog
                    const isFile = handle.kind === 'file';
                    await ensureHandlePermission(handle, isFile); // skipForFiles only for files
                }
            }
        }

        const selections = [];
        for (let i = 0; i < files.length; i++) {
            const rel = rels ? rels[i] : undefined;
            const handle = fileHandles ? fileHandles[i] : undefined;

            // Determine if this file is from a directory
            // Files from directories have relativePath with folder separator
            const fromDirectory = rel && rel.includes('/');

            // Skip permission check since we already did it above
            selections.push(await createSessionForFile(files[i], rel, handle, true, fromDirectory));
        }
        return selections;
    }

    async function collectDirectoryHandle(handle, prefix, files, rels, emptyDirs, fileHandles) {
        const path = prefix ? `${prefix}${handle.name}/` : `${handle.name}/`;
        let hasEntries = false;
        for await (const entry of handle.values()) {
            hasEntries = true;
            if (entry.kind === 'file') {
                const file = await entry.getFile();
                files.push(file);
                rels.push(`${path}${file.name}`);
                if (fileHandles) {
                    fileHandles.push(entry);
                }
            } else if (entry.kind === 'directory') {
                await collectDirectoryHandle(entry, path, files, rels, emptyDirs, fileHandles);
            }
        }
        if (!hasEntries) {
            emptyDirs.push(path.slice(0, -1));
        }
    }

    async function collectFromTransferHandle(handle, prefix, files, rels, emptyDirs, fileHandles) {
        if (!handle) return;
        try {
            if (handle.kind === 'file') {
                const file = await handle.getFile();
                const rel = prefix ? `${prefix}${file.name}` : file.name;
                files.push(file);
                rels.push(rel);
                if (fileHandles) {
                    fileHandles.push(handle);
                }
            } else if (handle.kind === 'directory') {
                await collectDirectoryHandle(handle, prefix, files, rels, emptyDirs, fileHandles);
            }
        } catch (err) {
            console.warn('[DROP] failed to collect transfer handle', err);
        }
    }

    async function openPicker(options = {}) {
        const allowFolders = !!options.allowFolders;
        const multiple = options.multiple !== false;
    const files = [];
    const rels = [];
    const emptyDirs = [];
    const fileHandles = [];

        try {
            if (allowFolders && window.showDirectoryPicker) {
                const dirHandle = await window.showDirectoryPicker({
                    id: options.id || 'upload-folder-picker',
                    mode: 'read'
                });
                await collectDirectoryHandle(dirHandle, '', files, rels, emptyDirs, fileHandles);
            } else if (window.showOpenFilePicker) {
                const pickerHandles = await window.showOpenFilePicker({
                    multiple,
                    id: options.id || 'upload-file-picker',
                    types: options.types || undefined
                });

                // Collect files and handles - actual storage happens in createSessionForFile
                // which will request readwrite permission and trigger "Save changes" dialog
                for (const handle of pickerHandles) {
                    const file = await handle.getFile();
                    files.push(file);
                    rels.push(file.name);
                    fileHandles.push(handle);
                }
            } else {
                const input = document.createElement('input');
                input.type = 'file';
                input.multiple = multiple;
                if (allowFolders) input.webkitdirectory = true;
                if (options.accept) input.accept = options.accept;

                const selections = await new Promise((resolve) => {
                    let settled = false;
                    const cleanup = () => {
                        if (input.parentNode) input.parentNode.removeChild(input);
                    };
                    const finish = (values) => {
                        if (settled) return;
                        settled = true;
                        resolve(values);
                        cleanup();
                    };
                    input.addEventListener('change', () => finish(Array.from(input.files || [])), { once: true });
                    input.addEventListener('cancel', () => finish([]), { once: true });
                    input.addEventListener('focusout', () => {
                        setTimeout(() => {
                            if (!settled && (!input.files || input.files.length === 0)) {
                                finish([]);
                            }
                        }, 0);
                    }, { once: true });
                    document.body.appendChild(input);
                    input.click();
                });

                for (const file of selections) {
                    files.push(file);
                    const rel = (/** @type {any} */(file)).webkitRelativePath || file.name;
                    rels.push(rel);
                    fileHandles.push(null);
                }
            }
        } catch (err) {
            if (err && err.name === 'AbortError') {
                return { files: [], emptyDirs: [] };
            }
            throw err;
        }

        const selections = await createSessionsForFiles(files, rels, fileHandles);
        const enriched = await Promise.all(selections.map(async (selection, index) => {
            const session = sessions.get(selection.sessionKey);
            const handle = fileHandles[index];
            if (session && handle && !session.handleId) {
                const handleId = await persistHandleForEntry(session, handle);
                if (handleId) {
                    session.handleId = handleId;
                }
            }
            return {
                ...selection,
                handleId: session?.handleId || null,
                hasHandle: !!session?.handleId
            };
        }));
        return { files: enriched, emptyDirs };
    }

    async function createSessionsFromDrop(batchId) {
        if (!batchId) return null;
        const drop = drops.get(batchId);
        if (!drop) return null;
        const selections = await createSessionsForFiles(drop.files, drop.rels, drop.handles);
        const enriched = await Promise.all(selections.map(async (selection, index) => {
            const session = sessions.get(selection.sessionKey);
            const handle = drop.handles[index];
            if (session && handle && !session.handleId) {
                const handleId = await persistHandleForEntry(session, handle);
                if (handleId) {
                    session.handleId = handleId;
                }
            }
            return {
                ...selection,
                handleId: session?.handleId || null,
                hasHandle: !!session?.handleId
            };
        }));
        drops.delete(batchId);
        return {
            files: enriched,
            emptyDirs: drop.emptyDirs.slice()
        };
    }

    window.RemoteUploadHelpers = {
        attachGlobalInputDropTracker() {
            // Attach once
            if (window.__cdmInputDropTrackerAttached) return;
            window.__cdmInputDropTrackerAttached = true;
            document.addEventListener('drop', (e) => {
                try {
                    const target = e.target;
                    if (!target) return;
                    if (target instanceof Element) {
                        const isOverlay = target.matches('input[type="file"].files-content-overlay, input[type="file"].folder-upload-overlay');
                        const surface = target.closest('[data-upload-surface]');
                        const surfaceId = surface ? (surface.getAttribute('data-upload-surface') || surface.id) : null;
                        if ((isOverlay && target.id) || surfaceId) {
                            const registration = window.RemoteUploadHelpers.registerDrop(e.dataTransfer);

                            if (isOverlay && target.id) {
                                inputDrops.set(target.id, registration);
                                registration.then((res) => {
                                    if (inputDrops.get(target.id) === registration) {
                                        inputDrops.set(target.id, res);
                                    }
                                }).catch(() => {
                                    if (inputDrops.get(target.id) === registration) {
                                        inputDrops.delete(target.id);
                                    }
                                });
                            }

                            if (surfaceId) {
                                surfaceDrops.set(surfaceId, registration);
                                registration.then((res) => {
                                    if (surfaceDrops.get(surfaceId) === registration) {
                                        surfaceDrops.set(surfaceId, res.batchId || null);
                                    }
                                }).catch(() => {
                                    if (surfaceDrops.get(surfaceId) === registration) {
                                        surfaceDrops.delete(surfaceId);
                                    }
                                });
                            }
                            // Do NOT prevent default here to allow the element to receive files normally
                        }
                    }
                } catch (err) {
                    console.warn('[DROP] global tracker error:', err);
                }
            }, true);
        },
        getInputDropBatch(inputId) {
            const value = inputDrops.get(inputId);
            if (!value || isPromiseLike(value)) {
                return null;
            }
            return value;
        },
        consumeInputDropBatch(inputId) {
            const value = inputDrops.get(inputId) || null;
            if (!value) return null;
            if (isPromiseLike(value)) {
                inputDrops.delete(inputId);
                return value;
            }
            inputDrops.delete(inputId);
            return value;
        },
        async consumeSurfaceDrop(surfaceId) {
            if (!surfaceId) return null;
            const value = surfaceDrops.get(surfaceId) || null;
            if (!value) {
                surfaceDrops.delete(surfaceId);
                return null;
            }
            surfaceDrops.delete(surfaceId);
            try {
                if (isPromiseLike(value)) {
                    const res = await value;
                    if (!res || !res.batchId) {
                        return null;
                    }
                    return await createSessionsFromDrop(res.batchId);
                }

                if (typeof value === 'string') {
                    return await createSessionsFromDrop(value);
                }

                if (value && typeof value === 'object' && 'batchId' in value) {
                    const batchId = value.batchId;
                    if (!batchId) {
                        return null;
                    }
                    return await createSessionsFromDrop(batchId);
                }
            } catch (err) {
                console.warn(`[DROP] consumeSurfaceDrop failed for ${surfaceId}:`, err);
            }
            return null;
        },
        async registerDrop(dataTransfer) {
            // Traverse DataTransferItemList to collect files with relative paths and empty directories
            const batchId = 'drop-' + Math.random().toString(36).slice(2);
            const result = { files: [], rels: [], emptyDirs: [], handles: [] };
            try {
                const items = (dataTransfer && dataTransfer.items) ? Array.from(dataTransfer.items) : [];
                let usedFileSystemHandles = false;
                // Only attempt File System Access API on HTTPS or localhost
                if (isFileSystemAccessSupported() && items.length && items.some((it) => typeof it.getAsFileSystemHandle === 'function')) {
                    // CRITICAL: Get all handles synchronously FIRST before any await
                    // Chrome invalidates DataTransfer items after the first async operation
                    const handlePromises = [];
                    for (let i = 0; i < items.length; i++) {
                        const it = items[i];
                        if (typeof it.getAsFileSystemHandle === 'function') {
                            handlePromises.push(
                                it.getAsFileSystemHandle()
                                    .then(handle => ({ index: i, handle, error: null }))
                                    .catch(err => ({ index: i, handle: null, error: err }))
                            );
                        } else {
                            handlePromises.push(Promise.resolve({ index: i, handle: null, error: 'not supported' }));
                        }
                    }

                    // Now await all handles together
                    const handleResults = await Promise.all(handlePromises);

                    // Process all handles
                    for (const { handle, error } of handleResults) {
                        if (error || !handle) {
                            continue;
                        }

                        await collectFromTransferHandle(handle, '', result.files, result.rels, result.emptyDirs, result.handles);
                        usedFileSystemHandles = true;
                    }
                }

                if (!usedFileSystemHandles && items.length && items[0].webkitGetAsEntry) {
                    const readAllEntries = async (dirReader) => {
                        const all = [];
                        while (true) {
                            const batch = await new Promise((resolve) => dirReader.readEntries(resolve));
                            if (!batch || batch.length === 0) break;
                            all.push(...batch);
                        }
                        return all;
                    };
                    const traverseEntry = async (entry, path) => {
                        if (!entry) return;
                        if (entry.isFile) {
                            await new Promise((resolve) => entry.file(f => { result.files.push(f); result.rels.push(path + f.name); result.handles.push(null); resolve(); }));
                        } else if (entry.isDirectory) {
                            const dirReader = entry.createReader();
                            const entries = await readAllEntries(dirReader);
                            if (!entries || entries.length === 0) {
                                // empty directory
                                result.emptyDirs.push(path + entry.name);
                            } else {
                                const dirPath = path + entry.name + '/';
                                for (const child of entries) {
                                    await traverseEntry(child, dirPath);
                                }
                            }
                        }
                    };
                    // Kick off traversal for all items
                    for (const it of items) {
                        const entry = it.webkitGetAsEntry();
                        if (entry) await traverseEntry(entry, '');
                    }
                }
                else {
                    // Fallback to flat files (no empty directories)
                    const files = (dataTransfer && dataTransfer.files) ? Array.from(dataTransfer.files) : [];
                    for (const f of files) {
                        result.files.push(f);
                        const rel = (/** @type {any} */(f)).webkitRelativePath || f.name;
                        result.rels.push(rel);
                        result.handles.push(null);
                    }
                }
            } catch (e) {
                console.warn('[DROP] enumerate failed:', e);
            }
            drops.set(batchId, result);
            return { batchId, count: result.files.length, emptyDirs: result.emptyDirs.slice() };
        },
            triggerFileInput(inputId) {
                if (!inputId) return false;
                try {
                    const el = document.getElementById(inputId);
                    if (el && typeof el.click === 'function') {
                        el.click();
                        return true;
                    }
                } catch (err) {
                    console.warn('[UPLOAD] triggerFileInput failed', err);
                }
                return false;
            },
        getDeviceId() {
            if (inMemoryDeviceId) {
                return inMemoryDeviceId;
            }
            let deviceId = null;
            try {
                deviceId = localStorage.getItem(DEVICE_ID_STORAGE_KEY);
                if (deviceId && typeof deviceId === 'string' && deviceId.length >= 8) {
                    inMemoryDeviceId = deviceId;
                    return deviceId;
                }
            } catch (err) {
                // ignore localStorage errors and fallback to in-memory id
            }

            try {
                if (globalCrypto && typeof globalCrypto.randomUUID === 'function') {
                    deviceId = globalCrypto.randomUUID();
                } else if (globalCrypto && typeof globalCrypto.getRandomValues === 'function') {
                    const bytes = new Uint8Array(16);
                    globalCrypto.getRandomValues(bytes);
                    deviceId = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
                } else {
                    deviceId = `upl-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
                }
            } catch (err) {
                deviceId = `upl-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
            }

            try {
                localStorage.setItem(DEVICE_ID_STORAGE_KEY, deviceId);
            } catch (err) {
                // ignore storage errors, rely on in-memory cache for this session
            }

            inMemoryDeviceId = deviceId;
            return deviceId;
        },
        getDropFileCount(batchId) {
            const d = drops.get(batchId);
            return d ? d.files.length : 0;
        },
        getDropRelativePath(batchId, index) {
            const d = drops.get(batchId);
            if (!d) return '';
            const rel = d.rels[Number(index)] || '';
            return (rel || '').replace(/\\/g, '/');
        },
        initializeSessionFromDropped(sessionId, batchId, index) {
            const d = drops.get(batchId);
            if (!d) throw new Error('drop batch not found: ' + batchId);
            const f = d.files[Number(index)];
            if (!f) throw new Error('drop file index out of range for ' + batchId + ': ' + index);
            sessions.set(sessionId, { file: f, size: f.size, canceled: false, handleId: null });
        },
        getDropEmptyDirs(batchId) {
            const d = drops.get(batchId);
            return d ? d.emptyDirs.slice() : [];
        },
        hasSession(sessionId) {
            return sessions.has(sessionId);
        },
        initializeSessionFromInput(sessionId, inputId, fileIndex) {
            const el = document.getElementById(inputId);
            if (!el || !el.files) throw new Error(`input element not found or has no files: ${inputId}`);
            const f = el.files[Number(fileIndex)];
            if (!f) throw new Error(`file index out of range for ${inputId}: ${fileIndex}`);
            sessions.set(sessionId, { file: f, size: f.size, canceled: false, handleId: null });
        },
        async openPicker(options) {
            return await openPicker(options || {});
        },
        async createSessionsFromDropBatch(batchId) {
            return await createSessionsFromDrop(batchId);
        },
        getRelativePath(inputId, fileIndex) {
            const el = document.getElementById(inputId);
            if (!el || !el.files) return '';
            const f = el.files[Number(fileIndex)];
            if (!f) return '';
            // Chromium/WebKit expose webkitRelativePath when selecting directories or dropping folders onto an input with webkitdirectory
            const p = (/** @type {any} */(f)).webkitRelativePath || '';
            return (typeof p === 'string') ? p : '';
        },
        async initializeSessionFromFileInput(sessionId, file) {
            if (file && typeof file.arrayBuffer === 'function') {
                const buf = await file.arrayBuffer();
                sessions.set(sessionId, { buffer: buf, size: buf.byteLength, canceled: false });
            } else {
                throw new Error('initializeSessionFromFileInput expects a native File/Blob; use initializeSessionFromStream for IBrowserFile.');
            }
        },

        async initializeSessionFromStream(sessionId, streamRef) {
            // streamRef is a DotNetStreamReference on the .NET side; it exposes arrayBuffer() here
            const buf = await streamRef.arrayBuffer();
            sessions.set(sessionId, { buffer: buf, size: buf.byteLength, canceled: false, handleId: null });
        },

        async requestPermissionForStoredHandle(handleId) {
            if (!handleId || !isFileSystemAccessSupported()) {
                return false;
            }
            try {
                const handle = await idbGetHandle(handleId);
                if (!handle || typeof handle.getFile !== 'function') {
                    console.warn('[UPLOAD] requestPermissionForStoredHandle: handle not found');
                    return false;
                }

                let permission = 'prompt';
                if (typeof handle.queryPermission === 'function') {
                    try {
                        permission = await handle.queryPermission({ mode: 'read' });
                    } catch (err) {
                        console.warn('[UPLOAD] queryPermission failed:', err);
                    }
                }

                if (permission !== 'granted' && typeof handle.requestPermission === 'function') {
                    try {
                        console.info('[UPLOAD] Requesting read permission for stored handle...');
                        permission = await handle.requestPermission({ mode: 'read' });
                        console.info('[UPLOAD] Permission granted:', permission === 'granted');
                        return permission === 'granted';
                    } catch (err) {
                        console.warn('[UPLOAD] requestPermission failed:', err);
                        return false;
                    }
                }

                return permission === 'granted';
            } catch (err) {
                console.warn('[UPLOAD] requestPermissionForStoredHandle failed:', err);
                return false;
            }
        },

        async restoreSessionFromHandle(sessionId, handleId, interactive) {
            if (!sessionId || !handleId || !isFileSystemAccessSupported()) {
                return false;
            }
            const userInitiated = Boolean(interactive);
            try {
                const handle = await idbGetHandle(handleId);
                if (!handle || typeof handle.getFile !== 'function') {
                    console.warn('[UPLOAD] restoreSessionFromHandle: handle not found or invalid, removing from IndexedDB');
                    // Clean up invalid handle from IndexedDB
                    try {
                        await idbDeleteHandle(handleId);
                    } catch (cleanupErr) {
                        console.warn('[UPLOAD] failed to delete invalid handle from IndexedDB:', cleanupErr);
                    }
                    // Throw a specific error so C# knows the handle is permanently gone
                    throw new Error('HANDLE_NOT_FOUND');
                }

                // Always use read permission for both files and directories
                const mode = 'read';

                let permission = 'granted';
                if (typeof handle.queryPermission === 'function') {
                    try {
                        permission = await handle.queryPermission({ mode });
                        console.info('[UPLOAD] restoreSessionFromHandle: queried', mode, 'permission:', permission);
                    } catch (err) {
                        console.warn('[UPLOAD] restoreSessionFromHandle: queryPermission failed:', err);
                        permission = 'denied';
                    }
                }

                if (permission !== 'granted') {
                    if (userInitiated && typeof handle.requestPermission === 'function') {
                        try {
                            console.info('[UPLOAD] restoreSessionFromHandle: requesting', mode, 'permission...');
                            permission = await handle.requestPermission({ mode });
                            console.info('[UPLOAD] restoreSessionFromHandle: permission result:', permission);
                        } catch (err) {
                            console.warn('[UPLOAD] handle.requestPermission failed', err);
                        }
                    } else if (permission === 'prompt') {
                        console.info('[UPLOAD] restored handle requires user activation to grant permission (permission is prompt)');
                    }

                    if (permission !== 'granted') {
                        if (userInitiated) {
                            console.info('[UPLOAD] handle permission request result:', permission);
                        }
                        return false;
                    }
                }

                let file;
                try {
                    file = await handle.getFile();
                } catch (err) {
                    console.warn('[UPLOAD] restoreSessionFromHandle: getFile() failed, handle is stale, removing from IndexedDB:', err);
                    // Clean up stale handle from IndexedDB
                    try {
                        await idbDeleteHandle(handleId);
                    } catch (cleanupErr) {
                        console.warn('[UPLOAD] failed to delete stale handle from IndexedDB:', cleanupErr);
                    }
                    // Throw a specific error so C# knows the handle is permanently gone
                    throw new Error('HANDLE_STALE');
                }

                const entry = {
                    file,
                    size: file.size,
                    canceled: false,
                    handleId
                };
                if (file.size <= MAX_IN_MEMORY_HASH) {
                    try {
                        entry.buffer = await file.arrayBuffer();
                    } catch (err) {
                        console.warn('[UPLOAD] failed to buffer restored file', err);
                    }
                }
                sessions.set(sessionId, entry);
                return true;
            } catch (err) {
                console.warn('[UPLOAD] restoreSessionFromHandle failed', err);
                // Clean up handle on unexpected errors
                try {
                    await idbDeleteHandle(handleId);
                } catch (cleanupErr) {
                    console.warn('[UPLOAD] failed to delete handle after error:', cleanupErr);
                }
                return false;
            }
        },

        async clearPersistedHandles() {
            try {
                await idbClearHandles();
            } catch (err) {
                console.warn('[UPLOAD] clearPersistedHandles failed', err);
            }
        },

        async removeHandle(handleId) {
            if (!handleId) return;
            try {
                await idbDeleteHandle(handleId);
            } catch (err) {
                console.warn('[UPLOAD] removeHandle failed', err);
            }
        },

        async getPersistedUploads() {
            try {
                const result = await idbReadUploads();
                if (result) {
                    const state = {
                        Uploads: Array.isArray(result.uploads) ? result.uploads : [],
                        DeviceId: result.deviceId || null
                    };
                    if (state.Uploads.length > 0 || state.DeviceId) {
                        return JSON.stringify(state);
                    }
                }
            } catch (err) {
                console.warn('[UPLOAD] getPersistedUploads IndexedDB read failed', err);
            }

            return null;
        },

        async savePersistedUploads(json) {
            const payload = (typeof json === 'string') ? json : JSON.stringify(json);
            if (!payload || payload.length === 0) {
                await this.clearPersistedUploads();
                return;
            }

            let persisted = false;
            try {
                let parsed = null;
                try {
                    parsed = JSON.parse(payload);
                } catch (err) {
                    console.warn('[UPLOAD] savePersistedUploads parse failed', err);
                }
                if (parsed && typeof parsed === 'object') {
                    const uploads = Array.isArray(parsed.Uploads) ? parsed.Uploads : [];
                    const deviceId = parsed.DeviceId ?? null;
                    persisted = await idbReplaceUploads(uploads, deviceId);
                }
            } catch (err) {
                console.warn('[UPLOAD] savePersistedUploads IndexedDB write failed', err);
            }

            if (!persisted) {
                console.warn('[UPLOAD] savePersistedUploads: IndexedDB unavailable, state will not persist.');
            }
        },

        async clearPersistedUploads() {
            try {
                await idbClearUploads();
            } catch (err) {
                console.warn('[UPLOAD] clearPersistedUploads IndexedDB removal failed', err);
            }
        },

        isFileSystemAccessSupported: () => isFileSystemAccessSupported(),

        // Read requested chunk [offset, offset+length) from file without loading entire file into memory.
        // IMPORTANT: File.slice() creates a zero-copy view/reference - no data is read until arrayBuffer() is called.
        // This allows efficient reading of large files (> 2GB) by reading only requested chunks.
        async readData(sessionId, offset, length) {
            const s = sessions.get(sessionId);
            if (!s) throw new Error('session not found');
            let len = typeof length === 'number' ? length : 0;
            if (!(len > 0)) {
                len = DEFAULT_STREAM_READ;
            }
            const end = Math.min(offset + len, s.size);
            let arrayBuf;
            if (s.buffer) {
                // Buffer is already in memory (small files only), slice it
                arrayBuf = s.buffer.slice(offset, end);
            } else if (s.file) {
                // File.slice() creates a Blob reference (zero-copy), then read only that chunk
                const blob = s.file.slice(offset, end);
                arrayBuf = await blob.arrayBuffer();
            } else {
                throw new Error('session has neither buffer nor file');
            }
            const isLast = end >= s.size;
            const b64 = toBase64(arrayBuf);
            return { base64: b64, isLast };
        },

        // Streaming variant: return Blob/File slice as a JS stream reference to .NET
        // Avoids arrayBuffer + base64 overhead on large reads.
        // IMPORTANT: File.slice() is a zero-copy operation - returns a Blob reference without reading data.
        // The actual data is read only when .NET consumes the stream, allowing memory-efficient transfers.
        readDataStream(sessionId, offset, length) {
            const s = sessions.get(sessionId);
            if (!s) throw new Error('session not found');
            let len = typeof length === 'number' ? length : 0;
            if (!(len > 0)) {
                len = DEFAULT_STREAM_READ;
            }
            const end = Math.min(offset + len, s.size);
            let blob;
            if (s.file) {
                // File.slice() creates a zero-copy Blob reference to the file range [offset, end)
                blob = s.file.slice(offset, end);
            } else if (s.buffer) {
                // Create a Blob view over the ArrayBuffer slice (may incur small overhead but avoids base64)
                const slice = s.buffer.slice(offset, end);
                blob = new Blob([slice]);
            } else {
                throw new Error('session has neither buffer nor file');
            }
            // Return a Blob slice (IJSStreamReference consumes this efficiently)
            return blob;
        },

        async computeHash(sessionId, hashType, md5BlockSize, progressDotNetRef) {
            const s = sessions.get(sessionId);
            if (!s) throw new Error('session not found');

            if (!s.buffer && s.file && s.file.size <= MAX_IN_MEMORY_HASH) {
                // Promote small file-backed sessions to in-memory buffers so all hashers share the fast path.
                s.buffer = await s.file.arrayBuffer();
                s.size = s.file.size;
            }

            const buf = s.buffer;

            const report = async (p, fin, h, blocks) => {
                if (progressDotNetRef && typeof progressDotNetRef.invokeMethodAsync === 'function') {
                    await progressDotNetRef.invokeMethodAsync('Report', p, !!fin, h || null, blocks || null);
                }
            };

            // Throttle: only report progress every ~128MB processed
            const REPORT_GRANULARITY = 128 * 1024 * 1024;
            let lastReportedBytes = 0;
            const maybeReport = async (processedBytes, totalBytes) => {
                if ((processedBytes - lastReportedBytes) >= REPORT_GRANULARITY || processedBytes >= totalBytes) {
                    lastReportedBytes = processedBytes;
                    await report(totalBytes > 0 ? (processedBytes / totalBytes) : 1, processedBytes >= totalBytes, null, null);
                }
            };

            if (hashType === 1) {
                if (buf) {
                    // Use streaming MD5 to reduce overhead and improve speed
                    const total = buf.byteLength;
                    // Constant 8MB step for stable performance
                    const step = 8 * 1024 * 1024;
                    const ctx = new MD5Ctx();
                    const u8 = new Uint8Array(buf);
                    let tYield = 0;
                    for (let offset = 0; offset < total; offset += step) {
                        const end = Math.min(offset + step, total);
                        ctx.update(u8.subarray(offset, end));
                        await maybeReport(end, total);
                        // Yield occasionally for responsiveness
                        if ((offset / step) % 8 === 0) { const y0 = now(); await new Promise(r => setTimeout(r, 0)); tYield += (now() - y0); }
                    }
                    const full = ctx.finalizeHex();
                    if (md5BlockSize && md5BlockSize > 0) {
                        // Optionally compute per-block hashes in a second pass (small files only)
                        const blocks = [];
                        for (let offset = 0; offset < total; offset += md5BlockSize) {
                            const end = Math.min(offset + md5BlockSize, total);
                            const bh = md5HexFromBytes(u8.subarray(offset, end));
                            blocks.push(bh);
                            if ((offset / md5BlockSize) % 16 === 0) { const y0 = now(); await new Promise(r => setTimeout(r, 0)); tYield += (now() - y0); }
                        }
                        await report(1, true, full, blocks);
                    } else {
                        await report(1, true, full, null);
                    }
                } else if (s.file) {
                    // File-backed session: stream the file without loading it entirely
                    const f = s.file;
                    const total = f.size;
                    // Constant 8MB step across the board
                    const step = 8 * 1024 * 1024;
                    const ctx = new MD5Ctx();
                    let blocks = null;
                    let blockBuf = null;
                    let blockFill = 0;
                    const wantBlocks = !!(md5BlockSize && md5BlockSize > 0);
                    let tYield = 0;
                    if (wantBlocks) {
                        blocks = [];
                        blockBuf = new Uint8Array(md5BlockSize);
                        blockFill = 0;
                    }
                    for (let offset = 0; offset < total; offset += step) {
                        const end = Math.min(offset + step, total);
                        const chunk = new Uint8Array(await f.slice(offset, end).arrayBuffer());
                        ctx.update(chunk);
                        if (wantBlocks) {
                            let pos = 0;
                            while (pos < chunk.length) {
                                const take = Math.min(md5BlockSize - blockFill, chunk.length - pos);
                                blockBuf.set(chunk.subarray(pos, pos + take), blockFill);
                                blockFill += take;
                                pos += take;
                                if (blockFill === md5BlockSize) {
                                    blocks.push(md5HexFromBytes(blockBuf));
                                    blockFill = 0;
                                }
                            }
                        }
                        await maybeReport(end, total);
                        if ((offset / step) % 4 === 0) { const y0 = now(); await new Promise(r => setTimeout(r, 0)); tYield += (now() - y0); }
                    }
                    // Flush last partial block if any
                    if (wantBlocks && blockFill > 0) {
                        blocks.push(md5HexFromBytes(blockBuf.subarray(0, blockFill)));
                    }
                    const full = ctx.finalizeHex();
                    await report(1, true, full, blocks);
                } else {
                    throw new Error('No data source for hashing');
                }
            } else if (hashType === 2) {
                // SHA1 - use optimized streaming implementation for all file sizes
                if (buf) {
                    const h = await sha1(buf);
                    await report(1, true, h, null);
                } else if (s.file) {
                    // Use optimized streaming SHA1Ctx with large chunks for best performance
                    const f = s.file;
                    const total = f.size;
                    const chunkSize = 64 * 1024 * 1024; // 256MB chunks for optimal performance
                    const ctx = new SHA1Ctx();
                    for (let offset = 0; offset < total; offset += chunkSize) {
                        const end = Math.min(offset + chunkSize, total);
                        const chunk = new Uint8Array(await f.slice(offset, end).arrayBuffer());
                        ctx.update(chunk);
                        await maybeReport(end, total);
                        // Yield every 2 chunks to keep UI responsive
                        if ((offset / chunkSize) % 2 === 0) await new Promise(r => setTimeout(r, 0));
                    }
                    const h = ctx.finalizeHex();
                    await report(1, true, h, null);
                }
            } else if (hashType === 3) {
                // PikPakSha1
                if (buf) {
                    const h = await computePikPakSha1(buf);
                    await report(1, true, h, null);
                } else if (s.file) {
                    // Compute PikPakSha1 with variable block size based on file size
                    const total = s.file.size;
                    const blockSize = calculatePikPakBlockSize(total);
                    const ctx = new SHA1Ctx();
                    for (let offset = 0; offset < total; offset += blockSize) {
                        const end = Math.min(offset + blockSize, total);
                        const ab = await s.file.slice(offset, end).arrayBuffer();
                        // Hash the segment and feed binary result (not hex) into final hasher
                        const segmentHash = await sha1Binary(ab);
                        ctx.update(new Uint8Array(segmentHash));
                        await maybeReport(end, total);
                        if ((offset / blockSize) % 16 === 0) await new Promise(r => setTimeout(r, 0));
                    }
                    const final = ctx.finalizeHex().toUpperCase();
                    await report(1, true, final, null);
                }
            } else {
                throw new Error('unknown hash type');
            }
        },

        async cancelSession(sessionId) {
            const s = sessions.get(sessionId);
            if (s) s.canceled = true;
        },

        async cleanupSession(sessionId) {
            const entry = sessions.get(sessionId);
            sessions.delete(sessionId);
            if (entry && entry.handleId) {
                try {
                    await idbDeleteHandle(entry.handleId);
                } catch (err) {
                    console.warn('[UPLOAD] cleanupSession handle delete failed', err);
                }
            }
        }
    };

    // console banner removed for production
})();