#!/usr/bin/env node
var express = require('express'),
    dnode   = require('dnode'),
    path    = require('path');


var app = express.createServer();
app.use(express.static(path.join(__dirname, 'static')));

app.listen(8888);
console.log('http://localhost:8888/');

var browsers = [];

dnode({
          plot : function(data, opts) {
              browsers.forEach(function (cb) {
                  cb(data, opts);
              });
          }
      }).listen(9000);

var server = dnode({
    register : function (cb) {
        browsers.push(cb);
    }
});
server.listen(app);
