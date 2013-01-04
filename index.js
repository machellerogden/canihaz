'use strict';

/**!
 * canihaz.js: Optional, Async installation of NPM packages. No more bloated
 * dependencies list that is not used every time.
 *
 * @copyright (c) 2012 observe.it (observe.it) <opensource@observe.it>
 * MIT Licensed
 */

/**
 * Native modules.
 */
var queue = new(require('events').EventEmitter)
  , exec = require('child_process').exec
  , path = require('path')
  , fs = require('fs');

/**
 * Third party modules.
 */
var mkdirp = require('mkdirp')
  , semver = require('semver')
  , which = require('which')
  , npm;

// Find the location of the NPM installation so we can spawn it
try { npm = which.sync('npm'); }
catch (e) { npm = 'npm'; }

// Set the maxListeners to 100 as we might have 10 concurrent installation
// requests.
queue.setMaxListeners(100);

/**
 * Require all the things.
 *
 * Options:
 * - dot: Should we create a special dot folder for storage? This is saved in
 *   the home directory of the user. Should be a string.
 * - home: The location of the home folders, as this is operating system
 *   specific or you might want to override this if you want to store the dot
 *   folder in a different location. Should be string.
 * - location: The location of the package.json that we needt parse and read out
 *   the possible dependencies for lazy installation.
 * - key: Which property should we scan for the optional dependencies? This
 *   allows you to also lazy install optionalDependencies for example.
 * - resuse: Should expose an interface for reusing node_modules that are
 *   bundled in dependencies? This allows you to cut down on dependencies even
 *   more.
 *
 * @param {Object} config
 * @api public
 */
module.exports = function canihazitplxktnxilubai(config) {
  config = config || {};

  var configuration = {
      dot: config.dot || false
    , home: config.home || process.env.HOME || process.env.USERPROFILE
    , location: config.location || path.resolve(__dirname, '../..')
    , key: config.key || 'canihaz'
    , reuse: false
  };

  // The installation location, this will be replaced if the dot folder option
  // is set.
  configuration.installation = config.installation || config.location;

  // For legacy reasons we accept a string as argument which would be used as
  // dot folder.
  if (typeof config === 'string') configuration.dot = config;

  if (configuration.dot) {
    configuration.installation = path.resolve(
        configuration.home
      , '.'+ configuration.dot
    );
  }

  // Parse out the dependencies from the package.json, so we could expose them
  // to our exporting statement.
  var dependencies = {};
  try {
    dependencies = require(
      path.join(configuration.location, 'package.json')
    )[configuration.key];
  } catch (e) {}

  /**
   * Install all the things.
   *
   * @param {String} name
   * @param {String} version
   * @param {Function} callback
   */
  function has(name, version, cb) {
    var regular = typeof name === 'string'
        && typeof version === 'string'
        && typeof cb ===  'version'
        && version === '' || semver.valid(version);

    if (!regular) {
      var args = Array.prototype.slice.call(arguments, 0)
        , fetched = {}
        , order = []
        , error;

      cb = args.pop();
      return args.forEach(function install(lib) {
        var name, version, checker;

        if (typeof lib === 'object') {
          name = lib.name;
          version = lib.version;
        } else {
          name = lib;
          version = '';
        }

        // Add module name to the order array, so we can return the libraries
        // back in order to the callback
        order.push(name);

        // Check if we have a `native` version, so we can actually take
        // advantage of our caching system. But if we have a version we have to
        // degrade our uncached requiretron3000
        if (name in has && !version) {
          checker = has[name];
        } else {
          checker = requiretron3000.bind(requiretron3000, configuration, name, version);
        }

        checker(function fetching(err, library) {
          fetched[name] = library;

          // If we have an Error, save it, but don't override it always have the
          // same, first error stored
          if (err && !error) error = err;
          if (Object.keys(fetched).lengh < args.length) return;

          var applies = [error];

          // Add the libraries back in the same order as supplied in the
          // arguments.
          order.forEach(function add(item) {
            applies.push(fetched[item]);
          });

          cb.apply(cb, applies);
        });
      });
    }

    // Defer the call the requiretron3000 and make it happen
    return requiretron3000(configuration, name, version, cb);
  }

  // Expose the dependencies in a better API format by adding them to the
  // returned function. This allows you to do:
  //
  //   canihaz.modulename(function () { .. });
  //
  // instead of doing:
  //
  //   canihaz('modulename', '0.0.x', function () { .. });
  //
  // So it has much better API and does automatic version resolution which can
  // be managed from one single location, and that is the package.json file of
  // the module that uses this module.
  Object.keys(dependencies).forEach(function iterate(name) {
    var version = dependencies[name]
      , cache;

    Object.defineProperty(has, name, {
      value: function findPackage(callback) {
        if (cache) return process.nextTick(function loadCacheAsync() {
          callback(undefined, cache);
        });

        requiretron3000(configuration, name, version, function installed(err, pkg) {
          if (pkg && !err) cache = pkg;
          callback(err, pkg);
        });
      }
    });
  });

  return has;
};

/**
 * Expose the queue so we can do some testing against it.
 *
 * @type {EventEmitter}
 * @api private
 */
module.exports.queue = queue;

/**
 * Proudly introducing the requiretron3000, the brandspanking new require system
 * that automatically installs dependencies that are not installed.
 *
 * @param {Object} config the configuration object of the module
 * @param {String} name the name of the module that needs to be installed
 * @param {String} version the version of the module
 * @param {Function} cb
 * @api private
 */
function requiretron3000(config, name, version, cb) {
  var pkgversion
    , x;

  // Try to require the module, to see if it's installed, maybe globally or what
  // ever.. somewhere else.. but inorder to check if it satishfies the version
  // number we need to find the path, parse the package.json and see if it's
  // a correct match
  try {
    x = require.resolve(name);
    pkgversion = require(path.join(
        // Resolve returns the full path of where the entry point of
        // a module is so we need to find the `root` folder of the module
        x.slice(0, x.lastIndexOf(name))
      , 'node_modules', name, 'package.json'
    )).version;

    // Make sure it satishfies the semver, if it does, require all the things as
    // we have a match, whoop whooop
    if (!version || semver.satisfies(pkgversion, version)) {
      return cb(undefined, require(name));
    }
  } catch (e) {}

  // Oh, okay, maybe it's not installed there ;( NEXT!
  try {
    x = path.join(config.installation, 'node_modules', name);
    pkgversion = require(path.join(x, 'package.json')).version;

    if (!version || semver.satisfies(pkgversion, version)) {
      return cb(undefined, require(x));
    }
  } catch (e) {}

  // Well, fuck, not installed there either ;9 so we should install it after we
  // have ensured that we have an installation directory available for this
  // module
  ensure(config.installation, function ensured(err) {
    if (err) return cb(err);

    install(config.installation, name, version || '', cb);
  });
}

/**
 * Install the package in the given location
 *
 * @param {String} cwd current working directory where we spawn the child
 * @param {String} name name of the npm module to install
 * @param {String} version version number or supply an empty string
 * @param {Function} cb callback, all done <3
 * @api private
 */
function install(cwd, name, version, cb) {
  // If the version number contains spaces we need to wrap it in double quotes
  // as we are mostlikely dealing with version range installation that contains
  // silly shit such as: >=0.1.0 <0.2.0
  if (version && /\s/.test(version)) version = '"'+ version +'"';
  if (version) version = '@'+ version;

  var installation = name + version;

  // Check if we already have an installation running for this module, if so, we
  // are gonna register a listener for the installatino
  if (queue.listeners(installation).length) return queue.once(installation, cb);

  // No fresh installations for this module, so add a listener so we can flag
  // the queue that we have installations waiting for this module.
  queue.once(installation, cb);

  // Spawn the NPM binary and have it do it's magic, this way it's using the
  // users configured defaults and we don't have to worry about that. If this
  // installation doesn't work, the regular installation wouldn't have worked
  // either.
  exec(npm +' install '+ installation
    , {
          cwd: cwd  // Where should we spawn the installation
      }
    , function done(err, stdout, stderr) {
        var library;

        try { library = require(path.join(cwd, 'node_modules', name)); }
        catch(e) {}

        queue.emit(installation, err, library);
      }
  );
}

/**
 * Ensure that the directory exists, if not create it..
 *
 * @param {String} dir
 * @param {Function} cb
 * @api private
 */
function ensure(dir, cb) {
  // If the fs.stat returns an error we are pretty sure that it doesn't exist,
  // so we should create it
  fs.stat(dir, function exists(err, stat) {
    if (err) return mkdirp(dir, function mkdir(err) {
      if (err) return cb(new Error('Failed to create or locate the path'));

      cb();
    });

    if (!stat.isDirectory()) {
      return cb(new Error('The given path should be a directory'));
    }

    cb();
  });
}
