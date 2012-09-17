/*!
 * ECT CoffeeScript template engine v0.2.10
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
	var fs;
	var path;
	var CoffeeScript;

	var	ECT = function (options) {
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
			paramExp = /(partial|extend|block)\s+('|")([^'"]+)('|")/,
			cache = {},
			loaders = {},
			watchers = {},
			indentChars = { ':' : ':', '>' : '>' },
			escapeExp = /&|<|>|"/g,
			escapedChars = { '&' : '&amp;', '<' : '&lt;', '>' : '&gt;', '"' : '&quot;' },
			escapeHandler = function (char) { return escapedChars[char]; },

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

			parse = function (template, callback) {
				var
					lineNo = 1,
					bufferStack = [ '__ectOutput' ], bufferStackPointer = 0,
					buffer = '__ectExtend = undefined\n' + bufferStack[bufferStackPointer] + ' = \'',
					matches = template.split(new RegExp(regExpEscape(ect.options.open) + '((?:.|[\r\n])+?)(?:' + regExpEscape(ect.options.close) + '|$)')),
					text, command, line, dependencies = [],
					prefix, postfix, newline,
					indentChar, indentation = '', indent = false, indentStack = [], indentStackPointer = -1, extend;

				for (var i = 0; i < matches.length; i++) {
					text = matches[i];
					command = '';
					if (i % 2 === 1) {
						line = '__ectFileInfo.line = ' + lineNo;
						switch (text.charAt(0)) {
						case '=':
							prefix = '\' + (' + line + '\n\'\') + __ectTemplateContext.escape(';
							postfix = ') + \'';
							newline = '';
							text = text.substr(1);
							break;
						case '-':
							prefix = '\' + (' + line + '\n\'\') + ((';
							postfix = ') ? \'\') + \'';
							newline = '';
							text = text.substr(1);
							break;
						default:
							prefix = '\'\n' + line;
							postfix = '\n' + bufferStack[bufferStackPointer] + ' += \'';
							newline = '\n';
						}
						text = text.replace(trimExp, '');

						command = text.split(/[^a-z]+/)[0];
						if ((indentChar = indentChars[text.charAt(text.length - 1)])) {
							text = text.replace(/:$/, '').replace(trimExp, '');
							if (indentChar === '>') {
								bufferStack.push('__ectFunction' + bufferStackPointer);
								bufferStackPointer++;
								postfix = '\n' + bufferStack[bufferStackPointer] + ' = \'';
								command = 'function';
							}
							indentStack.push(command);
							indentStackPointer++;
							indent = true;
						}
						switch (command) {
						case 'partial' :
							dependencies.push(text.replace(paramExp, '$3'));
							prefix = '\' + (' + line + '\n\'\') + (';
							postfix = ') + \'';
							buffer += prefix.replace(newlineExp, '\n' + indentation) + text + postfix.replace(newlineExp, '\n' + indentation);
							break;
						case 'block' :
							bufferStack.push('__ectTemplateContext.blocks[\'' + text.replace(paramExp, '$3') + '\']');
							bufferStackPointer++;
							prefix = '\'\n';
							postfix = '\n' + bufferStack[bufferStackPointer] + ' += \'';
							text = 'if ' + text;
							buffer += prefix.replace(newlineExp, '\n' + indentation) + text;
							if (indent) {
								indentation += '  ';
								indent = false;
							}
							buffer += postfix.replace(newlineExp, '\n' + indentation);
							break;
						case 'content' :
							prefix = '\' + (' + line + '\n\'\') + (';
							postfix = ') + \'';
							if (text === 'content') {
								text = 'if __ectChildContent then __ectChildContent else \'\''
							}
							buffer += prefix.replace(newlineExp, '\n' + indentation) + text + postfix.replace(newlineExp, '\n' + indentation);
							break;
						case 'end' :
							prefix = '\'';
							switch (indentStack[indentStackPointer]) {
							case 'block' :
								bufferStack.pop();
								bufferStackPointer--;
								prefix = '\'';
								postfix = '\n' + bufferStack[bufferStackPointer] + ' += \'';
								buffer += prefix.replace(newlineExp, '\n' + indentation);
								indentation = indentation.substr(2);
								buffer += postfix.replace(newlineExp, '\n' + indentation);
								break;
							case 'when' :
								postfix = '\n' + bufferStack[bufferStackPointer] + ' += \'\'';
								buffer += prefix.replace(newlineExp, '\n' + indentation) + postfix.replace(newlineExp, '\n' + indentation);
								indentation = indentation.substr(2);
								break;
							case 'function' :
								prefix = '\'\n' + bufferStack[bufferStackPointer];
								buffer += prefix.replace(newlineExp, '\n' + indentation);
								indentation = indentation.substr(2);
								bufferStack.pop();
								bufferStackPointer--;
								postfix = '\n' + bufferStack[bufferStackPointer] + ' += \'';
								buffer += postfix.replace(newlineExp, '\n' + indentation);
								break;
							case 'switch' :
								prefix = '\n' + line;
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
						case 'extend' :
								extend = text.replace(paramExp, '$3');
								dependencies.push(extend);
								prefix = '\'';
								postfix = '\n' + bufferStack[bufferStackPointer] + ' += \'';
								text = '__ectExtend = \'' + extend + '\'';
								buffer += prefix.replace(newlineExp, '\n' + indentation) + (newline.length ? newline + indentation : '') + text + postfix.replace(newlineExp, '\n' + indentation);
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
				buffer += '\'\nif not __ectExtend\n  return __ectOutput\nelse\n  __ectFileInfo.file = __ectTemplateContext.compiled[\'' + extend + '\'].file\n  __ectFileInfo.line = 1\n  return __ectTemplateContext.compiled[\'' + extend + '\'].compiled.call(this, __ectTemplateContext, __ectFileInfo, partial, content, block, __ectOutput)';
				try {
					var compiled = Function('__ectTemplateContext', '__ectFileInfo', 'partial', 'content', 'block', '__ectChildContent', CoffeeScript.compile(buffer, { bare : true }));
					callback(undefined, compiled, dependencies);
				} catch (e) {
					callback(e);
				}
			},

			loaded = function (error, file) {
				var callbacks = loaders[file];
				delete (loaders[file]);
				for (var i = 0; i < callbacks.length; i++) {
					callbacks[i](error);
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
					fs.readFile(file, 'utf8', function (error, data) {
						if (error) {
							error = new Error ('Failed to load template ' + error.path)
						}
						callback(error, data);
					});
				}
			};

		var TemplateContext = function (data) {
			this.compiled = {};
			this.blocks = {};
			this.data = data;
		};

		TemplateContext.prototype.escape = function (text) {
			var type = typeof text;
			if (type === 'undefined') return '';
			if (type !== 'string') return text;
			return text.replace(escapeExp, escapeHandler);
		};

		TemplateContext.prototype.block = function (name) {
			if (!this.blocks[name]) { this.blocks[name] = ''; }
			return !this.blocks[name].length;
		};
	
		TemplateContext.prototype.partial = function (template, data) {
			return this.render(template, data);
		};
	
		TemplateContext.prototype.content = function (block) {
			if (block && block.length) {
				if (!this.blocks[block]) { return ''; }
				return this.blocks[block];
			} else {
				return '';
			}
		};

		TemplateContext.prototype.load = function (template, callback) {
			var that = this, file;

			if (ect.options.cache && cache[template]) {
				this.compiled[template] = cache[template];
				if (this.compiled[template].dependencies.length === 0) {
					callback();
				} else {
					iterate(cache[template].dependencies, function(template, callback) {
						that.load(template, callback);
					}, function (error) {
						callback(error);
					});
				}
			}	else if (this.compiled[template]) {
				if (this.compiled[template].dependencies.length === 0) {
					callback();
				} else {
					iterate(this.compiled[template].dependencies, function(template, callback) {
						that.load(template, callback);
					}, function (error) {
						callback(error);
					});
				}
			} else {
				if (!loaders[template]) {
					loaders[template] = [ callback ];

					if (Object.prototype.toString.call(ect.options.root) === '[object String]') {
						file = path.normalize((ect.options.root.length ? (ect.options.root + '/') : '') + template + ect.options.ext);
					} else {
						file = template;
					}

					read(file, function (error, data) {
						if (error) {
							loaded(error, template);
							return;
						}

						parse(data, function (error, compiled, dependencies) {
							if (error) {
								error.message = error.message.replace(/ on line \d+/, '') + ' in ' + file;
								loaded(error, template);
								return;
							}

							that.compiled[template] = { compiled : compiled, dependencies : dependencies, file : file };

							if (ect.options.cache) {
								cache[template] = that.compiled[template];
							}

							if (ect.options.watch) {
								watchers[file] = fs.watch(file, function () {
									watchers[file].close();
									delete (watchers[file]);
									delete (cache[template]);
								});
							}

							iterate(dependencies, function(template, callback) {
								that.load(template, callback);
							}, function (error) {
								loaded(error, template);
							});

						});
					});
				} else {
					loaders[template].push(callback);
				}
			}
		};

		TemplateContext.prototype.render = function (template, customData) {
			var that = this, data = {};
			if (this.data) {
				for (var field in this.data) {
					data[field] = this.data[field];
				}
			}

			if (customData) {
				for (var field in customData) {
					data[field] = customData[field];
				}
			}

			var fileInfo = { file : this.compiled[template].file, line : 1 };

			try {
				var output = this.compiled[template].compiled.call(
					data,
					this,
					fileInfo,
					function() { return that.partial.apply(that, arguments); },
					function() { return that.content.apply(that, arguments); },
					function() { return that.block.apply(that, arguments); }
				);
				return output;
			} catch (e) {
				e.message = e.message + ' in ' + fileInfo.file + ' on line ' + fileInfo.line;
				throw e;
			}
		};

		this.configure = function (options) {
			options = options || {};
			for (var option in options) {
				this.options[option] = options[option];
			}
		};

		this.render = function (template, data, callback) {
			if (typeof data === 'function') {
				callback = data, data = {};
			}
			callback = callback || function () {};

			var context = new TemplateContext(data);

			context.load(template, function (error) {
				if (error) {
					callback(error);
					return;
				}
				try {
					var output = context.render(template);
					callback(undefined, output);
				} catch (e) {
					callback(e);
				}
			});

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