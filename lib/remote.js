
/**
 * Module dependencies.
 */

var debug = require('debug')('jstrace:remote');
var assert = require('assert');
var utils = require('./utils');
var util = require('util');

/**
 * Expose `Remote`.
 */

module.exports = Remote;

/**
 * Initialize a remote with the given
 * function `body` string.
 *
 * @param {String} body
 * @param {Server} server
 * @api private
 */

function Remote(body, server) {
  body = parse(body);
  this.fn = new Function('traces, console', body);
  this.actor = server.actor;
  this.server = server;
  this.patterns = [];
  this.handlers = [];
  this.invoke();
  this.regexp = utils.patterns(this.patterns);
}

/**
 * Invoke the .remote function that has been constructed,
 * and report back with errors.
 *
 * @api private
 */

Remote.prototype.invoke = function(){
  try {
    this.fn(this, this);
  } catch (err) {
    // TODO: decorate with hostname/pid etc
    this.error(err.stack);
  }
};

/**
 * Remote console.log() implementation.
 *
 * @param {Mixed} ...
 * @api public
 */

Remote.prototype.log = function(){
  var str = util.format.apply(this, arguments) + '\n'
  debug('log %j', str);
  if (!this.actor) return debug('no actor');
  this.actor.send('stdio', {
    stream: 'stdout',
    value: str
  });
};

/**
 * Remote console.dir() implementation.
 *
 * Prefixed with the hostname/process/pid.
 * TODO: just send server info and format on the client
 *
 * @param {Mixed} ...
 * @api public
 */

Remote.prototype.dir = function(){
  var str = util.format.apply(this, arguments) + '\n'
  debug('dir %j', str);
  if (!this.actor) return debug('no actor');
  var prefix = [this.server.hostname, this.server.title, this.server.pid].join('/');
  this.actor.send('stdio', {
    stream: 'stdout',
    value: prefix + ' >> ' + str
  });
};

/**
 * Remote console.error() implementation.
 *
 * @param {Mixed} ...
 * @api public
 */

Remote.prototype.error = function(){
  var str = util.format.apply(this, arguments) + '\n'
  debug('error %j', str);
  if (!this.actor) return debug('no actor');
  this.actor.send('stdio', {
    stream: 'stderr',
    value: str
  });
};

/**
 * Check if remote has subscribed to `name`.
 *
 * @param {String} name
 * @return {Boolean}
 * @api private
 */

Remote.prototype.subscribed = function(name){
  return this.regexp.test(name);
};

/**
 * Send a trace, evaluated on the remote side.
 *
 * @param {String} name
 * @param {Object} obj
 * @api private
 */

Remote.prototype.send = function(name, obj){
  this.trace(this.server.trace(name, obj));
};

/**
 * Pass `trace` to the matching pattern methods.
 *
 * @param {Object} trace
 * @api private
 */

Remote.prototype.trace = function(trace){
  this.handlers.forEach(function(h){
    if (!h.regexp.test(trace.name)) return;
    h.fn(trace);
  });
};

/**
 * Listen on `pattern` and invoke `fn()`.
 *
 * @param {String} pattern
 * @param {Function} fn
 * @api public
 */

Remote.prototype.on = function(pattern, fn){
  debug('on %j', pattern);
  this.patterns.push(pattern);
  this.handlers.push({
    regexp: utils.pattern(pattern),
    pattern: pattern,
    fn: fn
  });
};

/**
 * Emit a remote event, received by the client.
 *
 * @param {String} name
 * @param {Mixed} [arg ...]
 * @api public
 */

Remote.prototype.emit = function(name){
  var args = [].slice.call(arguments, 1);
  debug('emit %j %j', name, args);
  if (!this.actor) return debug('no actor');
  this.actor.send('event', {
    name: name,
    args: args
  });
};

/**
 * Return the body of a serialized function.
 *
 * @param {String} str
 * @return {String}
 * @api private
 */

function parse(str) {
  return str.slice(str.indexOf('{') + 1, -1).trim();
}
