var hyperquext = require('hyperquext');
var url = require('url');
var _ = require('underscore');
var xpath = require('xpath')
  , dom = require('xmldom').DOMParser;

module.exports = function hyperquextMeDirect(hyperquext) {
  var expression = /[-a-zA-Z0-9@:%_\+.~#?&//]{2,256}\.[a-z]{2,4}\b(\/[-a-zA-Z0-9@:%_\+.~#?&//=]*)?/gi;
  var regex = new RegExp(expression);

  return function(uri, opts, cb) {
    if (typeof uri === 'object') {
      cb = opts;
      opts = uri;
      uri = undefined;
    }
    if (typeof opts === 'function') {
      cb = opts;
      opts = undefined;
    }
    if (!opts) opts = {};
    if (uri !== undefined) opts.uri = uri;
    if (opts.uri !== undefined)
      opts = _.extend(opts, url.parse(opts.uri));
    else
      opts.uri = url.format(opts);


    opts = _.clone(opts);

    var req = hyperquext(uri, opts);

    if (req.reqopts.method !== 'GET' || !opts.maxRedirects) {
      req.setCallback(cb);
      return req;
    } else {
      var proxy = require('hyperquext').createRequestProxy(opts, cb);

      var redirects = [];

      proxy.on("redirect", onRedirect);
      proxy.on("close", function () {proxy.removeListener("redirect", onRedirect);});

      function onRedirect (res) {
        redirects.push({
          statusCode: res.statusCode,
          redirectUri: res.headers.location
        });
      }
      var failed = false;
      keepRequesting(hyperquext, req, opts.maxRedirects, function (err, req) {
        if (failed) return;
        if (err) {
          failed = true;
          err.reqopts = _.clone(proxy.reqopts);
          err.redirects = redirects;
          proxy.emit("error", err);

          return;
        }

        if (req.finalRequest) {
          emitFinalRequest(req.finalRequest);
        } else {
          req.once('finalRequest', function (finalRequest) {
            emitFinalRequest(finalRequest);
          });
        }

        function emitFinalRequest(finalRequest) {
          if (finalRequest.res) {
            attachRedirectsToResponse(finalRequest.res);
          } else {
            finalRequest.once('response', function (res) {
              attachRedirectsToResponse(res);
            });
          }

          proxy.emit('finalRequest', finalRequest);
        }

        function attachRedirectsToResponse(res) {
          res.request = res.request || {};
          res.request.redirects = res.request.redirects || [];
          res.request.redirects = _.union(res.request.redirects, redirects);
        }
      });


      return proxy;
    }

    function keepRequesting(hyperquext, initialRequest, maxRedirects, cb) {
      initialRequest.on('error', function requestErrorListener(err) {
        return cb(err, initialRequest);
      });
      initialRequest.on('request', function (request) {
        proxy.emit('request', request);
      });
      if (maxRedirects <= 0) { return cb(new Error('max redirects'), initialRequest); };

      initialRequest.on('finalRequest', function (clientRequest) {
        getResponseFromClientRequest(clientRequest, function (err, res) {
          if (res.statusCode !== 200) return cb(null, initialRequest);

          var body = '';
          var stream = require('through')().pause();

          res.on('data', function(d){body += d.toString('utf8'); stream.queue(d);})

          res.on('end', function () {
            var doc = new dom({errorHandler: function(){}}).parseFromString(body.toLowerCase() + ' ');
            var nodes = xpath.select("//meta[@http-equiv='refresh']/@content", doc)
            var redirectUrl = nodes.length > 0 && nodes[0].value.match(regex);
            redirectUrl = redirectUrl && redirectUrl.length ? redirectUrl[0] : false;
            clientRequest.res = _.extend({}, clientRequest.res, stream);

            if (!redirectUrl) {
              cb(null, initialRequest);
            } else {
              clientRequest.res.statusCode = 'meta-refresh';
              clientRequest.res.headers.location = redirectUrl;

              proxy.emit("redirect", clientRequest.res);

              var opts = _.clone(initialRequest.reqopts);
              var location = res.headers.location;
              if (location.search('://') === -1) location = url.resolve(opts.uri, res.headers.location);

              opts = _.extend(opts, url.parse(location));
              opts.uri = location;

              var req = hyperquext(opts);
              keepRequesting(hyperquext, req, --maxRedirects, cb);
            }

            doc = null;
            nodes = null;
            body = null;

            stream.resume();
            stream.queue(null);
          });
        });
      })
    }
  }

  function getResponseFromClientRequest(clientRequest, cb) {
    if (clientRequest.res) return cb(null, clientRequest.res);
    clientRequest.once('response', function (res) {
      cb(null, res);
    });
  }
}