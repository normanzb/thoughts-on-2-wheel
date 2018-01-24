define(['/scripts/RoadBook'], function(RoadBook) {
    'use strict';

    var container = document.querySelector('article.post');

    function initRoadBook() {
        var isMobile = document.documentElement.clientWidth <= 1226;
        if (isMobile) {
            return;
        }
        var el = document.querySelector('.post > .inner');
        var engine = new RoadBook({
            el: el,
            limits: {
                height: document.documentElement.clientHeight - 30 * 2
            }
        });
        engine.render();
        var scheduled = null;
        window.addEventListener('resize', function(){
            if (scheduled) {
                clearTimeout(scheduled);
            }
            scheduled = setTimeout(function(){
                console.log('render...')
                engine.render();
                scheduled = false;
            }, 300);
            scheduled = true;
        });
    }

    /* TODO: auto wrap from server side */
    function wrapElement(query, wrapperClass, callback){
        var imgs = container.querySelectorAll(query);
        var img;
        var wrap;
        for(var l = imgs.length; l--; ) {
            img = imgs[l];
            wrap = document.createElement('div');
            wrap.classList.add(wrapperClass);
            img.parentNode.insertBefore(wrap,img);
            wrap.appendChild(img);
            if (callback) {
                callback(wrap, img);
            }
        }
        return wrap;
    }

    return {
        init: function () {
            wrapElement('img', 'image-container', function(wrap, el){
                wrap.setAttribute('title', el.getAttribute('alt'));
            });

            wrapElement(':scope > .inner > iframe', 'iframe-container', function(wrap){
                wrap.addEventListener('click', function(){
                    wrap.classList.add('activated');
                });
            });

            document.querySelectorAll('.iframe-video-container').forEach(function(wrap){
                wrap.addEventListener('click', function(){
                    wrap.classList.add('activated');
                });
            });

            initRoadBook();
        }
    };
})