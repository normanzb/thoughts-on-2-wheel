'use strict';

var Metalsmith  = require('metalsmith');
var collections = require('metalsmith-collections');
var layouts     = require('metalsmith-layouts');
var markdown    = require('metalsmith-markdown');
var permalinks  = require('metalsmith-permalinks');
var less = require('metalsmith-less');



Metalsmith(__dirname)         
  .metadata({                 
    sitename: 'Thoughts on 2-wheel',
    siteurl: 'http://blog.norm.im/',
    description: 'It\'s about saying »Hello« to the world.'
  })
  .source('./src')            // source directory
  .destination('./docs')     // destination directory
  .clean(true)                // clean destination before
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
  }))
  .build(function(err) {      // build process
    if (err) throw err;       // error handling is required
  });