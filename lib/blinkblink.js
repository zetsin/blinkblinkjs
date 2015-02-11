'use strict';
var preference = require ('./preference.json');
var path = require ('path');
var child_process = require ('child_process');
var util = require ("util");
var events = require ('events');
var os = require ('os');
var http = require ('http');
var ws = require ('ws');
var blinkblinkjs = {
    open: function (url, name, attribute) {
        var self = this;
        attribute = init_attribute (attribute);
        attribute.app.url = url;
        attribute.app.name = name;
        attribute.app.port = self._port ++;
        attribute.app.user_data_dir = attribute.app.user_data_dir || path.join (os.tmpdir (), 'blinkblinkjs' + self._dir ++);
        attribute.blink.push ('--remote-debugging-port=' + attribute.app.port);
        attribute.blink.push ('--user-data-dir=' + attribute.app.user_data_dir);
        attribute.blink.push (url);
        if (attribute.app.mode === 'app') {
            attribute.blink.push ('--app=' + url);
        }
        var win = new window (attribute);
        win.open ();
        win.on ('close', function (code, signal) {
            delete self.windows[win.attribute.app.port];
            self.length --;
        });
        self.windows[win.attribute.app.port] = win;
        self.length ++;
        return win;
    },
    close: function () {
        var self = this;
        for (var key in self.windows) {
            self.windows[key].close ();
            delete self.windows[key];
            self.length --;
        }
    },
    _dir: Math.random (),
    _port: 9222 + parseInt (Math.random () * 50000),
    windows: {},
    length: 0
};
function init_attribute (attribute) {
    var defalut_attribute = JSON.parse (JSON.stringify (preference));
    if (attribute) {
        for (var key in attribute.app) {
            defalut_attribute.app[key] = attribute.app[key];
        }
        for (var key in attribute.process) {
            defalut_attribute.process[key] = attribute.process[key];
        }
        for (var key in attribute.blink) {
            defalut_attribute.blink.push (attribute.blink[key]);
        }
    }
    return defalut_attribute;
}
function window (attribute) {
    var self = this;
    self.attribute = attribute;
    self._blinks = {};
    self.blinks = {};
    self.length = 0;
    self._sum = 0;
    self._watch_optioin = {
        hostname: self.attribute.app.hostname,
        port: self.attribute.app.port,
        path: '/json'
    };
}
util.inherits (window, events.EventEmitter);
window.prototype.open = function () {
    var self = this;
    self.process = child_process.spawn (self.attribute.app.command, self.attribute.blink, self.attribute.process).on ('error', function (err) {
        self.close (err);
    });
    watchdog ();
    function watchdog () {
        if (! self.closed) {
            http.get (self._watch_optioin, function (response) {
                var data = '';
                response.on ('data', function (chunk) {
                    data += chunk;
                });
                response.on ('end', function () {
                    var blinks_attribute;
                    try {
                        blinks_attribute = JSON.parse (data);
                    }
                    catch (ex) {
                        self.close (ex);
                        return;
                    }
                    for (var index in blinks_attribute) {
                        var blink_attribute = blinks_attribute[index];
                        var id = blink_attribute.id;
                        var debugger_url = blink_attribute.webSocketDebuggerUrl;
                        var url = blink_attribute.url;
                        var title = blink_attribute.title;
                        var type = blink_attribute.type;
                        if (type === 'page' || type === 'background_page') {
                            if (url && title && debugger_url && ! self._blinks[id]) {
                                self._blinks[id] = new_blink (blink_attribute);
                            }
                            else if (self._blinks[id]) {
                                self._blinks[id].attribute = blink_attribute;
                            }
                        }
                    }
                    setTimeout (watchdog, 100);
                });
            }).on ('error', function (err) {
                self.close (err);
            });
        }
    }
    function new_blink (attribute) {
        var b = new blink (attribute);
        b.on ('open', function () {
            if (self._sum === 0) {
                var url = self.attribute.app.url;
                b.attribute.name = self.attribute.app.name;
                b.send ('Runtime.evaluate', {
                    expression: 'window.name="' + b.attribute.name + '"'
                });
                self.emit (b.attribute.name, b);
                self.blinks[b.attribute.name] = b;
                self._sum ++;
                self.length ++;
            }
            else {
                b.send ('Runtime.evaluate', {
                    expression: 'window.name'
                }, function (error, response) {
                    if (! error && response.result) {
                        b.attribute.name = response.result.value;
                        self.emit (b.attribute.name, b);
                        self.blinks[b.attribute.name] = b;
                        self._sum ++;
                        self.length ++;
                    }
                });
            }
        });
        b.on ('close', function (reason) {
            self.length --;
            delete self._blinks[b.attribute.id];
            delete self.blinks[b.attribute.name];
        });
        return b;
    }
};
window.prototype.close = function (err) {
    var self = this;
    if (! self.closed) {
        self.closed = true;
        self.emit ('close', err);
        self.process.kill ('SIGTERM');
    }
};
function blink (attribute) {
    var self = this;
    self.attribute = attribute;
    self._send_id = 1;
    self._callbacks = [];
    self._ws = new ws (self.attribute.webSocketDebuggerUrl);
    self._ws.on ('open', function () {
        self.send ('Runtime.enable');
        self.send ('Console.enable');
        self.send ('Page.enable');
        self.emit ('open');
        self.send ('Runtime.evaluate', {
            expression: 'window.document.readyState'
        }, function (error, response) {
            if (! error && response.result) {
                if (response.result.value === 'interactive') {
                    self.emit ('ready');
                }
                else if (response.result.value === 'complete') {
                    self.emit ('ready');
                    self.emit ('load');
                }
            }
        });
    });
    self._ws.on ('message', function (data) {
        var message = JSON.parse (data);
        if (message.id) {
            var callback = self._callbacks[message.id];
            if (callback) {
                if (message.result) {
                    callback (false, message.result);
                }
                else if (message.error) {
                    callback (true, message.error);
                }
            }
            delete self._callbacks[message.id];
        }
        else if (message.method) {
            if (message.method === 'Inspector.detached') {
                self.emit ('close', message.params);
            }
            else if (message.method === 'Console.messageAdded' && message.params !== undefined && message.params.message && message.params.message.type === 'log') {
                var yan_text = '+_+';
                var text = message.params.message.text;
                var index = text.indexOf ('+_+');
                if (index >= 0) {
                    self.emit (yan_text, text.slice (0, index), text.slice (index + yan_text.length));
                }
            }
            else {
                var index = message.method.indexOf ('.');
                self.emit (message.method.slice (0, index), message.method.slice (index + 1), message.params);
                if (message.method === 'Page.loadEventFired') {
                    self.emit ('load');
                }
                else if (message.method === 'Page.domContentEventFired') {
                    self.emit ('ready');
                }
            }
        }
    });
    self._ws.on ('error', function (err) {
        self.emit ('close', err);
    });
}
util.inherits (blink, events.EventEmitter);
blink.prototype.send = function (method, params, callback) {
    var self = this;
    var id = self._send_id ++;
    if (typeof params === 'function') {
        callback = params;
        params = undefined;
    }
    var message = {
        'id': id,
        'method': method,
        'params': params
    };
    self._ws.send (JSON.stringify (message));
    if (typeof callback === 'function') {
        self._callbacks[id] = callback;
    }
};
blink.prototype.blink = function () {
    var self = this;
    var expr = arguments[0];
    var callback = arguments[1];
    if (typeof expr === 'function') {
        expr = '(' + expr + ')(';
        for (var i = 0; i < arguments.length - 1; i ++) {
            var arg = arguments[i + 1];
            expr += JSON.stringify (arguments[i + 1]);
            if (i !== arguments.length - 1 - 1) {
                expr += ',';
            }
        }
        expr += ')';
    }
    self.send ('Runtime.evaluate', {
        expression: expr
    }, function (error, response) {
        if (typeof callback === 'function') {
            callback (error, response);
        }
    });
};
module.exports = blinkblinkjs;
