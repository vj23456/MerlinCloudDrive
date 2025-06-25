function scrollIntoView(element, blockstr) {
    if (element != null) {
        element.scrollIntoView({
            behavior: "auto",
            block: blockstr,
        });
    }
}
function setFocus(el) {
    el.focus();
}
function disableContextMenu() {
    window.oncontextmenu = function (event) {
        event.preventDefault();
        event.stopPropagation();
        return false;
    };
}
function getBrowserDimensions() {
    return {
        width: window.innerWidth,
        height: window.innerHeight
    };
}
function getElementDimensions(element) {
    return {
        width: element.offsetWidth,
        height: element.offsetHeight
    };
}

function getImageSize(img) {
    try {
        return {
            width: img.naturalWidth,
            height: img.naturalHeight
        }
    }
    catch (err) {
        return {
            width: -1,
            height: -1
        }
    }
}

var fbDotnetRef;
var wholeContainerElement;
var contentContainerElement;
var toolbarResizeObserver;
var containerResizeObserver;
function monitorElementResize(element, refelement, callbackname) {
    function onElementSizeChanged() {
        if (fbDotnetRef) {
            fbDotnetRef.invokeMethodAsync(callbackname, refelement.offsetWidth, refelement.offsetHeight, element.offsetWidth, element.offsetHeight)
                .catch(error => console.error(error));
        } else {
            console.warn('DotNetObjectReference is null or disposed.');
        }
    }
    containerResizeObserver = new ResizeObserver(onElementSizeChanged);
    containerResizeObserver.observe(element);
    toolbarResizeObserver = new ResizeObserver(onElementSizeChanged);
    toolbarResizeObserver.observe(refelement);
}
function unmonitorContainer() {
    toolbarResizeObserver.disconnect();
}
function setContainerVars(dr, wholeContainer, contentContainer) {
    fbDotnetRef = dr;
    wholeContainerElement = wholeContainer;
    contentContainerElement = contentContainer;
    createHammer();
    monitorElementClick();
    monitorElementTouch();
}
function onImageLoad(img) {
    fbDotnetRef.invokeMethodAsync("OnImageLoaded", img.src, img.naturalWidth, img.naturalHeight);
}
function getElementPosition(element) {
    return {
        width: element.offsetWidth,
        height: element.offsetHeight,
        left: element.offsetLeft,
        top: element.offsetTop
    }
}

function setElementLeftPos(element, left) {
    element.style.left = left;
}

function setElementTopPos(element, top) {
    element.style.top = top;
}

function setElementPos(element, top, left) {
    element.style.top = top;
    element.style.left = left;
}

function removeFocusFromElement(element) {
    element.blur();
}

function playVideo(videoElement, videosourceElement, source, videotype, poster) {
    videoElement.pause();
    //videoElement.addEventListener("ended", onVideoPlayEnded);
    if (poster != null)
        videoElement.setAttribute('poster', poster);
    videosourceElement.setAttribute('src', source);
    videosourceElement.setAttribute('type', videotype);
    videoElement.load();
    videoElement.play();
}

function playAudio(audioElement, audiosourceElement, source, audiotype, poster) {
    audioElement.pause();
    audiosourceElement.setAttribute('src', source);
    audiosourceElement.setAttribute('type', audiotype);
    audioElement.load();
    audioElement.play();
}

var splitFBInstance = null;
function splitFileBrowser(elements, options) {
    if (splitFBInstance != null)
        splitFBInstance.destroy(false, false);
    splitFBInstance = Split(elements, options);
}
function splitDestroyFB() {
    if (splitFBInstance != null) {
        splitFBInstance.destroy(false, false);
        splitFBInstance = null;
    }
}

function getSplitFBInstance() {
    return splitFBInstance;
}

function setContentHeightToBottom(container, header, content) {
    content.height(container.height() - header.height());
}

function getInnerText(element) {
    return element.innerText;
}

function setInnerText(element, text) {
    element.innerText = text;
}

function selectElementContents(el) {
    var range = document.createRange();
    range.selectNodeContents(el);
    var sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
}

function setFocusAndSelectAll(el) {
    el.focus();
    selectElementContents(el);
}

function setIndeterminate(el, value) {
    el.indeterminate = value;
}

function setFullScreen(elem, fullscreen) {
    if (fullscreen) {
        if (elem.requestFullscreen) {
            elem.requestFullscreen();
        } else if (elem.webkitRequestFullscreen) { /* Safari */
            elem.webkitRequestFullscreen();
        } else if (elem.msRequestFullscreen) { /* IE11 */
            elem.msRequestFullscreen();
        }
    }
    else {
        if (document.exitFullscreen) {
            document.exitFullscreen();
        } else if (document.webkitExitFullscreen) { /* Safari */
            document.webkitExitFullscreen();
        } else if (document.msExitFullscreen) { /* IE11 */
            document.msExitFullscreen();
        }
    }
}

function copyToClipboard(el) {
    var range = document.createRange();
    range.selectNode(el);
    window.getSelection().removeAllRanges(); // clear current selection
    window.getSelection().addRange(range); // to select text
    document.execCommand('copy');
    window.getSelection().removeAllRanges();// to deselect
}

function getImageSizeFromUrlAsync(dotNetObject, url, callbackname) {
    const img = new Image();
    img.onload = function () {
        dotNetObject.invokeMethodAsync(callbackname, this.width, this.height);
    }
    img.src = url;
}
function getImageSizeFromUrlAsyncCallBack(dotNetObject, url, callbackfunc) {
    const img = new Image();
    img.onload = function () {
        dotNetObject.invokeMethodAsync(callbackfunc, url, this.width, this.height);
    }
    img.src = url;
}


var isDoubleClick = false;

function monitorElementClick() {
    contentContainerElement.addEventListener('click', function (e) {
        setTimeout(function () {
            if (isDoubleClick) {
                isDoubleClick = false; // reset flag
                return; // exit the function if double click detected
            }
            var el = e.target;
            while (el != null && !el.hasAttribute('id')) {
                el = el.parentElement;
            }
            var pointerargs = {
                clientX: e.clientX,
                clientY: e.clientY,
                ctrlKey: e.ctrlKey,
                shiftKey: e.shiftKey,
                metaKey: e.metaKey,
                button: e.button,
                buttons: e.buttons,
            }
            if (el != null) {
                fbDotnetRef.invokeMethodAsync("OnElementClicked", el.id, pointerargs);
            }
            else {
                fbDotnetRef.invokeMethodAsync("OnElementClicked", "", pointerargs);
            }
        }, 300); // delay to detect double click
    }, false);

    contentContainerElement.addEventListener('dblclick', function (e) {
        isDoubleClick = true;
        var el = e.target;
        while (el != null && !el.hasAttribute('id')) {
            el = el.parentElement;
        }
        var pointerargs = {
            clientX: e.clientX,
            clientY: e.clientY,
            ctrlKey: e.ctrlKey,
            shiftKey: e.shiftKey,
            metaKey: e.metaKey,
            button: e.button,
            buttons: e.buttons,
        }
        if (el != null) {
            fbDotnetRef.invokeMethodAsync("OnElementDoubleClicked", el.id, pointerargs);
        }
        else {
            fbDotnetRef.invokeMethodAsync("OnElementDoubleClicked", "", pointerargs);
        }
    }, false);
}


function monitorElementTouch() {
    var timer;
    var touchduration = 500; //length of time we want the user to touch before we do something
    var moved = false;
    var cancelled = false;
    function touchstart(e) {
        if (!timer) {
            timer = setTimeout(function () { onlongtouch(e) }, touchduration);
        }
    }

    function touchend(e) {
        e.preventDefault();
        //stops short touches from firing the event
        if (timer) {
            clearTimeout(timer);
            timer = null;
            onshorttouch(e);
        }
    }
    function touchmove(e) {
        moved = true;
        if (timer) {
            clearTimeout(timer);
            timer = null;
        }
    }
    function touchcancel(e) {
        cancelled = true;
        if (timer) {
            clearTimeout(timer);
            timer = null;
        }
    }
    onlongtouch = function (e) {
        timer = null;
        var target = e.target || e.srcElement;
        var el = target;
        while (el != null && !el.hasAttribute('id')) {
            el = el.parentElement;
        }
        var pointerargs = {
            clientX: e.clientX,
            clientY: e.clientY,
            ctrlKey: e.ctrlKey,
            shiftKey: e.shiftKey,
            metaKey: e.metaKey,
            button: e.button,
            buttons: e.buttons,
            longTouch: true
        }
        if (el != null)
            fbDotnetRef.invokeMethodAsync("OnElementTouched", el.id, pointerargs);
        else
            fbDotnetRef.invokeMethodAsync("OnElementTouched", "", pointerargs);
    };
    onshorttouch = function (e) {
        var target = e.target || e.srcElement;
        var el = target;
        while (el != null && !el.hasAttribute('id')) {
            el = el.parentElement;
        }
        var pointerargs = {
            clientX: e.clientX,
            clientY: e.clientY,
            ctrlKey: e.ctrlKey,
            shiftKey: e.shiftKey,
            metaKey: e.metaKey,
            button: e.button,
            buttons: e.buttons,
            longtouch: false
        }
        if (el != null)
            fbDotnetRef.invokeMethodAsync("OnElementTouched", el.id, pointerargs);
        else
            fbDotnetRef.invokeMethodAsync("OnElementTouched", "", pointerargs);
    }
    contentContainerElement.addEventListener("touchstart", touchstart, false);
    contentContainerElement.addEventListener("touchend", touchend, false);
    contentContainerElement.addEventListener("touchmove", touchmove, false);
    contentContainerElement.addEventListener("touchcancel", touchcancel, false);
}
var zoomView = false;
function setZoomView(z) {
    zoomView = z;
}

function downloadFromUrl(url, fileName) {
    var anchorElement = document.createElement('a');
    anchorElement.href = url;
    alert('href:' + anchorElement.href);
    anchorElement.download = fileName;
    anchorElement.click();
    anchorElement.remove();
}
function downloadFromByteArray(byteArray, fileName, contentType) {
    // Convert base64 string to numbers array.
    var numArray = atob(byteArray).split('').map(function (c) { return c.charCodeAt(0); });
    // Convert numbers array to Uint8Array object.
    var uint8Array = new Uint8Array(numArray);
    // Wrap it by Blob object.
    var blob = new Blob([uint8Array], { type: contentType });
    // Create "object URL" that is linked to the Blob object.
    var url = URL.createObjectURL(blob);
    // Invoke download helper function that implemented in 
    // the earlier section of this article.
    downloadFromUrl(url, fileName);
    // At last, release unused resources.
    URL.revokeObjectURL(url);
}

function showOnBaiduMap(elementid, x, y) {
    var ggPoint = new BMap.Point(x, y);
    var bm = new BMap.Map(elementid);
    bm.centerAndZoom(ggPoint, 15);
    bm.addControl(new BMap.NavigationControl());

    translateCallback = function (data) {
        if (data.status === 0) {
            var marker = new BMap.Marker(data.points[0]);
            bm.addOverlay(marker);
            //var label = new BMap.Label("转换后的百度坐标（正确）", { offset: new BMap.Size(20, -10) });
            //marker.setLabel(label); //添加百度label
            bm.setCenter(data.points[0]);
        }
    }
    setTimeout(function () {
        var convertor = new BMap.Convertor();
        var pointArr = [];
        pointArr.push(ggPoint);
        convertor.translate(pointArr, 1, 5, translateCallback)
    }, 1000);
}


function createHammer() {
    var hammertime = new Hammer.Manager(wholeContainerElement);
    //var swipe = new Hammer.Swipe();
    var pinch = new Hammer.Pinch();
    //var min_horizotal_move = 30;
    //var min_start_x = 15;
    hammertime.add([pinch]);
    //hammertime.on("swiperight", function (ev) {
    //    if (ev.center.x - ev.deltaX <= min_start_x && ev.deltaX >= min_horizotal_move) {
    //        navigator.vibrate(1);
    //        fbDotnetRef.invokeMethodAsync("OnSwipeFromSide");
    //    }
    //});
    hammertime.on("pinchstart", function () {
        fbDotnetRef.invokeMethodAsync("OnPinchStart");
    });
    hammertime.on("pinchmove", function (ev) {
        fbDotnetRef.invokeMethodAsync("OnPinch", ev.scale);
    });
    hammertime.on("pinchend", function () {
        fbDotnetRef.invokeMethodAsync("OnPinchEnd");
    });
}
function updateQRCode(element, text) {
    element.appendChild(showQRCode(text));
}
function updateQRCode_v2(element, text) {
    // look for an existing QR code
    var existing = element.querySelector('.qrcode');
    // generate a new one
    var newQr = showQRCode(text);
    newQr.classList.add('qrcode');
    if (existing) {
        // replace old with new
        element.replaceChild(newQr, existing);
    } else {
        // first time: append
        element.appendChild(newQr);
    }
}

function monitorDropFile(dotnetRef, Element, callBack) {
    var totalFiles = 0;
    function dropfile(file) {
        var reader = new FileReader();
        reader.onload = function (e) {
            var arrayBuffer = reader.result
            var buffer = new Uint8Array(arrayBuffer);
            var start = 0;
            var maxlen = 32 * 1024;
            var finished = false;
            while (!finished) {
                var end = start + maxlen;
                if (end >= buffer.length) {
                    end = buffer.length;
                    finished = true;
                }
                var bytes = buffer.slice(start, end);
                dotnetRef.invokeMethodAsync(callBack, totalFiles, file.name, buffer.length, start, finished, bytes);
                start = end;
            }
        };
        reader.readAsArrayBuffer(file);
    }
    Element.ondrop = function (ev) {
        ev.preventDefault();
        if (ev.dataTransfer.items) {
            totalFiles = ev.dataTransfer.items.length;
            for (var i = 0; i < totalFiles; i++) {
                if (ev.dataTransfer.items[i].kind === 'file') {
                    var file = ev.dataTransfer.items[i].getAsFile();
                    dropfile(file);
                }
            }
        } else {
            totalFiles = ev.dataTransfer.files.length;
            for (var i = 0; i < totalFiles; i++) {
                var file = ev.dataTransfer.files[i];
                dropfile(file);
            }
        }
    };
}

window.isMobileDevice = function () {
    return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
}
window.getItemsPerRow = function (containerId, itemWidth) {
    var container = document.getElementById(containerId);
    if (container) {
        var containerWidth = container.clientWidth;
        return Math.floor(containerWidth / itemWidth);
    }
    return 1;
};
function openEmailClient(email, subject, body) {
    window.location.href = `mailto:${email}?subject=${subject}&body=${body}`;
}
window.forceRefreshFromServer = async function() {
  console.log("Forcing refresh from server...");
  
  if ('serviceWorker' in navigator) {
    const registrations = await navigator.serviceWorker.getRegistrations();
    for (let registration of registrations) {
      await registration.unregister();
      console.log("Service worker unregistered");
    }
    
    // Clear all caches
    const cacheKeys = await caches.keys();
    await Promise.all(
      cacheKeys.map(cacheName => caches.delete(cacheName))
    );
    console.log("Caches cleared");
    
    // Force reload from server
    window.location.reload(true);
  }
}
// Function to select text in an input element
window.selectTextInInput = function (element, start, end) {
    if (element) {
        element.focus();
        setTimeout(function () {
            if (typeof element.setSelectionRange === 'function') {
                element.setSelectionRange(start, end);
            } else if (element.createTextRange) {
                var range = element.createTextRange();
                range.moveStart('character', start);
                range.moveEnd('character', end - element.value.length);
                range.select();
            }
        }, 50);
    }
}
window.autoResizeInput = (element, value) => {
    if (!element) return;
    const tmpSpan = document.createElement("span");
    tmpSpan.style.visibility = "hidden";
    tmpSpan.style.whiteSpace = "pre";
    tmpSpan.style.font = getComputedStyle(element).font;
    tmpSpan.textContent = value;
    document.body.appendChild(tmpSpan);
    const width = Math.max(176, tmpSpan.getBoundingClientRect().width + 40); // add extra padding if needed
    document.body.removeChild(tmpSpan);
    const maxWidth = window.innerWidth * 0.8;
    element.style.width = Math.min(width, maxWidth) + "px";
};

function fixModalOverflow() {
    // Wait for modal to be rendered
    setTimeout(() => {
        const modals = document.querySelectorAll('.blazored-modal, .modal');
        modals.forEach(modal => {
            // Force modal to stay within viewport
            modal.style.position = 'fixed';
            modal.style.top = '0';
            modal.style.left = '0';
            modal.style.width = '100vw';
            modal.style.height = '100vh';
            modal.style.zIndex = '9999';
            modal.style.overflow = 'hidden';
            
            const modalContent = modal.querySelector('.blazored-modal-content, .modal-content');
            if (modalContent) {
                modalContent.style.maxWidth = '100vw';
                modalContent.style.maxHeight = '100vh';
                modalContent.style.overflow = 'hidden';
                modalContent.style.margin = '0';
                modalContent.style.borderRadius = '0';
                modalContent.style.width = '100vw';
                modalContent.style.height = '100vh';
                modalContent.style.display = 'flex';
                modalContent.style.flexDirection = 'column';
                
                // Make modal content scrollable
                const modalBody = modalContent.querySelector('.modal-body, .blazored-modal-body');
                if (modalBody) {
                    modalBody.style.flex = '1';
                    modalBody.style.maxHeight = 'calc(100vh - 120px)';
                    modalBody.style.overflowY = 'auto';
                    modalBody.style.overflowX = 'hidden';
                    modalBody.style.width = '100%';
                    modalBody.style.maxWidth = '100vw';
                    modalBody.style.webkitOverflowScrolling = 'touch';
                    
                    // Fix table overflow specifically
                    const tables = modalBody.querySelectorAll('table');
                    tables.forEach(table => {
                        table.style.width = '100%';
                        table.style.maxWidth = '100%';
                        table.style.tableLayout = 'auto';
                        table.style.fontSize = '12px';
                        
                        // Wrap table in responsive container if not already wrapped
                        let tableWrapper = table.closest('.table-responsive, .table-container');
                        if (!tableWrapper) {
                            const wrapper = document.createElement('div');
                            wrapper.className = 'table-responsive';
                            wrapper.style.width = '100%';
                            wrapper.style.maxWidth = 'calc(100vw - 30px)';
                            wrapper.style.overflowX = 'auto';
                            wrapper.style.overflowY = 'visible';
                            wrapper.style.webkitOverflowScrolling = 'touch';
                            table.parentNode.insertBefore(wrapper, table);
                            wrapper.appendChild(table);
                            tableWrapper = wrapper;
                        } else {
                            tableWrapper.style.width = '100%';
                            tableWrapper.style.maxWidth = 'calc(100vw - 30px)';
                            tableWrapper.style.overflowX = 'auto';
                            tableWrapper.style.overflowY = 'visible';
                            tableWrapper.style.webkitOverflowScrolling = 'touch';
                        }
                        
                        // Minimize table cell content
                        const cells = table.querySelectorAll('th, td');
                        cells.forEach(cell => {
                            cell.style.padding = '4px';
                            cell.style.fontSize = '12px';
                            cell.style.whiteSpace = 'nowrap';
                            cell.style.textOverflow = 'ellipsis';
                            cell.style.maxWidth = '120px';
                        });
                    });
                }
                
                // Fix modal header
                const modalHeader = modalContent.querySelector('.modal-header, .blazored-modal-header');
                if (modalHeader) {
                    modalHeader.style.flexShrink = '0';
                    modalHeader.style.width = '100%';
                    modalHeader.style.maxWidth = '100vw';
                    modalHeader.style.padding = '10px 15px';
                }
                
                // Fix modal footer
                const modalFooter = modalContent.querySelector('.modal-footer, .blazored-modal-footer');
                if (modalFooter) {
                    modalFooter.style.flexShrink = '0';
                    modalFooter.style.width = '100%';
                    modalFooter.style.maxWidth = '100vw';
                    modalFooter.style.padding = '10px 15px';
                }
            }
        });
    }, 50);
}

function applyMobileModalFixes() {
    // Only apply on mobile devices
    if (window.innerWidth <= 768) {
        fixModalOverflow();
        
        // Re-apply fixes when window is resized
        window.addEventListener('resize', fixModalOverflow);
        
        // Use MutationObserver to watch for new modals
        const observer = new MutationObserver((mutations) => {
            mutations.forEach((mutation) => {
                if (mutation.type === 'childList') {
                    mutation.addedNodes.forEach((node) => {
                        if (node.nodeType === Node.ELEMENT_NODE) {
                            if (node.classList && node.classList.contains('blazored-modal')) {
                                fixModalOverflow();
                            } else if (node.querySelector && node.querySelector('.blazored-modal')) {
                                fixModalOverflow();
                            }
                        }
                    });
                }
            });
        });
        
        observer.observe(document.body, {
            childList: true,
            subtree: true
        });
    }
}

// Initialize mobile modal fixes immediately
if (typeof window !== 'undefined') {
    // Apply fixes when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', applyMobileModalFixes);
    } else {
        applyMobileModalFixes();
    }
    
    // Also apply fixes on window load
    window.addEventListener('load', applyMobileModalFixes);
    
    // Apply fixes when window is resized
    window.addEventListener('resize', () => {
        if (window.innerWidth <= 768) {
            fixModalOverflow();
        }
    });
}

// Tooltip functions for MobileTooltip component
window.showTooltip = function(container, tooltip) {
    try {
        console.log('showTooltip called with:', container, tooltip);
        
        if (!container || !tooltip) {
            console.log('Container or tooltip element not found');
            return;
        }
        
        // Make the tooltip visible
        tooltip.style.display = 'block';
        tooltip.style.visibility = 'visible';
        tooltip.style.opacity = '1';
        
        // Position the tooltip
        const containerRect = container.getBoundingClientRect();
        const viewportWidth = window.innerWidth;
        const viewportHeight = window.innerHeight;
        
        console.log('Container rect:', containerRect);
        
        // Get actual tooltip dimensions after making it visible
        const tooltipRect = tooltip.getBoundingClientRect();
        const tooltipWidth = tooltipRect.width || 200;
        const tooltipHeight = tooltipRect.height || 50;
        
        console.log('Tooltip dimensions:', tooltipWidth, tooltipHeight);
        
        // Calculate position above the container, centered horizontally
        let left = containerRect.left + (containerRect.width / 2) - (tooltipWidth / 2);
        let top = containerRect.top - tooltipHeight - 10;
        
        // Adjust if tooltip would go off screen
        if (left < 10) {
            left = 10;
        } else if (left + tooltipWidth > viewportWidth - 10) {
            left = viewportWidth - tooltipWidth - 10;
        }
        
        // If tooltip would go above viewport, show it below instead
        if (top < 10) {
            top = containerRect.bottom + 10;
            // Set custom property for arrow direction
            tooltip.style.setProperty('--arrow-direction', 'up');
        } else {
            tooltip.style.removeProperty('--arrow-direction');
        }
        
        // Apply position
        tooltip.style.left = left + 'px';
        tooltip.style.top = top + 'px';
        
        console.log('Tooltip positioned at:', { left, top });
        
    } catch (error) {
        console.error('Error in showTooltip:', error);
    }
};

window.hideTooltip = function(tooltip) {
    try {
        console.log('hideTooltip called with:', tooltip);
        
        if (!tooltip) {
            console.log('Tooltip element not found');
            return;
        }
        
        tooltip.style.display = 'none';
        tooltip.style.visibility = 'hidden';
        tooltip.style.opacity = '0';
        
    } catch (error) {
        console.error('Error in hideTooltip:', error);
    }
};