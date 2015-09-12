/* -*- Mode: Java; tab-width: 4; indent-tabs-mode: nil; c-basic-offset: 4 -*- */
/* vim: set shiftwidth=4 tabstop=4 autoindent cindent expandtab: */

var system = require('system');
var fs = require('fs');

// Enable TCP socket API and grant tcp-socket permission to the testing page
var { Cu } = require("chrome");
Cu.import("resource://gre/modules/Services.jsm");
Services.prefs.setBoolPref("dom.mozTCPSocket.enabled", true);
var uri = Services.io.newURI("http://localhost:8000", null, null);
var principal = Services.scriptSecurityManager.getNoAppCodebasePrincipal(uri);
Services.perms.addFromPrincipal(principal, "tcp-socket", Services.perms.ALLOW_ACTION);

casper.on('remote.message', function(message) {
    this.echo(message);
});

casper.options.waitTimeout = 90000;
casper.options.verbose = true;
casper.options.viewportSize = { width: 240, height: 320 };
casper.options.clientScripts = [
  "tests/mocks/getUserMedia.js",
];

casper.options.onWaitTimeout = function() {
    this.echo("data:image/png;base64," + this.captureBase64('png'));
    this.test.fail("Timeout");
};

/**
 * Add a step that syncs the virtual filesystem to the persistent datastore,
 * to ensure all changes are synced before we move to the next step.
 *
 * We need to do this because the virtual filesystem caches changes,
 * while the tests often unload pages right after writing to the filesystem,
 * so sometimes those changes won't yet be synced on unload, though a subsequent
 * step depends on them.
 *
 * And we can't block unload while forcing a sync from within the app
 * because IndexedDB doesn't block unloads, it simply drops transactions
 * when the page is unloaded.
 */
function syncFS() {
    casper.waitForText("SYNC FILESYSTEM");
    casper.evaluate(function() {
        fs.syncStore(function() {
            console.log("SYNC FILESYSTEM");
        });
    });
}

casper.test.begin("unit tests", 39, function(test) {
    casper.start("data:text/plain,start");

    casper.page.onLongRunningScript = function(message) {
        casper.echo("FAIL unresponsive " + message, "ERROR");
        casper.page.stopJavaScript();
    };

    // Run the Init midlet, which does nothing by itself but ensures that any
    // initialization code gets run before we start a test that depends on it.
    casper
    .thenOpen("http://localhost:8000/index.html?midletClassName=midlets.InitMidlet&jars=tests/tests.jar&logConsole=web,page&logLevel=log")
    .withFrame(0, function() {
        casper.waitForText("DONE", syncFS);
    });

    casper
    .thenOpen("http://localhost:8000/tests/fs/test-fs-init.html")
    .waitForText("DONE", function() {
        test.assertTextExists("DONE: 30 pass, 0 fail", "test fs init");
    });

    function basicUnitTests() {
        casper.waitForText("DONE", function() {
            var content = this.getPageContent();
            var regex = /DONE: (\d+) class pass, (\d+) class fail/;
            var match = content.match(regex);
            if (!match || !match.length || match.length < 3) {
                this.echo("data:image/png;base64," + this.captureBase64('png'));
                test.fail('failed to parse status line of main unit tests');
            } else {
                var failed = match[2];
                if (failed === "0") {
                    test.pass('main unit tests');
                } else {
                    test.fail(failed + " unit test(s) failed");
                }
            }
            syncFS();
        });
    }

    casper
    .thenOpen("http://localhost:8000/index.html?logConsole=web,page&logLevel=log")
    .withFrame(0, basicUnitTests);

    // Run the same unit tests again to test the compiled method cache.
    casper
    .thenOpen("http://localhost:8000/index.html?logConsole=web,page&logLevel=log")
    .withFrame(0, basicUnitTests);

    // Run the same unit tests again with baseline JIT enabled for all methods.
    casper
    .thenOpen("http://localhost:8000/index.html?logConsole=web,page&logLevel=log&forceRuntimeCompilation=1")
    .withFrame(0, basicUnitTests);

    casper
    .thenOpen("http://localhost:8000/index.html?main=tests/isolate/TestIsolate&logLevel=info&logConsole=web,page,raw")
    .withFrame(0, function() {
        casper.waitForText("DONE", function() {
          var output = this.fetchText('#raw-console');
          var expectedOutput = ["I 0: m",
            "I 3 0 a ma",
            "I 1: ma",
            "I 2: 3",
            "I 3: 1 isolate",
            "I 4: Isolate ID correct",
            "I 5: 5",
            "I 6: 6",
            "I 7: 1 isolate",
            "I 8: ma",
            "I 9: ma",
            "I 10: 3 isolates",
            "I 6 0 2 m2",
            "I 5 0 1 m1",
            "I 11: ma",
            "I 12: 1 isolate",
            "I 13: Isolates terminated",
            "I 3 1 r mar",
            "I 14: mar",
            "I 3 2 c marc",
            "I 15: marc",
            "I 16: Main isolate still running",
            "I DONE",
            ""];
          output = output.split("\n").sort();
          expectedOutput.sort();
          test.assert(expectedOutput.length === output.length, "Same number of lines output.");
          var allMatch = true;
          for (var i = 0; i < expectedOutput.length; i++) {
            if (expectedOutput[i] !== output[i]) {
              allMatch = false;
              break;
            }
          }
          test.assert(allMatch, "All lines are contained within output.");
        });
    });

    casper
    .thenOpen("http://localhost:8000/index.html?main=MainStaticInitializer&logLevel=info&logConsole=web,page,raw")
    .withFrame(0, function() {
        casper.waitForText("DONE", function() {
            test.assertTextExists("I 1) static init\n" +
                                  "I 2) main");
        });
    });

    casper
    .thenOpen("http://localhost:8000/index.html?midletClassName=tests/alarm/MIDlet1&jad=tests/midlets/alarm/alarm.jad&jars=tests/tests.jar&logConsole=web,page&logLevel=log")
    .withFrame(0, function() {
        casper.waitForText("Hello World from MIDlet2", function() {
            test.pass();
        });
    });

    casper
    .thenOpen("http://localhost:8000/index.html?midletClassName=tests/recordstore/WriterMIDlet&jad=tests/midlets/RecordStore/recordstore.jad&jars=tests/tests.jar&logConsole=web,page&logLevel=log")
    .withFrame(0, function() {
        casper.waitForText("DONE", function() {
            test.assertTextDoesntExist("FAIL");
            test.assertTextExists("SUCCESS 8/8", "Test RecordStore with multiple MIDlets");
        });
    });

    casper
    .thenOpen("http://localhost:8000/index.html?midletClassName=tests.midlets.background.BackgroundMIDlet1&jad=tests/midlets/background/background1.jad&jars=tests/tests.jar&logConsole=web,page&logLevel=log")
    .withFrame(0, function() {
        casper.waitForText("Hello World from foreground MIDlet", function() {
            test.pass("First background test");
        });
    });

    casper
    .thenOpen("http://localhost:8000/index.html?midletClassName=tests.background.BackgroundMIDlet2&jad=tests/midlets/background/background2.jad&jars=tests/tests.jar&logConsole=web,page&logLevel=log")
    .withFrame(0, function() {
        casper.waitForText("Hello World from foreground MIDlet", function() {
            test.pass("Second background test");
        });
    });

    casper
    .thenOpen("http://localhost:8000/index.html?midletClassName=tests.background.BackgroundMIDlet3&jad=tests/midlets/background/background3.jad&jars=tests/tests.jar&logConsole=web,page&logLevel=log")
    .withFrame(0, function() {
        casper.waitForText("Hello World from foreground MIDlet", function() {
            test.assertTextExists("prop1=hello prop2=ciao");
        });
    });

    casper
    .thenOpen("http://localhost:8000/index.html?midletClassName=tests.midlets.background.BackgroundMIDlet1&jad=tests/midlets/background/foregroundExit.jad&jars=tests/tests.jar&logConsole=web,page&logLevel=log", function() {
      casper.evaluate(function() {
        window.close = function() {
          document.title = "window.close called";
        }
      });

      casper.waitFor(function() {
        return !!this.getTitle();
      }, function() {
        test.assertEquals(this.getTitle(), "window.close called", "window.close called");
      });
    });

    casper
    .thenOpen("http://localhost:8000/index.html?midletClassName=tests.midlets.background.BackgroundMIDlet1&jad=tests/midlets/background/destroy.jad&jars=tests/tests.jar&logConsole=web,page&logLevel=log")
    .withFrame(0, function() {
        casper.waitForText("PAINTED", function() {
          casper.waitForSelector("#canvas", function() {
            this.click("#canvas");
          });

          casper.waitForText("DONE", function() {
            var content = this.getPageContent();
            test.assertEquals(content.match(/startApp1/g).length, 2, "Two startApp1");
            test.assertEquals(content.match(/destroyApp/g).length, 1, "One destroyApp");
          });
        });
    });

    casper
    .thenOpen("http://localhost:8000/index.html?midletClassName=tests.midlets.ContentHandlerStarterMIDlet&jad=tests/midlets/ContentHandlerMIDlet/contenthandler.jad&jars=tests/tests.jar&logConsole=web,page&logLevel=log")
    .withFrame(0, function() {
        casper.waitForText("Test finished", function() {
            var content = this.getPageContent();
            test.assertEquals(content.match(/Hello World from starter MIDlet/g).length, 1, "ContentHandlerMIDlet test 1");
            test.assertEquals(content.match(/Invocation action: share/g).length, 2, "ContentHandlerMIDlet test 2");
            test.assertEquals(content.match(/Invocation args\[0\]: url=file:\/\/\/Private\/j2meshare\/j2mesharetestimage0\.jpg/g).length, 1, "ContentHandlerMIDlet test 3");
            test.assertEquals(content.match(/Invocation args\[0\]: url=file:\/\/\/Private\/j2meshare\/j2mesharetestimage1\.jpg/g).length, 1, "ContentHandlerMIDlet test 4");
            test.assertEquals(content.match(/Image exists/g).length, 2, "ContentHandlerMIDlet test 5");
        });
    });

    // Test that the background alarm is started after a SMS is received.
    casper
    .thenOpen("http://localhost:8000/index.html?midletClassName=tests.midlets.background.BackgroundMIDlet1&jad=tests/midlets/background/foregroundEnableBackgroundService.jad&jars=tests/tests.jar&logConsole=web,page&logLevel=log")
    .withFrame(0, function() {
        this.waitForText("START", function() {
            this.evaluate(function() {
                promptForMessageText();
            });
            this.waitUntilVisible(".sms-listener-prompt", function() {
                this.sendKeys(".sms-listener-prompt.visible input", "Prova SMS", { reset: true });
                this.click(".sms-listener-prompt.visible button.recommend");
                this.waitForText("DONE", function() {
                    test.assertTextDoesntExist("FAIL");
                    test.assertTextExists("START - Background alarm started: 0");
                    test.assertTextExists("DONE - Background alarm started: 1");
                    syncFS();
                });
            });
        });
    });

    // Test that the background alarm is started automatically when restarting a MIDlet (after the background
    // alarm has been activated during the previous session).
    // Also double-check that receiving a second SMS doesn't start a second background alarm.
    casper
    .thenOpen("http://localhost:8000/index.html?midletClassName=tests.midlets.background.BackgroundMIDlet1&jad=tests/midlets/background/foregroundEnableBackgroundService.jad&jars=tests/tests.jar&logConsole=web,page&logLevel=log")
    .withFrame(0, function() {
        this.waitForText("START", function() {
            this.evaluate(function() {
                promptForMessageText();
            });
            this.waitUntilVisible(".sms-listener-prompt", function() {
                this.sendKeys(".sms-listener-prompt.visible input", "Prova SMS", { reset: true });
                this.click(".sms-listener-prompt.visible button.recommend");
                this.waitForText("DONE", function() {
                    test.assertTextDoesntExist("FAIL");
                    test.assertTextExists("START - Background alarm started: 1");
                    test.assertTextExists("DONE - Background alarm started: 1");
                });
            });
        });
    });

    casper
    .thenOpen("http://localhost:8000/index.html?midletClassName=tests.sms.SMSMIDlet&jars=tests/tests.jar&logConsole=web,page&logLevel=log")
    .withFrame(0, function() {
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

    casper
    .thenOpen("http://localhost:8000/index.html?midletClassName=tests.fileui.FileUIMIDlet&jars=tests/tests.jar&logConsole=web,page&logLevel=log")
    .withFrame(0, function() {
        this.waitForText("START", function() {
            this.waitUntilVisible(".nokia-fileui-prompt", function() {
                this.fill("form.nokia-fileui-prompt.visible", {
                    "nokia-fileui-file": system.args[4],
                });
                this.click(".nokia-fileui-prompt.visible input");
                this.click(".nokia-fileui-prompt.visible button.recommend");
                this.waitForText("DONE", function() {
                    var content = this.getPageContent();
                    if (content.contains("FAIL")) {
                        this.echo("data:image/png;base64," + this.captureBase64('png'));
                        test.fail('file-ui test');
                    } else {
                        test.pass("file-ui test");
                    }
                });
            });
        });
    });

    casper
    .thenOpen("http://localhost:8000/index.html?downloadJAD=http://localhost:8000/tests/Manifest1.jad&midletClassName=tests.jaddownloader.AMIDlet&logConsole=web,page&args=1.0.0&logLevel=log")
    .withFrame(0, function() {
        casper.waitForText("DONE", function() {
            test.assertTextExists("SUCCESS 3/3", "test JAD downloader - Download");
            syncFS();
        });
    });

    // Run the test a second time to ensure loading the JAR stored in the JARStore works correctly.
    casper
    .thenOpen("http://localhost:8000/index.html?downloadJAD=http://localhost:8000/tests/Manifest1.jad&midletClassName=tests.jaddownloader.AMIDlet&logConsole=web,page&args=1.0.0&logLevel=log")
    .withFrame(0, function() {
        casper.waitForText("DONE", function() {
            test.assertTextExists("SUCCESS 3/3", "test JAD downloader - Load");
            syncFS();
        });
    });


    // Run the test that updates the MIDlet
    casper
    .thenOpen("http://localhost:8000/index.html?downloadJAD=http://localhost:8000/tests/Manifest1.jad&midletClassName=tests.jaddownloader.AMIDletUpdater&logConsole=web,page&logLevel=log")
    .withFrame(0, function() {
        var alertText = null;
        casper.on('remote.alert', function onAlert(message) {
            casper.removeListener('remote.alert', onAlert);
            alertText = message;
        });

        casper.waitFor(function() {
            return !!alertText;
        }, function() {
            test.assertEquals(alertText, "Update completed!", "Update alert shown");
            syncFS();
        });
    });

    // Verify that the update has been applied
    casper
    .thenOpen("http://localhost:8000/index.html?downloadJAD=http://localhost:8000/tests/Manifest1.jad&midletClassName=tests.jaddownloader.AMIDlet&logConsole=web,page&args=3.0.0&logLevel=log")
    .withFrame(0, function() {
        casper.waitForText("DONE", function() {
            test.assertTextExists("SUCCESS 3/3", "test JAD downloader - Load after update");
            syncFS();
        });
    });

    // Clear the JARStore before downloading another JAD
    casper
    .thenOpen("http://localhost:8000/tests/jarstore/clear-jarstore.html")
    .waitForText("DONE");

    casper
    .thenOpen("http://localhost:8000/index.html?downloadJAD=http://localhost:8000/tests/Manifest2.jad&midletClassName=tests.jaddownloader.AMIDlet&logConsole=web,page&args=2.0.0&logLevel=log")
    .withFrame(0, function() {
        casper.waitForText("DONE", function() {
            test.assertTextExists("SUCCESS 3/3", "test JAD downloader - Download with absolute URL");
            syncFS();
        });
    });

    casper
    .thenOpen("http://localhost:8000/index.html?midletClassName=com.sun.midp.midlet.TestMIDletPeer&jars=tests/tests.jar&logConsole=web,page&logLevel=log")
    .waitForPopup("test.html", function() {
        test.assertEquals(this.popups.length, 1);
        test.assertTextDoesntExist("FAIL");
    });

    casper
    .thenOpen("http://localhost:8000/index.html?midletClassName=midlets.TestAlertWithGauge&jars=tests/tests.jar&logConsole=web,page&logLevel=log")
    .withFrame(0, function() {
        this.waitUntilVisible(".lcdui-alert.visible .button1", function() {
            this.click(".lcdui-alert.visible .button0");
            this.waitForText("You pressed 'Yes'", function() {
                test.assertTextDoesntExist("FAIL");

                this.click(".lcdui-alert.visible .button1");
                this.waitForText("You pressed 'No'", function() {
                    test.assertTextDoesntExist("FAIL");
                });
            });
        });
    });

    casper
    .thenOpen("http://localhost:8000/tests/jarstore/jarstoretests.html")
    .waitForText("DONE", function() {
        test.assertTextExists("DONE: 23 pass, 0 fail", "JARStore unit tests");
    });

    casper
    .run(function() {
        test.done();
    });
});
