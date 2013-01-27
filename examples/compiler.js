var http = require('http');
var connect = require('connect');
var app = connect();
var server = http.createServer(app);

var ECT = require('./../index');
var renderer = ECT({ root : __dirname + '/view', ext : '.html', watch: true });
app.use('/views', renderer.compiler({ gzip: true }));

server.listen(3000);
