/*
 node-jvm
 Copyright (c) 2013 Yaroslav Gaponov <yaroslav.gaponov@gmail.com>
*/

declare var Shumway;
declare var profiling;

interface Array<T> {
  push2: (value) => void;
  pop2: () => any;
  pushKind: (kind: J2ME.Kind, value) => void;
  popKind: (kind: J2ME.Kind) => any;
  read: (i) => any;
}

module J2ME {
  import assert = Debug.assert;
  import Bytecodes = Bytecode.Bytecodes;
  declare var VM;
  declare var setZeroTimeout;

  export enum WriterFlags {
    None  = 0x00,
    Trace = 0x01,
    Link  = 0x02,
    Init  = 0x04,
    Perf  = 0x08,
    Load  = 0x10,
    JIT   = 0x20,
    Code  = 0x40,
    Thread = 0x80,

    All   = Trace | Link | Init | Perf | Load | JIT | Code | Thread
  }

  /**
   * Toggle VM tracing here.
   */
  export var writers = WriterFlags.None;

  Array.prototype.push2 = function(value) {
    this.push(value);
    this.push(null);
    return value;
  }

  Array.prototype.pop2 = function() {
    this.pop();
    return this.pop();
  }

  Array.prototype.pushKind = function(kind: Kind, value) {
    if (isTwoSlot(kind)) {
      this.push2(value);
      return;
    }
    this.push(value);
  }

  Array.prototype.popKind = function(kind: Kind) {
    if (isTwoSlot(kind)) {
      return this.pop2();
    }
    return this.pop();
  }

  // A convenience function for retrieving values in reverse order
  // from the end of the stack.  stack.read(1) returns the topmost item
  // on the stack, while stack.read(2) returns the one underneath it.
  Array.prototype.read = function(i) {
    return this[this.length - i];
  };

  export var frameCount = 0;

  export class Frame {
    methodInfo: MethodInfo;
    local: any [];
    stack: any [];
    code: Uint8Array;
    pc: number;
    opPC: number;
    lockObject: java.lang.Object;

    static dirtyStack: Frame [] = [];

    /**
     * Denotes the start of the context frame stack.
     */
    static Start: Frame = Frame.create(null, null);

    /**
     * Marks a frame set.
     */
    static Marker: Frame = Frame.create(null, null);

    static isMarker(frame: Frame) {
      return frame.methodInfo === null;
    }

    constructor(methodInfo: MethodInfo, local: any []) {
      frameCount ++;
      this.stack = [];
      this.reset(methodInfo, local);
    }

    reset(methodInfo: MethodInfo, local: any []) {
      this.methodInfo = methodInfo;
      this.code = methodInfo ? methodInfo.codeAttribute.code : null;
      this.pc = 0;
      this.opPC = 0;
      this.stack.length = 0;
      this.local = local;
      this.lockObject = null;
    }

    static create(methodInfo: MethodInfo, local: any []): Frame {
      var dirtyStack = Frame.dirtyStack;
      if (dirtyStack.length) {
        var frame = dirtyStack.pop();
        frame.reset(methodInfo, local);
        return frame;
      } else {
        return new Frame(methodInfo, local);
      }
    }

    free() {
      release || assert(!Frame.isMarker(this));
      Frame.dirtyStack.push(this);
    }

    incLocal(i: number, value: any) {
      this.local[i] += value | 0;
    }

    read8(): number {
      return this.code[this.pc++];
    }

    peek8(): number {
      return this.code[this.pc];
    }

    read16(): number {
      var code = this.code
      return code[this.pc++] << 8 | code[this.pc++];
    }

    patch(offset: number, oldValue: Bytecodes, newValue: Bytecodes) {
      release || assert(this.code[this.pc - offset] === oldValue);
      this.code[this.pc - offset] = newValue;
    }

    read32(): number {
      return this.read32Signed() >>> 0;
    }

    read8Signed(): number {
      return this.code[this.pc++] << 24 >> 24;
    }

    read16Signed(): number {
      var pc = this.pc;
      var code = this.code;
      this.pc = pc + 2
      return (code[pc] << 8 | code[pc + 1]) << 16 >> 16;
    }

    readTargetPC(): number {
      var pc = this.pc;
      var code = this.code;
      this.pc = pc + 2
      var offset = (code[pc] << 8 | code[pc + 1]) << 16 >> 16;
      return pc - 1 + offset;
    }

    read32Signed(): number {
      return this.read16() << 16 | this.read16();
    }

    tableSwitch(): number {
      var start = this.pc;
      while ((this.pc & 3) != 0) {
        this.pc++;
      }
      var def = this.read32Signed();
      var low = this.read32Signed();
      var high = this.read32Signed();
      var value = this.stack.pop();
      var pc;
      if (value < low || value > high) {
        pc = def;
      } else {
        this.pc += (value - low) << 2;
        pc = this.read32Signed();
      }
      return start - 1 + pc;
    }

    lookupSwitch(): number {
      var start = this.pc;
      while ((this.pc & 3) != 0) {
        this.pc++;
      }
      var pc = this.read32Signed();
      var size = this.read32();
      var value = this.stack.pop();
      lookup:
      for (var i = 0; i < size; i++) {
        var key = this.read32Signed();
        var offset = this.read32Signed();
        if (key === value) {
          pc = offset;
        }
        if (key >= value) {
          break lookup;
        }
      }
      return start - 1 + pc;
    }

    wide() {
      var stack = this.stack;
      var op = this.read8();
      switch (op) {
        case Bytecodes.ILOAD:
        case Bytecodes.FLOAD:
        case Bytecodes.ALOAD:
          stack.push(this.local[this.read16()]);
          break;
        case Bytecodes.LLOAD:
        case Bytecodes.DLOAD:
          stack.push2(this.local[this.read16()]);
          break;
        case Bytecodes.ISTORE:
        case Bytecodes.FSTORE:
        case Bytecodes.ASTORE:
          this.local[this.read16()] = stack.pop();
          break;
        case Bytecodes.LSTORE:
        case Bytecodes.DSTORE:
          this.local[this.read16()] = stack.pop2();
          break;
        case Bytecodes.IINC:
          var index = this.read16();
          var value = this.read16Signed();
          this.local[index] += value;
          break;
        case Bytecodes.RET:
          this.pc = this.local[this.read16()];
          break;
        default:
          var opName = Bytecodes[op];
          throw new Error("Wide opcode " + opName + " [" + op + "] not supported.");
      }
    }

    /**
     * Returns the |object| on which a call to the specified |methodInfo| would be
     * called.
     */
    peekInvokeObject(methodInfo: MethodInfo): java.lang.Object {
      release || assert(!methodInfo.isStatic);
      var i = this.stack.length - methodInfo.argumentSlots - 1;
      release || assert (i >= 0);
      release || assert (this.stack[i] !== undefined);
      return this.stack[i];
    }

    popArgumentsInto(methodInfo: MethodInfo, args): any [] {
      var stack = this.stack;
      var signatureKinds = methodInfo.signatureKinds;
      var argumentSlots = methodInfo.argumentSlots;
      for (var i = 1, j = stack.length - argumentSlots, k = 0; i < signatureKinds.length; i++) {
        args[k++] = stack[j++];
        if (isTwoSlot(signatureKinds[i])) {
          j++;
        }
      }
      release || assert(j === stack.length && k === signatureKinds.length - 1);
      stack.length -= argumentSlots;
      args.length = k;
      return args;
    }

    toString() {
      return this.methodInfo.implKey + " " + this.pc;
    }

    trace(writer: IndentingWriter) {
      var localStr = this.local.map(function (x) {
        return toDebugString(x);
      }).join(", ");

      var stackStr = this.stack.map(function (x) {
        return toDebugString(x);
      }).join(", ");

      writer.writeLn(("" + this.pc).padLeft(" ", 4) + " " + localStr + " | " + stackStr);
    }
  }

  export class Context {
    private static _nextId: number = 0;
    private static _colors = [
      IndentingWriter.PURPLE,
      IndentingWriter.YELLOW,
      IndentingWriter.GREEN,
      IndentingWriter.RED,
      IndentingWriter.BOLD_RED
    ];
    private static writer: IndentingWriter = new IndentingWriter(false, function (s) {
      console.log(s);
    });

    id: number;
    priority: number = NORMAL_PRIORITY;

    private static waitStr: string = "wait";
    private static monitorEnterStr: string = "monitorEnter";

    /**
     * Are we currently unwinding the stack because of a Yield?
     */
    U: J2ME.VMState = J2ME.VMState.Running;

    /**
     * Whether or not the context is currently paused.  The profiler uses this
     * to distinguish execution time from paused time in an async method.
     */
    paused: boolean = true;

    /*
     * Contains method frames separated by special frame instances called marker frames. These
     * mark the position in the frame stack where the interpreter starts execution.
     *
     * During normal execution, a marker frame is inserted on every call to |executeFrame|, so
     * the stack looks something like:
     *
     *     frame stack: [start, f0, m, f1, m, f2]
     *                   ^          ^      ^
     *                   |          |      |
     *   js call stack:  I ........ I .... I ...
     *
     * After unwinding, the frame stack is compacted:
     *
     *     frame stack: [start, f0, f1, f2]
     *                   ^       ^
     *                   |       |
     *   js call stack:  I ..... I .......
     *
     */
    private frames: Frame [];
    bailoutFrames: Frame [];
    lockTimeout: number;
    lockLevelOnAcquire: number = 1;
    thread: java.lang.Thread;
    writer: IndentingWriter;
    methodTimeline: any;
    virtualRuntime: number;
    constructor(public runtime: Runtime) {
      var id = this.id = Context._nextId ++;
      this.frames = [];
      this.bailoutFrames = [];
      this.runtime = runtime;
      this.runtime.addContext(this);
      this.virtualRuntime = 0;
      this.writer = new IndentingWriter(false, function (s) {
        console.log(s);
      });
      if (profile && typeof Shumway !== "undefined") {
        this.methodTimeline = new Shumway.Tools.Profiler.TimelineBuffer("Thread " + this.runtime.id + ":" + this.id);
        methodTimelines.push(this.methodTimeline);
      }
    }

    public static color(id) {
      if (inBrowser) {
        return id;
      }
      return Context._colors[id % Context._colors.length] + id + IndentingWriter.ENDC;
    }
    public static currentContextPrefix() {
      if ($) {
        return Context.color($.id) + "." + $.ctx.runtime.priority + ":" + Context.color($.ctx.id) + "." + $.ctx.priority;
      }
      return "";
    }

    /**
     * Sets global writers. Uncomment these if you want to see trace output.
     */
    static setWriters(writer: IndentingWriter) {
      traceWriter = writers & WriterFlags.Trace ? writer : null;
      perfWriter = writers & WriterFlags.Perf ? writer : null;
      linkWriter = writers & WriterFlags.Link ? writer : null;
      jitWriter = writers & WriterFlags.JIT ? writer : null;
      codeWriter = writers & WriterFlags.Code ? writer : null;
      initWriter = writers & WriterFlags.Init ? writer : null;
      threadWriter = writers & WriterFlags.Thread ? writer : null;
      loadWriter = writers & WriterFlags.Load ? writer : null;
    }

    kill() {
      if (this.thread) {
        this.thread.alive = false;
      }
      this.runtime.removeContext(this);
    }

    current(): Frame {
      var frames = this.frames;
      return frames[frames.length - 1];
    }

    popFrame(): Frame {
      var frame = this.frames.pop();
      if (profile) {
        this.leaveMethodTimeline(frame.methodInfo.implKey, MethodType.Interpreted);
      }
      return frame;
    }

    pushFrame(frame: Frame) {
      if (profile) {
        this.enterMethodTimeline(frame.methodInfo.implKey, MethodType.Interpreted);
      }
      this.frames.push(frame);
    }

    private popMarkerFrame() {
      var marker = this.frames.pop();
      release || assert (Frame.isMarker(marker));
    }

    // NB: This does not set this Context as the current context. This must only
    // be called on the current context.
    executeFrame(frame: Frame) {
      var frames = this.frames;
      frames.push(Frame.Marker);
      this.pushFrame(frame);

      try {
        var returnValue = VM.execute();
        if (this.U) {
          // Prepend all frames up until the first marker to the bailout frames.
          while (true) {
            var frame = frames.pop();
            if (Frame.isMarker(frame)) {
              break;
            }
            this.bailoutFrames.unshift(frame);
          }
          return;
        }
      } catch (e) {
        this.popMarkerFrame();
        throwHelper(e);
      }
      this.popMarkerFrame();
      return returnValue;
    }

    createException(className: string, message?: string) {
      if (!message) {
        message = "";
      }
      message = "" + message;
      var classInfo = CLASSES.loadAndLinkClass(className);
      classInitCheck(classInfo);
      release || Debug.assert(!this.U, "Unexpected unwind during createException.");
      runtimeCounter && runtimeCounter.count("createException " + className);
      var exception = new classInfo.klass();
      var methodInfo = classInfo.getMethodByNameString("<init>", "(Ljava/lang/String;)V");
      preemptionLockLevel++;
      getLinkedMethod(methodInfo).call(exception, message ? newString(message) : null);
      release || Debug.assert(!this.U, "Unexpected unwind during createException.");
      preemptionLockLevel--;
      return exception;
    }

    setAsCurrentContext() {
      if ($) {
        threadTimeline && threadTimeline.leave();
      }
      threadTimeline && threadTimeline.enter(this.runtime.id + ":" + this.id);
      $ = this.runtime;
      if ($.ctx === this) {
        return;
      }
      $.ctx = this;
      Context.setWriters(this.writer);
    }

    clearCurrentContext() {
      if ($) {
        threadTimeline && threadTimeline.leave();
      }
      $ = null;
      Context.setWriters(Context.writer);
    }

    start(frames: Frame[]) {
      this.frames.push(Frame.Start);
      for (var i = 0; i < frames.length; i++) {
        this.pushFrame(frames[i]);
      }
      this.resume();
    }

    execute() {
      this.setAsCurrentContext();
      profile && this.resumeMethodTimeline();
      do {
        VM.execute();
        if (this.U) {
          if (this.bailoutFrames.length) {
            Array.prototype.push.apply(this.frames, this.bailoutFrames);
            this.bailoutFrames = [];
          }
          var frames = this.frames;
          switch (this.U) {
            case VMState.Yielding:
              this.resume();
              break;
            case VMState.Pausing:
              break;
            case VMState.Stopping:
              this.clearCurrentContext();
              this.kill();
              return;
          }
          this.U = VMState.Running;
          this.clearCurrentContext();
          return;
        }
      } while (this.current() !== Frame.Start);
      this.clearCurrentContext();
      this.kill();
    }

    resume() {
      Scheduler.enqueue(this);
    }

    wakeup(obj) {
      if (this.lockTimeout !== null) {
        window.clearTimeout(this.lockTimeout);
        this.lockTimeout = null;
      }

      var lock = obj._lock;

      if (lock.level !== 0) {
        lock.ready.put(this);
        return;
      }

      this.acquire(lock);
      this.resume();
    }

    // NB: Only call to acquire a lock for the first time, after checking
    // that another thread does not already own it.
    acquire(lock) {
      lock.ctx = this;
      lock.level = this.lockLevelOnAcquire;
      this.lockLevelOnAcquire = 1;
    }

    monitorEnter(object: java.lang.Object) {
      var lock = object._lock;
      if (!lock) {
        object._lock = new Lock(this, this.lockLevelOnAcquire);
        this.lockLevelOnAcquire = 1;
      } else if (lock.level === 0) {
        this.acquire(lock);
      } else if (lock.ctx === this) {
        ++lock.level;
      } else {
        lock.ready.put(this);
        this.pause(Context.monitorEnterStr);
      }
    }

    monitorExit(object: java.lang.Object) {
      var lock = object._lock;
      if (!lock || lock.ctx !== this || lock.level === 0) {
        throw $.newIllegalMonitorStateException();
      }

      if (--lock.level > 0 || !lock.ready.hasMore()) {
        return;
      }

      lock.ready.get(performance.now()).wakeup(object);
    }

    wait(obj: java.lang.Object, timeout) {
      if (timeout < 0) {
        throw $.newIllegalArgumentException();
      }

      var lock = obj._lock;
      if (!lock || lock.ctx !== this || lock.level === 0) {
        throw $.newIllegalMonitorStateException();
      }

      this.lockLevelOnAcquire = lock.level;
      lock.level = 1;
      this.monitorExit(obj);
      if (timeout) {
        var self = this;
        this.lockTimeout = window.setTimeout(function () {
          lock.waiting.remove(self);
          self.wakeup(obj);
        }, timeout);
      } else {
        this.lockTimeout = null;
      }
      lock.waiting.put(this);
      this.pause(Context.waitStr);
    }

    notify(obj, notifyAll) {
      var lock = obj._lock;
      if (!lock || lock.ctx !== this || lock.level === 0) {
        throw $.newIllegalMonitorStateException();
      }

      if (!lock.waiting.hasMore()) {
        return;
      }

      if (!notifyAll) {
        lock.waiting.get(performance.now()).wakeup(obj);
        return;
      }

      var ctxs = lock.waiting.getAll();
      while (ctxs.length) {
        ctxs.pop().wakeup(obj)
      }
    }

    bailout(methodInfo: MethodInfo, pc: number, nextPC: number, local: any [], stack: any [], lockObject: java.lang.Object) {
      // perfWriter && perfWriter.writeLn("C Unwind: " + methodInfo.implKey);
      var frame = Frame.create(methodInfo, local);
      frame.stack = stack;
      frame.pc = nextPC;
      frame.opPC = pc;
      frame.lockObject = lockObject;
      this.bailoutFrames.unshift(frame);
    }

    pauseMethodTimeline() {
      release || assert(!this.paused, "context is not paused");

      if (profiling) {
        this.methodTimeline.enter("<pause>", MethodType.Interpreted);
      }

      this.paused = true;
    }

    resumeMethodTimeline() {
      release || assert(this.paused, "context is paused");

      if (profiling) {
        this.methodTimeline.leave("<pause>", MethodType.Interpreted);
      }

      this.paused = false;
    }

    /**
     * Re-enters all the frames that are currently on the stack so the full stack
     * trace shows up in the profiler.
     */
    restartMethodTimeline() {
      for (var i = 0; i < this.frames.length; i++) {
        var frame = this.frames[i];
        if (J2ME.Frame.isMarker(frame)) {
          continue;
        }
        this.methodTimeline.enter(frame.methodInfo.implKey, MethodType.Interpreted);
      }

      if (this.paused) {
        this.methodTimeline.enter("<pause>", MethodType.Interpreted);
      }
    }

    enterMethodTimeline(key: string, methodType: MethodType) {
      if (profiling) {
        this.methodTimeline.enter(key, MethodType[methodType]);
      }
    }

    leaveMethodTimeline(key: string, methodType: MethodType) {
      if (profiling) {
        this.methodTimeline.leave(key, MethodType[methodType]);
      }
    }


    yield(reason: string) {
      unwindCount ++;
      threadWriter && threadWriter.writeLn("yielding " + reason);
      runtimeCounter && runtimeCounter.count("yielding " + reason);
      this.U = VMState.Yielding;
      profile && this.pauseMethodTimeline();
    }

    pause(reason: string) {
      unwindCount ++;
      threadWriter && threadWriter.writeLn("pausing " + reason);
      runtimeCounter && runtimeCounter.count("pausing " + reason);
      this.U = VMState.Pausing;
      profile && this.pauseMethodTimeline();
    }

    stop() {
      this.U = VMState.Stopping;
    }
  }
}

var Context = J2ME.Context;
var Frame = J2ME.Frame;
