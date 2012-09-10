/*!
 * ect CoffeeScript template engine v0.1.0
 * https://github.com/baryshev/ect
 *
 * Copyright 2012, Vadim M. Baryshev <vadimbaryshev@gmail.com>
 * Licensed under the MIT license
 * https://github.com/baryshev/ect/LICENSE
 *
 * Includes parts of async
 * https://github.com/caolan/async
 * Copyright 2010 Caolan McMahon
 * Released under the MIT license
 *
 * Includes parts of node
 * https://github.com/joyent/node
 * Copyright Joyent, Inc. and other Node contributors
 * Released under the MIT license
 *
 * Includes Cross-Browser Split 1.0.1
 * http://xregexp.com/
 * Copyright Steven Levithan <stevenlevithan.com>
 * Released under the MIT license
 */
(function () {
	'use strict';
	var
		fs,
		path,
		CoffeeScript,
		async = (function () {
			var
				async = {},

				forEach = function (arr, iterator) {
					var i;
					if (arr.forEach) {
						return arr.forEach(iterator);
					}
					for (i = 0; i < arr.length; i++) {
						iterator(arr[i], i, arr);
					}
				},

				map = function (arr, iterator) {
					if (arr.map) {
						return arr.map(iterator);
					}
					var results = [];
					forEach(arr, function (x, i, a) {
						results.push(iterator(x, i, a));
					});
					return results;
				},

				asyncMap = function (eachfn, arr, iterator, callback) {
					var results = [];
					arr = map(arr, function (x, i) {
						return {index: i, value: x};
					});
					eachfn(arr, function (x, callback) {
						iterator(x.value, function (err, v) {
							results[x.index] = v;
							callback(err);
						});
					}, function (err) {
						callback(err, results);
					});
				},

				doParallel = function (fn) {
					return function () {
						var args = Array.prototype.slice.call(arguments);
						return fn.apply(null, [async.forEach].concat(args));
					};
				};

			async.forEach = function (arr, iterator, callback) {
				if (!arr.length) {
					return callback();
				}
				var completed = 0;
				forEach(arr, function (x) {
					iterator(x, function (err) {
						if (err) {
							callback(err);
							callback = function () {};
						} else {
							completed++;
							if (completed === arr.length) {
								callback();
							}
						}
					});
				});
			};

			async.map = doParallel(asyncMap);

			async.parallel = function (tasks, callback) {
				callback = callback || function () {};
				if (tasks.constructor === Array) {
					async.map(tasks, function (fn, callback) {
						if (fn) {
							fn(function (err) {
								var args = Array.prototype.slice.call(arguments, 1);
								if (args.length <= 1) {
									args = args[0];
								}
								callback.call(null, err, args);
							});
						}
					}, callback);
				}
			};

			return async;
		}()),

		ect = function (options) {
			if (!(this instanceof ect)) {
				return new ect(options);
			}
			var _ect = this;

			this.options = {
				open : '<%',
				close : '%>',
				ext : '',
				useCache : false,
				watchForChanges : false,
				root : ''
			};

			var
				trimExp = /^\s+|\s+$/g,
				escapeExp = /([.*+?\^=!:${}()|\[\]\/\\])/g,
				newlineExp = /\n/g,
				indentExp = /:$/,
				commandExp = /[^a-z]+/,
				quoteExp = /[\\']/g,
				crExp = /\r/g,
				cache = {},
				loaders = {},
				watchers = {},
				indentChars = { ':' : ':', '>' : '>' },

				regExpEscape = function (str) {
					return String(str).replace(escapeExp, '\\$1');
				},

				parse = function (html) {
					var
						lineNo = 1,
						bufferStack = [ '__ectTemplate.buffer' ], bufferStackPointer = 0,
						buffer = [ bufferStack[bufferStackPointer] + '.push \'' ],
						indentChar,
						matches = html.split(new RegExp(regExpEscape(_ect.options.open) + '((?:.|[\r\n])+?)(?:' + regExpEscape(_ect.options.close) + '|$)')),
						length,	i, text, command, line,
						prefix, postfix, newline, indentation = '', indent = false, indentStack = [], indentStackPointer = -1;

					for (i = 0, length = matches.length; i < length; i++) {
						text = matches[i];
						command = '';
						if (i % 2 === 1) {
							line = '__ectTemplate.line = ' + lineNo;
							switch (text.charAt(0)) {
							case '=':
								prefix = '\', 0[' + line + '], __ectTemplate.escape(';
								postfix = '), \'';
								newline = '';
								text = text.substr(1);
								break;
							case '-':
								prefix = '\', 0[' + line + '], (';
								postfix = '), \'';
								newline = '';
								text = text.substr(1);
								break;
							default:
								prefix = '\'\n' + line + '';
								postfix = '\n' + bufferStack[bufferStackPointer] + '.push \'';
								newline = '\n';
							}
							text = text.replace(trimExp, '');

							command = text.split(commandExp)[0];
							if ((indentChar = indentChars[text.charAt(text.length - 1)])) {
								text = text.replace(indentExp, '').replace(trimExp, '');
								if (indentChar === '>') {
									bufferStack.push('__ectBuffer' + bufferStackPointer);
									postfix = '\n__ectBuffer' + bufferStackPointer + ' = []';
									bufferStackPointer++;
									postfix += '\n' + bufferStack[bufferStackPointer] + '.push \'';
									command = 'function';
								}
								indentStack.push(command);
								indentStackPointer++;
								if (command !== 'block') {
									indent = true;
								}
							}
							switch (command) {
							case 'partial' :
								prefix = '\', 0[' + line + '], (';
								postfix = '), \'';
								buffer.push(prefix.replace(newlineExp, '\n' + indentation), text, postfix.replace(newlineExp, '\n' + indentation));
								break;
							case 'content' :
								prefix = '\', 0[' + line + '], (';
								postfix = '), \'';
								if (text === 'content') {
									postfix = '()' + postfix;
								}
								buffer.push(prefix.replace(newlineExp, '\n' + indentation), text, postfix.replace(newlineExp, '\n' + indentation));
								break;
							case 'end' :
								prefix = '\'';
								switch (indentStack[indentStackPointer]) {
								case 'block' :
									prefix = '\'\n__ectTemplate.blockEnd(';
									postfix = ')\n' + bufferStack[bufferStackPointer] + '.push \'';
									buffer.push(prefix.replace(newlineExp, '\n' + indentation) + postfix.replace(newlineExp, '\n' + indentation));
									break;
								case 'when' :
									postfix = '\n' + bufferStack[bufferStackPointer] + '.push \'\'';
									buffer.push(prefix.replace(newlineExp, '\n' + indentation) + postfix.replace(newlineExp, '\n' + indentation));
									indentation = indentation.substr(2);
									break;
								case 'function' :
									prefix = '\'\n' + bufferStack[bufferStackPointer] + '.join \'\'';
									buffer.push(prefix.replace(newlineExp, '\n' + indentation));
									indentation = indentation.substr(2);
									bufferStack.pop();
									bufferStackPointer--;
									postfix = '\n' + bufferStack[bufferStackPointer] + '.push \'';
									buffer.push(postfix.replace(newlineExp, '\n' + indentation));
									break;
								case 'switch' :
									prefix = '\n' + line + '';
									indentation = indentation.substr(2);
								default :
									if (indentStack[indentStackPointer - 1] === 'switch') {
										postfix = '';
									}
									indentation = indentation.substr(2);
									buffer.push(prefix.replace(newlineExp, '\n' + indentation));
									buffer.push(postfix.replace(newlineExp, '\n' + indentation));
								}
								indentStack.pop();
								indentStackPointer--;
								break;
							case 'else' :
								if (indentStack[indentStackPointer - 1] === 'switch') {
									prefix = '';
								} else {
									prefix = '\'';
								}
								buffer.push(prefix.replace(newlineExp, '\n' + indentation));
								if (indentStack[indentStackPointer - 1] === 'if') {
									indentStack.splice(-2, 1);
									indentStackPointer--;
									indentation = indentation.substr(2);
								}
								buffer.push((newline.length ? newline + indentation : '') + text);
								if (indent) {
									indentation += '  ';
									indent = false;
								}
								buffer.push(postfix.replace(newlineExp, '\n' + indentation));
								break;
							case 'switch' :
								buffer.push(prefix.replace(newlineExp, '\n' + indentation), (newline.length ? newline + indentation : '') + text);
								if (indent) {
									indentation += '  ';
									indent = false;
								}
								break;
							case 'when' :
								buffer.push((newline.length ? newline + indentation : '') + text);
								if (indent) {
									indentation += '  ';
									indent = false;
								}
								buffer.push(postfix.replace(newlineExp, '\n' + indentation));
								break;
							default :
								buffer.push(prefix.replace(newlineExp, '\n' + indentation), (newline.length ? newline + indentation : '') + text);
								if (indent) {
									indentation += '  ';
									indent = false;
								}
								buffer.push(postfix.replace(newlineExp, '\n' + indentation));
								break;
							}
						} else {
							if (indentStack[indentStackPointer] !== 'switch') {
								buffer.push(text.replace(quoteExp, '\\$&').replace(crExp, '').replace(newlineExp, '\\n'));
							}
						}
						lineNo += text.split(newlineExp).length - 1;
					}
					buffer.push('\'\nreturn __ectTemplate.buffer');
					buffer = buffer.join('');
					return new Function('__ectTemplate', 'partial', 'extend', 'block', 'content', 'return ' + CoffeeScript.compile(buffer));
				},

				loaded = function (error, file, blank) {
					var callbacks = loaders[file];
					delete (loaders[file]);
					async.forEach(callbacks, function (loader, callback) {
						loader(error, blank);
						callback();
					}, function () {});
				},

				read = function (file, callback) {
					if (Object.prototype.toString.call(_ect.options.root) === '[object Object]') {
						try {
							var data = eval('(options.root.' + file + ')');
							if (Object.prototype.toString.call(data) === '[object String]') {
								callback(undefined, data);
							} else {
								callback('Failed to load template');
							}
						} catch (e) {
							callback(e);
						}
					} else {
						fs.readFile(file, 'utf8', callback);
					}
				},

				load = function (file, callback) {
					if (_ect.options.useCache && cache[file]) {
						if (callback) { callback(undefined, cache[file]); }
					} else {
						if (!loaders[file]) {
							loaders[file] = [];
							if (callback) { loaders[file].push(callback); }
							read(file, function (error, data) {
								if (error) {
									loaded(error, file, undefined);
								} else {
									try {
										var blank = parse(data);
										if (_ect.options.useCache) {
											cache[file] = blank;
										}
										loaded(undefined, file, blank);
										if (_ect.options.watchForChanges) {
											watchers[file] = fs.watch(file, function () {
												watchers[file].close();
												delete (watchers[file]);
												delete (cache[file]);
											});
										}
									} catch (e) {
										e.message = e.message.replace(/ on line \d+/, '') + ' in ' + file;
										loaded(e, file, undefined);
									}
								}
							});
						} else {
							if (callback) { loaders[file].push(callback); }
						}
					}
				},

				Template = function (file, data, customData) {
					this.file = file;
					if (Object.prototype.toString.call(_ect.options.root) === '[object String]') {
						this.file = path.normalize((_ect.options.root.length ? (_ect.options.root + '/') : '') + file + _ect.options.ext);
					}
					this.data = data;
					if (customData) {
						for (var field in customData) {
							this.data[field] = customData[field];
						}
					}
					this.buffer = [];
					this.tmpBuffer = undefined;
					this.watcher = undefined;
					this.line = 1;
					this.partials = [];
					this.childData = [];
					this.childError = undefined;
					this.childCallback = undefined;
					this.callback = undefined;
					this.blocks = {};
				};

			Template.prototype.blockStart = function (name) {
				this.tmpBuffer = this.buffer;
				if (!this.blocks[name]) { this.blocks[name] = []; }
				if (!this.blocks[name].length) {
					this.buffer = this.blocks[name];
				} else {
					this.buffer = [];
				}
			};

			Template.prototype.blockEnd = function () {
				this.buffer = this.tmpBuffer;
				delete (this.tmpBuffer);
			};

			Template.prototype.partial = function (template, customData) {
				var
					part = [],
					page = new Template(template, this.data, customData);
				page.blocks = this.blocks;
				this.partials.push(function (callback) {
					page.render(function (error, html) {
						if (!error) { part.push(html); }
						callback(error);
					});
				});
				return part;
			};

			Template.prototype.extend = function (template, customData) {
				var
					page = new Template(template, this.data, customData),
					callback = this.callback;
				page.blocks = this.blocks;
				this.callback = function (error, data) {
					page.render(callback);
					if (error) {
						page.childError = error;
						if (page.childCallback) { page.childCallback(error); }
					} else {
						page.childData.push(data);
						if (page.childCallback) { page.childCallback(); }
					}
				};
				page.partials.push(function (callback) {
					if (page.childError) {
						callback(page.childError);
					} else if (page.childData.length) {
						callback();
					} else {
						page.childCallback = callback;
					}
				});
				return '';
			};

			Template.prototype.content = function (block) {
				if (block && block.length) {
					if (!this.blocks[block]) { this.blocks[block] = []; }
					return this.blocks[block];
				}
				return this.childData;
			};

			Template.prototype.render = function (callback) {
				var that = this;
				this.callback = callback;
				load(this.file, function (error, blank) {
					if (error) {
						if (that.callback) { that.callback(error, undefined); }
					} else {
						try {
							var buffer = blank.call(
								that.data,
								that,
								function() { return that.partial.apply(that, arguments); },
								function() { return that.extend.apply(that, arguments); },
								function() { return that.blockStart.apply(that, arguments); },
								function() { return that.content.apply(that, arguments); }
							);
							async.parallel(that.partials, function (error) {
								var html = '', length, i;
								if (!error) {
									for (i = 0, length = buffer.length; i < length; i++) {
										if (buffer[i] === undefined) continue;
										html += (Array.isArray(buffer[i])) ? buffer[i].join('') : buffer[i];
									}
								}
								if (that.callback) { that.callback(error, html); }
							});
						} catch (e) {
							e.message = e.message + ' in ' + that.file + ' on line ' + that.line;
							if (that.callback) { that.callback(e, undefined); }
						}
					}
				});
			};

			Template.prototype.escape = function (html) {
				return String(html)
					.replace(/&/g, '&amp;')
					.replace(/</g, '&lt;')
					.replace(/>/g, '&gt;')
					.replace(/"/g, '&quot;');
			};

			this.configure = function (options) {
				var option;
				options = options || {};
				for (option in options) {
					if (typeof this.options[option] === 'undefined') continue;
					this.options[option] = options[option];
				}
			};

			this.render = function (template, data, callback) {
				if ('function' == typeof data) {
					callback = data, data = {};
				}
				var tpl = new Template(template, data);
				tpl.render(callback);
			};

			this.configure(options);
		};

	if (typeof module !== 'undefined' && module.exports) {
		fs = require('fs');
		path = require('path');
		CoffeeScript = require('coffee-script');
		module.exports = ect;
	} else {
		if (!Array.prototype.filter) {
			Array.prototype.filter = function (fun, thisp) {
				var
					len = this.length,
					res = [],
					i,
					val;
				if (typeof fun !== 'function') { throw new TypeError(); }
				for (i = 0; i < len; i++) {
					if (i in this) {
						val = this[i];
						if (fun.call(thisp, val, i, this)) { res.push(val); }
					}
				}
				return res;
			};
		}

		if (!Array.prototype.forEach) {
			Array.prototype.forEach = function (fun, thisp) {
				var
					len = this.length,
					i;
				if (typeof fun !== 'function') { throw new TypeError(); }
				for (i = 0; i < len; i++) {
					if (i in this) {
						fun.call(thisp, this[i], i, this);
					}
				}
			};
		}

		if (!Array.isArray) {
			Array.isArray = function (obj) {
				return Object.prototype.toString.call(obj) === '[object Array]';
			};
		}

		var cbSplit;

		if (!cbSplit) {
			cbSplit = function (str, separator, limit) {
				if (Object.prototype.toString.call(separator) !== '[object RegExp]') {
					return cbSplit.nativeSplit.call(str, separator, limit);
				}
				var
					output = [],
					lastLastIndex = 0,
					flags = (separator.ignoreCase ? 'i' : '') +
					(separator.multiline  ? 'm' : '') +
					(separator.sticky     ? 'y' : ''),
					separator2, match, lastIndex, lastLength;

				separator = new RegExp(separator.source, flags + 'g');

				str = str + '';

				if (!cbSplit.compliantExecNpcg) {
					separator2 = new RegExp('^' + separator.source + '$(?!\\s)', flags);
				}

				if (limit === undefined || +limit < 0) {
					limit = Infinity;
				} else {
					limit = Math.floor(+limit);
					if (!limit) {
						return [];
					}
				}

				while ((match = separator.exec(str))) {
					lastIndex = match.index + match[0].length;
					if (lastIndex > lastLastIndex) {
						output.push(str.slice(lastLastIndex, match.index));

						if (!cbSplit.compliantExecNpcg && match.length > 1) {
							match[0].replace(separator2, function () {
								var i;
								for (i = 1; i < arguments.length - 2; i++) {
									if (arguments[i] === undefined) {
										match[i] = undefined;
									}
								}
							});
						}

						if (match.length > 1 && match.index < str.length) {
							Array.prototype.push.apply(output, match.slice(1));
						}

						lastLength = match[0].length;
						lastLastIndex = lastIndex;

						if (output.length >= limit) {
							break;
						}
					}

					if (separator.lastIndex === match.index) {
						separator.lastIndex++;
					}
				}

				if (lastLastIndex === str.length) {
					if (lastLength || !separator.test('')) {
						output.push('');
					}
				} else {
					output.push(str.slice(lastLastIndex));
				}

				return output.length > limit ? output.slice(0, limit) : output;
			};

			cbSplit.compliantExecNpcg = /()??/.exec('')[1] === undefined;
			cbSplit.nativeSplit = String.prototype.split;
		}

		String.prototype.split = function (separator, limit) {
			return cbSplit(this, separator, limit);
		};

		window.ect = ect;
		CoffeeScript = window.CoffeeScript;
		path = (function () {
			var
				normalizeArray = function (parts, allowAboveRoot) {
					var up = 0, i, last;
					for (i = parts.length - 1; i >= 0; i--) {
						last = parts[i];
						if (last === '.') {
							parts.splice(i, 1);
						} else if (last === '..') {
							parts.splice(i, 1);
							up++;
						} else if (up) {
							parts.splice(i, 1);
							up--;
						}
					}
					if (allowAboveRoot) {
						while (up) {
							parts.unshift('..');
							up--;
						}
					}
					return parts;
				},

				normalize = function (path) {
					var
						isAbsolute = path.charAt(0) === '/',
						trailingSlash = path.slice(-1) === '/';
					path = normalizeArray(path.split('/').filter(function (p) {
						return !!p;
					}), !isAbsolute).join('/');
					if (!path && !isAbsolute) {
						path = '.';
					}
					if (path && trailingSlash) {
						path += '/';
					}
					return (isAbsolute ? '/' : '') + path;
				};

			return {
				normalize: normalize
			};
		}());

		var AjaxObject = function (url, callbackFunction) {
			var that = this;
			this.updating = false;

			this.abort = function () {
				if (that.updating) {
					that.updating = false;
					that.AJAX.abort();
					that.AJAX = null;
				}
			};

			this.update = function () {
				if (that.updating) { return false; }
				that.AJAX = null;
				if (window.XMLHttpRequest) {
					that.AJAX = new XMLHttpRequest();
					if (that.AJAX.overrideMimeType) { that.AJAX.overrideMimeType('text/html'); }
				} else {
					that.AJAX = new ActiveXObject('Microsoft.XMLHTTP');
				}
				if (that.AJAX === null) {
					return false;
				}
				that.AJAX.onreadystatechange = function () {
					if (that.AJAX.readyState === 4) {
						that.updating = false;
						that.callback(that.AJAX.responseText, that.AJAX.status, that.AJAX.responseXML);
						that.AJAX = null;
					}
				};
				that.updating = new Date();
				that.AJAX.open('GET', url, true);
				that.AJAX.send(null);
				return true;
			};

			this.callback = callbackFunction || function () { };
		};

		fs = (function () {
			var
				readFile = function (file, encoding, callback) {
					var request = new AjaxObject(file, function (data, status) {
						if (status < 200 || status > 399) {
							callback('Failed to load template');
						} else {
							callback(undefined, data);
						}
					});
					try {
						request.update();
					} catch (e) {
						callback(e);
					}
				},
				watch = function () {};

			return {
				readFile: readFile,
				watch: watch
			};
		}());

	}
}());