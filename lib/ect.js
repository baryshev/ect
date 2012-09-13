/*!
 * ECT CoffeeScript template engine v0.2.4
 * https://github.com/baryshev/ect
 *
 * Copyright 2012, Vadim M. Baryshev <vadimbaryshev@gmail.com>
 * Licensed under the MIT license
 * https://github.com/baryshev/ect/LICENSE
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

		ECT = function (options) {
			if (!(this instanceof ECT)) {
				return new ECT(options);
			}
			var ect = this;

			this.options = {
				open : '<%',
				close : '%>',
				ext : '',
				cache : false,
				watch : false,
				root : ''
			};

			var
				trimExp = /^\s+|\s+$/g,
				newlineExp = /\n/g,
				cache = {},
				loaders = {},
				watchers = {},
				indentChars = { ':' : ':', '>' : '>' },

				regExpEscape = function (str) {
					return String(str).replace(/([.*+?\^=!:${}()|\[\]\/\\])/g, '\\$1');
				},

				iterate = function (arr, iterator, callback) {
					if (!arr.length) {
						return callback();
					}
					var completed = 0;
					for (var i = 0; i < arr.length; i++) {
						iterator(arr[i], function (error) {
							if (error) {
								callback(error);
								callback = function () {};
							} else {
								completed++;
								if (completed === arr.length) {
									callback();
								}
							}
						});
					}
				},

				parse = function (html) {
					var
						lineNo = 1,
						bufferStack = [ '__ectTemplate.buffer' ], bufferStackPointer = 0,
						buffer = bufferStack[bufferStackPointer] + '.push \'',
						indentChar,
						matches = html.split(new RegExp(regExpEscape(ect.options.open) + '((?:.|[\r\n])+?)(?:' + regExpEscape(ect.options.close) + '|$)')),
						text, command, line,
						prefix, postfix, newline, indentation = '', indent = false, indentStack = [], indentStackPointer = -1;

					for (var i = 0; i < matches.length; i++) {
						text = matches[i];
						command = '';
						if (i % 2 === 1) {
							line = '__ectTemplate.line = ' + lineNo;
							switch (text.charAt(0)) {
							case '=':
								prefix = '\', __ectTemplate.empty(' + line + '), __ectTemplate.escape(';
								postfix = '), \'';
								newline = '';
								text = text.substr(1);
								break;
							case '-':
								prefix = '\', __ectTemplate.empty(' + line + '), (';
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

							command = text.split(/[^a-z]+/)[0];
							if ((indentChar = indentChars[text.charAt(text.length - 1)])) {
								text = text.replace(/:$/, '').replace(trimExp, '');
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
								prefix = '\', __ectTemplate.empty(' + line + '), (';
								postfix = '), \'';
								buffer += prefix.replace(newlineExp, '\n' + indentation) + text + postfix.replace(newlineExp, '\n' + indentation);
								break;
							case 'content' :
								prefix = '\', __ectTemplate.empty(' + line + '), (';
								postfix = '), \'';
								if (text === 'content') {
									postfix = '()' + postfix;
								}
								buffer += prefix.replace(newlineExp, '\n' + indentation) + text + postfix.replace(newlineExp, '\n' + indentation);
								break;
							case 'end' :
								prefix = '\'';
								switch (indentStack[indentStackPointer]) {
								case 'block' :
									prefix = '\'\n__ectTemplate.blockEnd(';
									postfix = ')\n' + bufferStack[bufferStackPointer] + '.push \'';
									buffer += prefix.replace(newlineExp, '\n' + indentation) + postfix.replace(newlineExp, '\n' + indentation);
									break;
								case 'when' :
									postfix = '\n' + bufferStack[bufferStackPointer] + '.push \'\'';
									buffer += prefix.replace(newlineExp, '\n' + indentation) + postfix.replace(newlineExp, '\n' + indentation);
									indentation = indentation.substr(2);
									break;
								case 'function' :
									prefix = '\'\n' + bufferStack[bufferStackPointer] + '.join \'\'';
									buffer += prefix.replace(newlineExp, '\n' + indentation);
									indentation = indentation.substr(2);
									bufferStack.pop();
									bufferStackPointer--;
									postfix = '\n' + bufferStack[bufferStackPointer] + '.push \'';
									buffer += postfix.replace(newlineExp, '\n' + indentation);
									break;
								case 'switch' :
									prefix = '\n' + line + '';
									indentation = indentation.substr(2);
								default :
									if (indentStack[indentStackPointer - 1] === 'switch') {
										postfix = '';
									}
									indentation = indentation.substr(2);
									buffer += prefix.replace(newlineExp, '\n' + indentation) + postfix.replace(newlineExp, '\n' + indentation);
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
								buffer += prefix.replace(newlineExp, '\n' + indentation);
								if (indentStack[indentStackPointer - 1] === 'if') {
									indentStack.splice(-2, 1);
									indentStackPointer--;
									indentation = indentation.substr(2);
								}
								buffer += (newline.length ? newline + indentation : '') + text;
								if (indent) {
									indentation += '  ';
									indent = false;
								}
								buffer += postfix.replace(newlineExp, '\n' + indentation);
								break;
							case 'switch' :
								buffer += prefix.replace(newlineExp, '\n' + indentation) + (newline.length ? newline + indentation : '') + text;
								if (indent) {
									indentation += '  ';
									indent = false;
								}
								break;
							case 'when' :
								buffer += (newline.length ? newline + indentation : '') + text;
								if (indent) {
									indentation += '  ';
									indent = false;
								}
								buffer += postfix.replace(newlineExp, '\n' + indentation);
								break;
							default :
								buffer += prefix.replace(newlineExp, '\n' + indentation) + (newline.length ? newline + indentation : '') + text;
								if (indent) {
									indentation += '  ';
									indent = false;
								}
								buffer += postfix.replace(newlineExp, '\n' + indentation);
								break;
							}
						} else {
							if (indentStack[indentStackPointer] !== 'switch') {
								buffer += text.replace(/[\\']/g, '\\$&').replace(/\r/g, '').replace(newlineExp, '\\n');
							}
						}
						lineNo += text.split(newlineExp).length - 1;
					}
					buffer += '\'\nreturn __ectTemplate.buffer';
					return new Function('__ectTemplate', 'partial', 'extend', 'block', 'content', CoffeeScript.compile(buffer, { bare : true }));
				},

				loaded = function (error, file, blank) {
					var callbacks = loaders[file];
					delete (loaders[file]);
					for (var i = 0; i < callbacks.length; i++) {
						callbacks[i](error, blank);
					}
				},

				read = function (file, callback) {
					if (Object.prototype.toString.call(ect.options.root) === '[object Object]') {
						try {
							var data = eval('(options.root.' + file + ')');
							if (Object.prototype.toString.call(data) === '[object String]') {
								callback(undefined, data);
							} else {
								callback(new Error ('Failed to load template ' + file));
							}
						} catch (e) {
							callback(e);
						}
					} else {
						fs.readFile(file, 'utf8', callback);
					}
				},

				load = function (file, callback) {
					if (ect.options.cache && cache[file]) {
						if (callback) { callback(undefined, cache[file]); }
					} else {
						if (!loaders[file]) {
							loaders[file] = [];
							if (callback) { loaders[file].push(callback); }
							read(file, function (error, data) {
								if (error) {
									loaded(error, file);
									return;
								}

								try {
									var blank = parse(data);
									if (ect.options.cache) {
										cache[file] = blank;
									}
									loaded(undefined, file, blank);
									if (ect.options.watch) {
										watchers[file] = fs.watch(file, function () {
											watchers[file].close();
											delete (watchers[file]);
											delete (cache[file]);
										});
									}
								} catch (e) {
									e.message = e.message.replace(/ on line \d+/, '') + ' in ' + file;
									loaded(e, file);
								}
							});
						} else {
							if (callback) { loaders[file].push(callback); }
						}
					}
				},

				Template = function (file, data, customData) {
					this.file = file;
					if (Object.prototype.toString.call(ect.options.root) === '[object String]') {
						this.file = path.normalize((ect.options.root.length ? (ect.options.root + '/') : '') + file + ect.options.ext);
					}
					this.data = data;
					if (customData) {
						for (var field in customData) {
							this.data[field] = customData[field];
						}
					}
					this.buffer = [];
					this.tmpBuffer = undefined;
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
				this.callback = callback || function () {};
				load(this.file, function (error, blank) {
					if (error) {
						that.callback(error);
						return;
					}
					try {
						var buffer = blank.call(
							that.data,
							that,
							function() { return that.partial.apply(that, arguments); },
							function() { return that.extend.apply(that, arguments); },
							function() { return that.blockStart.apply(that, arguments); },
							function() { return that.content.apply(that, arguments); }
						);
						iterate(that.partials, function(partial, callback) {
							partial(callback);
						}, function (error) {
							if (error) {
								that.callback(error);
								return;
							}
							that.callback(error, buffer.join(''));
						});
					} catch (e) {
						e.message = e.message + ' in ' + that.file + ' on line ' + that.line;
						that.callback(e);
					}
				});
			};

			Template.prototype.escape = function (html) {
				if (typeof html === 'undefined') return '';
				return String(html)
					.replace(/&/g, '&amp;')
					.replace(/</g, '&lt;')
					.replace(/>/g, '&gt;')
					.replace(/"/g, '&quot;');
			};

			Template.prototype.empty = function () { return ''; };

			this.configure = function (options) {
				options = options || {};
				for (var option in options) {
					if (typeof this.options[option] === 'undefined') continue;
					this.options[option] = options[option];
				}
			};

			this.render = function (template, data, callback) {
				if (typeof data === 'function') {
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
		module.exports = ECT;
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

		window.ECT = ECT;
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
							callback(new Error ('Failed to load template ' + file));
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