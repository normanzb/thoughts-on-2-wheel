define(function(){
    function Ctor(options) {
        this.opts = options;


    }

    Ctor.prototype.run = function(){
        var container = this.opts.el;
        var fragment = document.createDocumentFragment();
        while (container.children.length > 0) {
            let el = container.children[0];
            fragment.appendChild(el);
        }

    }

    return Ctor;
});