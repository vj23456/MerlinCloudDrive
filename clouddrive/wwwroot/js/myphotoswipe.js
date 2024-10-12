var gallery;
var hasGallery = false;

function createPhotoSwipeGallery(dotnetobject, pwspElement, items, options, gettingDataCallBack, afterChangeCallBackFunc, getDoubleTapZoomCallBackFunc) {
    
    gallery = new PhotoSwipe(pwspElement, PhotoSwipeUI_Default, items, options);
    var x = document.getElementsByClassName("pswp__scroll-wrap");
    x[0].addEventListener('wheel', function (event) {
        if (event.deltaY <= -100 && gallery.getCurrentIndex() > 0) {
            gallery.prev();
        }
        else if (event.deltaY >=100 && gallery.getCurrentIndex() < gallery.items.length - 1) {
            gallery.next();
        }
    });

    //gallery.listen('gettingData', function (index, item) {
    //    if (item.w <= 0) {
    //        fbDotnetRef.invokeMethodAsync(gettingDataCallBack, index, item)
    //            .then(data => {
    //                item.src = data.src;
    //                item.msrc = data.msrc;
    //                item.w = data.w;
    //                item.h = data.h;
    //            });
    //    }
    //});
    gallery.listen('afterChange', function () {
        //var curItemElement = document.getElementById("ID_" + gallery.currItem.title);
        //if (curItemElement !== null) {
        //    curItemElement.scrollIntoView();
        //}
        dotnetobject.invokeMethodAsync(afterChangeCallBackFunc, gallery.getCurrentIndex(), gallery.currItem, gallery.options.getNumItemsFn());
    });
    gallery.listen('destroy', function () {
        dotnetobject.invokeMethodAsync("OnPhotoSwipteDestroyed");
    });
    gallery.init();
    hasGallery = true;
    
    return gallery;
}
function gotoPhotoSwipeItem(index){
    gallery.goto(index);
}
function nextPhotoSwipeItem() {
    gallery.next();
}
function prevPhotoSwipeItem() {
    gallery.prev();
}
function updateSizePhotoSwipeItem(force) {
    gallery.updateSize(force);
}
function closePhotoSwipeItem() {
    gallery.close();
}
function destroyPhotoSwipeItem() {
    gallery.destroy();
}
function getCurrentIndex() {
    return gallery.getCurrentIndex();
}
function getCurrentItem() {
    return gallery.currItem;
}
function setCurrentItem(item) {
    gallery.currItem.msrc = item.msrc;
    gallery.currItem.src = item.src;
    gallery.currItem.w = item.w;
    gallery.currItem.h = item.h;
    gallery.currItem.title = item.title;
    gallery.invalidateCurrItems();
    gallery.updateSize(true);
}
function setItem(index, item) {
    gallery.items[index].msrc = item.mscr;
    gallery.items[index].src = item.src;
    gallery.items[index].w = item.w;
    gallery.items[index].h = item.h;
    gallery.items[index].title = item.title;
    var curIndex = gallery.getCurrentIndex();
    if (index == curIndex) {
        gallery.invalidateCurrItems();
        gallery.updateSize(true);
    }
}
function setItemSizeByUrl(url, w, h) {
    var item = gallery.items.find(e => e.src == url);
    if (item !== undefined) {
        item.w = w;
        item.h = h;
    }
}
function pushPhotoSwipeItem(item, toEnd) {
    if (toEnd) {
        gallery.items.push(item);
    }
    else {
        gallery.items.unshift(item);
    }
}
function switchToOriginalSize(origlUrl, width, height) {
    gallery.currItem.msrc = gallery.currItem.src;
    gallery.currItem.src = origlUrl;
    gallery.currItem.w = width;
    gallery.currItem.h = height;
    gallery.invalidateCurrItems();
    gallery.updateSize(true);
}

function zoomCurrentToOriginal() {
    gallery.zoomTo(1, { x: gallery.viewportSize.x / 2, y: gallery.viewportSize.y / 2 }, 1000, false, function (now) {
    });
}