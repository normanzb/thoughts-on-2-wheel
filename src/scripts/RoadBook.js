define(['./imageMetaReady', './animationFrame'], function(imageMetaReady, animationFrame) {
    'use strict';

    async function asyncRequestFrame() {
        return new Promise(function(rs){
            animationFrame.request(rs);
        });
    }

    function eventOnce(el, name, handler) {
        el.addEventListener(name, function handlerWrapper() {
            el.removeEventListener(name, handlerWrapper);
            handler();
        });
    }

    async function imgReady(img) {
        return new Promise(function(rs, rj){
            if (img.complete) {
                rs();
            }
            else {
                imageMetaReady(img).then(rs, rj);
                eventOnce(img, 'load', rs);
            }
        });
    }

    async function videoReady(video) {
        return new Promise(function(rs){
            if (video.readyState >= 1) {
                rs();
            }
            else {
                eventOnce(video, 'loadedmetadata', rs);
                eventOnce(video, 'load', rs);
            }
        });
    }

    async function pageSqueeze(node, parent) {
        var me = this;
        var cloned;

        parent.appendChild(node);
        if (me.isFit()){
            return null;
        }

        parent.removeChild(node);
        cloned = node.cloneNode(false);
        parent.appendChild(cloned);

        if (node.nodeType === node.TEXT_NODE) {
            let lastChar = null, allIn = true;

            cloned.nodeValue = '';
            for (var i = 0; i < node.nodeValue.length; i++) {
                lastChar = node.nodeValue[i];
                cloned.nodeValue += lastChar;
                if (!me.isFit()) {
                    if (i === 0 && cloned.parentNode.clientHeight > me.book.limits.height) {
                        throw new Error('Smallest element is even larger than limit');
                    }
                    allIn = false;
                    cloned.nodeValue = cloned.nodeValue.substr(0, cloned.nodeValue.length - 1);
                    node.nodeValue = node.nodeValue.substring(i, node.length);
                    break;
                }
            }

            if (allIn) {
                return null;
            }
        }
        else {
            if (cloned.tagName === 'IMG') {
                console.log('waiting for image to be ready...');
                await imgReady(cloned);
            }
            else if (cloned.tagName === 'VIDEO') {
                console.log('waiting for video to be ready...');
                await videoReady(cloned);
                if (cloned.attributes['autoplay']) {
                    cloned.play();
                }
            }

            if (!me.isFit()) {
                if (cloned.clientHeight > me.book.limits.height) {
                    throw new Error('Smallest element is even larger than limit');
                }
                parent.removeChild(cloned);
                return node;
            }

            let lastNode, allIn = true;

            while (node.childNodes.length > 0) {
                lastNode = node.childNodes[0];
                cloned.appendChild(lastNode);
                if (!me.isFit()) {
                    allIn = false;
                    cloned.removeChild(lastNode);
                    break;
                }
            }

            if (allIn) {
                return null;
            }

            let leftOver = await pageSqueeze.call(me, lastNode, cloned);

            if (leftOver) {
                node.insertBefore(leftOver, node.childNodes[0]);
            }
        }

        return node;
    }

    function Page(book) {
        this.book = book;
        this.root = document.createElement('div');
        this.root.classList.add('page');
        this.inner = document.createElement('div');
        this.inner.classList.add('inner');
        this.root.appendChild(this.inner);
    }

    Page.prototype.isFit = function() {
        var me = this;
        var height;
        me.root.style.height = 'auto';
        var style = window.getComputedStyle(me.root);
        height = me.root.clientHeight + parseInt(style.marginTop);
        me.root.style.height = '';
        if (height > me.book.limits.height) {
            return false;
        }
        return true;
    };

    Page.prototype.squeeze = async function(node) {
        var me = this;
        return await pageSqueeze.call(me, node, me.inner);
    };

    Page.prototype.setNumber = function(number) {
        this.root.setAttribute('data-number', number);
    };

    Page.prototype.clean = function() {
        this.inner.innerHTML = '';
    };

    async function roadBookCreatePage() {
        var me = this;
        var page;
        if (me.pagePool.length > 0) {
            page = me.pagePool.shift();
        }
        else {
            page = new Page(me);
        }
        await asyncRequestFrame;
        return page;
    }

    function roadBookDisposePage(page) {
        page.clean();
        this.pagePool.push(page);
    }

    async function roadBookFitItemsIntoPage(fragment, page) {
        while (fragment.children.length > 0) {
            let el = fragment.children[0];
            let leftOver = await page.squeeze(el);
            if (leftOver) {
                fragment.insertBefore(leftOver, fragment.children[0]);
                return true;
            }
        }

        return false;
    }

    async function roadBookRender(){
        var me = this;
        var fragment = this.fragment;
        var page;
        var cloned;

        this.inner.innerHTML = '';
        while(me.pages.length > 0) {
            let page = me.pages.pop();
            await roadBookDisposePage.call(me, page);
        }

        cloned = document.createDocumentFragment();

        for(var i = 0; i < fragment.children.length; i++) {
            cloned.appendChild(fragment.children[i].cloneNode(true));
        }

        do {
            page = await roadBookCreatePage.call(me);
            this.pages.push(page);
            page.setNumber(this.pages.length);
            this.inner.appendChild(page.root);
        }
        while (await roadBookFitItemsIntoPage.call(me, cloned, page));
    }

    function RoadBook(options) {
        this.opts = options;
        
        this.root = document.createElement('div');
        this.root.classList.add('road-book');
        this.inner = document.createElement('inner');
        this.inner.classList.add('inner');
        this.root.appendChild(this.inner);
        this.limits = Object.assign({}, {
            height: 0
        }, this.opts.limits);
        this.isRendering = null;

        if (this.limits.height <= 0) {
            throw new Error('No limit is set');
        }

        this.pagePool = [];
        this.pages = [];
        
        var fragment = this.fragment = document.createDocumentFragment();
        var container = this.opts.el;

        if (!container.parentNode) {
            throw new Error('RoadBook is not inside dom tree');
        }
        
        while (container.children.length > 0) {
            let el = container.children[0];
            fragment.appendChild(el);
        }

        container.appendChild(this.root);
    }

    RoadBook.prototype.render = async function() {
        var me = this;
        if (me.isRendering) {
            await me.isRendering;
        }

        me.isRendering = roadBookRender.call(me);
        var ret = await me.isRendering;
        me.isRendering = null;
        return ret;
    };

    RoadBook.prototype.destroy = async function() {
        var container = this.opts.el;
        var fragment = this.fragment;

        container.removeChild(this.root);

        while (fragment.children.length > 0) {
            let el = fragment.children[0];
            container.appendChild(el);
        }

        this.pages.length = 0;
        this.pagePool.length = 0;

        return Promise.resolve();
    };

    return RoadBook;
});