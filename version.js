const pkg = require('./package.json');
const fs = require('fs');
const FILENAME = 'partials/styles.html';

var readmeContent = fs.readFileSync(FILENAME, 'utf8');
readmeContent = readmeContent.replace(/\{placeholder\}/g, pkg.version);
fs.writeFileSync(FILENAME, readmeContent, 'utf8');