if (typeof window === 'undefined') {
    self = require("sdk/self");
    var tabs = require("sdk/tabs");
    window = require("sdk/window/utils").getMostRecentBrowserWindow();
    window.isModule = true;
    mono = require('./mono.js');
}
var init = function (env, lang) {
    if (env) {
        mono = mono.init(env);
        window.get_lang = lang.get_lang;
    }
    mono.pageId = 'bg';
    bg.boot();
};
var bg = function() {
    /**
     * @namespace chrome
     * @namespace chrome.omnibox
     * @namespace chrome.omnibox.onInputEntered
     * @namespace chrome.omnibox.onInputEntered.addListener
     * @namespace chrome.tabs
     * @namespace chrome.contextMenus
     * @namespace chrome.removeAll
     * @namespace chrome.browserAction
     * @namespace chrome.browserAction.onClicked
     * @namespace chrome.browserAction.setPopup
     */
    var _lang, btn_init, var_cache = {};
    var add_in_omnibox = function(enable) {
        if (enable !== 1) {
            return;
        }
        if (mono.isChrome) {
            chrome.omnibox.onInputEntered.addListener(function (text) {
                chrome.tabs.create({
                    url: "index.html" + ( (text.length > 0) ? '#?search=' + text : ''),
                    selected: true
                });
            });
        }
    };
    var update_context_menu = function(enable) {
        if (mono.isChrome) {
            chrome.contextMenus.removeAll(function () {
                if (!enable) {
                    return;
                }
                chrome.contextMenus.create({
                    type: "normal",
                    id: "item",
                    title: _lang.ctx_title,
                    contexts: ["selection"],
                    onclick: function (info) {
                        var text = info.selectionText;
                        chrome.tabs.create({
                            url: 'index.html' + ( (text.length > 0) ? '#?search=' + text : ''),
                            selected: true
                        });
                    }
                });
            });
        }
        if (mono.isFF) {
            if (enable && var_cache.cm_state) {
                return;
            }
            var contentScript = (function() {
                var onContext = function() {
                    self.on("click", function() {
                        var text = window.getSelection().toString();
                        self.postMessage(text);
                    });
                };
                var minifi = function(str) {
                    var list = str.split('\n');
                    var newList = [];
                    list.forEach(function(line) {
                        newList.push(line.trim());
                    });
                    return newList.join('');
                };
                var onClickString = onContext.toString();
                var n_pos =  onClickString.indexOf('\n')+1;
                onClickString = onClickString.substr(n_pos, onClickString.length - 1 - n_pos).trim();
                return minifi(onClickString);
            })();
            var cm = require("sdk/context-menu");

            if (var_cache.topLevel) {
                var_cache.topLevel.parentMenu.removeItem(var_cache.topLevel);
            }

            if (!enable) {
                var_cache.cm_state = false;
                var_cache.topLevel = undefined;
                return;
            }

            var_cache.topLevel = cm.Item({
                label: _lang.ctx_title,
                context: cm.SelectionContext(),
                image: self.data.url('./icons/icon-16.png'),
                contentScript: contentScript,
                onMessage: function (text) {
                    tabs.open( self.data.url('index.html')+'#?search='+text );
                }
            });
            var_cache.cm_state = true;
        }
    };
    var init_btn_action = function() {
        chrome.browserAction.onClicked.addListener(function() {
            if (!var_cache.popup) {
                chrome.tabs.create({
                    url: 'index.html'
                });
            }
        });
    };
    var update_btn_action = function() {
        if (!btn_init) {
            init_btn_action();
            btn_init = true;
        }
        chrome.browserAction.setPopup({
            popup: (var_cache.popup)?'popup.html':''
        });
    };
    var getOptions = function() {
        var id = 'tms-options-window';
        var win = chrome.app.window.get(id);
        if (win !== null) {
            return win.focus();
        }
        var mainWin = chrome.app.window.get('tms-main-window');
        if (mainWin !== null) {
            mainWin.close();
        }
        chrome.app.window.create('options.html', {
            bounds: {width: 1024, height: 768},
            resizable: true,
            id: id
        });
    };
    var getHistory = function() {
        var id = 'tms-history-window';
        var win = chrome.app.window.get(id);
        if (win !== null) {
            return win.focus();
        }
        chrome.app.window.create('history.html', {
            bounds: {width: 1024, height: 768},
            resizable: true,
            id: id
        });
    };
    var getSearch = function(query) {
        var id = 'tms-main-window';
        var win = chrome.app.window.get(id);
        if (win !== null) {
            mono.sendMessage({action: 'tmp-search', data: query});
            return win.focus();
        }
        chrome.app.window.create('index.html'+( query?'#?search='+query:'' ), {
            bounds: {width: 1024, height: 768},
            resizable: true,
            id: id
        });
    };
    return {
        boot: function() {
            if ( mono.isChromeFullApp) {
                chrome.app.runtime.onLaunched.addListener(function() {
                    getSearch();
                });
                mono.onMessage(function(message) {
                    if (message.action === 'search') {
                        return getSearch(message.data);
                    }
                    if (message.action === 'getHistory') {
                        return getHistory();
                    }
                    if (message.action === 'getOptions') {
                        return getOptions();
                    }
                });
                return;
            }
            mono.storage.get('lang', function(storage) {
                _lang = window.get_lang( storage.lang || window.navigator.language.substr(0, 2) );
                mono.onMessage(function(message) {
                    if (message === 'bg_update') {
                        bg.update();
                    }
                });
                bg.update();
            });
        },
        update: function() {
            mono.storage.get(['add_in_omnibox', 'context_menu', 'search_popup'], function(storage) {
                if (storage.add_in_omnibox === undefined) {
                    storage.add_in_omnibox = 1;
                }
                if (storage.context_menu === undefined) {
                    storage.context_menu = 1;
                }
                if (storage.search_popup === undefined) {
                    storage.search_popup = 1;
                }
                add_in_omnibox(storage.add_in_omnibox);
                update_context_menu(storage.context_menu);
                if (mono.isChrome && !mono.isChromeApp) {
                    var_cache.popup = storage.search_popup;
                    update_btn_action();
                }
            });
        }
    };
}();
if (window.isModule) {
    exports.init = init;
} else {
    init();
}