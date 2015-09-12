package gfx;

import javax.microedition.lcdui.*;
import javax.microedition.midlet.*;
import com.nokia.mid.ui.*;

public class CreateImmutableCopyTest extends MIDlet {
    private Display display;

    class TestCanvas extends Canvas {
        protected void paint(Graphics screenG) {
            Image image = Image.createImage(getWidth(), getHeight());
            Graphics g = image.getGraphics();

            g.setColor(255, 0, 0);
            g.fillRect(0, 0, getWidth(), getHeight());
            g.setColor(0, 0, 255);
            g.fillRect(20, 30, 200, 80);

            Image immutableCopy = Image.createImage(image);

            if (immutableCopy.getWidth() != image.getWidth() || immutableCopy.getHeight() != image.getHeight()) {
                System.out.println("FAIL: immutable copy's dimensions aren't same as original image");
            }

            screenG.drawImage(immutableCopy, 0, 0, Graphics.TOP | Graphics.LEFT);

            System.out.println("PAINTED");
        }
    }

    public CreateImmutableCopyTest() {
        display = Display.getDisplay(this);
    }

    public void startApp() {
        TestCanvas test = new TestCanvas();
        test.setFullScreenMode(true);
        display.setCurrent(test);
    }

    public void pauseApp() {
    }

    public void destroyApp(boolean unconditional) {
    }
}

