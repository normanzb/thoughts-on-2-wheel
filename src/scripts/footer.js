define(['scripts/huntun'], function (huntun) {
    'use strict';

    function initScrollBar() {
        if (!huntun || !huntun.ScrollBar) {
            return;
        }

        return;

        var mounted = false;
        var options = {
            directions: {
                bar: 'left'
            },
            handlers: {
            }
        };
        var content = document.querySelector('.content');
        if (!content) {
            return;
        }
        var article = document.querySelector('article.post');
        if (article) {
            article.addEventListener('scroll', function(){
                scrollbar.handleResize();
            });
            options.handlers.resize = function(){
                scrollbar.model.length = article.scrollWidth + content.scrollHeight;
                scrollbar.model.viewport = article.offsetWidth + content.offsetHeight;
                scrollbar.model.position = article.scrollLeft + content.scrollTop;
            };
        }
        var scrollbar = new huntun.ScrollBar(options);
        if (typeof options.handlers.resize === 'function') {
            options.handlers.resize();
            scrollbar.viewModel.redraw(true);
        }

        function handleWindowResize(){
            if (window.innerWidth <= 1226)  {
                if (mounted) {
                    scrollbar.unmount();
                    mounted = false;
                }
            }
            else {
                if (!mounted) {
                    scrollbar.mount(content);
                    mounted = true;
                }
            }
        }

        window.addEventListener('resize', handleWindowResize);
        handleWindowResize();
    }
    
    return {
        init: function(){
            return initScrollBar();
        }
    }
});