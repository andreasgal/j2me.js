/* -*- Mode: Java; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* vim: set shiftwidth=2 tabstop=2 autoindent cindent expandtab: */

'use strict';

var JARStore = (function() {
  var DATABASE = "JARStore";
  var VERSION = 1;
  var OBJECT_STORE = "files";

  var database;
  var jars = new Map();

  var upgrade = {
    "0to1": function(database, transaction, next) {
      database.createObjectStore(OBJECT_STORE);
      next();
    },
  };

  var openDatabase = new Promise(function(resolve, reject) {
    var request = indexedDB.open(DATABASE, VERSION);

    request.onerror = function() {
      console.error("error opening database: " + request.error.name);
      reject(request.error.name);
    };

    request.onupgradeneeded = function(event) {
      var database = request.result;
      var transaction = request.transaction;

      var version = event.oldVersion;
      (function next() {
        if (version < event.newVersion) {
          upgrade[version + "to" + ++version](database, transaction, next);
        }
      })();
    };

    request.onsuccess = function() {
      database = request.result;
      resolve();
    };
  });

  function addBuiltInJAR(jarName, jarData) {
    var zip = new ZipFile(jarData, false);

    jars.set(jarName, {
      data: zip.directory,
      isBuiltIn: true,
    });
  }

  function installJAR(jarName, jarData) {
    return openDatabase.then(function() {
      return new Promise(function(resolve, reject) {
        var zip = new ZipFile(jarData, true);

        var transaction = database.transaction(OBJECT_STORE, "readwrite");
        var objectStore = transaction.objectStore(OBJECT_STORE);
        var request = objectStore.put(zip.directory, jarName);

        request.onerror = function() {
          console.error("Error installing: " + request.error.name);
          reject(request.error.name);
        };

        transaction.oncomplete = function() {
          jars.set(jarName, {
            data: zip.directory,
            isBuiltIn: false,
          });
          resolve();
        };
      });
    });
  }

  function loadJAR(jarName) {
    return openDatabase.then(function() {
      return new Promise(function(resolve, reject) {
        var transaction = database.transaction(OBJECT_STORE, "readonly");
        var objectStore = transaction.objectStore(OBJECT_STORE);
        var request = objectStore.get(jarName);

        request.onerror = function() {
          console.error("Error loading: " + request.error.name);
          reject(request.error.name);
        };

        transaction.oncomplete = function() {
          console.log(request.result);
          jars.set(jarName, {
            data: request.result,
            isBuiltIn: false,
          });
          resolve();
        };
      });
    });
  }

  function loadFileFromJAR(jarName, fileName) {
    var jar = jars.get(jarName);
    if (!jar) {
      return null;
    }

    var entry = jar.data[fileName];

    if (!entry) {
      return null;
    }

    if (entry.compression_method === 0) {
      return entry.compressed_data;
    } else {
      return inflate(entry.compressed_data);
    }
  }

  function loadFile(fileName) {
    for (var jarName of jars.keys()) {
      var data = loadFileFromJAR(jarName, fileName);
      if (data) {
        return data;
      }
      J2ME.stderrWriter.writeLn(fileName + " not found");
    }
  }

  function clear() {
    return openDatabase.then(function() {
      return new Promise(function(resolve, reject) {
        jars.clear();

        var transaction = database.transaction(OBJECT_STORE, "readwrite");
        var objectStore = transaction.objectStore(OBJECT_STORE);
        var request = objectStore.clear();

        request.onerror = function() {
          console.error("Error clearing: " + request.error.name);
          reject(request.error.name);
        };

        request.onsuccess = function() {
          resolve();
        };
      });
    });
  }

  return {
    addBuiltInJAR: addBuiltInJAR,
    installJAR: installJAR,
    loadJAR: loadJAR,
    loadFileFromJAR: loadFileFromJAR,
    loadFile: loadFile,
    clear: clear,
  };
})();

if (typeof module === 'object') {
  module.exports.JARStore = JARStore;
}