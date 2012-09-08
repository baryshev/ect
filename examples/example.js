var Cent = require('./../index');

var renderer = Cent({ root : __dirname + '/view', useCache : true, ext : '.html' });

renderer.render('page', { title: 'Hello, World!' }, function(error, html) {
	console.log(error);
	console.log(html);
});
