define(function() {

    function pageSqueeze(node, parent) {
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

            let leftOver = pageSqueeze.call(me, lastNode, cloned);

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
        me.root.style.height = 'auto';
        var style = window.getComputedStyle(me.root);
        var height = me.root.clientHeight + parseInt(style.marginTop);
        me.root.style.height = '';
        if (height > me.book.limits.height) {
            return false;
        }
        return true;
    };

    Page.prototype.squeeze = function(node) {
        var me = this;
        return pageSqueeze.call(me, node, me.inner);
    };

    Page.prototype.setNumber = function(number) {
        this.root.setAttribute('data-number', number);
    };

    function roadBookCreatePage() {
        var me = this;
        var page = new Page(me);
        return page;
    }

    function roadBookDisposePage() {

    }

    function roadBookFitItemsIntoPage(fragment, page) {
        while (fragment.children.length > 0) {
            let el = fragment.children[0];
            let leftOver = page.squeeze(el);
            if (leftOver) {
                fragment.insertBefore(leftOver, fragment.children[0]);
                return true;
            }
        }

        return false;
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

    RoadBook.prototype.render = function (){
        var me = this;
        
        var fragment = this.fragment;
        var page;

        var cloned = document.createDocumentFragment();

        for(var i = 0; i < fragment.children.length; i++) {
            cloned.appendChild(fragment.children[i].cloneNode(true));
        }

        do {
            page = roadBookCreatePage.call(me);
            this.pages.push(page);
            page.setNumber(this.pages.length);
            this.inner.appendChild(page.root);
        }
        while (roadBookFitItemsIntoPage.call(me, cloned, page));
    };

    return RoadBook;
});