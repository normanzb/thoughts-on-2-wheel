define(['./RoadBook', './highlight'], function (RoadBook, highlight) {
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