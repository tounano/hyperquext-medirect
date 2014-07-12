var hq = require('hyperquext');
var url = require('url');
var attachCheerioToResponse = require('hyperquext-cheerio'),
  redirector = hq.devcorators.redirector,
  consumeForcedOption = hq.devcorators.consumeForcedOption,
  getFinalRequestFromHyperquext = hq.helpers.getFinalRequestFromHyperquext,
  getResponseFromClientRequest = hq.helpers.getResponseFromClientRequest;

module.exports = function hyperquextMeDirect(hyperquext) {
  var expression = /https?:\/\/(www\.)?[-a-zA-Z0-9@:%._\+~#=]{2,256}\.[a-z]{2,6}\b([-a-zA-Z0-9@:%_\+.~#?&//=]*)/gi;
  var regex = new RegExp(expression);

  return redirector(function (uri, opts, cb) {
    if (!opts.maxRedirects) return opts;

    var req = consumeForcedOption(attachCheerioToResponse(hyperquext), 'cheerio')(uri, opts, cb);

    getFinalRequestFromHyperquext(req, function (err, finalRequest) {
      getResponseFromClientRequest(finalRequest, function (err, res) {
        if (res['$redirect'] || !res.cheerio) return;
        var $ = res.cheerio;
        var redirectUrl;
        $('meta[http-equiv]').each( function () {
          redirectUrl = $(this).attr('http-equiv').toLowerCase() == 'refresh' &&
            $(this).attr('content') && $(this).attr('content').match(regex);
        })

        redirectUrl = redirectUrl && redirectUrl.length ? redirectUrl[0] : false;
        if (redirectUrl) {
          finalRequest.res['$redirect'] = {
            statusCode: 'meta-refresh',
            redirectUri: url.resolve(req.reqopts.uri, redirectUrl)
          }
        }
      })
    })

    return req;
  });
}