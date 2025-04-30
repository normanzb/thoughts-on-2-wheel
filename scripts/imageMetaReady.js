define(['./animationFrame'], function (animationFrame) {
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