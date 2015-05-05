module.exports = AsyncCache;

var LRU = require('lru-cache');

function AsyncCache(opt) {
  if (!opt || typeof opt !== 'object')
    throw new Error('options must be an object');

  if (!opt.load)
    throw new Error('load function is required');

  if (!(this instanceof AsyncCache))
    return new AsyncCache(opt);

  this._opt = opt;
  this._cache = new LRU(opt);
  this._load = opt.load;
  this._loading = {};
  this._stales = {};
  this._allowStale = opt.stale;
  this._returnStaleWhileUpdating = this._allowStale && opt.returnStaleWhileUpdating;
}

Object.defineProperty(AsyncCache.prototype, 'itemCount', {
  get: function() {
    return this._cache.itemCount;
  },
  enumerable: true,
  configurable: true
});

AsyncCache.prototype.get = function(key, cb) {
  var staled = this._stales[key];
  if(this._returnStaleWhileUpdating && void 0 !== staled){
    return process.nextTick(function() {
      cb(null, staled);
    });
  }

  if (this._loading[key])
    return this._loading[key].push(cb);

  var has = this._cache.has(key);
  var cached = this._cache.get(key);
  if (has && void 0 !== cached)
    return process.nextTick(function() {
      cb(null, cached);
    });

  if (void 0 !== cached && this._allowStale && !has){
    if(this._returnStaleWhileUpdating)
      this._stales[key] = cached;

    process.nextTick(function() {
      cb(null, cached);
    });
  }
  else
    this._loading[key] = [ cb ];

  this._load(key, function(er, res) {
    if (!er)
      this._cache.set(key, res);

    if (this._returnStaleWhileUpdating && this._stales[key])
      delete this._stales[key];

    var cbs = this._loading[key];
    if (!cbs)
      return;
    delete this._loading[key];

    cbs.forEach(function (cb) {
      cb(er, res);
    });
  }.bind(this));
};

AsyncCache.prototype.set = function(key, val) {
  return this._cache.set(key, val);
};

AsyncCache.prototype.reset = function() {
  return this._cache.reset();
};

AsyncCache.prototype.has = function(key) {
  return this._cache.has(key);
};

AsyncCache.prototype.del = function(key) {
  return this._cache.del(key);
};

AsyncCache.prototype.peek = function(key) {
  return this._cache.peek(key);
};
