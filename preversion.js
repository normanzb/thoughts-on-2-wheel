const pkg = require('./package.json');
const fs = require('fs');
const FILENAME = 'README.md';

var readmeContent = fs.readFileSync(FILENAME, 'utf8');
readmeContent = readmeContent.replace(new RegExp(pkg.version, 'g'), '{placeholder}');
fs.writeFileSync(FILENAME, readmeContent, 'utf8');