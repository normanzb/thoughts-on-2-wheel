const pkg = require('./package.json');
const fs = require('fs');
const FILES = ['partials/styles.html', 'partials/footer.html'];

for(var i = 0; i < FILES.length; i++) {
	let file = FILES[i];
	var readmeContent = fs.readFileSync(file, 'utf8');
	readmeContent = readmeContent.replace(/\{placeholder\}/g, pkg.version);
	fs.writeFileSync(file, readmeContent, 'utf8');
}