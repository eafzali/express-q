/**
 * Module dependencies.
 */

var slice = require('sliced')
  , Q = require('q')
;


module.exports = function(express){
  /**
   * Wrap response.render with support for Q
   */

  var render = express.response.render;
  express.response.render = function (view, options, callback) {
    if (!options || 'function' == typeof options) {
      return render.call(this, view, options, callback);
    }

    var self = this;
    return resolve(options, function (err, result) {
      if (err) {
        return 'function' == typeof callback
          ? callback(err)
          : self.req.next(err);
      }

      // must return here so partials always work
      return render.call(self, view, result, callback);
    });
  }

  /**
   * Add Q support to res.send.
   */

  var send = express.response.send;
  express.response.send = function () {
    var args = slice(arguments);
    var self = this;

    function handleResult (err, result) {
      if (err) return self.req.next(err);
      args[0] = result;
      send.apply(self, args);
    }

    if (Q.isPromiseAlike(args[0])) {
      return Q.when(args[0])
      .then(function(result){
        args[0] = result;
        send.apply(self, args);
      })
      .fail(function(err){
        self.req.next(err);
      })
    }

    if ('Object' == args[0].constructor.name) {
      return resolve(args[0], handleResult);
    }

    send.apply(this, args);
  };

  // TODO res.json
  // TODO res.jsonp

  /**
   * Resolves any Q within the passed options.
   * @api private
   */

  function resolve (options, callback, nested) {
    var keys = Object.keys(options)
      , i = keys.length
      , remaining = []
      , pending
      , item
      , key;

    while (i--) {
      key = keys[i];
      item = options[key];
      if (Q.isPromiseAlike(item)) {
        item.key = key;
        remaining.push(item);
      }
    }

    pending = remaining.length;
    if (options.locals) ++pending;

    if (!pending) {
      return callback(null, options);
    }

    function error (err) {
      if (error.ran) return;
      callback(error.ran = err);
    }

    remaining.forEach(function (item) {
      Q.when(item)
      .then(function(result){
        options[item.key] = result;
        --pending || callback(null, options);      
      })
      .fail(function(err){
        return error(err);
      })
    });

    if (nested) return;

    // locals support
    if (options.locals) {
      return resolve(options.locals, function (err, resolved) {
        if (err) return error(err);
        options.locals = resolved;
        if (--pending) return;
        return callback(null, options);
      }, true);
    }
  }
}