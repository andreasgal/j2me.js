/* -*- Mode: Java; tab-width: 4; indent-tabs-mode: nil; c-basic-offset: 4 -*- */
/* vim: set shiftwidth=4 tabstop=4 autoindent cindent expandtab: */

casper.on('remote.message', function(message) {
    this.echo(message);
});

casper.options.waitTimeout = 35000;

casper.options.onWaitTimeout = function() {
    this.debugPage();
    this.echo(this.captureBase64('png'));
    this.test.fail("Timeout");
};

var gfxTests = [
  { name: "gfx/CanvasTest", maxDifferent: 268 },
  { name: "gfx/ImageRenderingTest", maxDifferent: 266 },
  { name: "gfx/FillRectTest", maxDifferent: 0 },
  { name: "gfx/DrawStringTest", maxDifferent: 342 },
  { name: "gfx/DrawRedStringTest", maxDifferent: 491 },
  { name: "gfx/TextBoxTest", maxDifferent: 4677 },
  { name: "gfx/DirectUtilsCreateImageTest", maxDifferent: 0 },
  { name: "gfx/GetPixelsDrawPixelsTest", maxDifferent: 0 },
  { name: "gfx/OffScreenCanvasTest", maxDifferent: 0 },
  { name: "gfx/ARGBColorTest", maxDifferent: 0 },
  { name: "gfx/GetRGBDrawRGBTest", maxDifferent: 0 },
  { name: "gfx/GetRGBDrawRGBWidthHeightTest", maxDifferent: 0 },
  { name: "gfx/GetRGBDrawRGBxyTest", maxDifferent: 0 },
  { name: "gfx/GetRGBDrawRGBNoAlphaTest", maxDifferent: 0, todo: true },
  { name: "gfx/ClippingTest", maxDifferent: 0 },
];

casper.test.begin("unit tests", 5 + gfxTests.length, function(test) {
    casper
    .start("http://localhost:8000/index.html")
    .waitForText("DONE", function() {
        test.assertTextExists("DONE: 4904 pass, 0 fail, 165 known fail, 0 unknown pass", "run unit tests");
    });

    casper
    .thenOpen("http://localhost:8000/index.html?main=tests/isolate/TestIsolate&logLevel=info&logConsole=page,raw")
    .waitForText("DONE", function() {
        test.assertTextExists("I m\nI a ma\nI 2\nI ma\nI 2\nI 1 isolate\nI Isolate ID correct\nI 4\nI 5\nI 1 isolate\nI ma\nI ma\nI 3 isolates\nI 1 m1\nI 2 m2\nI 4\nI 5\nI ma\nI 1 isolate\nI Isolates terminated\nI r mar\nI 2\nI mar\nI c marc\nI 2\nI marc\nI Main isolate still running");
    });

    casper
    .thenOpen("http://localhost:8000/index.html?main=com/sun/midp/main/MIDletSuiteLoader&midletClassName=tests/alarm/MIDlet1&jad=tests/midlets/alarm/alarm.jad")
    .waitForText("Hello World from MIDlet2", function() {
        test.assert(true);
    });

    casper
    .thenOpen("http://localhost:8000/tests/fstests.html")
    .waitForText("DONE", function() {
        test.assertTextExists("DONE: 121 PASS, 0 FAIL", "run fs.js unit tests");
    });

    casper
    .thenOpen("http://localhost:8000/index.html?midletClassName=tests.sms.SMSMIDlet&main=com/sun/midp/main/MIDletSuiteLoader", function() {
        this.waitForText("START", function() {
            this.evaluate(function() {
                promptForMessageText();
            });
            this.waitUntilVisible(".sms-listener-prompt", function() {
                this.sendKeys(".sms-listener-prompt.visible input", "Prova SMS", { reset: true });
                this.click(".sms-listener-prompt.visible button.recommend");
                this.waitForText("DONE", function() {
                    test.assertTextDoesntExist("FAIL");
                });
            });
        });
    });

    // Graphics tests

    gfxTests.forEach(function(testCase) {
        casper
        .thenOpen("http://localhost:8000/index.html?main=com/sun/midp/main/MIDletSuiteLoader&midletClassName=" + testCase.name)
        .waitForText("PAINTED", function() {
            this.waitForSelector("#canvas", function() {
                var got = this.evaluate(function(testCase) {
                    var gotCanvas = document.getElementById("canvas");
                    var gotPixels = new Uint32Array(gotCanvas.getContext("2d").getImageData(0, 0, gotCanvas.width, gotCanvas.height).data.buffer);

                    var img = new Image();
                    img.src = "tests/" + testCase.name + ".png";

                    img.onload = function() {
                        var expectedCanvas = document.createElement('canvas');
                        expectedCanvas.width = img.width;
                        expectedCanvas.height = img.height;
                        expectedCanvas.getContext("2d").drawImage(img, 0, 0);

                        var expectedPixels = new Uint32Array(expectedCanvas.getContext("2d").getImageData(0, 0, img.width, img.height).data.buffer);

                        if (expectedCanvas.width !== gotCanvas.width || expectedCanvas.height !== gotCanvas.height) {
                            console.log("Canvas dimensions are wrong");
                            console.log("FAIL");
                            return;
                        }

                        var different = 0;
                        var i = 0;
                        for (var x = 0; x < gotCanvas.width; x++) {
                            for (var y = 0; y < gotCanvas.height; y++) {
                                if (expectedPixels[i] !== gotPixels[i]) {
                                    different++;
                                }

                                i++;
                            }
                        }

                        if (different > testCase.maxDifferent) {
                            console.log(gotCanvas.toDataURL());
                            if (!testCase.todo) {
                              console.log("FAIL - " + different);
                            } else {
                              console.log("TODO - " + different);
                            }
                        } else {
                            if (!testCase.todo) {
                                console.log("PASS - " + different);
                            } else {
                                console.log("UNEXPECTED PASS - " + different);
                            }
                        }

                        console.log("DONE");
                    };

                    img.onerror = function() {
                        console.log("Error while loading test image");
                        console.log("FAIL");
                    };
                }, testCase);

                this.waitForText("DONE", function() {
                    var content = this.getPageContent();
                    var fail = content.contains("FAIL");
                    var todo = content.contains("TODO");
                    var unexpected = content.contains("UNEXPECTED");

                    if (fail) {
                        this.echo(content);
                        test.fail(testCase.name + " - Failure");
                    } else if (unexpected) {
                        this.echo(content);
                        test.fail(testCase.name + " - Unexpected pass");
                    } else if (todo) {
                        test.skip(1, testCase.name + " - Todo");
                    } else {
                        test.pass(testCase.name + " - Pass");
                    }
                });
            });
        });
    });

    casper
    .run(function() {
        test.done();
    });
});
