'use strict';

// Define objects and functions that j2me.js expects
// but are unavailable in the shell environment.

if (typeof console === "undefined") {
  var console = {
    log: print,
  }
}

console.info = function (c) {
  putstr(String.fromCharCode(c));
};

console.error = function (c) {
  putstr(String.fromCharCode(c));
};

var finalizedAddresses = [];

function nextFinalized() {
  return finalizedAddresses.shift();
}

var passed = 0, failed = 0;

function is(a, b, msg) {
  if (a == b) {
    ++passed;
    print("pass " + msg);
  } else {
    ++failed;
    print("fail " + msg + "; expected " + JSON.stringify(b) + ", got " + JSON.stringify(a));
  }
}

function isNot(a, b, msg) {
  if (a != b) {
    ++passed;
    print("pass " + msg);
  } else {
    ++failed;
    print("fail " + msg + "; expected " + JSON.stringify(b) + " != " + JSON.stringify(a));
  }
}

function ok(a, msg) {
  if (!!a) {
    ++passed;
    print("pass " + msg);
  } else {
    ++failed;
    print("fail " + msg);
  }
}

var tests = [];

function next() {
  finalizedAddresses = [];

  if (tests.length == 0) {
    ok(true, "TESTS COMPLETED");
    print("DONE " + passed + "/" + (passed + failed));
  } else {
    var test = tests.shift();
    test();
  }
}

// Test gcMalloc
tests.push(function() {
  var addr = ASM._gcMalloc(4);
  ASM._registerFinalizer(addr);
  ASM._forceCollection();
  is(nextFinalized(), addr, "Object allocated with gcMalloc is freed");

  next();
});

// Test gcMallocUncollectable
tests.push(function() {
  var addr = ASM._gcMallocUncollectable(4);
  ASM._registerFinalizer(addr);
  ASM._forceCollection();
  isNot(nextFinalized(), addr, "Object allocated with gcMallocUncollectable isn't freed");

  ASM._gcFree(addr);

  ASM._forceCollection();
  ASM._forceCollection();
  is(nextFinalized(), addr, "Finalizer is called for a freed object");

  next();
});

// Test gcMallocAtomic
tests.push(function() {
  var addr = ASM._gcMallocAtomic(4);
  ASM._registerFinalizer(addr);
  ASM._forceCollection();
  is(nextFinalized(), addr, "Object allocated with gcMallocAtomic is freed");

  next();
});

// Make sure values inside the gcMallocAtomic allocated area aren't considered pointers
tests.push(function() {
  var uncollectableAddr = ASM._gcMallocUncollectable(4);
  ASM._registerFinalizer(uncollectableAddr);

  var addr = ASM._gcMallocAtomic(4);
  ASM._registerFinalizer(addr);

  i32[uncollectableAddr >> 2] = addr;

  var objAddr = J2ME.allocObject(CLASSES.java_lang_Object);
  ASM._registerFinalizer(objAddr);

  i32[addr >> 2] = objAddr;
  ASM._forceCollection();
  is(nextFinalized(), objAddr, "Values in an area allocated via gcMallocAtomic aren't considered references");

  ASM._gcFree(uncollectableAddr);

  ASM._forceCollection();
  is(nextFinalized(), addr, "Object not referenced by anyone anymore is freed");

  ASM._forceCollection();
  is(nextFinalized(), uncollectableAddr, "Finalizer is called for a freed object");

  next();
});

// Test allocObject
tests.push(function() {
  var objAddr = J2ME.allocObject(CLASSES.java_lang_Object);
  ASM._registerFinalizer(objAddr);

  ASM._forceCollection();
  is(nextFinalized(), objAddr, "An object not referenced by anyone is freed");

  next();
});

// Test newArray (primitive)
tests.push(function() {
  var objAddr = J2ME.newIntArray(7);
  ASM._registerFinalizer(objAddr);

  ASM._forceCollection();
  is(nextFinalized(), objAddr, "A primitive array not referenced by anyone is freed");

  next();
});

// Test newArray (composite)
tests.push(function() {
  var objAddr = J2ME.newObjectArray(7);
  ASM._registerFinalizer(objAddr);

  ASM._forceCollection();
  is(nextFinalized(), objAddr, "A composite array not referenced by anyone is freed");

  next();
});

tests.push(function() {
  var addr = ASM._gcMallocUncollectable(4);
  ASM._registerFinalizer(addr);

  var objAddr = J2ME.allocObject(CLASSES.java_lang_Object);
  ASM._registerFinalizer(objAddr);

  i32[addr >> 2] = objAddr;
  ASM._forceCollection();
  isNot(nextFinalized(), addr, "Object allocated with GC_MALLOC_UNCOLLECTABLE isn't collected");
  isNot(nextFinalized(), objAddr, "Object referenced by someone isn't freed");

  ASM._gcFree(addr);

  ASM._forceCollection();
  is(nextFinalized(), objAddr, "Object that isn't referenced by anyone anymore is freed");

  ASM._forceCollection();
  is(nextFinalized(), addr, "Finalizer is called for a freed object");

  next();
});

tests.push(function() {
  var addr = ASM._gcMallocUncollectable(4);
  ASM._registerFinalizer(addr);

  var objAddr = J2ME.allocObject(CLASSES.java_lang_Object);
  ASM._registerFinalizer(objAddr);

  i32[addr >> 2] = objAddr;
  ASM._forceCollection();
  isNot(nextFinalized(), addr, "Object allocated with GC_MALLOC_UNCOLLECTABLE isn't collected");
  isNot(nextFinalized(), objAddr, "Object referenced by someone isn't freed");

  i32[addr >> 2] = 0;

  ASM._forceCollection();
  is(nextFinalized(), objAddr, "Object that isn't referenced by anyone anymore is freed");

  ASM._gcFree(addr);

  ASM._forceCollection();
  ASM._forceCollection();
  is(nextFinalized(), addr, "Finalizer is called for a freed object");

  next();
});

tests.push(function() {
  var addr = ASM._gcMallocUncollectable(4);
  ASM._registerFinalizer(addr);

  var objAddr = J2ME.newByteArray(7);
  ASM._registerFinalizer(objAddr);

  i32[addr >> 2] = objAddr;
  ASM._forceCollection();
  isNot(nextFinalized(), addr, "Object allocated with GC_MALLOC_UNCOLLECTABLE isn't collected");
  isNot(nextFinalized(), objAddr, "Object referenced by someone isn't freed");

  i32[addr >> 2] = 0;

  ASM._forceCollection();
  is(nextFinalized(), objAddr, "Object that isn't referenced by anyone anymore is freed");

  ASM._gcFree(addr);

  ASM._forceCollection();
  ASM._forceCollection();
  is(nextFinalized(), addr, "Finalizer is called for a freed object");

  next();
});

tests.push(function() {
  var addr = J2ME.newArray(CLASSES.java_lang_Object, 1);
  ASM._registerFinalizer(addr);

  var objAddr = J2ME.allocObject(CLASSES.java_lang_Object);
  ASM._registerFinalizer(objAddr);

  i32[addr + J2ME.Constants.ARRAY_HDR_SIZE >> 2] = objAddr;
  ASM._forceCollection();
  is(nextFinalized(), addr, "Object not referenced by anyone is freed");
  ASM._forceCollection();
  is(nextFinalized(), objAddr, "Object that isn't referenced by anyone anymore is freed");

  next();
});

// Make sure values inside the gcMallocAtomic allocated area aren't considered pointers
tests.push(function() {
  var uncollectableAddr = ASM._gcMallocUncollectable(4);
  ASM._registerFinalizer(uncollectableAddr);

  var addr = J2ME.newIntArray(4);
  ASM._registerFinalizer(addr);

  i32[uncollectableAddr >> 2] = addr;

  var objAddr = J2ME.allocObject(CLASSES.java_lang_Object);
  ASM._registerFinalizer(objAddr);

  i32[addr + J2ME.Constants.ARRAY_HDR_SIZE >> 2] = objAddr;
  ASM._forceCollection();
  is(nextFinalized(), objAddr, "Values in an area allocated via newArray (primitive) aren't considered references");

  ASM._gcFree(uncollectableAddr);

  ASM._forceCollection();
  is(nextFinalized(), addr, "Object not referenced by anyone anymore is freed");

  ASM._forceCollection();
  is(nextFinalized(), uncollectableAddr, "Finalizer is called for a freed object");

  next();
});

// For the zero-out tests below, since we can't control where the memory
// is allocated by Boehm, we allocate it multiple times hoping that within 1000
// iterations the areas allocated by the allocations will collide (in my testing
// this happens within 2 iterations, so 1000 should be a safe bet).

tests.push(function() {
  var zeroedOut = true;
  for (var i = 0; i < 1000; i++) {
    var addr = ASM._gcMallocAtomic(8);
    for (var j = 0; j < 8; j += 4) {
      if (i32[addr + j >> 2] != 0) {
        zeroedOut = false;
        break;
      }
    }

    if (!zeroedOut) {
      break;
    }

    for (var j = 0; j < 8; j += 4) {
      i32[addr + j >> 2] = 0xDEADBEEF;
    }

    ASM._forceCollection();
  }

  ok(zeroedOut, "gcMallocAtomic does zero-out allocated memory");

  next();
});

tests.push(function() {
  var zeroedOut = true;
  for (var i = 0; i < 1000; i++) {
    var addr = J2ME.newIntArray(2);
    for (var j = 0; j < 8; j += 4) {
      if (i32[addr + J2ME.Constants.ARRAY_HDR_SIZE + j >> 2] != 0) {
        zeroedOut = false;
        break;
      }
    }

    if (!zeroedOut) {
      break;
    }

    for (var j = 0; j < 8; j += 4) {
      i32[addr + J2ME.Constants.ARRAY_HDR_SIZE + j >> 2] = 0xDEADBEEF;
    }

    ASM._forceCollection();
  }

  ok(zeroedOut, "newIntArray does zero-out allocated memory");

  next();
});

tests.push(function() {
  var zeroedOut = true;
  for (var i = 0; i < 1000; i++) {
    var addr = J2ME.newArray(J2ME.PrimitiveClassInfo.J, 2);
    for (var j = 0; j < 8; j += 4) {
      if (i32[addr + J2ME.Constants.ARRAY_HDR_SIZE + j >> 2] != 0) {
        zeroedOut = false;
        break;
      }
    }

    if (!zeroedOut) {
      break;
    }

    for (var j = 0; j < 8; j += 4) {
      i32[addr + J2ME.Constants.ARRAY_HDR_SIZE + j >> 2] = 0xDEADBEEF;
    }

    ASM._forceCollection();
  }

  ok(zeroedOut, "newArray does zero-out allocated memory");

  next();
});

tests.push(function() {
  var addr = J2ME.allocObject(CLASSES.java_lang_Object);
  setNative(addr, { prop: "ciao" });

  ok(NativeMap.has(addr), "Native object is in the NativeMap map");

  ASM._forceCollection();
  is(nextFinalized(), addr, "Object not referenced by anyone is freed");

  ok(!NativeMap.has(addr), "Native object has been removed from the NativeMap map");

  next();
});

tests.push(function() {
  var addr = ASM._gcMallocUncollectable(4);
  setNative(addr, { prop: "ciao" });

  ok(NativeMap.has(addr), "Native object is in the NativeMap map");

  ASM._forceCollection();
  isNot(nextFinalized(), addr, "Uncollectable memory isn't freed");

  ok(NativeMap.has(addr), "Native object is still in the NativeMap map");

  next();
});

try {
  load("config/default.js", "polyfill/promise.js", "bld/native.js", "libs/encoding.js", "bld/j2me.js", "libs/zipfile.js",
       "libs/jarstore.js", "native.js");

  var dump = putstr;

  JARStore.addBuiltIn("java/classes.jar", snarf("java/classes.jar", "binary").buffer);

  CLASSES.initializeBuiltinClasses();

  var origOnFinalize = J2ME.onFinalize;
  J2ME.onFinalize = function(addr) {
    origOnFinalize(addr);
    finalizedAddresses.push(addr);
  };

  var start = dateNow();

  next();

  print("Time: " + (dateNow() - start).toFixed(4) + " ms");
} catch (x) {
  print(x);
  print(x.stack);
}
