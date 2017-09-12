'use strict';

var Metalsmith  = require('metalsmith');
var collections = require('metalsmith-collections');
var layouts     = require('metalsmith-layouts');
var markdown    = require('metalsmith-markdown');
var permalinks  = require('metalsmith-permalinks');
var less = require('metalsmith-less');
var sitemap = require('metalsmith-mapsite');
var imageResizer = require('metalsmith-image-resizer');
var imagemin = require('metalsmith-imagemin');
var handlebars = require('handlebars');
var pathUtil = require('path');
var cheerio = require('cheerio');

var folderMapping = {
  'motorbiking-destinations': '摩旅目的地',
  'highway-code-talks': '交规学习班',
  'zen-and-the-art': '摩托车与禅'
};

handlebars.registerHelper('folder', function(path) {
  path = handlebars.Utils.escapeExpression(path);
  var folders = path.split(pathUtil.sep);

  return new handlebars.SafeString(
    folderMapping[folders[0]] || 
    folders[0]
  );
});

handlebars.registerHelper('preview', function(content) {
  var $ = cheerio.load(content);
  var text = $('p').eq(0).text();
  var $image = $('img').eq(0);
  var imageSource = $image.attr('src');
  var imageAlt = $image.attr('alt');

  return new handlebars.SafeString(`<p class="preview-text">${text}</p>` +
    (
      imageSource?
      `
      <div class="image-container" title="${imageAlt}">
        <img src="${imageSource}" alt="${imageAlt}" />
      </div>
      `:''
    )
  );
});

var ms = Metalsmith(__dirname)        
  .metadata({                 
    sitename: 'Thoughts on 2-wheel',
    siteurl: 'http://blog.norm.im/',
    description: 'It\'s about saying »Hello« to the world.'
  })
  .source('./src')            // source directory
  .destination('./docs')     // destination directory
  .clean(false)                // clean destination before
  .use(collections({          // group all blog posts by internally
    posts: {
      pattern: '**/*.md',
      sortBy: 'date',
      reverse: true
    }
  }))                         // use `collections.posts` in layouts
  .use(markdown())            // transpile all md into html
  .use(permalinks({           // change URLs to permalink URLs
    relative: false           // put css only in /css
  }))
  .use(layouts({              // wrap layouts around html
    engine: 'handlebars',     // use the layout engine you like
    default: 'post.html',
    pattern: '**/*.html',
    partials: 'partials'
  }))
  .use(less({
    pattern: '**/*.less'
  }));

  if (process.argv[2] === '--with-images') {
    ms.use(imageResizer({
      glob: "resources/**/*.jpg",
      width: 1920,
      height: 1080
    }))
    .use(imagemin({
      optimizationLevel: 3,
      svgoPlugins: [{ removeViewBox: false }]
    }));
  }
  else {
    ms
      .ignore('**/*.jpg')
      .ignore('**/*.png')
      .ignore('**/*.gif');
  }
  
  ms.use(sitemap({
    hostname: 'http://blog.norm.im',
    omitIndex: true,
    pattern: '**/*.html'
  }))
  .build(function(err) {      // build process
    if (err) throw err;       // error handling is required
  });