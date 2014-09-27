/* -*- Mode: Java; tab-width: 4; indent-tabs-mode: nil; c-basic-offset: 4 -*- */
/* vim: set shiftwidth=4 tabstop=4 autoindent cindent expandtab: */

'use strict';

var Instrument = {
  enter: {},
  exit: {},

  profiling: false,
  profile: null,

  getKey: function(methodInfo) {
    return "name" in methodInfo ? methodInfo.classInfo.className + "." + methodInfo.name + "." + methodInfo.signature
                                : methodInfo.syntheticKey;
  },

  callEnterHooks: function(methodInfo, caller, callee) {
    var key = this.getKey(methodInfo);
    if (Instrument.enter[key]) {
      Instrument.enter[key](caller, callee);
    }

    if (this.profiling) {
      var now = performance.now();

      if (caller.profileData && caller.profileData.then) {
        caller.profileData.cost += now - caller.profileData.then;
        caller.profileData.then = null;
      }

      callee.profileData = {
        cost: 0,
        then: now,
      };
    }
  },

  callExitHooks: function(methodInfo, caller, callee) {
    var key = this.getKey(methodInfo);

    if (this.profiling) {
      var now = performance.now();

      if (callee.profileData) {
        if (callee.profileData.then) {
          callee.profileData.cost += now - callee.profileData.then;
          callee.profileData.then = null;
        }

        var methodProfileData = this.profile[key] || (this.profile[key] = { count: 0, cost: 0 });
        methodProfileData.count++;
        methodProfileData.cost += callee.profileData.cost;
      }

      if (caller.profileData) {
        caller.profileData.then = now;
      }
    }

    if (Instrument.exit[key]) {
      Instrument.exit[key](caller, callee);
    }
  },

  callPauseHooks: function(frame) {
    if (this.profiling && frame.profileData && frame.profileData.then) {
        frame.profileData.cost += performance.now() - frame.profileData.then;
        frame.profileData.then = null;
    }
  },

  callResumeHooks: function(frame) {
    if (this.profiling && frame.profileData) {
      frame.profileData.then = performance.now();
    }
  },

  startProfile: function() {
    this.profile = {};
    this.profiling = true;
  },

  stopProfile: function() {
    var methods = [];

    for (var key in this.profile) {
      methods.push({
        key: key,
        count: this.profile[key].count,
        cost: this.profile[key].cost,
      });
    }

    methods.sort(function(a, b) { return b.cost - a.cost });

    console.log("Profile:");
    // The Web Console displays a maximum of 200 lines, so we need to limit
    // the number of lines we log to it, or our top offenders will scroll off
    // the console before we get a chance to see them.
    var MAX_LENGTH = urlParams.logConsole === "web" ? 100 : 1000;
    var len = (methods.length > MAX_LENGTH) ? MAX_LENGTH : methods.length;
    for (var i = 0; i < len; i++) {
      var method = methods[i];
      console.log(Math.round(method.cost) + "ms " + method.count + " " + method.key);
    }

    this.profiling = false;
  },

  measure: function(Alt, ctx, methodInfo) {
    if (this.profiling) {
      var then = performance.now();
      Alt.invoke(ctx, methodInfo);
      var key = this.getKey(methodInfo);
      var methodProfileData = this.profile[key] || (this.profile[key] = { count: 0, cost: 0 });
      methodProfileData.count++;
      methodProfileData.cost += performance.now() - then;
    } else {
      Alt.invoke(ctx, methodInfo);
    }
  },
};

Instrument.enter["com/sun/midp/ssl/SSLStreamConnection.<init>.(Ljava/lang/String;ILjava/io/InputStream;Ljava/io/OutputStream;Lcom/sun/midp/pki/CertStore;)V"] = function(caller, callee) {
  var _this = caller.stack.read(6), port = caller.stack.read(4), host = util.fromJavaString(caller.stack.read(5));
  _this.logBuffer = "SSLStreamConnection to " + host + ":" + port + ":\n";
};

Instrument.enter["com/sun/midp/ssl/Out.write.(I)V"] = function(caller, callee) {
  var _this = caller.stack.read(3);
  var connection = _this.class.getField("I.ssc.Lcom/sun/midp/ssl/SSLStreamConnection;").get(_this);
  connection.logBuffer += String.fromCharCode(callee.stack.read(1));
};

Instrument.enter["com/sun/midp/ssl/Out.write.([BII)V"] = function(caller, callee) {
  var len = caller.stack.read(1), off = caller.stack.read(2), b = caller.stack.read(3), _this = caller.stack.read(4);
  var connection = _this.class.getField("I.ssc.Lcom/sun/midp/ssl/SSLStreamConnection;").get(_this);
  var range = b.subarray(off, off + len);
  for (var i = 0; i < range.length; i++) {
    connection.logBuffer += String.fromCharCode(range[i] & 0xff);
  }
};

Instrument.exit["com/sun/midp/ssl/In.read.()I"] = function(caller, callee) {
  var _this = caller.stack.read(3);
  var connection = _this.class.getField("I.ssc.Lcom/sun/midp/ssl/SSLStreamConnection;").get(_this);
  connection.logBuffer += String.fromCharCode(callee.stack.read(1));
};

Instrument.exit["com/sun/midp/ssl/In.read.([BII)I"] = function(caller, callee) {
  var len = caller.stack.read(4), off = caller.stack.read(5), b = caller.stack.read(6), _this = caller.stack.read(7);
  var connection = _this.class.getField("I.ssc.Lcom/sun/midp/ssl/SSLStreamConnection;").get(_this);
  var range = b.subarray(off, off + len);
  for (var i = 0; i < range.length; i++) {
    connection.logBuffer += String.fromCharCode(range[i] & 0xff);
  }
};

Instrument.enter["com/sun/midp/ssl/SSLStreamConnection.close.()V"] = function(caller, callee) {
  var _this = caller.stack.read(1);
  if ("logBuffer" in _this) {
    console.log(_this.logBuffer);
    delete _this.logBuffer;
  }
};
