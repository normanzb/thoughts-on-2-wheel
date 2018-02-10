// columns scroll handling
var articleScrollingInfo = window.articleScrollingInfo = {
    handling: false
};
var elContent = document.querySelector('.content');
var obj = {
    x: container.scrollLeft * 1
};

container.addEventListener('wheel', function(event){
    var value = event.deltaY; 
    // value = (event.deltaY/Math.abs(event.deltaY)) >> 0; 
    var dy = Math.abs(event.deltaY);
    var dx = Math.abs(event.deltaX);
    var doNotBlock = false;

    if (dy > dx) {
        value = event.deltaY;
    }
    else {
        value = event.deltaX;
        doNotBlock = true;
    }
    var boundingRect = container.getBoundingClientRect();

    if (
        doNotBlock === false && 
        value > 0 && 
        Math.ceil(container.scrollLeft + container.offsetWidth) >= container.scrollWidth
    ) {
        articleScrollingInfo.handling = false;
        return;
    }

    if (
        doNotBlock === false && (
            boundingRect.top < container.offsetTop || 
            (value < 0 && container.scrollLeft <= 0)
        )
    ) {
        articleScrollingInfo.handling = false;
        return;
    }

    articleScrollingInfo.handling = true;

    obj.x += value * 10;

    if (obj.x > container.scrollWidth - container.offsetWidth) {
        obj.x = container.scrollWidth - container.offsetWidth;
    }
    else if (obj.x < 0) {
        obj.x = 0;
    }

    event.preventDefault();
    event.stopPropagation();
}, {passive: false, capture: false});

requestAnimationFrame(function loop(){
    if (container.scrollLeft !== obj.x) {
        container.scrollLeft += Math.ceil((obj.x - container.scrollLeft) / 2);
    }
    requestAnimationFrame(loop);
});