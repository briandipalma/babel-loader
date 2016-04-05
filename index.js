'use strict';

var assign = require('object-assign');
var babel = require('babel-core');
var loaderUtils = require('loader-utils');
var cache = require('./lib/fs-cache.js');
var exists = require('./lib/helpers/exists')();
var read = require('./lib/helpers/read')();
var resolveRc = require('./lib/resolve-rc.js');
var pkg = require('./package.json');
var path = require('path');

var transpile = function(source, options) {
  var result = babel.transform(source, options);
  var code = result.code;
  var map = result.map;

  if (map && (!map.sourcesContent || !map.sourcesContent.length)) {
    map.sourcesContent = [source];
  }

  return {
    code: code,
    map: map,
  };
};

module.exports = function(source, inputSourceMap) {
  var result = {};

  // Handle filenames (#106)
  var webpackRemainingChain = loaderUtils.getRemainingRequest(this).split('!');
  var filename = webpackRemainingChain[webpackRemainingChain.length - 1];

  // Handle options
  var globalOptions = this.options.babel || {};
  var loaderOptions = loaderUtils.parseQuery(this.query);
  var userOptions = assign({}, globalOptions, loaderOptions);
  var babelrc = exists(userOptions.babelrc) ?
    read(userOptions.babelrc) :
    resolveRc(process.cwd());
  var babelrcOpts = JSON.parse(babelrc || '{}');
  var defaultOptions = {
    inputSourceMap: inputSourceMap,
    sourceRoot: process.cwd(),
    filename: filename,
    cacheIdentifier: JSON.stringify({
      'babel-loader': pkg.version,
      'babel-core': babel.version,
      babelrc: babelrc,
      env: process.env.BABEL_ENV || process.env.NODE_ENV,
    }),
  };

  if (babelrcOpts.plugins) {
    babelrcOpts.plugins = babelrcOpts.plugins.map(function(plugin) {
      return require.resolve('babel-plugin-' + plugin) ||
        require.resolve(plugin);
    });
  }

  if (babelrcOpts.presets) {
    babelrcOpts.presets = babelrcOpts.presets.map(function(preset) {
      return require.resolve('babel-preset-' + preset) ||
        require.resolve(preset);
    });
  }

  var options = assign({}, defaultOptions, babelrcOpts, userOptions);

  if (userOptions.sourceMap === undefined) {
    options.sourceMap = this.sourceMap;
  }

  if (options.sourceFileName === undefined) {
    options.sourceFileName = path.relative(
        options.sourceRoot,
        options.filename
    );
  }

  var cacheDirectory = options.cacheDirectory;
  var cacheIdentifier = options.cacheIdentifier;

  delete options.cacheDirectory;
  delete options.cacheIdentifier;

  this.cacheable();

  if (cacheDirectory) {
    var callback = this.async();
    return cache({
      directory: cacheDirectory,
      identifier: cacheIdentifier,
      source: source,
      options: options,
      transform: transpile,
    }, function(err, result) {
      if (err) { return callback(err); }
      return callback(null, result.code, result.map);
    });
  }

  result = transpile(source, options);
  this.callback(null, result.code, result.map);
};
