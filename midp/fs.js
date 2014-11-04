/* -*- Mode: Java; tab-width: 4; indent-tabs-mode: nil; c-basic-offset: 4 -*- */
/* vim: set shiftwidth=4 tabstop=4 autoindent cindent expandtab: */

'use strict';

var RECORD_STORE_BASE = "/RecordStore";

Native.create("com/sun/midp/io/j2me/storage/File.initConfigRoot.(I)Ljava/lang/String;", function(storageId) {
    return "assets/" + storageId + "/";
});

Native.create("com/sun/midp/midletsuite/MIDletSuiteStorage.getSecureFilenameBase.(I)Ljava/lang/String;", function(id) {
    return "";
});

Native.create("com/sun/midp/rms/RecordStoreUtil.exists.(Ljava/lang/String;Ljava/lang/String;I)Z",
function(filenameBase, name, ext) {
    return new Promise(function(resolve, reject) {
        var path = RECORD_STORE_BASE + "/" + util.fromJavaString(filenameBase) + "/" + util.fromJavaString(name) + "." + ext;
        fs.exists(path, resolve);
    });
}, true);

Native.create("com/sun/midp/rms/RecordStoreUtil.deleteFile.(Ljava/lang/String;Ljava/lang/String;I)V",
function(filenameBase, name, ext) {
    return new Promise(function(resolve, reject) {
        var path = RECORD_STORE_BASE + "/" + util.fromJavaString(filenameBase) + "/" + util.fromJavaString(name) + "." + ext;

        fs.remove(path, resolve);
    });
}, true);

Native.create("com/sun/midp/rms/RecordStoreFile.spaceAvailableNewRecordStore0.(Ljava/lang/String;I)I", function(filenameBase, storageId) {
    // Pretend there is 50MiB available.  Our implementation is backed
    // by IndexedDB, which has no actual limit beyond space available on device,
    // which I don't think we can determine.  But this should be sufficient
    // to convince the MIDlet to use the API as needed.
    return 50 * 1024 * 1024;
});

Native.create("com/sun/midp/rms/RecordStoreFile.spaceAvailableRecordStore.(ILjava/lang/String;I)I", function(handle, filenameBase, storageId) {
    // Pretend there is 50MiB available.  Our implementation is backed
    // by IndexedDB, which has no actual limit beyond space available on device,
    // which I don't think we can determine.  But this should be sufficient
    // to convince the MIDlet to use the API as needed.
    return 50 * 1024 * 1024;
});

Native.create("com/sun/midp/rms/RecordStoreFile.openRecordStoreFile.(Ljava/lang/String;Ljava/lang/String;I)I",
function(filenameBase, name, ext) {
    return new Promise(function(resolve, reject) {
        var path = RECORD_STORE_BASE + "/" + util.fromJavaString(filenameBase) + "/" + util.fromJavaString(name) + "." + ext;

        function openCallback(fd) {
            if (fd == -1) {
                reject(new JavaException("java/io/IOException", "openRecordStoreFile: open failed"));
            } else {
                resolve(fd); // handle
            }
        }

        fs.exists(path, function(exists) {
            if (exists) {
                fs.open(path, openCallback);
            } else {
                // Per the reference impl, create the file if it doesn't exist.
                var dirname = fs.dirname(path);
                fs.mkdirp(dirname, function(created) {
                    if (created) {
                        fs.create(path, new Blob(), function(created) {
                            if (created) {
                                fs.open(path, openCallback);
                            }
                            else {
                                reject(new JavaException("java/io/IOException", "openRecordStoreFile: create failed"));
                            }
                        });
                    } else {
                        reject(new JavaException("java/io/IOException", "openRecordStoreFile: mkdirp failed"));
                    }
                });
            }
        });
    });
}, true);

Native.create("com/sun/midp/rms/RecordStoreFile.setPosition.(II)V", function(handle, pos) {
    fs.setpos(handle, pos);
});

Native.create("com/sun/midp/rms/RecordStoreFile.readBytes.(I[BII)I", function(handle, buf, offset, numBytes) {
    var from = fs.getpos(handle);
    var to = from + numBytes;
    var readBytes = fs.read(handle, from, to);

    if (readBytes.byteLength <= 0) {
        throw new JavaException("java/io/IOException", "handle invalid or segment indices out of bounds");
    }

    var subBuffer = buf.subarray(offset, offset + readBytes.byteLength);
    for (var i = 0; i < readBytes.byteLength; i++) {
        subBuffer[i] = readBytes[i];
    }
    return readBytes.byteLength;
});

Native.create("com/sun/midp/rms/RecordStoreFile.writeBytes.(I[BII)V", function(handle, buf, offset, numBytes) {
    fs.write(handle, buf.subarray(offset, offset + numBytes));
});

Native.create("com/sun/midp/rms/RecordStoreFile.commitWrite.(I)V", function(handle) {
    return new Promise(function(resolve, reject) {
      fs.flush(handle, resolve);
    });
}, true);

Native.create("com/sun/midp/rms/RecordStoreFile.closeFile.(I)V", function(handle) {
    return new Promise(function(resolve, reject) {
      fs.flush(handle, function() {
          fs.close(handle);
          resolve();
      });
    });
}, true);

Native.create("com/sun/midp/rms/RecordStoreFile.truncateFile.(II)V", function(handle, size) {
    return new Promise(function(resolve, reject) {
      fs.flush(handle, function() {
          fs.ftruncate(handle, size);
          resolve();
      });
    });
}, true);

MIDP.RecordStoreCache = [];

Native.create("com/sun/midp/rms/RecordStoreSharedDBHeader.getLookupId0.(ILjava/lang/String;I)I",
function(suiteId, jStoreName, headerDataSize) {
    var storeName = util.fromJavaString(jStoreName);

    var sharedHeader =
        MIDP.RecordStoreCache.filter(function(v) { return (v && v.suiteId == suiteId && v.storeName == storeName); })[0];
    if (!sharedHeader) {
        sharedHeader = {
            suiteId: suiteId,
            storeName: storeName,
            headerVersion: 0,
            headerData: null,
            headerDataSize: headerDataSize,
            refCount: 0,
            // Use cache indices as IDs, so we can look up objects by index.
            lookupId: MIDP.RecordStoreCache.length,
        };
        MIDP.RecordStoreCache.push(sharedHeader);
    }
    ++sharedHeader.refCount;

    return sharedHeader.lookupId;
});

Native.create("com/sun/midp/rms/RecordStoreSharedDBHeader.shareCachedData0.(I[BI)I", function(lookupId, headerData, headerDataSize) {
    var sharedHeader = MIDP.RecordStoreCache[lookupId];
    if (!sharedHeader) {
        throw new JavaException("java/lang/IllegalStateException", "invalid header lookup ID");
    }

    if (!headerData) {
        throw new JavaException("java/lang/IllegalArgumentException", "header data is null");
    }

    var size = headerDataSize;
    if (size > sharedHeader.headerDataSize) {
        size = sharedHeader.headerDataSize;
    }
    sharedHeader.headerData = headerData.buffer.slice(0, size);
    ++sharedHeader.headerVersion;

    return sharedHeader.headerVersion;
});

Native.create("com/sun/midp/rms/RecordStoreSharedDBHeader.updateCachedData0.(I[BII)I",
function(lookupId, headerData, headerDataSize, headerVersion) {
    var sharedHeader = MIDP.RecordStoreCache[lookupId];
    if (!sharedHeader) {
        throw new JavaException("java/lang/IllegalStateException", "invalid header lookup ID");
    }

    if (!headerData) {
        throw new JavaException("java/lang/IllegalArgumentException", "header data is null");
    }

    if (sharedHeader.headerVersion > headerVersion && sharedHeader.headerData) {
        var size = sharedHeader.headerDataSize;
        if (size > headerDataSize) {
            size = headerDataSize;
        }
        for (var i = 0; i < size; i++) {
            headerData[i] = sharedHeader.headerData[i];
        }
        return sharedHeader.headerVersion;
    }

    return headerVersion;
});

Native.create("com/sun/midp/rms/RecordStoreSharedDBHeader.getHeaderRefCount0.(I)I", function(lookupId) {
    var sharedHeader = MIDP.RecordStoreCache[lookupId];
    if (!sharedHeader) {
        throw new JavaException("java/lang/IllegalStateException", "invalid header lookup ID");
    }

    return sharedHeader.refCount;
});

Native.create("com/sun/midp/rms/RecordStoreSharedDBHeader.cleanup0.()V", function() {
    var lookupId = this.class.getField("I.lookupId.I").get(this);
    if (MIDP.RecordStoreCache[lookupId] &&
        --MIDP.RecordStoreCache[lookupId].refCount <= 0) {
        // Set to null instead of removing from array to maintain
        // correspondence between lookup IDs and array indices.
        MIDP.RecordStoreCache[lookupId] = null;
    }
});

// In the reference implementation, finalize is identical to cleanup0.
Native["com/sun/midp/rms/RecordStoreSharedDBHeader.finalize.()V"] =
    Native["com/sun/midp/rms/RecordStoreSharedDBHeader.cleanup0.()V"];

Native.create("com/sun/midp/rms/RecordStoreRegistry.getRecordStoreListeners.(ILjava/lang/String;)[I",
function(suiteId, storeName) {
    console.warn("RecordStoreRegistry.getRecordStoreListeners.(IL...String;)[I not implemented (" +
                 suiteId + ", " + util.fromJavaString(storeName) + ")");
    return null;
});

Native.create("com/sun/midp/rms/RecordStoreRegistry.sendRecordStoreChangeEvent.(ILjava/lang/String;II)V",
function(suiteId, storeName, changeType, recordId) {
    console.warn("RecordStoreRegistry.sendRecordStoreChangeEvent.(IL...String;II)V not implemented (" +
                 suiteId + ", " + util.fromJavaString(storeName) + ", " + changeType + ", " + recordId + ")");
});

Native.create("com/sun/midp/rms/RecordStoreRegistry.startRecordStoreListening.(ILjava/lang/String;)V",
function(suiteId, storeName) {
    console.warn("RecordStoreRegistry.startRecordStoreListening.(IL...String;)V not implemented (" +
                 suiteId + ", " + util.fromJavaString(storeName) + ")");
});

Native.create("com/sun/midp/rms/RecordStoreRegistry.stopRecordStoreListening.(ILjava/lang/String;)V",
function(suiteId, storeName) {
    console.warn("RecordStoreRegistry.stopRecordStoreListening.(IL...String;)V not implemented (" +
                 suiteId + ", " + util.fromJavaString(storeName) + ")");
});

Native.create("com/sun/midp/rms/RecordStoreRegistry.stopAllRecordStoreListeners.(I)V", function(taskId) {
    console.warn("RecordStoreRegistry.stopAllRecordStoreListeners.(I)V not implemented (" + taskId + ")");
});

Native.create("com/ibm/oti/connection/file/Connection.isValidFilenameImpl.([B)Z", function(path) {
    var invalid = ['<', '>', ':', '"', '/', '\\', '|', '*', '?'].map(function(char) {
      return char.charCodeAt(0);
    });

    for (var i = 0; i < path.length; i++) {
        if (path[i] <= 31 || invalid.indexOf(path[i]) != -1) {
            return false;
        }
    }

    return true;
});

Native.create("com/ibm/oti/connection/file/Connection.availableSizeImpl.([B)J", function(path) {
    // Pretend there is 1 GB available
    return Long.fromNumber(1024 * 1024 * 1024);
});

Native.create("com/ibm/oti/connection/file/Connection.setHiddenImpl.([BZ)V", function(path, value) {
    console.warn("Connection.setHiddenImpl.([BZ)V not implemented (" + util.decodeUtf8(path) + ")");
});

Native.create("com/ibm/oti/connection/file/Connection.existsImpl.([B)Z", function(path) {
    return new Promise(function(resolve, reject) {
      fs.exists(util.decodeUtf8(path), resolve);
    });
}, true);

Native.create("com/ibm/oti/connection/file/Connection.fileSizeImpl.([B)J", function(path) {
    return new Promise(function(resolve, reject) {
        fs.size(util.decodeUtf8(path), function(size) {
            resolve(Long.fromNumber(size));
        });
    });
}, true);

Native.create("com/ibm/oti/connection/file/Connection.isDirectoryImpl.([B)Z", function(path) {
    return new Promise(function(resolve, reject) {
        fs.stat(util.decodeUtf8(path), function(stat) {
            resolve(!!stat && stat.isDir);
        });
    });
}, true);

Native.create("com/ibm/oti/connection/file/Connection.listImpl.([B[BZ)[[B",
function(jPath, filterArray, includeHidden) {
    var path = util.decodeUtf8(jPath);
    return new Promise(function(resolve, reject) {
        var filter = "";
        if (filterArray) {
            filter = util.decodeUtf8(filterArray);
            if (filter.contains("?")) {
                console.warn("Our implementation of Connection::listImpl assumes the filter doesn't contain the ? wildcard character");
            }

            // Translate the filter to a regular expression

            // Escape regular expression (everything but * and ?)
            // Source of the regexp: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Regular_Expressions
            filter = filter.replace(/([.+^${}()|\[\]\/\\])/g, "\\$1");

            // Transform * to .+
            filter = filter.replace(/\*/g, ".+");

            filter += "$";
        }

        fs.list(path, function(files) {
            var regexp = new RegExp(filter);

            files = files.filter(regexp.test.bind(regexp));

            var filesArray = util.newArray("[[B", files.length);

            var added = 0;

            function checkDone() {
                if (added === files.length) {
                    resolve(filesArray);

                    return true;
                }

                return false;
            }

            if (checkDone()) {
                return;
            }

            files.forEach(function(file) {
              fs.stat(path + "/" + file, function(stat) {
                  if (stat.isDir) {
                      file += "/";
                  }

                  var bytesFile = new TextEncoder("utf-8").encode(file);

                  var fileArray = util.newPrimitiveArray("B", bytesFile.byteLength);
                  fileArray.set(bytesFile);

                  filesArray[added++] = fileArray;

                  checkDone();
              });
            });
        });
    });
}, true);


Native.create("com/ibm/oti/connection/file/Connection.mkdirImpl.([B)I", function(path) {
    return new Promise(function(resolve, reject) {
        fs.mkdir(util.decodeUtf8(path), function(created) {
            // IBM's implementation returns different error numbers, we don't care
            resolve(created ? 0 : 42);
        });
    });
}, true);

Native.create("com/ibm/oti/connection/file/Connection.newFileImpl.([B)I", function(jPath) {
    var path = util.decodeUtf8(jPath);

    return new Promise(function(resolve, reject) {
        // IBM's implementation returns different error numbers, we don't care

        fs.exists(path, function(exists) {
            if (exists) {
                fs.truncate(path, function(truncated) {
                    resolve(truncated ? 0 : 42);
                });
            } else {
                fs.create(path, new Blob(), function(created) {
                    resolve(created ? 0 : 42);
                });
            }
        });
    });
}, true);

Native.create("com/ibm/oti/connection/file/Connection.deleteFileImpl.([B)Z", function(path) {
    return new Promise(function(resolve, reject) {
        fs.remove(util.decodeUtf8(path), resolve);
    });
}, true);

Native["com/ibm/oti/connection/file/Connection.deleteDirImpl.([B)Z"] =
  Native["com/ibm/oti/connection/file/Connection.deleteFileImpl.([B)Z"]

Native.create("com/ibm/oti/connection/file/Connection.isReadOnlyImpl.([B)Z", function(path) {
    console.warn("Connection.isReadOnlyImpl.([B)Z not implemented (" + util.decodeUtf8(path) + ")");
    return false;
});

Native.create("com/ibm/oti/connection/file/Connection.isWriteOnlyImpl.([B)Z", function(path) {
    console.warn("Connection.isWriteOnlyImpl.([B)Z not implemented (" + util.decodeUtf8(path) + ")");
    return false;
});

Native.create("com/ibm/oti/connection/file/Connection.lastModifiedImpl.([B)J", function(path) {
    return new Promise(function(resolve, reject) {
        fs.stat(util.decodeUtf8(path), function(stat) {
            resolve(Long.fromNumber(stat != null ? stat.mtime : 0));
        });
    });
}, true);

Native.create("com/ibm/oti/connection/file/Connection.renameImpl.([B[B)V", function(oldPath, newPath) {
    return new Promise(function(resolve, reject) {
        fs.rename(util.decodeUtf8(oldPath), util.decodeUtf8(newPath), function(renamed) {
            if (!renamed) {
                reject(new JavaException("java/io/IOException", "Rename failed"));
                return;
            }

            resolve();
        });
    });
}, true);

Native.create("com/ibm/oti/connection/file/Connection.truncateImpl.([BJ)V", function(path, newLength, _) {
    return new Promise(function(resolve, reject) {
        fs.open(util.decodeUtf8(path), function(fd) {
          if (fd == -1) {
            reject(new JavaException("java/io/IOException", "truncate failed"));
            return;
          }

          fs.ftruncate(fd, newLength.toNumber());
          fs.flush(fd, function() {
              fs.close(fd);
              resolve();
          });
        });
    });
}, true);

Native.create("com/ibm/oti/connection/file/FCInputStream.openImpl.([B)I", function(path) {
    return new Promise(function(resolve, reject) {
      fs.open(util.decodeUtf8(path), resolve);
    });
}, true);

Native.create("com/ibm/oti/connection/file/FCInputStream.availableImpl.(I)I", function(fd) {
    return fs.getsize(fd) - fs.getpos(fd);
});

Native.create("com/ibm/oti/connection/file/FCInputStream.skipImpl.(JI)J", function(count, _, fd) {
    var curpos = fs.getpos(fd);
    var size = fs.getsize(fd);
    if (curpos + count.toNumber() > size) {
        fs.setpos(fd, size);
        return Long.fromNumber(size - curpos);
    }

    fs.setpos(fd, curpos + count.toNumber());
    return count;
});

Native.create("com/ibm/oti/connection/file/FCInputStream.readImpl.([BIII)I", function(buffer, offset, count, fd) {
    if (offset < 0 || count < 0 || offset > buffer.byteLength || (buffer.byteLength - offset) < count) {
        throw new JavaException("java/lang/IndexOutOfBoundsException");
    }

    if (buffer.byteLength == 0 || count == 0) {
        return 0;
    }

    var curpos = fs.getpos(fd);
    var data = fs.read(fd, curpos, curpos + count);
    buffer.set(data, offset);

    return (data.byteLength > 0) ? data.byteLength : -1;
});

Native.create("com/ibm/oti/connection/file/FCInputStream.readByteImpl.(I)I", function(fd) {
    var curpos = fs.getpos(fd);

    var data = fs.read(fd, curpos, curpos+1);

    return (data.byteLength > 0) ? data[0] : -1;
});

Native.create("com/ibm/oti/connection/file/FCInputStream.closeImpl.(I)V", function(fd) {
    if (fd >= 0) {
      fs.close(fd);
    }
});

Native.create("com/ibm/oti/connection/file/FCOutputStream.closeImpl.(I)V", function(fd) {
    return new Promise(function(resolve, reject) {
        if (fd <= -1) {
            resolve();
            return;
        }

        fs.flush(fd, function() {
            fs.close(fd);
            resolve();
        });
    });
}, true);

Native.create("com/ibm/oti/connection/file/FCOutputStream.openImpl.([B)I", function(jPath) {
    var path = util.decodeUtf8(jPath);

    return new Promise(function(resolve, reject) {
        fs.exists(path, function(exists) {
            if (exists) {
                fs.truncate(path, function(truncated) {
                    if (truncated) {
                        fs.open(path, resolve);
                    } else {
                        resolve(-1);
                    }
                });
            } else {
                fs.create(path, new Blob(), function(created) {
                    if (created) {
                        fs.open(path, resolve);
                    } else {
                        resolve(-1);
                    }
                });
            }
        });
    });
}, true);

Native.create("com/ibm/oti/connection/file/FCOutputStream.openOffsetImpl.([BJ)I", function(jPath, offset, _) {
    var path = util.decodeUtf8(jPath);

    return new Promise(function(resolve, reject) {
        function open() {
            fs.open(path, function(fd) {
                fs.setpos(fd, offset.toNumber());
                resolve(fd);
            });
        }

        fs.exists(path, function(exists) {
            if (exists) {
                open();
            } else {
                fs.create(path, new Blob(), function(created) {
                    if (created) {
                        open();
                    } else {
                        resolve(-1);
                    }
                });
            }
        });
    });
}, true);

Native.create("com/ibm/oti/connection/file/FCOutputStream.syncImpl.(I)V", function(fd) {
    return new Promise(function(resolve, reject) {
        fs.flush(fd, resolve);
    });
}, true);

Native.create("com/ibm/oti/connection/file/FCOutputStream.writeByteImpl.(II)V", function(val, fd) {
    var buf = new Uint8Array(1);
    buf[0] = val;
    fs.write(fd, buf);
});

Native.create("com/ibm/oti/connection/file/FCOutputStream.writeImpl.([BIII)V",
function(byteArray, offset, count, fd) {
    fs.write(fd, byteArray.subarray(offset, offset+count));
});

Native.create("com/sun/midp/io/j2me/storage/RandomAccessStream.open.(Ljava/lang/String;I)I", function(fileName, mode) {
    var path = "/" + util.fromJavaString(fileName);

    return new Promise(function(resolve, reject) {
        function open() {
            fs.open(path, function(fd) {
                if (fd == -1) {
                    reject(new JavaException("java/io/IOException",
                                             "RandomAccessStream::open(" + path + ") failed opening the file"));
                } else {
                    resolve(fd);
                }
            });
        }

        fs.exists(path, function(exists) {
            if (exists) {
                open();
            } else {
                fs.create(path, new Blob(), function(created) {
                    if (created) {
                        open();
                    } else {
                        reject(new JavaException("java/io/IOException",
                                                 "RandomAccessStream::open(" + path + ") failed creating the file"));
                    }
                });
            }
        });
    });
}, true);

Native.create("com/sun/midp/io/j2me/storage/RandomAccessStream.read.(I[BII)I",
function(handle, buffer, offset, length) {
    var from = fs.getpos(handle);
    var to = from + length;
    var readBytes = fs.read(handle, from, to);

    if (readBytes.byteLength <= 0) {
        return -1;
    }

    var subBuffer = buffer.subarray(offset, offset + readBytes.byteLength);
    for (var i = 0; i < readBytes.byteLength; i++) {
        subBuffer[i] = readBytes[i];
    }
    return readBytes.byteLength;
});

Native.create("com/sun/midp/io/j2me/storage/RandomAccessStream.write.(I[BII)V",
function(handle, buffer, offset, length) {
    fs.write(handle, buffer.subarray(offset, offset + length));
});

Native.create("com/sun/midp/io/j2me/storage/RandomAccessStream.commitWrite.(I)V", function(handle) {
    return new Promise(function(resolve, reject) {
        fs.flush(handle, resolve);
    });
}, true);

Native.create("com/sun/midp/io/j2me/storage/RandomAccessStream.position.(II)V", function(handle, position) {
    fs.setpos(handle, position);
});

Native.create("com/sun/midp/io/j2me/storage/RandomAccessStream.sizeOf.(I)I", function(handle) {
    var size = fs.getsize(handle);

    if (size == -1) {
        throw new JavaException("java/io/IOException", "RandomAccessStream::sizeOf(" + handle + ") failed");
    }

    return size;
});

Native.create("com/sun/midp/io/j2me/storage/RandomAccessStream.close.(I)V", function(handle) {
    return new Promise(function(resolve, reject) {
        fs.flush(handle, function() {
            fs.close(handle);
            resolve();
        });
    });
}, true);
