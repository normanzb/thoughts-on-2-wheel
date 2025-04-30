define('scripts/animationFrame',[],function () {
  var requestAnimationFrame = window.requestAnimationFrame;
  var cancelAnimationFrame = window.cancelAnimationFrame;

  (function () {
    var lastTime = 0;
    var vendors = ['ms', 'moz', 'webkit', 'o'];
    for (var x = 0; x < vendors.length && !requestAnimationFrame; ++x) {
      requestAnimationFrame = window[vendors[x] + 'RequestAnimationFrame'];
      cancelAnimationFrame = window[vendors[x] + 'CancelAnimationFrame'] ||
        window[vendors[x] + 'CancelRequestAnimationFrame'];
    }

    if (!requestAnimationFrame)
      requestAnimationFrame = function (callback) {
        var currTime = new Date().getTime();
        var timeToCall = Math.max(0, 16 - (currTime - lastTime));
        var id = window.setTimeout(function () { callback(currTime + timeToCall); },
          timeToCall);
        lastTime = currTime + timeToCall;
        return id;
      };

    if (!cancelAnimationFrame)
      cancelAnimationFrame = function (id) {
        clearTimeout(id);
      };
  }());

  return {
    request: requestAnimationFrame.bind(window),
    cancel: cancelAnimationFrame.bind(window)
  };
});
define('scripts/imageMetaReady',['./animationFrame'], function (animationFrame) {
  'use strict';

  return function (el) {
    function loop(callback) {
      if (el.naturalWidth && el.naturalHeight) {
        return callback();
      }
      else {
        animationFrame.request(function () {
          loop(callback);
        });
      }
    }

    return new Promise(function (rs) {
      loop(rs);
    });
  };
});
define('scripts/RoadBook',['./imageMetaReady', './animationFrame'], function (imageMetaReady, animationFrame) {
  'use strict';

  async function asyncRequestFrame() {
    return new Promise(function (rs) {
      animationFrame.request(rs);
    });
  }

  // async function asyncWait(timeout) {
  //     return new Promise(function(rs){
  //         setTimeout(rs, timeout);
  //     });
  // }

  function eventOnce(el, name, handler) {
    el.addEventListener(name, function handlerWrapper() {
      el.removeEventListener(name, handlerWrapper);
      handler();
    });
  }

  async function imgReady(img) {
    return new Promise(function (rs, rj) {
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
    return new Promise(function (rs) {
      if (video.readyState >= 1) {
        rs();
      }
      else {
        eventOnce(video, 'loadedmetadata', rs);
        eventOnce(video, 'load', rs);
      }
    });
  }

  async function wait4Element(element) {
    if (element.tagName === 'IMG') {
      element.style.height = '';
      // console.log(`Waiting for image (${element.src}) to be ready...`);
      await imgReady(element);
      element.style.height = Math.round(element.clientWidth / element.naturalWidth * element.naturalHeight) + 'px';
      // console.log('Image ready', element);
    }
    else if (element.tagName === 'VIDEO') {
      console.log(`Waiting for video (${element.src}) to be ready...`);
      element.muted = true;
      await videoReady(element);
      console.log('Video ready', element);
    }
    else if (element.children && element.children.length > 0) {
      for (var i = 0; i < element.children.length; i++) {
        await wait4Element(element.children[i]);
      }
    }
  }

  function videoElementMutingWorkaround(element) {
    if (element.tagName === 'VIDEO') {
      element.muted = true;
    }
    else if (element.children && element.children.length > 0) {
      for (var i = 0; i < element.children.length; i++) {
        videoElementMutingWorkaround(element.children[i]);
      }
    }
  }

  function isUnseparatableChar(char) {
    var code = char.charCodeAt(0);
    if (
      (code >= 33 && code <= 126) ||
      (code >= 160 && code <= 591) ||
      (code >= 647 && code <= 669) ||
      (code >= 668 && code <= 767) ||
      (code >= 880 && code <= 1023)
    ) {
      return true;
    }
    return false;
  }

  async function pageSqueeze(node, parent) {
    var me = this;
    var cloned;

    parent.appendChild(node);
    await wait4Element(node);

    if (me.isFit()) {
      return null;
    }

    parent.removeChild(node);

    if (node.nodeType === node.TEXT_NODE) {
      let lastChar = null, allIn = true;
      let i = 0;

      cloned = node.cloneNode(false);
      parent.appendChild(cloned);

      cloned.nodeValue = '';
      while (i < node.nodeValue.length) {
        var squeezedChars = '';
        var nodeValueLength = node.nodeValue.length;
        do {
          lastChar = node.nodeValue[i + squeezedChars.length];
          squeezedChars += lastChar;
        }
        while (
          isUnseparatableChar(lastChar) &&
          (i + squeezedChars.length) < nodeValueLength
        );
        cloned.nodeValue += squeezedChars;
        if (!me.isFit()) {
          if (i === 0 && cloned.parentNode.clientHeight > me.book.limits.height) {
            throw new Error('Smallest element is even larger than limit');
          }
          allIn = false;
          cloned.nodeValue = cloned.nodeValue.substr(
            0, cloned.nodeValue.length - squeezedChars.length
          );
          node.nodeValue = node.nodeValue.substring(
            i, node.length
          );
          break;
        }
        i += squeezedChars.length;
      }

      if (allIn) {
        return null;
      }
    }
    else if (node.childNodes.length > 0) {
      cloned = node.cloneNode(false);
      parent.appendChild(cloned);

      await wait4Element(cloned);

      if (!me.isFit()) {
        if (cloned.clientHeight > me.book.limits.height) {
          throw new Error('Smallest element is even larger than limit');
        }
        parent.removeChild(cloned);
        return node;
      }

      let lastNode, leftOver;

      while (node.childNodes.length > 0) {
        await asyncRequestFrame;
        lastNode = node.childNodes[0];
        leftOver = await pageSqueeze.call(me, lastNode, cloned);

        if (leftOver) {
          cloned.classList.add('road-book--pre');
          break;
        }
      }

      if (leftOver) {
        node.classList.add('road-book--post');
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

  Page.prototype.isFit = function () {
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

  Page.prototype.squeeze = async function (node) {
    var me = this;
    return await pageSqueeze.call(me, node, me.inner);
  };

  Page.prototype.setNumber = function (number) {
    this.root.setAttribute('data-number', number);
  };

  Page.prototype.clean = function () {
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
    return page;
  }

  function roadBookDisposePage(page) {
    page.clean();
    this.pagePool.push(page);
  }

  function triggerProgress(curent) {
    if (typeof this.onProgress === 'function') {
      var total = this.fragment.children.length;
      this.onProgress(Math.round((1 - curent / total) * 100));
    }
  }

  async function roadBookFitItemsIntoPage(fragment, page) {
    while (fragment.children.length > 0) {
      let el = fragment.children[0];
      let leftOver = await page.squeeze(el);
      if (leftOver) {
        fragment.insertBefore(leftOver, fragment.children[0]);
        triggerProgress.call(this, fragment.children.length);
        return true;
      }
    }

    triggerProgress.call(this, fragment.children.length);
    return false;
  }

  async function roadBookRender() {
    var me = this;
    var fragment = this.fragment;
    var page;
    var cloned;

    this.inner.innerHTML = '';
    while (me.pages.length > 0) {
      let page = me.pages.pop();
      await roadBookDisposePage.call(me, page);
    }

    cloned = document.createDocumentFragment();

    for (var i = 0; i < fragment.children.length; i++) {
      cloned.appendChild(fragment.children[i].cloneNode(true));
    }

    videoElementMutingWorkaround(cloned);

    do {
      await asyncRequestFrame;
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

  RoadBook.prototype.render = async function () {
    var me = this;
    if (me.isRendering) {
      await me.isRendering;
    }

    me.isRendering = roadBookRender.call(me);
    var ret = await me.isRendering;
    me.isRendering = null;
    return ret;
  };

  RoadBook.prototype.destroy = async function () {
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
/*! highlight.js v9.13.1 | BSD3 License | git.io/hljslicense */
!function(e){var n="object"==typeof window&&window||"object"==typeof self&&self;"undefined"!=typeof exports?e(exports):n&&(n.hljs=e({}),"function"==typeof define&&define.amd&&define('scripts/highlight',[],function(){return n.hljs}))}(function(e){function n(e){return e.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;")}function t(e){return e.nodeName.toLowerCase()}function r(e,n){var t=e&&e.exec(n);return t&&0===t.index}function a(e){return k.test(e)}function i(e){var n,t,r,i,o=e.className+" ";if(o+=e.parentNode?e.parentNode.className:"",t=M.exec(o))return w(t[1])?t[1]:"no-highlight";for(o=o.split(/\s+/),n=0,r=o.length;r>n;n++)if(i=o[n],a(i)||w(i))return i}function o(e){var n,t={},r=Array.prototype.slice.call(arguments,1);for(n in e)t[n]=e[n];return r.forEach(function(e){for(n in e)t[n]=e[n]}),t}function c(e){var n=[];return function r(e,a){for(var i=e.firstChild;i;i=i.nextSibling)3===i.nodeType?a+=i.nodeValue.length:1===i.nodeType&&(n.push({event:"start",offset:a,node:i}),a=r(i,a),t(i).match(/br|hr|img|input/)||n.push({event:"stop",offset:a,node:i}));return a}(e,0),n}function u(e,r,a){function i(){return e.length&&r.length?e[0].offset!==r[0].offset?e[0].offset<r[0].offset?e:r:"start"===r[0].event?e:r:e.length?e:r}function o(e){function r(e){return" "+e.nodeName+'="'+n(e.value).replace('"',"&quot;")+'"'}l+="<"+t(e)+E.map.call(e.attributes,r).join("")+">"}function c(e){l+="</"+t(e)+">"}function u(e){("start"===e.event?o:c)(e.node)}for(var s=0,l="",f=[];e.length||r.length;){var g=i();if(l+=n(a.substring(s,g[0].offset)),s=g[0].offset,g===e){f.reverse().forEach(c);do u(g.splice(0,1)[0]),g=i();while(g===e&&g.length&&g[0].offset===s);f.reverse().forEach(o)}else"start"===g[0].event?f.push(g[0].node):f.pop(),u(g.splice(0,1)[0])}return l+n(a.substr(s))}function s(e){return e.v&&!e.cached_variants&&(e.cached_variants=e.v.map(function(n){return o(e,{v:null},n)})),e.cached_variants||e.eW&&[o(e)]||[e]}function l(e){function n(e){return e&&e.source||e}function t(t,r){return new RegExp(n(t),"m"+(e.cI?"i":"")+(r?"g":""))}function r(a,i){if(!a.compiled){if(a.compiled=!0,a.k=a.k||a.bK,a.k){var o={},c=function(n,t){e.cI&&(t=t.toLowerCase()),t.split(" ").forEach(function(e){var t=e.split("|");o[t[0]]=[n,t[1]?Number(t[1]):1]})};"string"==typeof a.k?c("keyword",a.k):B(a.k).forEach(function(e){c(e,a.k[e])}),a.k=o}a.lR=t(a.l||/\w+/,!0),i&&(a.bK&&(a.b="\\b("+a.bK.split(" ").join("|")+")\\b"),a.b||(a.b=/\B|\b/),a.bR=t(a.b),a.endSameAsBegin&&(a.e=a.b),a.e||a.eW||(a.e=/\B|\b/),a.e&&(a.eR=t(a.e)),a.tE=n(a.e)||"",a.eW&&i.tE&&(a.tE+=(a.e?"|":"")+i.tE)),a.i&&(a.iR=t(a.i)),null==a.r&&(a.r=1),a.c||(a.c=[]),a.c=Array.prototype.concat.apply([],a.c.map(function(e){return s("self"===e?a:e)})),a.c.forEach(function(e){r(e,a)}),a.starts&&r(a.starts,i);var u=a.c.map(function(e){return e.bK?"\\.?("+e.b+")\\.?":e.b}).concat([a.tE,a.i]).map(n).filter(Boolean);a.t=u.length?t(u.join("|"),!0):{exec:function(){return null}}}}r(e)}function f(e,t,a,i){function o(e){return new RegExp(e.replace(/[-\/\\^$*+?.()|[\]{}]/g,"\\$&"),"m")}function c(e,n){var t,a;for(t=0,a=n.c.length;a>t;t++)if(r(n.c[t].bR,e))return n.c[t].endSameAsBegin&&(n.c[t].eR=o(n.c[t].bR.exec(e)[0])),n.c[t]}function u(e,n){if(r(e.eR,n)){for(;e.endsParent&&e.parent;)e=e.parent;return e}return e.eW?u(e.parent,n):void 0}function s(e,n){return!a&&r(n.iR,e)}function p(e,n){var t=R.cI?n[0].toLowerCase():n[0];return e.k.hasOwnProperty(t)&&e.k[t]}function d(e,n,t,r){var a=r?"":j.classPrefix,i='<span class="'+a,o=t?"":I;return i+=e+'">',i+n+o}function h(){var e,t,r,a;if(!E.k)return n(k);for(a="",t=0,E.lR.lastIndex=0,r=E.lR.exec(k);r;)a+=n(k.substring(t,r.index)),e=p(E,r),e?(M+=e[1],a+=d(e[0],n(r[0]))):a+=n(r[0]),t=E.lR.lastIndex,r=E.lR.exec(k);return a+n(k.substr(t))}function b(){var e="string"==typeof E.sL;if(e&&!L[E.sL])return n(k);var t=e?f(E.sL,k,!0,B[E.sL]):g(k,E.sL.length?E.sL:void 0);return E.r>0&&(M+=t.r),e&&(B[E.sL]=t.top),d(t.language,t.value,!1,!0)}function v(){y+=null!=E.sL?b():h(),k=""}function m(e){y+=e.cN?d(e.cN,"",!0):"",E=Object.create(e,{parent:{value:E}})}function N(e,n){if(k+=e,null==n)return v(),0;var t=c(n,E);if(t)return t.skip?k+=n:(t.eB&&(k+=n),v(),t.rB||t.eB||(k=n)),m(t,n),t.rB?0:n.length;var r=u(E,n);if(r){var a=E;a.skip?k+=n:(a.rE||a.eE||(k+=n),v(),a.eE&&(k=n));do E.cN&&(y+=I),E.skip||E.sL||(M+=E.r),E=E.parent;while(E!==r.parent);return r.starts&&(r.endSameAsBegin&&(r.starts.eR=r.eR),m(r.starts,"")),a.rE?0:n.length}if(s(n,E))throw new Error('Illegal lexeme "'+n+'" for mode "'+(E.cN||"<unnamed>")+'"');return k+=n,n.length||1}var R=w(e);if(!R)throw new Error('Unknown language: "'+e+'"');l(R);var x,E=i||R,B={},y="";for(x=E;x!==R;x=x.parent)x.cN&&(y=d(x.cN,"",!0)+y);var k="",M=0;try{for(var C,A,S=0;;){if(E.t.lastIndex=S,C=E.t.exec(t),!C)break;A=N(t.substring(S,C.index),C[0]),S=C.index+A}for(N(t.substr(S)),x=E;x.parent;x=x.parent)x.cN&&(y+=I);return{r:M,value:y,language:e,top:E}}catch(O){if(O.message&&-1!==O.message.indexOf("Illegal"))return{r:0,value:n(t)};throw O}}function g(e,t){t=t||j.languages||B(L);var r={r:0,value:n(e)},a=r;return t.filter(w).filter(x).forEach(function(n){var t=f(n,e,!1);t.language=n,t.r>a.r&&(a=t),t.r>r.r&&(a=r,r=t)}),a.language&&(r.second_best=a),r}function p(e){return j.tabReplace||j.useBR?e.replace(C,function(e,n){return j.useBR&&"\n"===e?"<br>":j.tabReplace?n.replace(/\t/g,j.tabReplace):""}):e}function d(e,n,t){var r=n?y[n]:t,a=[e.trim()];return e.match(/\bhljs\b/)||a.push("hljs"),-1===e.indexOf(r)&&a.push(r),a.join(" ").trim()}function h(e){var n,t,r,o,s,l=i(e);a(l)||(j.useBR?(n=document.createElementNS("http://www.w3.org/1999/xhtml","div"),n.innerHTML=e.innerHTML.replace(/\n/g,"").replace(/<br[ \/]*>/g,"\n")):n=e,s=n.textContent,r=l?f(l,s,!0):g(s),t=c(n),t.length&&(o=document.createElementNS("http://www.w3.org/1999/xhtml","div"),o.innerHTML=r.value,r.value=u(t,c(o),s)),r.value=p(r.value),e.innerHTML=r.value,e.className=d(e.className,l,r.language),e.result={language:r.language,re:r.r},r.second_best&&(e.second_best={language:r.second_best.language,re:r.second_best.r}))}function b(e){j=o(j,e)}function v(){if(!v.called){v.called=!0;var e=document.querySelectorAll("pre code");E.forEach.call(e,h)}}function m(){addEventListener("DOMContentLoaded",v,!1),addEventListener("load",v,!1)}function N(n,t){var r=L[n]=t(e);r.aliases&&r.aliases.forEach(function(e){y[e]=n})}function R(){return B(L)}function w(e){return e=(e||"").toLowerCase(),L[e]||L[y[e]]}function x(e){var n=w(e);return n&&!n.disableAutodetect}var E=[],B=Object.keys,L={},y={},k=/^(no-?highlight|plain|text)$/i,M=/\blang(?:uage)?-([\w-]+)\b/i,C=/((^(<[^>]+>|\t|)+|(?:\n)))/gm,I="</span>",j={classPrefix:"hljs-",tabReplace:null,useBR:!1,languages:void 0};return e.highlight=f,e.highlightAuto=g,e.fixMarkup=p,e.highlightBlock=h,e.configure=b,e.initHighlighting=v,e.initHighlightingOnLoad=m,e.registerLanguage=N,e.listLanguages=R,e.getLanguage=w,e.autoDetection=x,e.inherit=o,e.IR="[a-zA-Z]\\w*",e.UIR="[a-zA-Z_]\\w*",e.NR="\\b\\d+(\\.\\d+)?",e.CNR="(-?)(\\b0[xX][a-fA-F0-9]+|(\\b\\d+(\\.\\d*)?|\\.\\d+)([eE][-+]?\\d+)?)",e.BNR="\\b(0b[01]+)",e.RSR="!|!=|!==|%|%=|&|&&|&=|\\*|\\*=|\\+|\\+=|,|-|-=|/=|/|:|;|<<|<<=|<=|<|===|==|=|>>>=|>>=|>=|>>>|>>|>|\\?|\\[|\\{|\\(|\\^|\\^=|\\||\\|=|\\|\\||~",e.BE={b:"\\\\[\\s\\S]",r:0},e.ASM={cN:"string",b:"'",e:"'",i:"\\n",c:[e.BE]},e.QSM={cN:"string",b:'"',e:'"',i:"\\n",c:[e.BE]},e.PWM={b:/\b(a|an|the|are|I'm|isn't|don't|doesn't|won't|but|just|should|pretty|simply|enough|gonna|going|wtf|so|such|will|you|your|they|like|more)\b/},e.C=function(n,t,r){var a=e.inherit({cN:"comment",b:n,e:t,c:[]},r||{});return a.c.push(e.PWM),a.c.push({cN:"doctag",b:"(?:TODO|FIXME|NOTE|BUG|XXX):",r:0}),a},e.CLCM=e.C("//","$"),e.CBCM=e.C("/\\*","\\*/"),e.HCM=e.C("#","$"),e.NM={cN:"number",b:e.NR,r:0},e.CNM={cN:"number",b:e.CNR,r:0},e.BNM={cN:"number",b:e.BNR,r:0},e.CSSNM={cN:"number",b:e.NR+"(%|em|ex|ch|rem|vw|vh|vmin|vmax|cm|mm|in|pt|pc|px|deg|grad|rad|turn|s|ms|Hz|kHz|dpi|dpcm|dppx)?",r:0},e.RM={cN:"regexp",b:/\//,e:/\/[gimuy]*/,i:/\n/,c:[e.BE,{b:/\[/,e:/\]/,r:0,c:[e.BE]}]},e.TM={cN:"title",b:e.IR,r:0},e.UTM={cN:"title",b:e.UIR,r:0},e.METHOD_GUARD={b:"\\.\\s*"+e.UIR,r:0},e});hljs.registerLanguage("json",function(e){var i={literal:"true false null"},n=[e.QSM,e.CNM],r={e:",",eW:!0,eE:!0,c:n,k:i},t={b:"{",e:"}",c:[{cN:"attr",b:/"/,e:/"/,c:[e.BE],i:"\\n"},e.inherit(r,{b:/:/})],i:"\\S"},c={b:"\\[",e:"\\]",c:[e.inherit(r)],i:"\\S"};return n.splice(n.length,0,t,c),{c:n,k:i,i:"\\S"}});hljs.registerLanguage("objectivec",function(e){var t={cN:"built_in",b:"\\b(AV|CA|CF|CG|CI|CL|CM|CN|CT|MK|MP|MTK|MTL|NS|SCN|SK|UI|WK|XC)\\w+"},_={keyword:"int float while char export sizeof typedef const struct for union unsigned long volatile static bool mutable if do return goto void enum else break extern asm case short default double register explicit signed typename this switch continue wchar_t inline readonly assign readwrite self @synchronized id typeof nonatomic super unichar IBOutlet IBAction strong weak copy in out inout bycopy byref oneway __strong __weak __block __autoreleasing @private @protected @public @try @property @end @throw @catch @finally @autoreleasepool @synthesize @dynamic @selector @optional @required @encode @package @import @defs @compatibility_alias __bridge __bridge_transfer __bridge_retained __bridge_retain __covariant __contravariant __kindof _Nonnull _Nullable _Null_unspecified __FUNCTION__ __PRETTY_FUNCTION__ __attribute__ getter setter retain unsafe_unretained nonnull nullable null_unspecified null_resettable class instancetype NS_DESIGNATED_INITIALIZER NS_UNAVAILABLE NS_REQUIRES_SUPER NS_RETURNS_INNER_POINTER NS_INLINE NS_AVAILABLE NS_DEPRECATED NS_ENUM NS_OPTIONS NS_SWIFT_UNAVAILABLE NS_ASSUME_NONNULL_BEGIN NS_ASSUME_NONNULL_END NS_REFINED_FOR_SWIFT NS_SWIFT_NAME NS_SWIFT_NOTHROW NS_DURING NS_HANDLER NS_ENDHANDLER NS_VALUERETURN NS_VOIDRETURN",literal:"false true FALSE TRUE nil YES NO NULL",built_in:"BOOL dispatch_once_t dispatch_queue_t dispatch_sync dispatch_async dispatch_once"},i=/[a-zA-Z@][a-zA-Z0-9_]*/,n="@interface @class @protocol @implementation";return{aliases:["mm","objc","obj-c"],k:_,l:i,i:"</",c:[t,e.CLCM,e.CBCM,e.CNM,e.QSM,{cN:"string",v:[{b:'@"',e:'"',i:"\\n",c:[e.BE]},{b:"'",e:"[^\\\\]'",i:"[^\\\\][^']"}]},{cN:"meta",b:"#",e:"$",c:[{cN:"meta-string",v:[{b:'"',e:'"'},{b:"<",e:">"}]}]},{cN:"class",b:"("+n.split(" ").join("|")+")\\b",e:"({|$)",eE:!0,k:n,l:i,c:[e.UTM]},{b:"\\."+e.UIR,r:0}]}});hljs.registerLanguage("css",function(e){var c="[a-zA-Z-][a-zA-Z0-9_-]*",t={b:/[A-Z\_\.\-]+\s*:/,rB:!0,e:";",eW:!0,c:[{cN:"attribute",b:/\S/,e:":",eE:!0,starts:{eW:!0,eE:!0,c:[{b:/[\w-]+\(/,rB:!0,c:[{cN:"built_in",b:/[\w-]+/},{b:/\(/,e:/\)/,c:[e.ASM,e.QSM]}]},e.CSSNM,e.QSM,e.ASM,e.CBCM,{cN:"number",b:"#[0-9A-Fa-f]+"},{cN:"meta",b:"!important"}]}}]};return{cI:!0,i:/[=\/|'\$]/,c:[e.CBCM,{cN:"selector-id",b:/#[A-Za-z0-9_-]+/},{cN:"selector-class",b:/\.[A-Za-z0-9_-]+/},{cN:"selector-attr",b:/\[/,e:/\]/,i:"$"},{cN:"selector-pseudo",b:/:(:)?[a-zA-Z0-9\_\-\+\(\)"'.]+/},{b:"@(font-face|page)",l:"[a-z-]+",k:"font-face page"},{b:"@",e:"[{;]",i:/:/,c:[{cN:"keyword",b:/\w+/},{b:/\s/,eW:!0,eE:!0,r:0,c:[e.ASM,e.QSM,e.CSSNM]}]},{cN:"selector-tag",b:c,r:0},{b:"{",e:"}",i:/\S/,c:[e.CBCM,t]}]}});hljs.registerLanguage("bash",function(e){var t={cN:"variable",v:[{b:/\$[\w\d#@][\w\d_]*/},{b:/\$\{(.*?)}/}]},s={cN:"string",b:/"/,e:/"/,c:[e.BE,t,{cN:"variable",b:/\$\(/,e:/\)/,c:[e.BE]}]},a={cN:"string",b:/'/,e:/'/};return{aliases:["sh","zsh"],l:/\b-?[a-z\._]+\b/,k:{keyword:"if then else elif fi for while in do done case esac function",literal:"true false",built_in:"break cd continue eval exec exit export getopts hash pwd readonly return shift test times trap umask unset alias bind builtin caller command declare echo enable help let local logout mapfile printf read readarray source type typeset ulimit unalias set shopt autoload bg bindkey bye cap chdir clone comparguments compcall compctl compdescribe compfiles compgroups compquote comptags comptry compvalues dirs disable disown echotc echoti emulate fc fg float functions getcap getln history integer jobs kill limit log noglob popd print pushd pushln rehash sched setcap setopt stat suspend ttyctl unfunction unhash unlimit unsetopt vared wait whence where which zcompile zformat zftp zle zmodload zparseopts zprof zpty zregexparse zsocket zstyle ztcp",_:"-ne -eq -lt -gt -f -d -e -s -l -a"},c:[{cN:"meta",b:/^#![^\n]+sh\s*$/,r:10},{cN:"function",b:/\w[\w\d_]*\s*\(\s*\)\s*\{/,rB:!0,c:[e.inherit(e.TM,{b:/\w[\w\d_]*/})],r:0},e.HCM,s,a,t]}});hljs.registerLanguage("cs",function(e){var i={keyword:"abstract as base bool break byte case catch char checked const continue decimal default delegate do double enum event explicit extern finally fixed float for foreach goto if implicit in int interface internal is lock long nameof object operator out override params private protected public readonly ref sbyte sealed short sizeof stackalloc static string struct switch this try typeof uint ulong unchecked unsafe ushort using virtual void volatile while add alias ascending async await by descending dynamic equals from get global group into join let on orderby partial remove select set value var where yield",literal:"null false true"},r={cN:"number",v:[{b:"\\b(0b[01']+)"},{b:"(-?)\\b([\\d']+(\\.[\\d']*)?|\\.[\\d']+)(u|U|l|L|ul|UL|f|F|b|B)"},{b:"(-?)(\\b0[xX][a-fA-F0-9']+|(\\b[\\d']+(\\.[\\d']*)?|\\.[\\d']+)([eE][-+]?[\\d']+)?)"}],r:0},t={cN:"string",b:'@"',e:'"',c:[{b:'""'}]},a=e.inherit(t,{i:/\n/}),c={cN:"subst",b:"{",e:"}",k:i},n=e.inherit(c,{i:/\n/}),s={cN:"string",b:/\$"/,e:'"',i:/\n/,c:[{b:"{{"},{b:"}}"},e.BE,n]},b={cN:"string",b:/\$@"/,e:'"',c:[{b:"{{"},{b:"}}"},{b:'""'},c]},l=e.inherit(b,{i:/\n/,c:[{b:"{{"},{b:"}}"},{b:'""'},n]});c.c=[b,s,t,e.ASM,e.QSM,r,e.CBCM],n.c=[l,s,a,e.ASM,e.QSM,r,e.inherit(e.CBCM,{i:/\n/})];var o={v:[b,s,t,e.ASM,e.QSM]},d=e.IR+"(<"+e.IR+"(\\s*,\\s*"+e.IR+")*>)?(\\[\\])?";return{aliases:["csharp"],k:i,i:/::/,c:[e.C("///","$",{rB:!0,c:[{cN:"doctag",v:[{b:"///",r:0},{b:"<!--|-->"},{b:"</?",e:">"}]}]}),e.CLCM,e.CBCM,{cN:"meta",b:"#",e:"$",k:{"meta-keyword":"if else elif endif define undef warning error line region endregion pragma checksum"}},o,r,{bK:"class interface",e:/[{;=]/,i:/[^\s:,]/,c:[e.TM,e.CLCM,e.CBCM]},{bK:"namespace",e:/[{;=]/,i:/[^\s:]/,c:[e.inherit(e.TM,{b:"[a-zA-Z](\\.?\\w)*"}),e.CLCM,e.CBCM]},{cN:"meta",b:"^\\s*\\[",eB:!0,e:"\\]",eE:!0,c:[{cN:"meta-string",b:/"/,e:/"/}]},{bK:"new return throw await else",r:0},{cN:"function",b:"("+d+"\\s+)+"+e.IR+"\\s*\\(",rB:!0,e:/\s*[{;=]/,eE:!0,k:i,c:[{b:e.IR+"\\s*\\(",rB:!0,c:[e.TM],r:0},{cN:"params",b:/\(/,e:/\)/,eB:!0,eE:!0,k:i,r:0,c:[o,r,e.CBCM]},e.CLCM,e.CBCM]}]}});hljs.registerLanguage("xml",function(s){var e="[A-Za-z0-9\\._:-]+",t={eW:!0,i:/</,r:0,c:[{cN:"attr",b:e,r:0},{b:/=\s*/,r:0,c:[{cN:"string",endsParent:!0,v:[{b:/"/,e:/"/},{b:/'/,e:/'/},{b:/[^\s"'=<>`]+/}]}]}]};return{aliases:["html","xhtml","rss","atom","xjb","xsd","xsl","plist"],cI:!0,c:[{cN:"meta",b:"<!DOCTYPE",e:">",r:10,c:[{b:"\\[",e:"\\]"}]},s.C("<!--","-->",{r:10}),{b:"<\\!\\[CDATA\\[",e:"\\]\\]>",r:10},{cN:"meta",b:/<\?xml/,e:/\?>/,r:10},{b:/<\?(php)?/,e:/\?>/,sL:"php",c:[{b:"/\\*",e:"\\*/",skip:!0},{b:'b"',e:'"',skip:!0},{b:"b'",e:"'",skip:!0},s.inherit(s.ASM,{i:null,cN:null,c:null,skip:!0}),s.inherit(s.QSM,{i:null,cN:null,c:null,skip:!0})]},{cN:"tag",b:"<style(?=\\s|>|$)",e:">",k:{name:"style"},c:[t],starts:{e:"</style>",rE:!0,sL:["css","xml"]}},{cN:"tag",b:"<script(?=\\s|>|$)",e:">",k:{name:"script"},c:[t],starts:{e:"</script>",rE:!0,sL:["actionscript","javascript","handlebars","xml"]}},{cN:"tag",b:"</?",e:"/?>",c:[{cN:"name",b:/[^\/><\s]+/,r:0},t]}]}});hljs.registerLanguage("java",function(e){var a="[À-ʸa-zA-Z_$][À-ʸa-zA-Z_$0-9]*",t=a+"(<"+a+"(\\s*,\\s*"+a+")*>)?",r="false synchronized int abstract float private char boolean var static null if const for true while long strictfp finally protected import native final void enum else break transient catch instanceof byte super volatile case assert short package default double public try this switch continue throws protected public private module requires exports do",s="\\b(0[bB]([01]+[01_]+[01]+|[01]+)|0[xX]([a-fA-F0-9]+[a-fA-F0-9_]+[a-fA-F0-9]+|[a-fA-F0-9]+)|(([\\d]+[\\d_]+[\\d]+|[\\d]+)(\\.([\\d]+[\\d_]+[\\d]+|[\\d]+))?|\\.([\\d]+[\\d_]+[\\d]+|[\\d]+))([eE][-+]?\\d+)?)[lLfF]?",c={cN:"number",b:s,r:0};return{aliases:["jsp"],k:r,i:/<\/|#/,c:[e.C("/\\*\\*","\\*/",{r:0,c:[{b:/\w+@/,r:0},{cN:"doctag",b:"@[A-Za-z]+"}]}),e.CLCM,e.CBCM,e.ASM,e.QSM,{cN:"class",bK:"class interface",e:/[{;=]/,eE:!0,k:"class interface",i:/[:"\[\]]/,c:[{bK:"extends implements"},e.UTM]},{bK:"new throw return else",r:0},{cN:"function",b:"("+t+"\\s+)+"+e.UIR+"\\s*\\(",rB:!0,e:/[{;=]/,eE:!0,k:r,c:[{b:e.UIR+"\\s*\\(",rB:!0,r:0,c:[e.UTM]},{cN:"params",b:/\(/,e:/\)/,k:r,r:0,c:[e.ASM,e.QSM,e.CNM,e.CBCM]},e.CLCM,e.CBCM]},c,{cN:"meta",b:"@[A-Za-z]+"}]}});hljs.registerLanguage("javascript",function(e){var r="[A-Za-z$_][0-9A-Za-z$_]*",t={keyword:"in of if for while finally var new function do return void else break catch instanceof with throw case default try this switch continue typeof delete let yield const export super debugger as async await static import from as",literal:"true false null undefined NaN Infinity",built_in:"eval isFinite isNaN parseFloat parseInt decodeURI decodeURIComponent encodeURI encodeURIComponent escape unescape Object Function Boolean Error EvalError InternalError RangeError ReferenceError StopIteration SyntaxError TypeError URIError Number Math Date String RegExp Array Float32Array Float64Array Int16Array Int32Array Int8Array Uint16Array Uint32Array Uint8Array Uint8ClampedArray ArrayBuffer DataView JSON Intl arguments require module console window document Symbol Set Map WeakSet WeakMap Proxy Reflect Promise"},a={cN:"number",v:[{b:"\\b(0[bB][01]+)"},{b:"\\b(0[oO][0-7]+)"},{b:e.CNR}],r:0},n={cN:"subst",b:"\\$\\{",e:"\\}",k:t,c:[]},c={cN:"string",b:"`",e:"`",c:[e.BE,n]};n.c=[e.ASM,e.QSM,c,a,e.RM];var s=n.c.concat([e.CBCM,e.CLCM]);return{aliases:["js","jsx"],k:t,c:[{cN:"meta",r:10,b:/^\s*['"]use (strict|asm)['"]/},{cN:"meta",b:/^#!/,e:/$/},e.ASM,e.QSM,c,e.CLCM,e.CBCM,a,{b:/[{,]\s*/,r:0,c:[{b:r+"\\s*:",rB:!0,r:0,c:[{cN:"attr",b:r,r:0}]}]},{b:"("+e.RSR+"|\\b(case|return|throw)\\b)\\s*",k:"return throw case",c:[e.CLCM,e.CBCM,e.RM,{cN:"function",b:"(\\(.*?\\)|"+r+")\\s*=>",rB:!0,e:"\\s*=>",c:[{cN:"params",v:[{b:r},{b:/\(\s*\)/},{b:/\(/,e:/\)/,eB:!0,eE:!0,k:t,c:s}]}]},{b:/</,e:/(\/\w+|\w+\/)>/,sL:"xml",c:[{b:/<\w+\s*\/>/,skip:!0},{b:/<\w+/,e:/(\/\w+|\w+\/)>/,skip:!0,c:[{b:/<\w+\s*\/>/,skip:!0},"self"]}]}],r:0},{cN:"function",bK:"function",e:/\{/,eE:!0,c:[e.inherit(e.TM,{b:r}),{cN:"params",b:/\(/,e:/\)/,eB:!0,eE:!0,c:s}],i:/\[|%/},{b:/\$[(.]/},e.METHOD_GUARD,{cN:"class",bK:"class",e:/[{;=]/,eE:!0,i:/[:"\[\]]/,c:[{bK:"extends"},e.UTM]},{bK:"constructor",e:/\{/,eE:!0}],i:/#(?!!)/}});hljs.registerLanguage("nginx",function(e){var r={cN:"variable",v:[{b:/\$\d+/},{b:/\$\{/,e:/}/},{b:"[\\$\\@]"+e.UIR}]},b={eW:!0,l:"[a-z/_]+",k:{literal:"on off yes no true false none blocked debug info notice warn error crit select break last permanent redirect kqueue rtsig epoll poll /dev/poll"},r:0,i:"=>",c:[e.HCM,{cN:"string",c:[e.BE,r],v:[{b:/"/,e:/"/},{b:/'/,e:/'/}]},{b:"([a-z]+):/",e:"\\s",eW:!0,eE:!0,c:[r]},{cN:"regexp",c:[e.BE,r],v:[{b:"\\s\\^",e:"\\s|{|;",rE:!0},{b:"~\\*?\\s+",e:"\\s|{|;",rE:!0},{b:"\\*(\\.[a-z\\-]+)+"},{b:"([a-z\\-]+\\.)+\\*"}]},{cN:"number",b:"\\b\\d{1,3}\\.\\d{1,3}\\.\\d{1,3}\\.\\d{1,3}(:\\d{1,5})?\\b"},{cN:"number",b:"\\b\\d+[kKmMgGdshdwy]*\\b",r:0},r]};return{aliases:["nginxconf"],c:[e.HCM,{b:e.UIR+"\\s+{",rB:!0,e:"{",c:[{cN:"section",b:e.UIR}],r:0},{b:e.UIR+"\\s",e:";|{",rB:!0,c:[{cN:"attribute",b:e.UIR,starts:b}],r:0}],i:"[^\\s\\}]"}});hljs.registerLanguage("cpp",function(t){var e={cN:"keyword",b:"\\b[a-z\\d_]*_t\\b"},r={cN:"string",v:[{b:'(u8?|U|L)?"',e:'"',i:"\\n",c:[t.BE]},{b:'(u8?|U|L)?R"\\(',e:'\\)"'},{b:"'\\\\?.",e:"'",i:"."}]},s={cN:"number",v:[{b:"\\b(0b[01']+)"},{b:"(-?)\\b([\\d']+(\\.[\\d']*)?|\\.[\\d']+)(u|U|l|L|ul|UL|f|F|b|B)"},{b:"(-?)(\\b0[xX][a-fA-F0-9']+|(\\b[\\d']+(\\.[\\d']*)?|\\.[\\d']+)([eE][-+]?[\\d']+)?)"}],r:0},i={cN:"meta",b:/#\s*[a-z]+\b/,e:/$/,k:{"meta-keyword":"if else elif endif define undef warning error line pragma ifdef ifndef include"},c:[{b:/\\\n/,r:0},t.inherit(r,{cN:"meta-string"}),{cN:"meta-string",b:/<[^\n>]*>/,e:/$/,i:"\\n"},t.CLCM,t.CBCM]},a=t.IR+"\\s*\\(",c={keyword:"int float while private char catch import module export virtual operator sizeof dynamic_cast|10 typedef const_cast|10 const for static_cast|10 union namespace unsigned long volatile static protected bool template mutable if public friend do goto auto void enum else break extern using asm case typeid short reinterpret_cast|10 default double register explicit signed typename try this switch continue inline delete alignof constexpr decltype noexcept static_assert thread_local restrict _Bool complex _Complex _Imaginary atomic_bool atomic_char atomic_schar atomic_uchar atomic_short atomic_ushort atomic_int atomic_uint atomic_long atomic_ulong atomic_llong atomic_ullong new throw return and or not",built_in:"std string cin cout cerr clog stdin stdout stderr stringstream istringstream ostringstream auto_ptr deque list queue stack vector map set bitset multiset multimap unordered_set unordered_map unordered_multiset unordered_multimap array shared_ptr abort abs acos asin atan2 atan calloc ceil cosh cos exit exp fabs floor fmod fprintf fputs free frexp fscanf isalnum isalpha iscntrl isdigit isgraph islower isprint ispunct isspace isupper isxdigit tolower toupper labs ldexp log10 log malloc realloc memchr memcmp memcpy memset modf pow printf putchar puts scanf sinh sin snprintf sprintf sqrt sscanf strcat strchr strcmp strcpy strcspn strlen strncat strncmp strncpy strpbrk strrchr strspn strstr tanh tan vfprintf vprintf vsprintf endl initializer_list unique_ptr",literal:"true false nullptr NULL"},n=[e,t.CLCM,t.CBCM,s,r];return{aliases:["c","cc","h","c++","h++","hpp"],k:c,i:"</",c:n.concat([i,{b:"\\b(deque|list|queue|stack|vector|map|set|bitset|multiset|multimap|unordered_map|unordered_set|unordered_multiset|unordered_multimap|array)\\s*<",e:">",k:c,c:["self",e]},{b:t.IR+"::",k:c},{v:[{b:/=/,e:/;/},{b:/\(/,e:/\)/},{bK:"new throw return else",e:/;/}],k:c,c:n.concat([{b:/\(/,e:/\)/,k:c,c:n.concat(["self"]),r:0}]),r:0},{cN:"function",b:"("+t.IR+"[\\*&\\s]+)+"+a,rB:!0,e:/[{;=]/,eE:!0,k:c,i:/[^\w\s\*&]/,c:[{b:a,rB:!0,c:[t.TM],r:0},{cN:"params",b:/\(/,e:/\)/,k:c,r:0,c:[t.CLCM,t.CBCM,r,s,e,{b:/\(/,e:/\)/,k:c,r:0,c:["self",t.CLCM,t.CBCM,r,s,e]}]},t.CLCM,t.CBCM,i]},{cN:"class",bK:"class struct",e:/[{;:]/,c:[{b:/</,e:/>/,c:["self"]},t.TM]}]),exports:{preprocessor:i,strings:r,k:c}}});
define('scripts/article',['./RoadBook', './highlight'], function (RoadBook, highlight) {
  'use strict';

  var container = document.querySelector('article.post');
  var progressBar = container.querySelector('.progress-bar');
  var engine;
  var postInner;
  var currentStatus = '';

  function isMobile() {
    return window.innerWidth <= 1226;
  }

  function switchEngine() {
    if (!isMobile()) {
      currentStatus = 0;
      if (!engine) {
        engine = new RoadBook({
          el: postInner,
          limits: {
            height: document.documentElement.clientHeight - 30 * 2
          }
        });
      }

      progressBar.style.height = '2px';
      engine.onProgress = function (percentage) {
        progressBar.style.width = percentage + '%';
      };
      engine.render()
        .then(function () {
          // give animation sometime to finish
          setTimeout(function () {
            progressBar.style.height = '0';
          }, 1000);
          // var videos = container.querySelectorAll('video[autoplay]');
          // for(var l = videos.length; l--;) {
          //     videos[l].muted = true;
          //     videos[l].play();
          // }
        });
      return Promise.resolve();
    }
    else {
      currentStatus = 1;
      if (engine) {
        return engine.destroy()
          .then(function () {
            engine = null;
          });
      }
      else {
        return Promise.resolve();
      }
    }
  }

  function initRoadBook() {
    postInner = document.querySelector('.post > .inner');
    postInner.querySelectorAll('pre > code')
      .forEach((block) => {
        highlight.highlightBlock(block);
      });
    var scheduled = null;
    window.addEventListener('resize', function () {
      if (scheduled) {
        clearTimeout(scheduled);
      }
      if (currentStatus !== 1 || !isMobile()) {
        container.classList.remove('ready');
      }
      scheduled = setTimeout(function () {
        switchEngine()
          .then(function () {
            container.classList.add('ready');
          });
        scheduled = false;
      }, 600);
    });

    switchEngine()
      .then(function () {
        container.classList.add('ready');
      });

  }

  /* TODO: auto wrap from server side */
  function wrapElement(query, wrapperClass, callback) {
    var imgs = container.querySelectorAll(query);
    var img;
    var wrap;
    for (var l = imgs.length; l--;) {
      img = imgs[l];
      wrap = document.createElement('div');
      wrap.classList.add(wrapperClass);
      img.parentNode.insertBefore(wrap, img);
      wrap.appendChild(img);
      if (callback) {
        callback(wrap, img);
      }
    }
    return wrap;
  }

  function matchSelector(element, selector) {
    if (element.matches) {
      return element.matches(selector);
    }
    else if (element.msMatchesSelector) {
      return element.msMatchesSelector(selector);
    }
    return false;
  }

  function isInside(element, ancestorSelector) {
    var cur = element;
    while (cur.parentNode) {
      if (matchSelector(cur, ancestorSelector)) {
        return cur;
      }

      cur = cur.parentNode;
    }

    return false;
  }

  return {
    init: function () {
      var monitorElements = [];
      container.addEventListener('click', function (event) {
        var target = false;
        for (var l = monitorElements.length; l--;) {
          let selector = monitorElements[l];
          target = isInside(event.target, selector);
          if (target) {
            break;
          }
        }
        if (target) {
          target.classList.add('activated');
        }
      });
      wrapElement('img', 'image-container', function (wrap, el) {
        wrap.setAttribute('title', el.getAttribute('alt'));
      });

      wrapElement(':scope > .inner > iframe', 'iframe-container');
      monitorElements.push('.iframe-container');

      document.querySelectorAll('.iframe-video-container');
      monitorElements.push('.iframe-video-container');

      initRoadBook();
    }
  };
});
(function(f){if(typeof exports==="object"&&typeof module!=="undefined"){module.exports=f()}else if(typeof define==="function"&&define.amd){define('scripts/huntun',[],f)}else{var g;if(typeof window!=="undefined"){g=window}else if(typeof global!=="undefined"){g=global}else if(typeof self!=="undefined"){g=self}else{g=this}g.bundle = f()}})(function(){var define,module,exports;return (function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);var f=new Error("Cannot find module '"+o+"'");throw f.code="MODULE_NOT_FOUND",f}var l=n[o]={exports:{}};t[o][0].call(l.exports,function(e){var n=t[o][1][e];return s(n?n:e)},l,l.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(require,module,exports){
window.huntun = {
    ScrollBar: require('./src/ScrollBar')
};
module.exports = huntun;
},{"./src/ScrollBar":7}],2:[function(require,module,exports){
/*
 * JavaScript MD5
 * https://github.com/blueimp/JavaScript-MD5
 *
 * Copyright 2011, Sebastian Tschan
 * https://blueimp.net
 *
 * Licensed under the MIT license:
 * https://opensource.org/licenses/MIT
 *
 * Based on
 * A JavaScript implementation of the RSA Data Security, Inc. MD5 Message
 * Digest Algorithm, as defined in RFC 1321.
 * Version 2.2 Copyright (C) Paul Johnston 1999 - 2009
 * Other contributors: Greg Holt, Andrew Kepert, Ydnar, Lostinet
 * Distributed under the BSD License
 * See http://pajhome.org.uk/crypt/md5 for more info.
 */

/* global define */

;(function ($) {
  'use strict'

  /*
  * Add integers, wrapping at 2^32. This uses 16-bit operations internally
  * to work around bugs in some JS interpreters.
  */
  function safeAdd (x, y) {
    var lsw = (x & 0xFFFF) + (y & 0xFFFF)
    var msw = (x >> 16) + (y >> 16) + (lsw >> 16)
    return (msw << 16) | (lsw & 0xFFFF)
  }

  /*
  * Bitwise rotate a 32-bit number to the left.
  */
  function bitRotateLeft (num, cnt) {
    return (num << cnt) | (num >>> (32 - cnt))
  }

  /*
  * These functions implement the four basic operations the algorithm uses.
  */
  function md5cmn (q, a, b, x, s, t) {
    return safeAdd(bitRotateLeft(safeAdd(safeAdd(a, q), safeAdd(x, t)), s), b)
  }
  function md5ff (a, b, c, d, x, s, t) {
    return md5cmn((b & c) | ((~b) & d), a, b, x, s, t)
  }
  function md5gg (a, b, c, d, x, s, t) {
    return md5cmn((b & d) | (c & (~d)), a, b, x, s, t)
  }
  function md5hh (a, b, c, d, x, s, t) {
    return md5cmn(b ^ c ^ d, a, b, x, s, t)
  }
  function md5ii (a, b, c, d, x, s, t) {
    return md5cmn(c ^ (b | (~d)), a, b, x, s, t)
  }

  /*
  * Calculate the MD5 of an array of little-endian words, and a bit length.
  */
  function binlMD5 (x, len) {
    /* append padding */
    x[len >> 5] |= 0x80 << (len % 32)
    x[(((len + 64) >>> 9) << 4) + 14] = len

    var i
    var olda
    var oldb
    var oldc
    var oldd
    var a = 1732584193
    var b = -271733879
    var c = -1732584194
    var d = 271733878

    for (i = 0; i < x.length; i += 16) {
      olda = a
      oldb = b
      oldc = c
      oldd = d

      a = md5ff(a, b, c, d, x[i], 7, -680876936)
      d = md5ff(d, a, b, c, x[i + 1], 12, -389564586)
      c = md5ff(c, d, a, b, x[i + 2], 17, 606105819)
      b = md5ff(b, c, d, a, x[i + 3], 22, -1044525330)
      a = md5ff(a, b, c, d, x[i + 4], 7, -176418897)
      d = md5ff(d, a, b, c, x[i + 5], 12, 1200080426)
      c = md5ff(c, d, a, b, x[i + 6], 17, -1473231341)
      b = md5ff(b, c, d, a, x[i + 7], 22, -45705983)
      a = md5ff(a, b, c, d, x[i + 8], 7, 1770035416)
      d = md5ff(d, a, b, c, x[i + 9], 12, -1958414417)
      c = md5ff(c, d, a, b, x[i + 10], 17, -42063)
      b = md5ff(b, c, d, a, x[i + 11], 22, -1990404162)
      a = md5ff(a, b, c, d, x[i + 12], 7, 1804603682)
      d = md5ff(d, a, b, c, x[i + 13], 12, -40341101)
      c = md5ff(c, d, a, b, x[i + 14], 17, -1502002290)
      b = md5ff(b, c, d, a, x[i + 15], 22, 1236535329)

      a = md5gg(a, b, c, d, x[i + 1], 5, -165796510)
      d = md5gg(d, a, b, c, x[i + 6], 9, -1069501632)
      c = md5gg(c, d, a, b, x[i + 11], 14, 643717713)
      b = md5gg(b, c, d, a, x[i], 20, -373897302)
      a = md5gg(a, b, c, d, x[i + 5], 5, -701558691)
      d = md5gg(d, a, b, c, x[i + 10], 9, 38016083)
      c = md5gg(c, d, a, b, x[i + 15], 14, -660478335)
      b = md5gg(b, c, d, a, x[i + 4], 20, -405537848)
      a = md5gg(a, b, c, d, x[i + 9], 5, 568446438)
      d = md5gg(d, a, b, c, x[i + 14], 9, -1019803690)
      c = md5gg(c, d, a, b, x[i + 3], 14, -187363961)
      b = md5gg(b, c, d, a, x[i + 8], 20, 1163531501)
      a = md5gg(a, b, c, d, x[i + 13], 5, -1444681467)
      d = md5gg(d, a, b, c, x[i + 2], 9, -51403784)
      c = md5gg(c, d, a, b, x[i + 7], 14, 1735328473)
      b = md5gg(b, c, d, a, x[i + 12], 20, -1926607734)

      a = md5hh(a, b, c, d, x[i + 5], 4, -378558)
      d = md5hh(d, a, b, c, x[i + 8], 11, -2022574463)
      c = md5hh(c, d, a, b, x[i + 11], 16, 1839030562)
      b = md5hh(b, c, d, a, x[i + 14], 23, -35309556)
      a = md5hh(a, b, c, d, x[i + 1], 4, -1530992060)
      d = md5hh(d, a, b, c, x[i + 4], 11, 1272893353)
      c = md5hh(c, d, a, b, x[i + 7], 16, -155497632)
      b = md5hh(b, c, d, a, x[i + 10], 23, -1094730640)
      a = md5hh(a, b, c, d, x[i + 13], 4, 681279174)
      d = md5hh(d, a, b, c, x[i], 11, -358537222)
      c = md5hh(c, d, a, b, x[i + 3], 16, -722521979)
      b = md5hh(b, c, d, a, x[i + 6], 23, 76029189)
      a = md5hh(a, b, c, d, x[i + 9], 4, -640364487)
      d = md5hh(d, a, b, c, x[i + 12], 11, -421815835)
      c = md5hh(c, d, a, b, x[i + 15], 16, 530742520)
      b = md5hh(b, c, d, a, x[i + 2], 23, -995338651)

      a = md5ii(a, b, c, d, x[i], 6, -198630844)
      d = md5ii(d, a, b, c, x[i + 7], 10, 1126891415)
      c = md5ii(c, d, a, b, x[i + 14], 15, -1416354905)
      b = md5ii(b, c, d, a, x[i + 5], 21, -57434055)
      a = md5ii(a, b, c, d, x[i + 12], 6, 1700485571)
      d = md5ii(d, a, b, c, x[i + 3], 10, -1894986606)
      c = md5ii(c, d, a, b, x[i + 10], 15, -1051523)
      b = md5ii(b, c, d, a, x[i + 1], 21, -2054922799)
      a = md5ii(a, b, c, d, x[i + 8], 6, 1873313359)
      d = md5ii(d, a, b, c, x[i + 15], 10, -30611744)
      c = md5ii(c, d, a, b, x[i + 6], 15, -1560198380)
      b = md5ii(b, c, d, a, x[i + 13], 21, 1309151649)
      a = md5ii(a, b, c, d, x[i + 4], 6, -145523070)
      d = md5ii(d, a, b, c, x[i + 11], 10, -1120210379)
      c = md5ii(c, d, a, b, x[i + 2], 15, 718787259)
      b = md5ii(b, c, d, a, x[i + 9], 21, -343485551)

      a = safeAdd(a, olda)
      b = safeAdd(b, oldb)
      c = safeAdd(c, oldc)
      d = safeAdd(d, oldd)
    }
    return [a, b, c, d]
  }

  /*
  * Convert an array of little-endian words to a string
  */
  function binl2rstr (input) {
    var i
    var output = ''
    var length32 = input.length * 32
    for (i = 0; i < length32; i += 8) {
      output += String.fromCharCode((input[i >> 5] >>> (i % 32)) & 0xFF)
    }
    return output
  }

  /*
  * Convert a raw string to an array of little-endian words
  * Characters >255 have their high-byte silently ignored.
  */
  function rstr2binl (input) {
    var i
    var output = []
    output[(input.length >> 2) - 1] = undefined
    for (i = 0; i < output.length; i += 1) {
      output[i] = 0
    }
    var length8 = input.length * 8
    for (i = 0; i < length8; i += 8) {
      output[i >> 5] |= (input.charCodeAt(i / 8) & 0xFF) << (i % 32)
    }
    return output
  }

  /*
  * Calculate the MD5 of a raw string
  */
  function rstrMD5 (s) {
    return binl2rstr(binlMD5(rstr2binl(s), s.length * 8))
  }

  /*
  * Calculate the HMAC-MD5, of a key and some data (raw strings)
  */
  function rstrHMACMD5 (key, data) {
    var i
    var bkey = rstr2binl(key)
    var ipad = []
    var opad = []
    var hash
    ipad[15] = opad[15] = undefined
    if (bkey.length > 16) {
      bkey = binlMD5(bkey, key.length * 8)
    }
    for (i = 0; i < 16; i += 1) {
      ipad[i] = bkey[i] ^ 0x36363636
      opad[i] = bkey[i] ^ 0x5C5C5C5C
    }
    hash = binlMD5(ipad.concat(rstr2binl(data)), 512 + data.length * 8)
    return binl2rstr(binlMD5(opad.concat(hash), 512 + 128))
  }

  /*
  * Convert a raw string to a hex string
  */
  function rstr2hex (input) {
    var hexTab = '0123456789abcdef'
    var output = ''
    var x
    var i
    for (i = 0; i < input.length; i += 1) {
      x = input.charCodeAt(i)
      output += hexTab.charAt((x >>> 4) & 0x0F) +
      hexTab.charAt(x & 0x0F)
    }
    return output
  }

  /*
  * Encode a string as utf-8
  */
  function str2rstrUTF8 (input) {
    return unescape(encodeURIComponent(input))
  }

  /*
  * Take string arguments and return either raw or hex encoded strings
  */
  function rawMD5 (s) {
    return rstrMD5(str2rstrUTF8(s))
  }
  function hexMD5 (s) {
    return rstr2hex(rawMD5(s))
  }
  function rawHMACMD5 (k, d) {
    return rstrHMACMD5(str2rstrUTF8(k), str2rstrUTF8(d))
  }
  function hexHMACMD5 (k, d) {
    return rstr2hex(rawHMACMD5(k, d))
  }

  function md5 (string, key, raw) {
    if (!key) {
      if (!raw) {
        return hexMD5(string)
      }
      return rawMD5(string)
    }
    if (!raw) {
      return hexHMACMD5(key, string)
    }
    return rawHMACMD5(key, string)
  }

  if (typeof define === 'function' && define.amd) {
    define(function () {
      return md5
    })
  } else if (typeof module === 'object' && module.exports) {
    module.exports = md5
  } else {
    $.md5 = md5
  }
}(this))

},{}],3:[function(require,module,exports){
/**
* Copyright (c) 2017, Leon Sorokin
* All rights reserved. (MIT Licensed)
*
* domvm.full.js - DOM ViewModel
* A thin, fast, dependency-free vdom view layer
* @preserve https://github.com/leeoniya/domvm (v3.0.5, nano)
*/

(function (global, factory) {
  typeof exports === 'object' && typeof module !== 'undefined' ? module.exports = factory() :
  typeof define === 'function' && define.amd ? define(factory) :
  (global.domvm = factory());
}(this, (function () { 'use strict';

// NOTE: if adding a new *VNode* type, make it < COMMENT and renumber rest.
// There are some places that test <= COMMENT to assert if node is a VNode

// VNode types
var ELEMENT = 1;
var TEXT    = 2;
var COMMENT = 3;

// placeholder types
var VVIEW   = 4;
var VMODEL    = 5;

var ENV_DOM = typeof window !== "undefined";
var win = ENV_DOM ? window : {};
var rAF = win.requestAnimationFrame;

var emptyObj = {};

function noop() {}

var isArr = Array.isArray;

function isSet(val) {
  return val != null;
}

function isPlainObj(val) {
  return val != null && val.constructor === Object;   //  && typeof val === "object"
}

function insertArr(targ, arr, pos, rem) {
  targ.splice.apply(targ, [pos, rem].concat(arr));
}

function isVal(val) {
  var t = typeof val;
  return t === "string" || t === "number";
}

function isFunc(val) {
  return typeof val === "function";
}

function isProm(val) {
  return typeof val === "object" && isFunc(val.then);
}



function assignObj(targ) {
  var args = arguments;

  for (var i = 1; i < args.length; i++)
    { for (var k in args[i])
      { targ[k] = args[i][k]; } }

  return targ;
}

// export const defProp = Object.defineProperty;

function deepSet(targ, path, val) {
  var seg;

  while (seg = path.shift()) {
    if (path.length === 0)
      { targ[seg] = val; }
    else
      { targ[seg] = targ = targ[seg] || {}; }
  }
}

/*
export function deepUnset(targ, path) {
  var seg;

  while (seg = path.shift()) {
    if (path.length === 0)
      targ[seg] = val;
    else
      targ[seg] = targ = targ[seg] || {};
  }
}
*/



function cmpObj(a, b) {
  for (var i in a)
    { if (a[i] !== b[i])
      { return false; } }

  return true;
}

function cmpArr(a, b) {
  var alen = a.length;

  if (b.length !== alen)
    { return false; }

  for (var i = 0; i < alen; i++)
    { if (a[i] !== b[i])
      { return false; } }

  return true;
}

// https://github.com/darsain/raft
// rAF throttler, aggregates multiple repeated redraw calls within single animframe
function raft(fn) {
  if (!rAF)
    { return fn; }

  var id, ctx, args;

  function call() {
    id = 0;
    fn.apply(ctx, args);
  }

  return function() {
    ctx = this;
    args = arguments;
    if (!id) { id = rAF(call); }
  };
}

function curry(fn, args, ctx) {
  return function() {
    return fn.apply(ctx, args);
  };
}

/*
export function prop(val, cb, ctx, args) {
  return function(newVal, execCb) {
    if (newVal !== undefined && newVal !== val) {
      val = newVal;
      execCb !== false && isFunc(cb) && cb.apply(ctx, args);
    }

    return val;
  };
}
*/

// adapted from https://github.com/Olical/binary-search

function VNode() {}

var VNodeProto = VNode.prototype = {
  constructor: VNode,

  type: null,

  vm:   null,

  // all this stuff can just live in attrs (as defined) just have getters here for it
  key:  null,
  ref:  null,
  data: null,
  hooks:  null,
  raw:  false,
  ns:   null,

  el:   null,

  tag:  null,
  attrs:  null,
  body: null,

  flags:  0,

  _class: null,
  _diff:  null,

  // pending removal on promise resolution
  _dead:  false,

  idx:  null,
  parent: null,

  /*
  // break out into optional fluent module
  key:  function(val) { this.key  = val; return this; },
  ref:  function(val) { this.ref  = val; return this; },    // deep refs
  data: function(val) { this.data = val; return this; },
  hooks:  function(val) { this.hooks  = val; return this; },    // h("div").hooks()
  html: function(val) { this.html = true; return this.body(val); },

  body: function(val) { this.body = val; return this; },
  */
};

function defineText(body) {
  var node = new VNode;
  node.type = TEXT;
  node.body = body;
  return node;
}

function isEvProp(name) {
  return name[0] === "o" && name[1] === "n";
}

function isSplProp(name) {
  return name[0] === "_";
}

function isStyleProp(name) {
  return name === "style";
}

function repaint(node) {
  node && node.el && node.el.offsetHeight;
}

// tests interactive props where real val should be compared
function isDynProp(tag, attr) {
//  switch (tag) {
//    case "input":
//    case "textarea":
//    case "select":
//    case "option":
      switch (attr) {
        case "value":
        case "checked":
        case "selected":
//        case "selectedIndex":
          return true;
      }
//  }

  return false;
}

function getVm(n) {
  n = n || emptyObj;
  while (n.vm == null && n.parent)
    { n = n.parent; }
  return n.vm;
}

// creates a one-shot self-ending stream that redraws target vm
// TODO: if it's already registered by any parent vm, then ignore to avoid simultaneous parent & child refresh

var tagCache = {};

var RE_ATTRS = /\[(\w+)(?:=(\w+))?\]/g;

function cssTag(raw) {
  {
    var cached = tagCache[raw];

    if (cached == null) {
      var tag, id, cls, attr;

      tagCache[raw] = cached = {
        tag:  (tag  = raw.match( /^[-\w]+/))    ? tag[0]            : "div",
        id:   (id   = raw.match( /#([-\w]+)/))    ?   id[1]           : null,
        class:  (cls  = raw.match(/\.([-\w.]+)/))   ? cls[1].replace(/\./g, " ")  : null,
        attrs:  null,
      };

      while (attr = RE_ATTRS.exec(raw)) {
        if (cached.attrs == null)
          { cached.attrs = {}; }
        cached.attrs[attr[1]] = attr[2] || "";
      }
    }

    return cached;
  }
}

// (de)optimization flags

// forces slow bottom-up removeChild to fire deep willRemove/willUnmount hooks,
var DEEP_REMOVE = 1;
// prevents inserting/removing/reordering of children
var FIXED_BODY = 2;
// enables fast keyed lookup of children via binary search, expects homogeneous keyed body
var KEYED_LIST = 4;
// indicates an vnode match/diff/recycler function for body
var LAZY_LIST = 8;

function initElementNode(tag, attrs, body, flags) {
  var node = new VNode;

  node.type = ELEMENT;

  if (isSet(flags))
    { node.flags = flags; }

  node.attrs = attrs;

  var parsed = cssTag(tag);

  node.tag = parsed.tag;

  // meh, weak assertion, will fail for id=0, etc.
  if (parsed.id || parsed.class || parsed.attrs) {
    var p = node.attrs || {};

    if (parsed.id && !isSet(p.id))
      { p.id = parsed.id; }

    if (parsed.class) {
      node._class = parsed.class;   // static class
      p.class = parsed.class + (isSet(p.class) ? (" " + p.class) : "");
    }
    if (parsed.attrs) {
      for (var key in parsed.attrs)
        { if (!isSet(p[key]))
          { p[key] = parsed.attrs[key]; } }
    }

//    if (node.attrs !== p)
      node.attrs = p;
  }

  var mergedAttrs = node.attrs;

  if (isSet(mergedAttrs)) {
    if (isSet(mergedAttrs._key))
      { node.key = mergedAttrs._key; }

    if (isSet(mergedAttrs._ref))
      { node.ref = mergedAttrs._ref; }

    if (isSet(mergedAttrs._hooks))
      { node.hooks = mergedAttrs._hooks; }

    if (isSet(mergedAttrs._raw))
      { node.raw = mergedAttrs._raw; }

    if (isSet(mergedAttrs._data))
      { node.data = mergedAttrs._data; }

    if (isSet(mergedAttrs._flags))
      { node.flags = mergedAttrs._flags; }

    if (!isSet(node.key)) {
      if (isSet(node.ref))
        { node.key = node.ref; }
      else if (isSet(mergedAttrs.id))
        { node.key = mergedAttrs.id; }
      else if (isSet(mergedAttrs.name))
        { node.key = mergedAttrs.name + (mergedAttrs.type === "radio" || mergedAttrs.type === "checkbox" ? mergedAttrs.value : ""); }
    }
  }

  if (body != null)
    { node.body = body; }

  return node;
}

function setRef(vm, name, node) {
  var path = ["refs"].concat(name.split("."));
  deepSet(vm, path, node);
}

function setDeepRemove(node) {
  while (node = node.parent)
    { node.flags |= DEEP_REMOVE; }
}

// vnew, vold
function preProc(vnew, parent, idx, ownVm) {
  if (vnew.type === VMODEL || vnew.type === VVIEW)
    { return; }

  vnew.parent = parent;
  vnew.idx = idx;
  vnew.vm = ownVm;

  if (vnew.ref != null)
    { setRef(getVm(vnew), vnew.ref, vnew); }

  var nh = vnew.hooks,
    vh = ownVm && ownVm.hooks;

  if (nh && (nh.willRemove || nh.didRemove) ||
    vh && (vh.willUnmount || vh.didUnmount))
    { setDeepRemove(vnew); }

  if (isArr(vnew.body))
    { preProcBody(vnew); }
  else {}
}

function preProcBody(vnew) {
  var body = vnew.body;

  for (var i = 0; i < body.length; i++) {
    var node2 = body[i];

    // remove false/null/undefined
    if (node2 === false || node2 == null)
      { body.splice(i--, 1); }
    // flatten arrays
    else if (isArr(node2)) {
      insertArr(body, node2, i--, 1);
    }
    else {
      if (node2.type == null)
        { body[i] = node2 = defineText(""+node2); }

      if (node2.type === TEXT) {
        // remove empty text nodes
        if (node2.body == null || node2.body === "")
          { body.splice(i--, 1); }
        // merge with previous text node
        else if (i > 0 && body[i-1].type === TEXT) {
          body[i-1].body += node2.body;
          body.splice(i--, 1);
        }
        else
          { preProc(node2, vnew, i, null); }
      }
      else
        { preProc(node2, vnew, i, null); }
    }
  }
}

function autoPx(name, val) {
  { return val; }
}

// assumes if styles exist both are objects or both are strings
function patchStyle(n, o) {
  var ns =     (n.attrs || emptyObj).style;
  var os = o ? (o.attrs || emptyObj).style : null;

  // replace or remove in full
  if (ns == null || isVal(ns))
    { n.el.style.cssText = ns; }
  else {
    for (var nn in ns) {
      var nv = ns[nn];

      if (os == null || nv != null && nv !== os[nn])
        { n.el.style[nn] = autoPx(nn, nv); }
    }

    // clean old
    if (os) {
      for (var on in os) {
        if (ns[on] == null)
          { n.el.style[on] = ""; }
      }
    }
  }
}

var didQueue = [];

function fireHook(name, o, n, immediate) {
  var fn = o.hooks[name];

  if (fn) {
    if (name[0] === "d" && name[1] === "i" && name[2] === "d") {  // did*
      //  console.log(name + " should queue till repaint", o, n);
      immediate ? repaint(o.parent) && fn(o, n) : didQueue.push([fn, o, n]);
    }
    else {    // will*
      //  console.log(name + " may delay by promise", o, n);
      return fn(o, n);    // or pass  done() resolver
    }
  }
}

function drainDidHooks(vm) {
  if (didQueue.length) {
    repaint(vm.node);

    var item;
    while (item = didQueue.shift())
      { item[0](item[1], item[2]); }
  }
}

var doc = ENV_DOM ? document : null;

function closestVNode(el) {
  while (el._node == null)
    { el = el.parentNode; }
  return el._node;
}

function createElement(tag, ns) {
  if (ns != null)
    { return doc.createElementNS(ns, tag); }
  return doc.createElement(tag);
}

function createTextNode(body) {
  return doc.createTextNode(body);
}

function createComment(body) {
  return doc.createComment(body);
}

// ? removes if !recycled
function nextSib(sib) {
  return sib.nextSibling;
}

// ? removes if !recycled
function prevSib(sib) {
  return sib.previousSibling;
}

// TODO: this should collect all deep proms from all hooks and return Promise.all()
function deepNotifyRemove(node) {
  var hooks = node.hooks, vm = node.vm;

  var wuRes = vm && vm.hooks && fireHook("willUnmount", vm, vm.data);

  var wrRes = hooks && fireHook("willRemove", node);

  if ((node.flags & DEEP_REMOVE) === DEEP_REMOVE && isArr(node.body)) {
    for (var i = 0; i < node.body.length; i++)
      { deepNotifyRemove(node.body[i]); }
  }

  return wuRes || wrRes;
}

function _removeChild(parEl, el, immediate) {
  var node = el._node, hooks = node.hooks, vm = node.vm;

  if ((node.flags & DEEP_REMOVE) === DEEP_REMOVE && isArr(node.body)) {
  //  var parEl = node.el;
    for (var i = 0; i < node.body.length; i++)
      { _removeChild(el, node.body[i].el); }
  }

  parEl.removeChild(el);

  hooks && fireHook("didRemove", node, null, immediate);

  vm && vm.hooks && fireHook("didUnmount", vm, vm.data, immediate);
}

// todo: should delay parent unmount() by returning res prom?
function removeChild(parEl, el) {
  var node = el._node, hooks = node.hooks;

  // already marked for removal
  if (node._dead) { return; }

  var res = deepNotifyRemove(node);

  if (res != null && isProm(res)) {
    node._dead = true;
    res.then(curry(_removeChild, [parEl, el, true]));
  }
  else
    { _removeChild(parEl, el); }
}

function clearChildren(parent) {
  var parEl = parent.el;

  if ((parent.flags & DEEP_REMOVE) === 0)
    { parEl.textContent = null; }
  else {
    var el = parEl.firstChild;

    do {
      var next = nextSib(el);
      removeChild(parEl, el);
    } while (el = next);
  }
}

// todo: hooks
function insertBefore(parEl, el, refEl) {
  var node = el._node, hooks = node.hooks, inDom = el.parentNode != null;

  // el === refEl is asserted as a no-op insert called to fire hooks
  var vm = (el === refEl || !inDom) && node.vm;

  vm && vm.hooks && fireHook("willMount", vm, vm.data);

  hooks && fireHook(inDom ? "willReinsert" : "willInsert", node);
  parEl.insertBefore(el, refEl);
  hooks && fireHook(inDom ? "didReinsert" : "didInsert", node);

  vm && vm.hooks && fireHook("didMount", vm, vm.data);
}

function insertAfter(parEl, el, refEl) {
  insertBefore(parEl, el, refEl ? nextSib(refEl) : null);
}

var onevent = noop;

function config(newCfg) {
  onevent = newCfg.onevent || onevent;

  
}

function bindEv(el, type, fn) {
//  DEBUG && console.log("addEventListener");
  el[type] = fn;
}

function handle(e, fn, args) {
  var node = closestVNode(e.target);
  var vm = getVm(node);
  var out = fn.apply(null, args.concat([e, node, vm, vm.data]));

  // should these respect out === false?
  vm.onevent(e, node, vm, vm.data, args);
  onevent.call(null, e, node, vm, vm.data, args);

  if (out === false) {
    e.preventDefault();
    e.stopPropagation();
  }
}

function wrapHandler(fn, args) {
//  console.log("wrapHandler");

  return function wrap(e) {
    handle(e, fn, args);
  };
}

// delagated handlers {".moo": [fn, a, b]}, {".moo": fn}
function wrapHandlers(hash) {
//  console.log("wrapHandlers");

  return function wrap(e) {
    for (var sel in hash) {
      if (e.target.matches(sel)) {
        var hnd = hash[sel];
        var isarr = isArr(hnd);
        var fn = isarr ? hnd[0] : hnd;
        var args = isarr ? hnd.slice(1) : [];

        handle(e, fn, args);
      }
    }
  }
}

// could merge with on*

function patchEvent(node, name, nval, oval) {
  if (nval === oval)
    { return; }

  var el = node.el;

  if (nval._raw) {
    bindEv(el, name, nval);
    return;
  }

  if (isArr(nval)) {
    var diff = oval == null || !cmpArr(nval, oval);
    diff && bindEv(el, name, wrapHandler(nval[0], nval.slice(1)));
  }
  // basic onclick: myFn (or extracted)
  else if (isFunc(nval)) {
    bindEv(el, name, wrapHandler(nval, []));
  }
  // delegated onclick: {".sel": myFn} & onclick: {".sel": [myFn, 1, 2, 3]}
  else    // isPlainObj, TODO:, diff with old/clean
    { bindEv(el, name, wrapHandlers(nval)); }
}

function defineElement(tag, arg1, arg2, flags) {
  var attrs, body;

  if (arg2 == null) {
    if (isPlainObj(arg1))
      { attrs = arg1; }
    else
      { body = arg1; }
  }
  else {
    attrs = arg1;
    body = arg2;
  }

  return initElementNode(tag, attrs, body, flags);
}

//export const XML_NS = "http://www.w3.org/2000/xmlns/";
var SVG_NS = "http://www.w3.org/2000/svg";
var XLINK_NS = "http://www.w3.org/1999/xlink";

function defineSvgElement(tag, arg1, arg2, flags) {
  var n = defineElement(tag, arg1, arg2, flags);
  n.ns = SVG_NS;
  return n;
}

var XLINKHREF = "xlink:href";

function remAttr(node, name, asProp) {
  if (asProp)
    { node.el[name] = ""; }
  else {
    if (name === XLINKHREF)
      { node.el.removeAttributeNS(XLINK_NS, "href"); }
    else
      { node.el.removeAttribute(name); }
  }
}

// setAttr
// diff, ".", "on*", bool vals, skip _*, value/checked/selected selectedIndex
function setAttr(node, name, val, asProp, initial) {
  var el = node.el;

  if (val == null)
    { !initial && remAttr(node, name, false); }   //, asProp?  // will also removeAttr of style: null
  else if (node.ns != null) {
    if (name === XLINKHREF)
      { el.setAttributeNS(XLINK_NS, "href", val); }
    else
      { el.setAttribute(name, val); }
  }
  else if (name === "class")
    { el.className = val; }
  else if (name === "id" || typeof val === "boolean" || asProp)
    { el[name] = val; }
  else if (name[0] === ".")
    { el[name.substr(1)] = val; }
  else
    { el.setAttribute(name, val); }
}

function patchAttrs(vnode, donor, initial) {
  var nattrs = vnode.attrs || emptyObj;
  var oattrs = donor.attrs || emptyObj;

  if (nattrs === oattrs) {
    
  }
  else {
    for (var key in nattrs) {
      var nval = nattrs[key];
      var isDyn = isDynProp(vnode.tag, key);
      var oval = isDyn ? vnode.el[key] : oattrs[key];

      if (nval === oval) {}
      else if (isStyleProp(key))
        { patchStyle(vnode, donor); }
      else if (isSplProp(key)) {}
      else if (isEvProp(key))
        { patchEvent(vnode, key, nval, oval); }
      else
        { setAttr(vnode, key, nval, isDyn, initial); }
    }

    // TODO: handle key[0] === "."
    // should bench style.cssText = "" vs removeAttribute("style")
    for (var key in oattrs) {
      !(key in nattrs) &&
      !isSplProp(key) &&
      remAttr(vnode, key, isDynProp(vnode.tag, key) || isEvProp(key));
    }
  }
}

function createView(view, data, key, opts) {
  if (view.type === VVIEW) {
    data  = view.data;
    key   = view.key;
    opts  = view.opts;
    view  = view.view;
  }

  return new ViewModel(view, data, key, opts);
}

//import { XML_NS, XLINK_NS } from './defineSvgElement';
function hydrateBody(vnode) {
  for (var i = 0; i < vnode.body.length; i++) {
    var vnode2 = vnode.body[i];
    var type2 = vnode2.type;

    // ELEMENT,TEXT,COMMENT
    if (type2 <= COMMENT)
      { insertBefore(vnode.el, hydrate(vnode2)); }    // vnode.el.appendChild(hydrate(vnode2))
    else if (type2 === VVIEW) {
      var vm = createView(vnode2.view, vnode2.data, vnode2.key, vnode2.opts)._redraw(vnode, i, false);    // todo: handle new data updates
      type2 = vm.node.type;
      insertBefore(vnode.el, hydrate(vm.node));
    }
    else if (type2 === VMODEL) {
      var vm = vnode2.vm;
      vm._redraw(vnode, i);         // , false
      type2 = vm.node.type;
      insertBefore(vnode.el, vm.node.el);   // , hydrate(vm.node)
    }
  }
}

//  TODO: DRY this out. reusing normal patch here negatively affects V8's JIT
function hydrate(vnode, withEl) {
  if (vnode.el == null) {
    if (vnode.type === ELEMENT) {
      vnode.el = withEl || createElement(vnode.tag, vnode.ns);

    //  if (vnode.tag === "svg")
    //    vnode.el.setAttributeNS(XML_NS, 'xmlns:xlink', XLINK_NS);

      if (vnode.attrs != null)
        { patchAttrs(vnode, emptyObj, true); }

      if ((vnode.flags & LAZY_LIST) === LAZY_LIST)  // vnode.body instanceof LazyList
        { vnode.body.body(vnode); }

      if (isArr(vnode.body))
        { hydrateBody(vnode); }
      else if (vnode.body != null && vnode.body !== "") {
        if (vnode.raw)
          { vnode.el.innerHTML = vnode.body; }
        else
          { vnode.el.textContent = vnode.body; }
      }
    }
    else if (vnode.type === TEXT)
      { vnode.el = withEl || createTextNode(vnode.body); }
    else if (vnode.type === COMMENT)
      { vnode.el = withEl || createComment(vnode.body); }
  }

  vnode.el._node = vnode;

  return vnode.el;
}

function nextNode(node, body) {
  return body[node.idx + 1];
}

function prevNode(node, body) {
  return body[node.idx - 1];
}

function parentNode(node) {
  return node.parent;
}

function tmpEdges(fn, parEl, lftSib, rgtSib) {
  // get outer immute edges
  var lftLft = prevSib(lftSib);
  var rgtRgt = nextSib(rgtSib);

  fn(lftLft, rgtRgt);

  return {
    lftSib: lftLft ? nextSib(lftLft) : parEl.firstChild,
    rgtSib: rgtRgt ? prevSib(rgtRgt) : parEl.lastChild,
  };
}

function headTailTry(parEl, lftSib, lftNode, rgtSib, rgtNode) {
  var areAdjacent = rgtNode.idx === lftNode.idx + 1;
  var headToTail = areAdjacent ? false : lftSib._node === rgtNode;
  var tailToHead = areAdjacent ? true  : rgtSib._node === lftNode;

  if (headToTail || tailToHead) {
    return tmpEdges(function(lftLft, rgtRgt) {
      if (tailToHead)
        { insertBefore(parEl, rgtSib, lftSib); }

      if (headToTail)
        { insertBefore(parEl, lftSib, rgtRgt); }
    }, parEl, lftSib, rgtSib);
  }

  return null;
}

// init vm,

// selection sort of DOM (cause move cost >> cmp cost)
// todo: skip removed
function sortDOM(parEl, lftSib, rgtSib, cmpFn) {
//  DEBUG && console.log("selection sort!");

  return tmpEdges(function(lftLft, rgtRgt) {
    var min;

    for (var i = lftSib; i !== rgtRgt; i = nextSib(i)) {
      lftSib = min = i;

      for (var j = nextSib(i); j !== rgtRgt; j = nextSib(j)) {
        if (cmpFn(min, j) > 0)
          { min = j; }
      }

      if (min === i)
        { continue; }

      insertBefore(parEl, min, lftSib);

      i = min;
    }
  }, parEl, lftSib, rgtSib);
}

function cmpElNodeIdx(a, b) {
  return a._node.idx - b._node.idx;
}

function syncChildren(node, donor) {
  var parEl   = node.el,
    body    = node.body,
    obody   = donor.body,
    lftNode   = body[0],
    rgtNode   = body[body.length - 1],
    lftSib    = ((obody)[0] || emptyObj).el,
  //  lftEnd    = prevSib(lftSib),
    rgtSib    = (obody[obody.length - 1] || emptyObj).el,
  //  rgtEnd    = nextSib(rgtSib),
    newSibs,
    tmpSib,
    lsNode,
    rsNode;

  converge:
  while (1) {
//    from_left:
    while (1) {
      // remove any non-recycled sibs whose el.node has the old parent
      if (lftSib) {
        // skip dom elements not created by domvm
        if ((lsNode = lftSib._node) == null) {
          lftSib = nextSib(lftSib);
          continue;
        }

        if (parentNode(lsNode) !== node) {
          tmpSib = nextSib(lftSib);
          lsNode.vm != null ? lsNode.vm.unmount(true) : removeChild(parEl, lftSib);
          lftSib = tmpSib;
          continue;
        }
      }

      if (lftNode == null)    // reached end
        { break converge; }
      else if (lftNode.el == null) {
        insertBefore(parEl, hydrate(lftNode), lftSib);    // lftNode.vm != null ? lftNode.vm.mount(parEl, false, true, lftSib) :
        lftNode = nextNode(lftNode, body);
      }
      else if (lftNode.el === lftSib) {
        lftNode = nextNode(lftNode, body);
        lftSib = nextSib(lftSib);
      }
      else
        { break; }
    }

//    from_right:
    while (1) {
    //  if (rgtSib === lftEnd)
    //    break converge;

      if (rgtSib) {
        if ((rsNode = rgtSib._node) == null) {
          rgtSib = prevSib(rgtSib);
          continue;
        }

        if (parentNode(rsNode) !== node) {
          tmpSib = prevSib(rgtSib);
          rsNode.vm != null ? rsNode.vm.unmount(true) : removeChild(parEl, rgtSib);
          rgtSib = tmpSib;
          continue;
        }
      }

      if (rgtNode === lftNode)    // converged
        { break converge; }
      else if (rgtNode.el == null) {
        insertAfter(parEl, hydrate(rgtNode), rgtSib);   // rgtNode.vm != null ? rgtNode.vm.mount(parEl, false, true, nextSib(rgtSib) :
        rgtNode = prevNode(rgtNode, body);
      }
      else if (rgtNode.el === rgtSib) {
        rgtNode = prevNode(rgtNode, body);
        rgtSib = prevSib(rgtSib);
      }
      else
        { break; }
    }

    if (newSibs = headTailTry(parEl, lftSib, lftNode, rgtSib, rgtNode)) {
      lftSib = newSibs.lftSib;
      rgtSib = newSibs.rgtSib;
      continue;
    }

    newSibs = sortDOM(parEl, lftSib, rgtSib, cmpElNodeIdx);
    lftSib = newSibs.lftSib;
    rgtSib = newSibs.rgtSib;
  }
}

function alreadyAdopted(vnode) {
  return vnode.el._node.parent !== vnode.parent;
}

function takeSeqIndex(n, obody, fromIdx) {
  return obody[fromIdx];
}

function findSeqThorough(n, obody, fromIdx) {   // pre-tested isView?
  for (; fromIdx < obody.length; fromIdx++) {
    var o = obody[fromIdx];

    if (o.vm != null) {
      // match by key & viewFn || vm
      if (n.type === VVIEW && o.vm.view === n.view && o.vm.key === n.key || n.type === VMODEL && o.vm === n.vm)
        { return o; }
    }
    else if (!alreadyAdopted(o) && n.tag === o.tag && n.type === o.type && n.key === o.key && (n.flags & ~DEEP_REMOVE) === (o.flags & ~DEEP_REMOVE))
      { return o; }
  }

  return null;
}

function findSeqKeyed(n, obody, fromIdx) {
  for (; fromIdx < obody.length; fromIdx++) {
    var o = obody[fromIdx];

    if (o.key === n.key)
      { return o; }
  }

  return null;
}

// have it handle initial hydrate? !donor?
// types (and tags if ELEM) are assumed the same, and donor exists
function patch(vnode, donor) {
  donor.hooks && fireHook("willRecycle", donor, vnode);

  var el = vnode.el = donor.el;

  var obody = donor.body;
  var nbody = vnode.body;

  el._node = vnode;

  // "" => ""
  if (vnode.type === TEXT && nbody !== obody) {
    el.nodeValue = nbody;
    return;
  }

  if (vnode.attrs != null || donor.attrs != null)
    { patchAttrs(vnode, donor, false); }

  // patch events

  var oldIsArr = isArr(obody);
  var newIsArr = isArr(nbody);
  var lazyList = (vnode.flags & LAZY_LIST) === LAZY_LIST;

//  var nonEqNewBody = nbody != null && nbody !== obody;

  if (oldIsArr) {
    // [] => []
    if (newIsArr || lazyList)
      { patchChildren(vnode, donor); }
    // [] => "" | null
    else if (nbody !== obody) {
      if (nbody != null) {
        if (vnode.raw)
          { el.innerHTML = nbody; }
        else
          { el.textContent = nbody; }
      }
      else
        { clearChildren(donor); }
    }
  }
  else {
    // "" | null => []
    if (newIsArr) {
      clearChildren(donor);
      hydrateBody(vnode);
    }
    // "" | null => "" | null
    else if (nbody !== obody) {
      if (vnode.raw)
        { el.innerHTML = nbody; }
      else if (donor.raw)
        { el.textContent = nbody; }
      else if (el.firstChild)
        { el.firstChild.nodeValue = nbody; }
      else
        { el.textContent = nbody; }
    }
  }

  donor.hooks && fireHook("didRecycle", donor, vnode);
}

// larger qtys of KEYED_LIST children will use binary search
//const SEQ_FAILS_MAX = 100;

// TODO: modify vtree matcher to work similar to dom reconciler for keyed from left -> from right -> head/tail -> binary
// fall back to binary if after failing nri - nli > SEQ_FAILS_MAX
// while-advance non-keyed fromIdx
// [] => []
function patchChildren(vnode, donor) {
  var nbody   = vnode.body,
    nlen    = nbody.length,
    obody   = donor.body,
    olen    = obody.length,
    isLazy    = (vnode.flags & LAZY_LIST) === LAZY_LIST,
    isFixed   = (vnode.flags & FIXED_BODY) === FIXED_BODY,
    isKeyed   = (vnode.flags & KEYED_LIST) === KEYED_LIST,
    domSync   = !isFixed && vnode.type === ELEMENT,
    doFind    = true,
    find    = (
      isKeyed ? findSeqKeyed :        // keyed lists/lazyLists (falls back to findBinKeyed when > SEQ_FAILS_MAX)
      isFixed || isLazy ? takeSeqIndex :    // unkeyed lazyLists and FIXED_BODY
      findSeqThorough             // more complex stuff
    );

  if (domSync && nlen === 0) {
    clearChildren(donor);
    if (isLazy)
      { vnode.body = []; }  // nbody.tpl(all);
    return;
  }

  var donor2,
    node2,
    foundIdx,
    patched = 0,
    everNonseq = false,
    fromIdx = 0;    // first unrecycled node (search head)

  if (isLazy) {
    var fnode2 = {key: null};
    var nbodyNew = Array(nlen);
  }

  for (var i = 0; i < nlen; i++) {
    if (isLazy) {
      var remake = false;
      var diffRes = null;

      if (doFind) {
        if (isKeyed)
          { fnode2.key = nbody.key(i); }

        donor2 = find(fnode2, obody, fromIdx);
      }

      if (donor2 != null) {
                foundIdx = donor2.idx;
        diffRes = nbody.diff(i, donor2);

        // diff returns same, so cheaply adopt vnode without patching
        if (diffRes === true) {
          node2 = donor2;
          node2.parent = vnode;
          node2.idx = i;
        }
        // diff returns new diffVals, so generate new vnode & patch
        else
          { remake = true; }
      }
      else
        { remake = true; }

      if (remake) {
        node2 = nbody.tpl(i);     // what if this is a VVIEW, VMODEL, injected element?
        preProc(node2, vnode, i);

        node2._diff = diffRes != null ? diffRes : nbody.diff(i);

        if (donor2 != null)
          { patch(node2, donor2); }
      }
      else {
        // TODO: flag tmp FIXED_BODY on unchanged nodes?

        // domSync = true;    if any idx changes or new nodes added/removed
      }

      nbodyNew[i] = node2;
    }
    else {
      var node2 = nbody[i];
      var type2 = node2.type;

      // ELEMENT,TEXT,COMMENT
      if (type2 <= COMMENT) {
        if (donor2 = doFind && find(node2, obody, fromIdx)) {
          patch(node2, donor2);
          foundIdx = donor2.idx;
        }
      }
      else if (type2 === VVIEW) {
        if (donor2 = doFind && find(node2, obody, fromIdx)) {   // update/moveTo
          var vm = donor2.vm._update(node2.data, vnode, i);   // withDOM
          foundIdx = donor2.idx;
        }
        else
          { var vm = createView(node2.view, node2.data, node2.key, node2.opts)._redraw(vnode, i, false); }  // createView, no dom (will be handled by sync below)

        type2 = vm.node.type;
      }
      else if (type2 === VMODEL) {
        var vm = node2.vm._update(node2.data, vnode, i);
        type2 = vm.node.type;
      }
    }

    // found donor & during a sequential search ...at search head
    if (donor2 != null) {
      if (foundIdx === fromIdx) {
        // advance head
        fromIdx++;
        // if all old vnodes adopted and more exist, stop searching
        if (fromIdx === olen && nlen > olen) {
          // short-circuit find, allow loop just create/init rest
          donor2 = null;
          doFind = false;
        }
      }
      else
        { everNonseq = true; }

      if (olen > 100 && everNonseq && ++patched % 10 === 0)
        { while (fromIdx < olen && alreadyAdopted(obody[fromIdx]))
          { fromIdx++; } }
    }
  }

  // replace List w/ new body
  if (isLazy)
    { vnode.body = nbodyNew; }

  domSync && syncChildren(vnode, donor);
}

// view + key serve as the vm's unique identity
function ViewModel(view, data, key, opts) {
  var vm = this;

  vm.view = view;
  vm.data = data;
  vm.key = key;

  if (opts) {
    vm.opts = opts;
    vm.config(opts);
  }

  var out = isPlainObj(view) ? view : view.call(vm, vm, data, key, opts);

  if (isFunc(out))
    { vm.render = out; }
  else {
    vm.render = out.render;
    vm.config(out);
  }

  // these must be wrapped here since they're debounced per view
  vm._redrawAsync = raft(function (_) { return vm._redraw(); });
  vm._updateAsync = raft(function (newData) { return vm._update(newData); });

  vm.init && vm.init.call(vm, vm, vm.data, vm.key, opts);
}

var ViewModelProto = ViewModel.prototype = {
  constructor: ViewModel,

  _diff:  null, // diff cache

  init: null,
  view: null,
  key:  null,
  data: null,
  state:  null,
  api:  null,
  opts: null,
  node: null,
  hooks:  null,
  onevent: noop,
  refs: null,
  render: null,

  mount: mount,
  unmount: unmount,
  config: function(opts) {
    var t = this;

    if (opts.init)
      { t.init = opts.init; }
    if (opts.diff)
      { t.diff = opts.diff; }
    if (opts.onevent)
      { t.onevent = opts.onevent; }

    // maybe invert assignment order?
    if (opts.hooks)
      { t.hooks = assignObj(t.hooks || {}, opts.hooks); }

    
  },
  parent: function() {
    return getVm(this.node.parent);
  },
  root: function() {
    var p = this.node;

    while (p.parent)
      { p = p.parent; }

    return p.vm;
  },
  redraw: function(sync) {
    var vm = this;
    sync ? vm._redraw() : vm._redrawAsync();
    return vm;
  },
  update: function(newData, sync) {
    var vm = this;
    sync ? vm._update(newData) : vm._updateAsync(newData);
    return vm;
  },

  _update: updateSync,
  _redraw: redrawSync,
  _redrawAsync: null,
  _updateAsync: null,
};

function mount(el, isRoot) {
  var vm = this;

  if (isRoot) {
    clearChildren({el: el, flags: 0});

    vm._redraw(null, null, false);

    // if placeholder node doesnt match root tag
    if (el.nodeName.toLowerCase() !== vm.node.tag) {
      hydrate(vm.node);
      insertBefore(el.parentNode, vm.node.el, el);
      el.parentNode.removeChild(el);
    }
    else
      { insertBefore(el.parentNode, hydrate(vm.node, el), el); }
  }
  else {
    vm._redraw(null, null);

    if (el)
      { insertBefore(el, vm.node.el); }
  }

  if (el)
    { drainDidHooks(vm); }

  return vm;
}

// asSub means this was called from a sub-routine, so don't drain did* hook queue
function unmount(asSub) {
  var vm = this;

  var node = vm.node;
  var parEl = node.el.parentNode;

  // edge bug: this could also be willRemove promise-delayed; should .then() or something to make sure hooks fire in order
  removeChild(parEl, node.el);

  if (!asSub)
    { drainDidHooks(vm); }
}

function reParent(vm, vold, newParent, newIdx) {
  if (newParent != null) {
    newParent.body[newIdx] = vold;
    vold.idx = newIdx;
    vold.parent = newParent;
  }
  return vm;
}

function redrawSync(newParent, newIdx, withDOM) {
  var isRedrawRoot = newParent == null;
  var vm = this;
  var isMounted = vm.node && vm.node.el && vm.node.el.parentNode;

  var vold = vm.node, oldDiff, newDiff;

  if (vm.diff != null) {
    oldDiff = vm._diff;
    vm._diff = newDiff = vm.diff(vm, vm.data);

    if (vold != null) {
      var cmpFn = isArr(oldDiff) ? cmpArr : cmpObj;
      var isSame = oldDiff === newDiff || cmpFn(oldDiff, newDiff);

      if (isSame)
        { return reParent(vm, vold, newParent, newIdx); }
    }
  }

  isMounted && vm.hooks && fireHook("willRedraw", vm, vm.data);

  var vnew = vm.render.call(vm, vm, vm.data, oldDiff, newDiff);

  if (vnew === vold)
    { return reParent(vm, vold, newParent, newIdx); }

  // todo: test result of willRedraw hooks before clearing refs
  vm.refs = null;

  // always assign vm key to root vnode (this is a de-opt)
  if (vm.key != null && vnew.key !== vm.key)
    { vnew.key = vm.key; }

  vm.node = vnew;

  if (newParent) {
    preProc(vnew, newParent, newIdx, vm);
    newParent.body[newIdx] = vnew;
  }
  else if (vold && vold.parent) {
    preProc(vnew, vold.parent, vold.idx, vm);
    vold.parent.body[vold.idx] = vnew;
  }
  else
    { preProc(vnew, null, null, vm); }

  if (withDOM !== false) {
    if (vold) {
      // root node replacement
      if (vold.tag !== vnew.tag || vold.key !== vnew.key) {
        // hack to prevent the replacement from triggering mount/unmount
        vold.vm = vnew.vm = null;

        var parEl = vold.el.parentNode;
        var refEl = nextSib(vold.el);
        removeChild(parEl, vold.el);
        insertBefore(parEl, hydrate(vnew), refEl);

        // another hack that allows any higher-level syncChildren to set
        // reconciliation bounds using a live node
        vold.el = vnew.el;

        // restore
        vnew.vm = vm;
      }
      else
        { patch(vnew, vold); }
    }
    else
      { hydrate(vnew); }
  }

  isMounted && vm.hooks && fireHook("didRedraw", vm, vm.data);

  if (isRedrawRoot && isMounted)
    { drainDidHooks(vm); }

  return vm;
}

// this also doubles as moveTo
// TODO? @withRedraw (prevent redraw from firing)
function updateSync(newData, newParent, newIdx, withDOM) {
  var vm = this;

  if (newData != null) {
    if (vm.data !== newData) {
      vm.hooks && fireHook("willUpdate", vm, newData);
      vm.data = newData;

      
    }
  }

  return vm._redraw(newParent, newIdx, withDOM);
}

function defineComment(body) {
  var node = new VNode;
  node.type = COMMENT;
  node.body = body;
  return node;
}

// placeholder for declared views
function VView(view, data, key, opts) {
  this.view = view;
  this.data = data;
  this.key = key;
  this.opts = opts;
}

VView.prototype = {
  constructor: VView,

  type: VVIEW,
  view: null,
  data: null,
  key: null,
  opts: null,
};

function defineView(view, data, key, opts) {
  return new VView(view, data, key, opts);
}

// placeholder for injected ViewModels
function VModel(vm) {
  this.vm = vm;
}

VModel.prototype = {
  constructor: VModel,

  type: VMODEL,
  vm: null,
};

function injectView(vm) {
//  if (vm.node == null)
//    vm._redraw(null, null, false);

//  return vm.node;

  return new VModel(vm);
}

function injectElement(el) {
  var node = new VNode;
  node.type = ELEMENT;
  node.el = node.key = el;
  return node;
}

function lazyList(items, cfg) {
  var len = items.length;

  var self = {
    items: items,
    length: len,
    // defaults to returning item identity (or position?)
    key: function(i) {
      return cfg.key(items[i], i);
    },
    // default returns 0?
    diff: function(i, donor) {
      var newVals = cfg.diff(items[i], i);
      if (donor == null)
        { return newVals; }
      var oldVals = donor._diff;
      var same = newVals === oldVals || isArr(oldVals) ? cmpArr(newVals, oldVals) : cmpObj(newVals, oldVals);
      return same || newVals;
    },
    tpl: function(i) {
      return cfg.tpl(items[i], i);
    },
    map: function(tpl) {
      cfg.tpl = tpl;
      return self;
    },
    body: function(vnode) {
      var nbody = Array(len);

      for (var i = 0; i < len; i++) {
        var vnode2 = self.tpl(i);

      //  if ((vnode.flags & KEYED_LIST) === KEYED_LIST && self. != null)
      //    vnode2.key = getKey(item);

        vnode2._diff = self.diff(i);      // holds oldVals for cmp

        nbody[i] = vnode2;

        // run preproc pass (should this be just preProc in above loop?) bench
        preProc(vnode2, vnode, i);
      }

      // replace List with generated body
      vnode.body = nbody;
    }
  };

  return self;
}

// prevent GCC from inlining some large funcs (which negatively affects Chrome's JIT)
window.syncChildren = syncChildren;

var nano$1 = {
  config: config,

  ViewModel: ViewModel,
  VNode: VNode,

  createView: createView,

  defineElement: defineElement,
  defineSvgElement: defineSvgElement,
  defineText: defineText,
  defineComment: defineComment,
  defineView: defineView,

  injectView: injectView,
  injectElement: injectElement,

  lazyList: lazyList,

  FIXED_BODY: FIXED_BODY,
  DEEP_REMOVE: DEEP_REMOVE,
  KEYED_LIST: KEYED_LIST,
  LAZY_LIST: LAZY_LIST,
};

function protoPatch(n) {
  return patch$1(this, n);
}

// newNode can be either {class: style: } or full new VNode
// will/didPatch hooks?
function patch$1(o, n) {
  if (n.type != null) {
    // no full patching of view roots, just use redraw!
    if (o.vm != null)
      { return; }

    preProc(n, o.parent, o.idx, null);
    o.parent.body[o.idx] = n;
    patch(n, o);
    drainDidHooks(getVm(n));
  }
  else {
    // TODO: re-establish refs

    // shallow-clone target
    var donor = Object.create(o);
    // fixate orig attrs
    donor.attrs = assignObj({}, o.attrs);
    // assign new attrs into live targ node
    var oattrs = assignObj(o.attrs, n);
    // prepend any fixed shorthand class
    if (o._class != null) {
      var aclass = oattrs.class;
      oattrs.class = aclass != null && aclass !== "" ? o._class + " " + aclass : o._class;
    }

    patchAttrs(o, donor);
  }
}

VNodeProto.patch = protoPatch;

return nano$1;

})));


},{}],4:[function(require,module,exports){
!function(a,b){"function"==typeof define&&define.amd?define([],function(){return a.returnExportsGlobal=b()}):"object"==typeof exports?module.exports=b():a.ResizeSensor=b()}(this,function(){var a=function(){"use strict";function a(){this.q=[],this.add=function(a){this.q.push(a)};var a,b;this.call=function(){for(a=0,b=this.q.length;b>a;a++)this.q[a].call()}}function b(a,b){return a.currentStyle?a.currentStyle[b]:window.getComputedStyle?window.getComputedStyle(a,null).getPropertyValue(b):a.style[b]}function c(c,e){if(c.resizedAttached){if(c.resizedAttached)return void c.resizedAttached.add(e)}else c.resizedAttached=new a,c.resizedAttached.add(e);c.resizeSensor=document.createElement("div"),c.resizeSensor.className="resize-sensor";var f="position: absolute; left: 0; top: 0; right: 0; bottom: 0; overflow: hidden; z-index: -1; visibility: hidden; opacity: 0;",g="position: absolute; left: 0; top: 0; transition: 0s;";c.resizeSensor.style.cssText=f,c.resizeSensor.innerHTML='<div class="resize-sensor-expand" style="'+f+'"><div style="'+g+'"></div></div><div class="resize-sensor-shrink" style="'+f+'"><div style="'+g+' width: 200%; height: 200%"></div></div>',c.appendChild(c.resizeSensor),"static"==b(c,"position")&&(c.style.position="relative");var h=c.resizeSensor.childNodes[0],i=h.childNodes[0],j=c.resizeSensor.childNodes[1],k=function(){i.style.width=1e5+"px",i.style.height=1e5+"px",h.scrollLeft=1e5,h.scrollTop=1e5,j.scrollLeft=1e5,j.scrollTop=1e5};k();var l=!1,m=function(){c.resizedAttached&&(l&&(c.resizedAttached.call(),l=!1),d(m))};d(m);var n,o,p,q,r=function(){((p=c.offsetWidth)!=n||(q=c.offsetHeight)!=o)&&(l=!0,n=p,o=q),k()},s=function(a,b,c){a.attachEvent?a.attachEvent("on"+b,c):a.addEventListener(b,c)};s(h,"scroll",r),s(j,"scroll",r)}var d=window.requestAnimationFrame||window.mozRequestAnimationFrame||window.webkitRequestAnimationFrame||function(a){return window.setTimeout(a,20)},e=function(a,b){var d=this,e=Object.prototype.toString.call(a),f=d._isCollectionTyped="[object Array]"===e||"[object NodeList]"===e||"[object HTMLCollection]"===e||"undefined"!=typeof jQuery&&a instanceof window.jQuery||"undefined"!=typeof Elements&&a instanceof window.Elements;if(d._element=a,f)for(var g=0,h=a.length;h>g;g++)c(a[g],b);else c(a,b)};return e.prototype.detach=function(){var a=this,b=a._isCollectionTyped,c=a._element;if(b)for(var d=0,f=c.length;f>d;d++)e.detach(c[d]);else e.detach(c)},e.detach=function(a){a.resizeSensor&&(a.removeChild(a.resizeSensor),delete a.resizeSensor,delete a.resizedAttached)},e}();return a});
},{}],5:[function(require,module,exports){
/*
 *          __        ___
 *    _____/ /___  __/ (_)____
 *   / ___/ __/ / / / / / ___/
 *  (__  ) /_/ /_/ / / (__  )
 * /____/\__/\__, /_/_/____/
 *          /____/
 *
 * light - weight css preprocessor @licence MIT
 */
/* eslint-disable */
(function (factory) {
  typeof exports === 'object' && typeof module !== 'undefined' ? (module['exports'] = factory(null)) :
    typeof define === 'function' && define['amd'] ? define(factory(null)) :
      (window['stylis'] = factory(null))
}(/** @param {*=} options */function factory (options) {

  'use strict'

  /**
   * Notes
   *
   * The ['<method name>'] pattern is used to support closure compiler
   * the jsdoc signatures are also used to the same effect
   *
   * ---- 
   *
   * int + int + int === n4 [faster]
   *
   * vs
   *
   * int === n1 && int === n2 && int === n3
   *
   * ----
   *
   * switch (int) { case ints...} [faster]
   *
   * vs
   *
   * if (int == 1 && int === 2 ...)
   *
   * ----
   *
   * The (first*n1 + second*n2 + third*n3) format used in the property parser
   * is a simple way to hash the sequence of characters
   * taking into account the index they occur in
   * since any number of 3 character sequences could produce duplicates.
   *
   * On the other hand sequences that are directly tied to the index of the character
   * resolve a far more accurate measure, it's also faster
   * to evaluate one condition in a switch statement
   * than three in an if statement regardless of the added math.
   *
   * This allows the vendor prefixer to be both small and fast.
   */

  var nullptn = /^\0+/g /* matches leading null characters */
  var formatptn = /[\0\r\f]/g /* matches new line, null and formfeed characters */
  var colonptn = /: */g /* splits animation rules */
  var cursorptn = /zoo|gra/ /* assert cursor varient */
  var transformptn = /([,: ])(transform)/g /* vendor prefix transform, older webkit */
  var animationptn = /,+\s*(?![^(]*[)])/g /* splits multiple shorthand notation animations */
  var propertiesptn = / +\s*(?![^(]*[)])/g /* animation properties */
  var elementptn = / *[\0] */g /* selector elements */
  var selectorptn = /,\r+?/g /* splits selectors */
  var andptn = /([\t\r\n ])*\f?&/g /* match & */
  var escapeptn = /:global\(((?:[^\(\)\[\]]*|\[.*\]|\([^\(\)]*\))*)\)/g /* matches :global(.*) */
  var invalidptn = /\W+/g /* removes invalid characters from keyframes */
  var keyframeptn = /@(k\w+)\s*(\S*)\s*/ /* matches @keyframes $1 */
  var plcholdrptn = /::(place)/g /* match ::placeholder varient */
  var readonlyptn = /:(read-only)/g /* match :read-only varient */
  var beforeptn = /\s+(?=[{\];=:>])/g /* matches \s before ] ; = : */
  var afterptn = /([[}=:>])\s+/g /* matches \s after characters [ } = : */
  var tailptn = /(\{[^{]+?);(?=\})/g /* matches tail semi-colons ;} */
  var whiteptn = /\s{2,}/g /* matches repeating whitespace */
  var pseudoptn = /([^\(])(:+) */g /* pseudo element */
  var writingptn = /[svh]\w+-[tblr]{2}/ /* match writing mode property values */

  /* vendors */
  var webkit = '-webkit-'
  var moz = '-moz-'
  var ms = '-ms-'

  /* character codes */
  var SEMICOLON = 59 /* ; */
  var CLOSEBRACES = 125 /* } */
  var OPENBRACES = 123 /* { */
  var OPENPARENTHESES = 40 /* ( */
  var CLOSEPARENTHESES = 41 /* ) */
  var OPENBRACKET = 91 /* [ */
  var CLOSEBRACKET = 93 /* ] */
  var NEWLINE = 10 /* \n */
  var CARRIAGE = 13 /* \r */
  var TAB = 9 /* \t */
  var AT = 64 /* @ */
  var SPACE = 32 /*   */
  var AND = 38 /* & */
  var DASH = 45 /* - */
  var UNDERSCORE = 95 /* _ */
  var STAR = 42 /* * */
  var COMMA = 44 /* , */
  var COLON = 58 /* : */
  var SINGLEQUOTE = 39 /* ' */
  var DOUBLEQUOTE = 34 /* " */
  var FOWARDSLASH = 47 /* / */
  var GREATERTHAN = 62 /* > */
  var PLUS = 43 /* + */
  var TILDE = 126 /* ~ */
  var NULL = 0 /* \0 */
  var FORMFEED = 12 /* \f */
  var VERTICALTAB = 11 /* \v */

  /* special identifiers */
  var KEYFRAME = 107 /* k */
  var MEDIA = 109 /* m */
  var SUPPORTS = 115 /* s */
  var PLACEHOLDER = 112 /* p */
  var READONLY = 111 /* o */
  var IMPORT = 169 /* <at>i */
  var CHARSET = 163 /* <at>c */
  var DOCUMENT = 100 /* <at>d */

  var column = 1 /* current column */
  var line = 1 /* current line numebr */
  var pattern = 0 /* :pattern */

  var cascade = 1 /* #id h1 h2 vs h1#id h2#id  */
  var vendor = 1 /* vendor prefix */
  var escape = 1 /* escape :global() pattern */
  var compress = 0 /* compress output */
  var semicolon = 0 /* no/semicolon option */
  var preserve = 0 /* preserve empty selectors */

  /* empty reference */
  var array = []

  /* plugins */
  var plugins = []
  var plugged = 0

  /* plugin context */
  var POSTS = -2
  var PREPS = -1
  var UNKWN = 0
  var PROPS = 1
  var BLCKS = 2
  var ATRUL = 3

  /* plugin newline context */
  var unkwn = 0

  /* keyframe animation */
  var keyed = 1
  var key = ''

  /* selector namespace */
  var nscopealt = ''
  var nscope = ''

  /**
   * Compile
   *
   * @param {Array<string>} parent
   * @param {Array<string>} current
   * @param {string} body
   * @param {number} id
   * @return {string}
   */
  function compile (parent, current, body, id) {
    var bracket = 0 /* brackets [] */
    var comment = 0 /* comments /* // or /* */
    var parentheses = 0 /* functions () */
    var quote = 0 /* quotes '', "" */

    var first = 0 /* first character code */
    var second = 0 /* second character code */
    var code = 0 /* current character code */
    var tail = 0 /* previous character code */
    var trail = 0 /* character before previous code */
    var peak = 0 /* previous non-whitespace code */
    
    var counter = 0 /* count sequence termination */
    var context = 0 /* track current context */
    var atrule = 0 /* track @at-rule context */
    var pseudo = 0 /* track pseudo token index */
    var caret = 0 /* current character index */
    var format = 0 /* control character formating context */
    var insert = 0 /* auto semicolon insertion */
    var invert = 0 /* inverted selector pattern */
    var length = 0 /* generic length address */
    var eof = body.length /* end of file(length) */
    var eol = eof - 1 /* end of file(characters) */

    var char = '' /* current character */
    var chars = '' /* current buffer of characters */
    var child = '' /* next buffer of characters */
    var out = '' /* compiled body */
    var children = '' /* compiled children */
    var flat = '' /* compiled leafs */
    var selector /* generic selector address */
    var result /* generic address */

    // ...build body
    while (caret < eof) {
      code = body.charCodeAt(caret)

      if (comment + quote + parentheses + bracket === 0) {
        // eof varient
        if (caret === eol) {
          if (format > 0) {
            chars = chars.replace(formatptn, '')
          }

          if ((chars = chars.trim()).length > 0) {
            switch (code) {
              case SPACE:
              case TAB:
              case SEMICOLON:
              case CARRIAGE:
              case NEWLINE: {
                break
              }
              default: {
                chars += body.charAt(caret)
              }
            }

            code = SEMICOLON
          }
        }

        // auto semicolon insertion
        if (insert === 1) {
          switch (code) {
            // false flags
            case OPENBRACES:
            case COMMA: {
              insert = 0
              break
            }
            // ignore
            case TAB:
            case CARRIAGE:
            case NEWLINE:
            case SPACE: {
              break
            }
            // valid
            default: {
              caret--
              code = SEMICOLON
            }
          }
        }

        // token varient
        switch (code) {
          case OPENBRACES: {
            chars = chars.trim()
            first = chars.charCodeAt(0)
            counter = 1
            caret++

            while (caret < eof) {
              code = body.charCodeAt(caret)

              switch (code) {
                case OPENBRACES: {
                  counter++
                  break
                }
                case CLOSEBRACES: {
                  counter--
                  break
                }
              }

              if (counter === 0) {
                break
              }

              child += body.charAt(caret++)
            }

            if (first === NULL) {
              first = (chars = chars.replace(nullptn, '').trim()).charCodeAt(0)
            }

            switch (first) {
              // @at-rule
              case AT: {
                if (format > 0) {
                  chars = chars.replace(formatptn, '')
                }

                second = chars.charCodeAt(1)

                switch (second) {
                  case DOCUMENT:
                  case MEDIA:
                  case SUPPORTS: {
                    selector = current
                    break
                  }
                  default: {
                    selector = array
                  }
                }

                child = compile(current, selector, child, second)
                length = child.length

                // preserve empty @at-rule
                if (preserve > 0 && length === 0) {
                  length = chars.length
                }

                // execute plugins, @at-rule context
                if (plugged > 0) {
                  selector = select(array, chars, invert)
                  result = proxy(ATRUL, child, selector, current, line, column, length, second)
                  chars = selector.join('')

                  if (result !== void 0) {
                    if ((length = (child = result.trim()).length) === 0) {
                      second = 0
                      child = ''
                    }
                  }
                }

                if (length > 0) {
                  switch (second) {
                    case DOCUMENT:
                    case MEDIA:
                    case SUPPORTS: {
                      child = chars + '{' + child + '}'
                      break
                    }
                    case KEYFRAME: {
                      chars = chars.replace(keyframeptn, '$1 $2' + (keyed > 0 ? key : ''))
                      child = chars + '{' + child + '}'
                      child = '@' + (vendor > 0 ? webkit + child + '@' + child : child)
                      break
                    }
                    default: {
                      child = chars + child
                    }
                  }
                } else {
                  child = ''
                }

                break
              }
              // selector
              default: {
                child = compile(current, select(current, chars, invert), child, id)
              }
            }

            children += child

            // reset
            context = 0
            insert = 0
            pseudo = 0
            format = 0
            invert = 0
            atrule = 0
            chars = ''
            child = ''
            code = body.charCodeAt(++caret)
            break
          }
          case CLOSEBRACES:
          case SEMICOLON: {
            chars = (format > 0 ? chars.replace(formatptn, '') : chars).trim()

            if (chars.length > 1) {
              // monkey-patch missing colon
              if (pseudo === 0) {
                first = chars.charCodeAt(0)

                // first character is a letter or dash, buffer has a space character
                if ((first === DASH || first > 96 && first < 123) && chars.indexOf(' ')) {
                  chars = chars.replace(' ', ':')
                }
              }

              // execute plugins, property context
              if (plugged > 0) {
                if ((result = proxy(PROPS, chars, current, parent, line, column, out.length, id)) !== void 0) {
                  if ((chars = result.trim()).length === 0) {
                    chars = '\0\0'
                  }
                }
              }

              first = chars.charCodeAt(0)
              second = chars.charCodeAt(1)

              switch (first + second) {
                case NULL: {
                  break
                }
                case IMPORT:
                case CHARSET: {
                  flat += chars + body.charAt(caret)
                  break
                }
                default: {
                  out += pseudo > 0 ? property(chars, first, second, chars.charCodeAt(2)) : chars + ';'
                }
              }
            }

            // reset
            context = 0
            insert = 0
            pseudo = 0
            format = 0
            invert = 0
            chars = ''
            code = body.charCodeAt(++caret)
            break
          }
        }
      }

      // parse characters
      switch (code) {
        case CARRIAGE:
        case NEWLINE: {
          // auto insert semicolon
          if (comment + quote + parentheses + bracket + semicolon === 0) {
            // valid non-whitespace characters that
            // may precede a newline
            switch (peak) {
              case CLOSEPARENTHESES:
              case SINGLEQUOTE:
              case DOUBLEQUOTE:
              case AT:
              case TILDE:
              case GREATERTHAN:
              case STAR:
              case PLUS:
              case FOWARDSLASH:
              case DASH:
              case COLON:
              case COMMA:
              case SEMICOLON:
              case OPENBRACES:
              case CLOSEBRACES: {
                break
              }
              default: {
                // current buffer has a colon
                if (pseudo > 0) {
                  insert = 1
                }
              }
            }
          }

          // terminate line comment
          if (comment === FOWARDSLASH) {
            comment = 0
          }

          // execute plugins, newline context
          if (plugged * unkwn > 0) {
            proxy(UNKWN, chars, current, parent, line, column, out.length, id)
          }

          // next line, reset column position
          column = 1
          line++
          break
        }
        case SEMICOLON:
        case CLOSEBRACES: {
          if (comment + quote + parentheses + bracket === 0) {
            column++
            break
          }
        }
        default: {
          // increment column position
          column++

          // current character
          char = body.charAt(caret)
            
          // remove comments, escape functions, strings, attributes and prepare selectors
          switch (code) {
            case TAB:
            case SPACE: {
              if (quote + bracket === 0) {
                switch (tail) {
                  case COMMA:
                  case COLON:
                  case TAB:
                  case SPACE: {
                    char = ''
                    break
                  }
                  default: {
                    if (code !== SPACE) {
                      char = ' '
                    }
                  }
                }
              }
              break
            }
            // escape breaking control characters
            case NULL: {
              char = '\\0'
              break
            }
            case FORMFEED: {
              char = '\\f'
              break
            }
            case VERTICALTAB: {
              char = '\\v'
              break
            }
            // &
            case AND: {
              // inverted selector pattern i.e html &
              if (quote + comment + bracket === 0 && cascade > 0) {
                invert = 1
                format = 1
                char = '\f' + char
              }
              break
            }
            // ::p<l>aceholder, l
            // :read-on<l>y, l
            case 108: {
              if (quote + comment + bracket + pattern === 0 && pseudo > 0) {
                switch (caret - pseudo) {
                  // ::placeholder
                  case 2: {
                    if (tail === PLACEHOLDER && body.charCodeAt(caret-3) === COLON) {
                      pattern = tail
                    }
                  }
                  // :read-only
                  case 8: {
                    if (trail === READONLY) {
                      pattern = trail
                    }
                  }
                }
              }
              break
            }
            // :<pattern>
            case COLON: {
              if (quote + comment + bracket === 0) {
                pseudo = caret
              }
              break
            }
            // selectors
            case COMMA: {
              if (comment + parentheses + quote + bracket === 0) {
                format = 1
                char += '\r'
              }
              break
            }
            // quotes
            case DOUBLEQUOTE: {
              if (comment === 0) {
                quote = quote === code ? 0 : (quote === 0 ? code : quote)
                // " last character, add synthetic padding
                if (caret === eol) {
                  eol++
                  eof++
                }
              }
              break
            }
            case SINGLEQUOTE: {
              if (comment === 0) {
                quote = quote === code ? 0 : (quote === 0 ? code : quote)
                // ' last character, add synthetic padding
                if (caret === eol) {
                  eol++
                  eof++
                }
              }
              break
            }
            // attributes
            case OPENBRACKET: {
              if (quote + comment + parentheses === 0) {
                bracket++
              }
              break
            }
            case CLOSEBRACKET: {
              if (quote + comment + parentheses === 0) {
                bracket--
              }
              break
            }
            // functions
            case CLOSEPARENTHESES: {
              if (quote + comment + bracket === 0) {
                // ) last character, add synthetic padding
                if (caret === eol) {
                  eol++
                  eof++
                }

                parentheses--
              }
              break
            }
            case OPENPARENTHESES: {
              if (quote + comment + bracket === 0) {
                if (context === 0) {
                  switch (tail*2 + trail*3) {
                    // :matches
                    case 533: {
                      break
                    }
                    // :global, :not, :nth-child etc...
                    default: {
                      counter = 0
                      context = 1
                    }
                  }
                }

                parentheses++
              }
              break
            }
            case AT: {
              if (comment + parentheses + quote + bracket + pseudo + atrule === 0) {
                atrule = 1
              }
              break
            }
            // block/line comments
            case STAR:
            case FOWARDSLASH: {
              if (quote + bracket + parentheses > 0) {
                break
              }

              switch (comment) {
                // initialize line/block comment context
                case 0: {
                  switch (code*2 + body.charCodeAt(caret+1)*3) {
                    // //
                    case 235: {
                      comment = FOWARDSLASH
                      break
                    }
                    // /*
                    case 220: {
                      comment = STAR
                      break
                    }
                  }
                  break
                }
                // end block comment context
                case STAR: {
                  if (code === FOWARDSLASH && tail === STAR) {
                    char = ''
                    comment = 0
                  }
                }
              }
            }
          }

          // ignore comment blocks
          if (comment === 0) {
            // aggressive isolation mode, divide each individual selector
            // including selectors in :not function but excluding selectors in :global function
            if (cascade + quote + bracket + atrule === 0 && id !== KEYFRAME && code !== SEMICOLON) {
              switch (code) {
                case COMMA:
                case TILDE:
                case GREATERTHAN:
                case PLUS:
                case CLOSEPARENTHESES:
                case OPENPARENTHESES: {
                  if (context === 0) {
                    // outside of an isolated context i.e nth-child(<...>)
                    switch (tail) {
                      case TAB:
                      case SPACE:
                      case NEWLINE:
                      case CARRIAGE: {
                        char = char + '\0'
                        break
                      }
                      default: {
                        char = '\0' + char + (code === COMMA ? '' : '\0')
                      }
                    }
                    format = 1
                  } else {
                    // within an isolated context, sleep untill it's terminated
                    switch (code) {
                      case OPENPARENTHESES: {
                        context = ++counter
                        break
                      }
                      case CLOSEPARENTHESES: {
                        if ((context = --counter) === 0) {
                          format = 1
                          char += '\0'
                        }
                        break
                      }
                    }
                  }
                  break
                }
                case SPACE: {
                  switch (tail) {
                    case NULL:
                    case OPENBRACES:
                    case CLOSEBRACES:
                    case SEMICOLON:
                    case COMMA:
                    case FORMFEED:
                    case TAB:
                    case SPACE:
                    case NEWLINE:
                    case CARRIAGE: {
                      break
                    }
                    default: {
                      // ignore in isolated contexts
                      if (context === 0) {
                        format = 1
                        char += '\0'
                      }
                    }
                  }
                }
              }
            }

            // concat buffer of characters
            chars += char

            // previous non-whitespace character code
            if (code !== SPACE) {
              peak = code
            }
          }
        }
      }

      // tail character codes
      trail = tail
      tail = code

      // visit every character
      caret++
    }

    length = out.length

    // preserve empty selector
    if (preserve > 0) {
      if (length === 0 && children.length === 0 && (current[0].length === 0) === false) {
        if (id !== MEDIA || (current.length === 1 && (cascade > 0 ? nscopealt : nscope) === current[0])) {
          length = current.join(',').length + 2           
        }
      }
    }

    if (length > 0) {
      // cascade isolation mode?
      selector = cascade === 0 && id !== KEYFRAME ? isolate(current) : current

      // execute plugins, block context
      if (plugged > 0) {
        result = proxy(BLCKS, out, selector, parent, line, column, length, id)

        if (result !== void 0 && (out = result).length === 0) {
          return flat + out + children
        }
      }

      out = selector.join(',') + '{' + out + '}'

      if (vendor*pattern > 0) {
        switch (pattern) {
          // ::read-only
          case READONLY: {
            out = out.replace(readonlyptn, ':'+moz+'$1')+out
            break
          }
          // ::placeholder
          case PLACEHOLDER: {
            out = (
              out.replace(plcholdrptn, '::' + webkit + 'input-$1') +
              out.replace(plcholdrptn, '::' + moz + '$1') +
              out.replace(plcholdrptn, ':' + ms + 'input-$1') + out
            )
            break
          }
        }
        pattern = 0
      }
    }

    return flat + out + children
  }

  /**
   * Select
   *
   * @param {Array<string>} parent
   * @param {string} current
   * @param {number} invert
   * @return {Array<string>}
   */
  function select (parent, current, invert) {
    var selectors = current.trim().split(selectorptn)
    var out = selectors

    var length = selectors.length
    var l = parent.length

    switch (l) {
      // 0-1 parent selectors
      case 0:
      case 1: {
        for (var i = 0, selector = l === 0 ? '' : parent[0] + ' '; i < length; i++) {
          out[i] = scope(selector, out[i], invert, l).trim()
        }
        break
      }
      // >2 parent selectors, nested
      default: {
        for (var i = 0, j = 0, out = []; i < length; i++) {
          for (var k = 0; k < l; k++) {
            out[j++] = scope(parent[k] + ' ', selectors[i], invert, l).trim()
          }
        }
      }
    }

    return out
  }

  /**
   * Scope
   *
   * @param {string} parent
   * @param {string} current
   * @param {number} invert
   * @param {number} level
   * @return {string}
   */
  function scope (parent, current, invert, level) {
    var selector = current
    var code = selector.charCodeAt(0)

    // trim leading whitespace
    if (code < 33) {
      code = (selector = selector.trim()).charCodeAt(0)
    }

    switch (code) {
      // &
      case AND: {
        switch (cascade + level) {
          case 0:
          case 1: {
            if (parent.trim().length === 0) {
              break
            }
          }
          default: {
            return selector.replace(andptn, '$1'+parent.trim())
          }
        }
        break
      }
      // :
      case COLON: {
        switch (selector.charCodeAt(1)) {
          // g in :global
          case 103: {
            if (escape > 0 && cascade > 0) {
              return selector.replace(escapeptn, '$1').replace(andptn, '$1'+nscope)
            }
            break
          }
          default: {
            // :hover
            return parent.trim() + selector
          }
        }
      }
      default: {
        // html &
        if (invert*cascade > 0 && selector.indexOf('\f') > 0) {
          return selector.replace(andptn, (parent.charCodeAt(0) === COLON ? '' : '$1')+parent.trim())
        }
      }
    }

    return parent + selector
  }

  /**
   * Property
   *
   * @param {string} input
   * @param {number} first
   * @param {number} second
   * @param {number} third
   * @return {string}
   */
  function property (input, first, second, third) {
    var out = input + ';'
    var index = 0
    var hash = (first*2) + (second*3) + (third*4)
    var cache

    // animation: a, n, i characters
    if (hash === 944) {
      out = animation(out)
    } else if (vendor > 0) {
      // vendor prefix
      switch (hash) {
        // color/column, c, o, l
        case 963: {
          // column
          if (out.charCodeAt(5) === 110) {
            out = webkit + out + out
          }
          break
        }
        // appearance: a, p, p
        case 978: {
          out = webkit + out + moz + out + out
          break
        }
        // hyphens: h, y, p
        // user-select: u, s, e
        case 1019:
        case 983: {
          out = webkit + out + moz + out + ms + out + out
          break
        }
        // background/backface-visibility, b, a, c
        case 883: {
          // backface-visibility, -
          if (out.charCodeAt(8) === DASH) {
            out = webkit + out + out
          }
          break
        }
        // flex: f, l, e
        case 932: {
          out = webkit + out + ms + out + out
          break
        }
        // order: o, r, d
        case 964: {
          out = webkit + out + ms + 'flex' + '-' + out + out
          break
        }
        // justify-content, j, u, s
        case 1023: {
          cache = out.substring(out.indexOf(':', 15)).replace('flex-', '')
          out = webkit + 'box-pack' + cache + webkit + out + ms + 'flex-pack' + cache + out
          break
        }
        // display(flex/inline-flex/inline-box): d, i, s
        case 975: {
          index = (out = input).length-10
          cache = (out.charCodeAt(index) === 33 ? out.substring(0, index) : out).substring(8).trim()

          switch (hash = cache.charCodeAt(0) + (cache.charCodeAt(7)|0)) {
            // inline-
            case 203: {
              // inline-box
              if (cache.charCodeAt(8) > 110) {
                out = out.replace(cache, webkit+cache)+';'+out
              }
              break
            }
            // inline-flex
            // flex
            case 207:
            case 102: {
              out = (
                out.replace(cache, webkit+(hash > 102 ? 'inline-' : '')+'box')+';'+
                out.replace(cache, webkit+cache)+';'+
                out.replace(cache, ms+cache+'box')+';'+
                out
              )
            }
          }
          
          out += ';'
          break
        }
        // align-items, align-center, align-self: a, l, i, -
        case 938: {
          if (out.charCodeAt(5) === DASH) {
            switch (out.charCodeAt(6)) {
              // align-items, i
              case 105: {
                cache = out.replace('-items', '')
                out = webkit + out + webkit + 'box-' + cache + ms + 'flex-' + cache + out
                break
              }
              // align-self, s
              case 115: {
                out = webkit + out + ms + 'flex-item-' + out.replace('-self', '') + out
                break
              }
              // align-content
              default: {
                out = webkit + out + ms + 'flex-line-pack' + out.replace('align-content', '') + out
              }
            }
          }
          break
        }
        // cursor, c, u, r
        case 1005: {
          if (cursorptn.test(out)) {
            out = out.replace(colonptn, ':' + webkit) + out.replace(colonptn, ':' + moz) + out
          }
          break
        }
        // width: min-content / width: max-content
        case 953: {
          if ((index = out.indexOf('-content', 9)) > 0) {
            // width: min-content / width: max-content
            cache = out.substring(index - 3)
            out = 'width:' + webkit + cache + 'width:' + moz + cache + 'width:' + cache
          }
          break
        }
        // text-size-adjust: t, e, x
        case 1015: {
          if (input.charCodeAt(9) !== DASH) {
            break
          }
        }
        // transform, transition: t, r, a
        case 962: {
          out = webkit + out + (out.charCodeAt(5) === 102 ? ms + out : '') + out

          // transitions
          if (second + third === 211 && out.charCodeAt(13) === 105 && out.indexOf('transform', 10) > 0) {
            out = out.substring(0, out.indexOf(';', 27) + 1).replace(transformptn, '$1' + webkit + '$2') + out
          }

          break
        }
        // writing-mode, w, r, i
        case 1000: {
          cache = out.substring(13).trim()
          index = cache.indexOf('-')+1

          switch (cache.charCodeAt(0)+cache.charCodeAt(index)) {
            // vertical-lr
            case 226: {
              cache = out.replace(writingptn, 'tb')
              break
            }
            // vertical-rl
            case 232: {
              cache = out.replace(writingptn, 'tb-rl')
              break
            }
            // horizontal-tb
            case 220: {
              cache = out.replace(writingptn, 'lr')
              break
            }
            default: {
              return out
            }
          }

          out = webkit+out+ms+cache+out
          break
        }
      }
    }

    return out
  }

  /**
   * Animation
   *
   * @param {string} input
   * @return {string}
   */
  function animation (input) {
    var length = input.length
    var index = input.indexOf(':', 9) + 1
    var declare = input.substring(0, index).trim()
    var body = input.substring(index, length-1).trim()
    var out = ''

    // shorthand
    if (input.charCodeAt(9) !== DASH) {
      // split in case of multiple animations
      var list = body.split(animationptn)

      for (var i = 0, index = 0, length = list.length; i < length; index = 0, i++) {
        var value = list[i]
        var items = value.split(propertiesptn)

        while (value = items[index]) {
          var peak = value.charCodeAt(0)

          if (keyed === 1 && (
            // letters
            (peak > AT && peak < 90) || (peak > 96 && peak < 123) || peak === UNDERSCORE ||
            // dash but not in sequence i.e --
            (peak === DASH && value.charCodeAt(1) !== DASH)
          )) {
            // not a number/function
            switch (isNaN(parseFloat(value)) + (value.indexOf('(') !== -1)) {
              case 1: {
                switch (value) {
                  // not a valid reserved keyword
                  case 'infinite': case 'alternate': case 'backwards': case 'running':
                  case 'normal': case 'forwards': case 'both': case 'none': case 'linear':
                  case 'ease': case 'ease-in': case 'ease-out': case 'ease-in-out':
                  case 'paused': case 'reverse': case 'alternate-reverse': case 'inherit':
                  case 'initial': case 'unset': case 'step-start': case 'step-end': {
                    break
                  }
                  default: {
                    value += key
                  }
                }
              }
            }
          }

          items[index++] = value
        }

        out += (i === 0 ? '' : ',') + items.join(' ')
      }
    } else {
      // animation-name, n
      out += input.charCodeAt(10) === 110 ? body + (keyed === 1 ? key : '') : body
    }

    out = declare + out + ';'

    return vendor > 0 ? webkit + out + out : out
  }

  /**
   * Isolate
   *
   * @param {Array<string>} current
   */
  function isolate (current) {
    for (var i = 0, length = current.length, selector = Array(length), padding, element; i < length; i++) {
      // split individual elements in a selector i.e h1 h2 === [h1, h2]
      var elements = current[i].split(elementptn)
      var out = ''

      for (var j = 0, size = 0, tail = 0, code = 0, l = elements.length; j < l; j++) {
        // empty element
        if ((size = (element = elements[j]).length) === 0 && l > 1) {
          continue
        }

        tail = out.charCodeAt(out.length-1)
        code = element.charCodeAt(0)
        padding = ''

        if (j !== 0) {
          // determine if we need padding
          switch (tail) {
            case STAR:
            case TILDE:
            case GREATERTHAN:
            case PLUS:
            case SPACE:
            case OPENPARENTHESES:  {
              break
            }
            default: {
              padding = ' '
            }
          }
        }

        switch (code) {
          case AND: {
            element = padding + nscopealt
          }
          case TILDE:
          case GREATERTHAN:
          case PLUS:
          case SPACE:
          case CLOSEPARENTHESES:
          case OPENPARENTHESES: {
            break
          }
          case OPENBRACKET: {
            element = padding + element + nscopealt
            break
          }
          case COLON: {
            switch (element.charCodeAt(1)*2 + element.charCodeAt(2)*3) {
              // :global
              case 530: {
                if (escape > 0) {
                  element = padding + element.substring(8, size - 1)
                  break
                }
              }
              // :hover, :nth-child(), ...
              default: {
                if (j < 1 || elements[j-1].length < 1) {
                  element = padding + nscopealt + element
                }
              }
            }
            break
          }
          case COMMA: {
            padding = ''
          }
          default: {
            if (size > 1 && element.indexOf(':') > 0) {
              element = padding + element.replace(pseudoptn, '$1' + nscopealt + '$2')
            } else {
              element = padding + element + nscopealt
            }
          }
        }

        out += element
      }

      selector[i] = out.replace(formatptn, '').trim()
    }

    return selector
  }

  /**
   * Proxy
   *
   * @param {number} context
   * @param {string} content
   * @param {Array<string>} selectors
   * @param {Array<string>} parents
   * @param {number} line
   * @param {number} column
   * @param {number} length
   * @param {number} id
   * @return {(string|void|*)}
   */
  function proxy (context, content, selectors, parents, line, column, length, id) {
    for (var i = 0, out = content, next; i < plugged; i++) {
      switch (next = plugins[i].call(stylis, context, out, selectors, parents, line, column, length, id)) {
        case void 0:
        case false:
        case true:
        case null: {
          break
        }
        default: {
          out = next
        }
      }
    }

    switch (out) {
      case void 0:
      case false:
      case true:
      case null:
      case content: {
        break
      }
      default: {
        return out
      }
    }
  }

  /**
   * Minify
   *
   * @param {(string|*)} output
   * @return {string}
   */
  function minify (output) {
    return output
      .replace(formatptn, '')
      .replace(beforeptn, '')
      .replace(afterptn, '$1')
      .replace(tailptn, '$1')
      .replace(whiteptn, ' ')
  }

  /**
   * Use
   *
   * @param {(Array<function(...?)>|function(...?)|number|void)?} plugin
   */
  function use (plugin) {
    switch (plugin) {
      case void 0:
      case null: {
        plugged = plugins.length = 0
        break
      }
      default: {
        switch (plugin.constructor) {
          case Array: {
            for (var i = 0, length = plugin.length; i < length; i++) {
              use(plugin[i])
            }
            break
          }
          case Function: {
            plugins[plugged++] = plugin
            break
          }
          case Boolean: {
            unkwn = !!plugin|0
          }
        }
      }
    }

    return use
  }

  /**
   * Set
   *
   * @param {*} options
   */
  function set (options) {    
    for (var name in options) {
      var value = options[name]
      switch (name) {
        case 'keyframe': keyed = value|0; break
        case 'global': escape = value|0; break
        case 'cascade': cascade = value|0; break
        case 'compress': compress = value|0; break
        case 'prefix': vendor = value|0; break
        case 'semicolon': semicolon = value|0; break
        case 'preserve': preserve = value|0; break
      }
    }

    return set
  }

  /**
   * Stylis
   *
   * @param {string} selector
   * @param {string} input
   * @return {*}
   */
  function stylis (selector, input) {
    if (this !== void 0 && this.constructor === stylis) {
      return factory(selector)
    }

    // setup
    var ns = selector
    var code = ns.charCodeAt(0)

    // trim leading whitespace
    if (code < 33) {
      code = (ns = ns.trim()).charCodeAt(0)
    }

    // keyframe/animation namespace
    if (keyed > 0) {
      key = ns.replace(invalidptn, code === OPENBRACKET ? '' : '-')
    }

    // reset, used to assert if a plugin is moneky-patching the return value
    code = 1

    // cascade/isolate
    if (cascade === 1) {
      nscope = ns
    } else {
      nscopealt = ns
    }

    var selectors = [nscope]
    var result

    // execute plugins, pre-process context
    if (plugged > 0) {
      result = proxy(PREPS, input, selectors, selectors, line, column, 0, 0)

      if (result !== void 0 && typeof result === 'string') {
        input = result
      }
    }

    // build
    var output = compile(array, selectors, input, 0)

    // execute plugins, post-process context
    if (plugged > 0) {
      result = proxy(POSTS, output, selectors, selectors, line, column, output.length, 0)
  
      // bypass minification
      if (result !== void 0 && typeof(output = result) !== 'string') {
        code = 0
      }
    }

    // reset
    key = ''
    nscope = ''
    nscopealt = ''
    pattern = 0
    line = 1
    column = 1

    return compress*code === 0 ? output : minify(output)
  }

  stylis['use'] = use
  stylis['set'] = set

  if (options !== void 0) {
    set(options)
  }

  return stylis
}));

},{}],6:[function(require,module,exports){
'use strict';

var domvm = require('domvm/dist/nano/domvm.nano.js');
var iv = domvm.injectView;

class Ctor {
    constructor(options) {
        this.model = Object.assign({}, {
            fields:[],
            views: []
        }, options);
        for(var l = this.model.fields.length; l--;) {
            this.model.views[l] = iv(this.model.fields[l].viewModel);
        }
        this.viewModel = null;
    }
    mount(...args) {
        var ret;
        if (this.viewModel) {
            ret = this.viewModel.mount(...args);
        }
        return ret;
    }
    unmount(...args) {
        var ret;
        if (this.viewModel) {
            ret = this.viewModel.unmount(...args);
        }
        return ret;
    }
    init(view, style) {
        var me = this;
        me.view = view;
        me.style = style;
        var wrapperView = Object.create(this.view);
        wrapperView.init = function() {
            me.style.mount();
        };
        this.viewModel = domvm.createView(wrapperView, this.model);
        this.viewModel.__container = this;
    }
}

module.exports = Ctor;
},{"domvm/dist/nano/domvm.nano.js":3}],7:[function(require,module,exports){
'use strict';

var domvm = require('domvm/dist/nano/domvm.nano.js');
var ResizeSensor = require('resize-sensor');
var animationFrame = require('../utils/animationFrame');
var config = require('../config');
var StyleSheet = require('../utils/StyleSheet');
var UIBase = require('../Base');
var el = domvm.defineElement;
var PREFIX_CSS = 'context-ui-scrollbar';
var NAME_THEME_OCEAN = 'ocean';
var THICKNESS = '10';

var style = new StyleSheet(`
    font-family: ${config.fields.fontFamily};
    font-size: 0;
    line-height: 0;

    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;

    height: 100%;
    transition: opacity .3s;

    > .inner
    {
        width: 2px;

        position: absolute;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        overflow: hidden;

        transition: width .3s, background-color .3s;

        > .indicator,
        > .handle
        {
            position: absolute;
            left: 0; right: 0;

            height: 20px;
            width: 100%;

            border-radius: 0;
            transition: border-radius .3s;
        }

        > .handle
        {
            cursor: pointer;
            z-index: 2;
        }

        > .indicator
        {
            z-index: 1;
        }
    }

    &:hover
    {
        > .inner
        {
            width: 100%;
            > .handle
            {
                border-radius: 0px;
            }
        }
    }
`, {
    prefix: PREFIX_CSS
});

style.fonts.google.push(config.fields.fontFamily);

style.modifiers['on-top'] = `
    bottom: auto;
    height: ${THICKNESS}px;

    > .inner
    {
        bottom: auto;
        > .handle
        {
            border-top-left-radius: 0;
            border-top-right-radius: 0;
        }
    }
`;

style.modifiers['on-bottom'] = `
    top: auto;
    height: ${THICKNESS}px;

    > .inner
    {
        top: auto;
        > .handle
        {
            border-bottom-left-radius: 0;
            border-bottom-right-radius: 0;
        }
    }
`;

style.modifiers['on-left'] = `
    right: auto;
    width: ${THICKNESS}px;

    > .inner
    {
        right: auto;
        > .handle
        {
            border-top-left-radius: 0;
            border-bottom-left-radius: 0;
        }
    }
`;

style.modifiers['on-right'] = `
    left: auto;
    width: ${THICKNESS}px;

    > .inner
    {
        left: auto;
        > .handle
        {
            border-top-right-radius: 0;
            border-bottom-right-radius: 0;
        }
    }
`;

style.modifiers[NAME_THEME_OCEAN] = `
    > .inner
    {
        background-color: rgba(0,0,0,0);
        > .handle 
        {
            background-color: ${config.themes.ocean.prominent};
        }

        > .indicator
        {
            background-color: rgba(0,0,0,.3);
        }
    }
    &:hover
    {
        > .inner
        {
            background-color: rgba(0,0,0,.03);
        }
    }
`;

var view = {
    render: function(vm, data) {
        var indicatorDisplay = data.enable.indicator?'block':'none';
        var indicatorPositionRuleName = data.directions.scrolling==='vertical'?'top':data.directions.text;
        return el(
            'div.' + style.id + 
            '.' + style.modifiers['on-' + data.directions.bar].name +
            '.' + style.modifiers[NAME_THEME_OCEAN].name, {
                _hooks: {
                    didInsert: function(view){
                        var parent = view.el.parentNode;
                        if (!parent) {
                            return;
                        }
                        data.prvt.originalOverflow = parent.style.overflow;
                        parent.style.overflow = 'hidden';
                        var parentViewportSizeProp = data.directions.scrolling === 'vertical'?
                            'offsetHeight':'offsetWidth';
                        var parentPositionProp = data.directions.scrolling === 'vertical'?
                            'scrollTop':'scrollLeft';
                        var parentLengthProp = data.directions.scrolling === 'vertical'?
                            'scrollHeight':'scrollWidth';
                        var innerPositionProp = (data.directions.bar === 'left' || data.directions.bar === 'right')?'scrollTop':'scrollLeft';
                        function handleResize(){
                            if (data.handlers.resize) {
                                data.handlers.resize();
                            }
                            else {
                                data.length = parent[parentLengthProp] * 1;
                                data.viewport = parent[parentViewportSizeProp] * 1;
                                data.position = parent[parentPositionProp] * 1;
                            }
                            data.prvt.innerElementPosition = parent[innerPositionProp] * 1;
                            data.prvt.handle = data.viewport / data.length * parent[parentViewportSizeProp];
                            if (data.prvt.handle < 20) {
                                data.prvt.handle = 20;
                            }
                            data.prvt.position = data.position / (data.length - data.viewport) * (parent[parentViewportSizeProp] - data.prvt.handle);
                            data.directions.text = window.getComputedStyle(parent).direction === 'rtl'?'right':'left';
                            vm.redraw(true);
                        }

                        function handleFrameRequest(){
                            var maxScrollTop = parent.scrollHeight - parent.offsetHeight;
                            var maxScrollLeft = parent.scrollWidth - parent.offsetWidth;
                            if (data.prvt.scrollTop > maxScrollTop) {
                                data.prvt.scrollTop = maxScrollTop;
                            }
                            if (data.prvt.scrollTop < 0) {
                                data.prvt.scrollTop = 0;
                            }
                            if (data.prvt.scrollLeft > maxScrollLeft) {
                                data.prvt.scrollLeft = maxScrollLeft;
                            }
                            if (data.prvt.scrollLeft < 0) {
                                data.prvt.scrollLeft = 0;
                            }
                            parent.scrollTop += (data.prvt.scrollTop - parent.scrollTop) / 2;
                            parent.scrollLeft += (data.prvt.scrollLeft - parent.scrollLeft) / 2;
                            animationFrame.request(handleFrameRequest);
                        }

                        vm.__container.handleResize = handleResize;
                        vm._handleFrameRequest = handleFrameRequest;
                        vm._resizeSensor = new ResizeSensor(parent, handleResize);
                        parent.addEventListener('scroll', handleResize, {passive: false});
                        parent.addEventListener('wheel', data.handlers.mousewheel, {passive: false});
                        animationFrame.request(handleFrameRequest);
                        handleResize();
                    },
                    willRemove: function(view) {
                        var parent = view.el.parentNode;
                        if (!parent) {
                            return;
                        }
                        vm._resizeSensor.detach();
                        vm._resizeSensor = null;
                        parent.removeEventListener('scroll', vm.__container.handleResize);
                        parent.removeEventListener('wheel', data.handlers.mousewheel);
                        animationFrame.cancel(vm._handleFrameRequest);
                        vm.__container.handleResize = null;
                        vm._handleFrameRequest = null;
                        parent.style.overflow = data.prvt.originalOverflow;
                    }
                },
                style: `
                    top: ${data.prvt.innerElementPosition}px;
                    opacity: ${data.prvt.handle >= data.viewport?'0':'1'};
                `
            }, [
                el('div.inner', [
                    el('div.handle', {
                        style: `
                            height: ${data.prvt.handle}px;
                            ${indicatorPositionRuleName}: ${data.prvt.position}px;
                        `
                    }),
                    el('div.indicator', {
                        style: `
                            display: ${indicatorDisplay};
                            height: ${data.prvt.handle}px;
                            ${indicatorPositionRuleName}: ${data.prvt.position}px;
                        `
                    })
                ])
            ]);
    }
};

class Ctor extends UIBase {
    constructor(...args) {
        super(...args);
        var me = this;
        me.model = Object.assign({}, {
            length: 0,
            position: 0,
            viewport: 0,
            enable: {
                indicator: true
            }
        }, me.model, {
            prvt: {
                handle: 0,
                scrollTop: 0,
                scrollLeft: 0,
                originalOverflow: ''
            }
        });
        me.model.handlers = Object.assign({
            mousewheel: function(evt) {
                var delta = me.model.directions.scrolling === 'vertical'?evt.deltaY:evt.deltaX;
                var prop = me.model.directions.scrolling === 'vertical'?'scrollTop':'scrollLeft';
                me.model.prvt[prop] = me.model.prvt[prop] + delta * 3;
                if (me.model.prvt[prop] > 0 && me.model.prvt[prop] < me.model.length) {
                    evt.preventDefault();
                }
            }
        }, me.model.handlers);
        me.model.directions = Object.assign({
            scrolling: 'vertical',
            bar: 'right',
            text: 'left'
        }, me.model.directions);

        me.init(view, style);
    }
}

module.exports = Ctor;
},{"../Base":6,"../config":8,"../utils/StyleSheet":11,"../utils/animationFrame":12,"domvm/dist/nano/domvm.nano.js":3,"resize-sensor":4}],8:[function(require,module,exports){
'use strict';

module.exports = {
  fields: {
    fontFamily: 'Maitree',
    fontSize: '12px',
    lineHeight: '1.2em',
    marginBlock: '14px'
  },
  themes: {
    ocean: {
      prominent: '#039BE5',
      assisting: '#FFF'
    }
  }
};
},{}],9:[function(require,module,exports){
'use strict';

class Modifier {
    constructor(context, name) {
        this.context = context;
        this._name = name;
        this.text = '';
    }
    get name() {
        return this.context.id + '--' + this._name;
    }
}

module.exports = Modifier;
},{}],10:[function(require,module,exports){
'use strict';
var Modifier = require('./Modifier');
var contextMap = new WeakMap();

function Modifiers(context) {
    var me = this;
    contextMap.set(me, context);
    var modifiers = {};
    return new Proxy(modifiers, {
        set (target, key, value){
            var modifier = new Modifier(contextMap.get(me), key);
            modifier.text = value;
            modifiers[key] = modifier; 
            return true;
        },
        get (target, key) {
            return modifiers[key];
        }
    });
}

module.exports = Modifiers;
},{"./Modifier":9}],11:[function(require,module,exports){
'use strict';

var md5 = require('blueimp-md5');
var StylisCtor = require('stylis');
var cssMounter = require('./cssMounter');
var fontLoader = require('./fontLoader');
var Modifiers = require('./Modifiers');
var addedStyles = {};
var stylis = new StylisCtor({
    compress: false
});

class StyleSheet {
    constructor (cssText, options) {
        this.prefix = (options && options.prefix + '-') || '_';
        this.id = this.prefix + md5(cssText);
        this.cssText = cssText;
        this.modifiers = new Modifiers(this);
        this.fonts = {
            google: []
        };
    }
    mount(){
        if (addedStyles[this.id]) {
            return;
        }
        var cssText = stylis('.' + this.id, this.cssText);

        for(var key in this.modifiers) {
            if (!this.modifiers.hasOwnProperty(key)) {
                continue;
            }
            cssText += stylis('.' + this.id + '.' + this.modifiers[key].name, this.modifiers[key].text);
        }

        for(var l = this.fonts.google.length; l--;) {
            fontLoader.load(this.fonts.google[l]);
        }
        cssMounter.mount(cssText);
        addedStyles[this.id] = true;
    }
}


module.exports = StyleSheet;
},{"./Modifiers":10,"./cssMounter":13,"./fontLoader":14,"blueimp-md5":2,"stylis":5}],12:[function(require,module,exports){
'use strict';

var request = window.requestAnimationFrame;
var cancel = window.cancelAnimationFrame;

var lastTime = 0;
var vendors = ['ms', 'moz', 'webkit', 'o'];
for(var x = 0; x < vendors.length && !request; ++x) {
    request = window[vendors[x]+'RequestAnimationFrame'];
    cancel = window[vendors[x]+'CancelAnimationFrame'] || 
        window[vendors[x]+'CancelRequestAnimationFrame'];
}

if (!request)
    request = function(callback) {
        var currTime = new Date().getTime();
        var timeToCall = Math.max(0, 16 - (currTime - lastTime));
        var id = window.setTimeout(function() { callback(currTime + timeToCall); }, 
          timeToCall);
        lastTime = currTime + timeToCall;
        return id;
    };

if (!cancel)
    cancel = function(id) {
        clearTimeout(id);
    };

module.exports.request = request.bind(window);
module.exports.cancel = cancel.bind(window);
},{}],13:[function(require,module,exports){
'use strict';
exports.mount = function(cssText) {
    var style = document.createElement('style');
    style.type = 'text/css';
    if (style.styleSheet) {
        style.styleSheet.cssText = cssText;
    }
    else {
        style.appendChild(document.createTextNode(cssText));
    }
    var head = document.documentElement.querySelector('head');
    head.appendChild(style);
};
},{}],14:[function(require,module,exports){
'use strict';
var Stylis = require('stylis');
var mounter = require('./cssMounter');
var loaded = {};

module.exports.load = function(familyName) {
    if (loaded[familyName]) {
        return;
    }
    var s = new Stylis({
        global: true
    });
    var cssText = s('','@import url(\'https://fonts.googleapis.com/css?family=' + familyName + '\');');
    mounter.mount(cssText);
    loaded[familyName] = true;
};
},{"./cssMounter":13,"stylis":5}]},{},[1])(1)
});
//# sourceMappingURL=bundle.js.map
;
define('scripts/footer',['./huntun'], function (huntun) {
  'use strict';

  function googleTrack(argument) {
    (function (i, s, o, g, r, a, m) {
      i['GoogleAnalyticsObject'] = r; i[r] = i[r] || function () {
        (i[r].q = i[r].q || []).push(arguments)
      }, i[r].l = 1 * new Date(); a = s.createElement(o),
        m = s.getElementsByTagName(o)[0]; a.async = 1; a.src = g; m.parentNode.insertBefore(a, m)
    })(window, document, 'script', 'https://www.google-analytics.com/analytics.js', 'ga');

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
    options.handlers.resize = function () {
      scrollbar.model.length = html.scrollHeight;
      scrollbar.model.viewport = html.clientHeight;
      scrollbar.model.position = html.scrollTop;
    };
    var scrollbar = new huntun.ScrollBar(options);
    if (typeof options.handlers.resize === 'function') {
      options.handlers.resize();
      scrollbar.viewModel.redraw(true);
    }
    window.addEventListener('scroll', function () {
      if (scrollbar && typeof scrollbar.handleResize === 'function') {
        scrollbar.handleResize();
      }
    });
    function handleWindowResize() {
      if (window.innerWidth <= 1226) {
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
    init: function () {
      initScrollBar();
      googleTrack();
    }
  };
});
