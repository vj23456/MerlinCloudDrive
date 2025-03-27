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
};