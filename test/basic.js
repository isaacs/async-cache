var test = require('tap').test
var AC = require('../ac.js')
var fs = require('fs')

test('options check', function (t) {
  var types = ['string', 123, true, new RegExp('boom', 'g'), undefined, null]

  types.forEach(function (val, key) {
    t.throws(function () {
      var ac = new AC()
      t.equal(ac, undefined)
    }, 'options must be an object')
  })

  t.throws(function () {
    var ac = new AC({ noload: function () {} })
    t.equal(ac, undefined)
  }, 'throws since parameter is an object without a .load property')

  t.doesNotThrow(function () {
    var ac = new AC({ load: function () {} })
    t.type(ac, 'object')
  }, 'does not throw since parameter has a .load property')

  t.end()
})

test('basic', function (t) {
  var ac = new AC({
    max: 1,
    load: function (key, cb) {
      fs.stat(key, cb)
    }
  })

  var called = 0
  var stFirst = null
  var stSecond = null

  t.equal(ac.itemCount, 0)
  ac.get(__filename, afterFirst)
  function afterFirst (er, st) {
    if (er) throw er
    t.equal(ac.itemCount, 1)
    called++
    stFirst = st
    t.pass('called the first one')
    if (called === 2) next()
  }

  var expectLoading = {}
  expectLoading[__filename] = [afterFirst]
  t.deepEqual(ac._loading, expectLoading)

  ac.get(__filename, afterSecond)
  function afterSecond (er, st) {
    if (er) throw er
    t.equal(ac.itemCount, 1)
    called++
    stSecond = st
    t.pass('called the second one')
    if (called === 2) next()
  }

  expectLoading[__filename].push(afterSecond)
  t.deepEqual(ac._loading, expectLoading)
  t.type(ac.peek(__filename), 'undefined')

  function next () {
    t.equal(ac.itemCount, 1)
    t.equal(stFirst, stSecond, 'should be same stat object')
    t.equal(stFirst, ac.peek(__filename), 'should be same stat object')
    t.deepEqual(ac._loading, {})
    t.equal(called, 2)
    ac.get(__filename, function (er, st) {
      if (er) throw er
      t.equal(st, stFirst, 'should be cached stat object')
      next2()
    })
  }

  function next2 () {
    // now make it fall out of cache by fetching a new one.
    ac.get(__dirname, function (er, st) {
      if (er) throw er
      t.type(ac.peek(__filename), 'undefined')
      t.equal(ac.itemCount, 1)
      ac.get(__filename, function (er, st) {
        if (er) throw er
        t.equal(ac.itemCount, 1)
        t.notEqual(st, stFirst, 'should have re-fetched')
        t.end()
      })
    })
  }
})

test('allow stale', function (t) {
  var v = 0
  var ac = new AC({
    max: 1,
    load: function (key, cb) {
      setTimeout(function () {
        cb(null, v++)
      }, 100)
    },
    maxAge: 10,
    stale: true
  })

  t.equal(ac.itemCount, 0)
  ac.get('foo', function (er, val) {
    t.equal(ac.itemCount, 1)
    t.equal(val, 0)
    var start = Date.now()
    setTimeout(function () {
      ac.get('foo', function (er, val) {
        var end = Date.now()
        t.equal(val, 0)
        t.ok(end - start < 50, 'should be stale')
        t.end()
      })
    }, 15)
  })
})

test('return stale while updating', function (t) {
  var maxAge = 500
  var loadingTimes = 0
  var ac = new AC({
    max: 1000,
    stale: true,
    maxAge: maxAge,
    load: function (key, cb) {
      loadingTimes++
      setTimeout(function () {
        cb(null, { created: Date.now(), version: loadingTimes })
      }, 450)
    }
  })

  var staleTimes = 0
  var responses = 0

  function step () {
    ac.get('someKey', function (err, item) {
      var resTime = Date.now()
      if (err) {
        throw err
      } else {
        var itemAge = resTime - item.created
        if (itemAge > maxAge) {
          staleTimes++
        }

        responses++

        if (responses === 30) {
          t.equal(staleTimes, 10, '10 stale times')
          t.equal(loadingTimes, 3, '3 loading times')
          t.end()
        }
      }
    })
  }

  for (var i = 0; i < 30; i++) {
    setTimeout(step, 100 * i)
  }
})

test('keys', function (t) {
  var ac = new AC({
    max: 10,
    load: function (key, cb) {
      cb({ msg: 'item not in cache' })
    },
    maxAge: 10,
    stale: true
  })

  t.equal(ac.itemCount, 0)

  ac.set('foo1', 'bar1')
  ac.set('foo2', 'bar2')

  var keys = ac.keys()

  t.ok(keys.indexOf('foo1') !== -1)
  t.ok(keys.indexOf('foo2') !== -1)

  t.end()
})

test('per item maxAge', function (t) {
  var counter = 0
  var ac = new AC({
    load: function (n, cb) {
      ++counter
      setTimeout(function () {
        // max age set to 500
        cb(null, 'value', 250)
      }, 0)
    }
  })

  function afterFirst (err, item) {
    if (err) throw err
    t.equal(item, 'value')
    t.equal(counter, 1, 'load called 1 time')

    ac.get('key', afterSecond)
  }

  function afterSecond (err, item) {
    if (err) throw err
    t.equal(item, 'value')
    t.equal(counter, 1, 'load still called 1 time')

    setTimeout(function () {
      ac.get('key', afterThird)
    }, 260) // wait longer then maxAge
  }

  function afterThird (err, item) {
    if (err) throw err
    t.equal(item, 'value')
    t.equal(counter, 2, 'load called twice since maxAge elapsed')

    t.end()
  }

  ac.get('key', afterFirst)
})
