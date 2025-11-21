# EXIF.js Library

## Overview
EXIF.js is a JavaScript library for reading EXIF metadata from JPEG and TIFF images.

## Source
- **Package:** exif-js (npm package)
- **Downloaded from:** https://cdn.jsdelivr.net/npm/exif-js/exif.js
- **Download date:** October 15, 2025
- **File size:** 40KB

## Purpose
Used by `metadataExtractor.js` for extracting EXIF metadata from image files, including:
- Camera make and model
- Exposure settings (ISO, aperture, shutter speed)
- GPS coordinates
- Date/time information
- Lens information
- And many other EXIF tags

## Usage
The library is loaded in `index.html` before `metadataExtractor.js`:
```html
<script src="lib/exif-js/exif.js"></script>
<script src="js/metadataExtractor.js"></script>
```

## License
MIT License (permissive open source license)

## Repository
https://github.com/exif-js/exif-js

## Updates
To update to the latest version:
```bash
cd wwwroot/lib/exif-js
curl -L -o exif.js https://cdn.jsdelivr.net/npm/exif-js/exif.js
```

## Why Local Copy?
- **Offline support** - Works without internet connection
- **Performance** - No CDN latency
- **Reliability** - No dependency on external CDN availability
- **Security** - Full control over library version and content
