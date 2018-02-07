const pkg = require('./package.json');
const fs = require('fs');
const FILENAME = 'partials/styles.html';

var readmeContent = fs.readFileSync(FILENAME, 'utf8');
readmeContent = readmeContent.replace(new RegExp(pkg.version, 'g'), '{placeholder}');
fs.writeFileSync(FILENAME, readmeContent, 'utf8');