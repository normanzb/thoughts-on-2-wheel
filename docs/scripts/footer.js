define(['scripts/huntun'], function (huntun) {
    'use strict';

    function initScrollBar() {
        if (!huntun || !huntun.ScrollBar) {
            return;
        }

        var mounted = false;
        var options = {
            directions: {
                bar: 'right'
            },
            handlers: {
                mousewheel: function () { }
            }
        };
        var html = document.documentElement;
        var primary = document.querySelector('.primary');
        if (!primary) {
            return;
        }
        window.addEventListener('scroll', function(){
            scrollbar.handleResize();
        });
        options.handlers.resize = function(){
            scrollbar.model.length = html.scrollHeight;
            scrollbar.model.viewport = html.clientHeight;
            scrollbar.model.position = html.scrollTop;
        };
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
                    scrollbar.mount(primary);
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
    };
});