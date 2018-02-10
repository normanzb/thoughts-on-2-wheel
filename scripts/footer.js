define(['./huntun'], function (huntun) {
    'use strict';

    function googleTrack(argument) {
        (function(i,s,o,g,r,a,m){i['GoogleAnalyticsObject']=r;i[r]=i[r]||function(){
        (i[r].q=i[r].q||[]).push(arguments)},i[r].l=1*new Date();a=s.createElement(o),
        m=s.getElementsByTagName(o)[0];a.async=1;a.src=g;m.parentNode.insertBefore(a,m)
        })(window,document,'script','https://www.google-analytics.com/analytics.js','ga');

        ga('create', 'UA-105801685-1', 'auto');
        ga('send', 'pageview');
    }

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
        window.addEventListener('scroll', function(){
            if (scrollbar && typeof scrollbar.handleResize === 'function') {
                scrollbar.handleResize();    
            }
        });
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
            initScrollBar();
            googleTrack();
        }
    };
});