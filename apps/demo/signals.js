// packages/signals/dist/batch.js
var batchDepth = 0;
var MAX_ITERATIONS = 1e4;
var pendingNotifications = /* @__PURE__ */ new Set();
function batch(fn) {
  batchDepth++;
  try {
    fn();
  } finally {
    if (batchDepth === 1) {
      try {
        let i = 0;
        while (pendingNotifications.size > 0) {
          if (++i >= MAX_ITERATIONS) {
            pendingNotifications.clear();
            throw new Error("Infinite reactive loop: batch flush exceeded 100 iterations");
          }
          const queued = [...pendingNotifications];
          pendingNotifications.clear();
          queued.forEach((notification) => notification());
        }
      } finally {
        batchDepth--;
      }
    } else {
      batchDepth--;
    }
  }
}
function isBatching() {
  return batchDepth > 0;
}
function scheduleNotification(fn) {
  pendingNotifications.add(fn);
}

// packages/signals/dist/observer.js
var observerStack = [];
var sourceStack = [];
var isTracking = true;
function getCurrentObserver() {
  return isTracking ? observerStack.at(-1) : void 0;
}
function runWithObserver(observer, fn) {
  observerStack.push(observer);
  let returnVal;
  try {
    returnVal = fn();
  } finally {
    observerStack.pop();
  }
  return returnVal;
}
function untracked(fn) {
  const prev = isTracking;
  isTracking = false;
  try {
    return fn();
  } finally {
    isTracking = prev;
  }
}
function startTrackingSources() {
  const deps = /* @__PURE__ */ new Map();
  sourceStack.push(deps);
  return deps;
}
function stopTrackingSources() {
  sourceStack.pop();
}
function trackSource(source) {
  const s = sourceStack.at(-1);
  if (s && !s.has(source)) {
    s.set(source, source._version);
  }
}

// packages/signals/dist/observer-utils.js
function registerObserver(knownObservers, listeners, observer) {
  const callback = observer.notify;
  const cleanup = () => {
    listeners.delete(callback);
    knownObservers.delete(observer);
  };
  knownObservers.add(observer);
  listeners.add(callback);
  observer.cleanups.push(cleanup);
}
function runCleanups(cleanups) {
  for (const cleanup of cleanups)
    cleanup();
  cleanups.length = 0;
}

// packages/signals/dist/signal-impl.js
var SignalImpl = class {
  _value;
  _version = 0;
  _listeners = /* @__PURE__ */ new Set();
  _watchers = /* @__PURE__ */ new Set();
  _knownObservers = /* @__PURE__ */ new WeakSet();
  _equals;
  _preBatchValue;
  _hasPrebatchValue = false;
  constructor(value, equals) {
    this._value = value;
    this._equals = equals;
    this._flushWatchers = this._flushWatchers.bind(this);
  }
  get value() {
    trackSource(this);
    const currentObserver = getCurrentObserver();
    if (currentObserver && !this._knownObservers.has(currentObserver)) {
      registerObserver(this._knownObservers, this._listeners, currentObserver);
    }
    return this._value;
  }
  set value(newValue) {
    const oldValue = this._value;
    if (this._equals(newValue, oldValue)) {
      return;
    }
    this._value = newValue;
    this._version++;
    if (!this._hasPrebatchValue) {
      this._preBatchValue = oldValue;
      this._hasPrebatchValue = true;
    }
    const notify = () => {
      this._listeners.forEach((listener) => scheduleNotification(listener));
      scheduleNotification(this._flushWatchers);
    };
    if (isBatching()) {
      notify();
    } else {
      batch(notify);
    }
  }
  peek() {
    return this._value;
  }
  subscribe(cb) {
    this._watchers.add(cb);
    return () => this._watchers.delete(cb);
  }
  _flushWatchers() {
    if (this._hasPrebatchValue && this._equals(this._value, this._preBatchValue)) {
      this._hasPrebatchValue = false;
      return;
    }
    this._hasPrebatchValue = false;
    for (const s of [...this._watchers])
      s(this._value, this._preBatchValue);
  }
};

// packages/signals/dist/signal.js
function signal(initial, options) {
  return new SignalImpl(initial, options?.equals ?? Object.is);
}

// packages/signals/dist/computed-impl.js
var ComputedImpl = class {
  _value;
  _version = 0;
  _listeners = /* @__PURE__ */ new Set();
  _watchers = /* @__PURE__ */ new Set();
  _knownObservers = /* @__PURE__ */ new WeakSet();
  _equals;
  _fn;
  _error;
  _hasError = false;
  _isEvaluating = false;
  active = true;
  dirty = false;
  cleanups = [];
  children = /* @__PURE__ */ new Set();
  constructor(fn, equals) {
    this._fn = fn;
    this._equals = equals;
    this.notify = this.notify.bind(this);
    this._recompute();
  }
  _recompute() {
    try {
      this._value = runWithObserver(this, this._fn);
      this._hasError = false;
    } catch (error) {
      this._hasError = true;
      this._error = error;
    }
  }
  _evaluate() {
    if (this._isEvaluating) {
      this._hasError = true;
      this._error = new Error("Circular dependency detected. Computed reading itself");
      this._isEvaluating = false;
      return;
    }
    this._isEvaluating = true;
    try {
      const oldValue = this._value;
      runCleanups(this.cleanups);
      this._recompute();
      this.dirty = false;
      if (!this._hasError && !this._equals(this._value, oldValue)) {
        this._version++;
      }
    } finally {
      this._isEvaluating = false;
    }
  }
  get value() {
    trackSource(this);
    const currentObserver = getCurrentObserver();
    if (currentObserver && !this._knownObservers.has(currentObserver)) {
      registerObserver(this._knownObservers, this._listeners, currentObserver);
    }
    if (this._hasError && !this.dirty) {
      throw this._error;
    }
    const oldValue = this._value;
    if (this.dirty) {
      this._evaluate();
      if (this._hasError) {
        throw this._error;
      }
      if (!this._equals(this._value, oldValue)) {
        for (const s of [...this._watchers])
          s(this._value, oldValue);
      }
    }
    return this._value;
  }
  notify() {
    if (this.dirty)
      return;
    this.dirty = true;
    if (this._listeners.size === 0 && this._watchers.size === 0)
      return;
    const propagate = () => {
      this._listeners.forEach((listener) => scheduleNotification(listener));
      if (this._watchers.size > 0) {
        scheduleNotification(() => {
          const oldValue = this._value;
          this._evaluate();
          const valueChanged = !this._equals(this._value, oldValue);
          if (!this._hasError && !valueChanged)
            return;
          if (valueChanged && this._watchers.size) {
            for (const s of [...this._watchers])
              s(this._value, oldValue);
          }
        });
      }
    };
    if (isBatching())
      propagate();
    else
      batch(propagate);
  }
  peek() {
    return this._value;
  }
  subscribe(cb) {
    this._watchers.add(cb);
    return () => this._watchers.delete(cb);
  }
  dispose() {
    runCleanups(this.cleanups);
    this.children.forEach((child) => child.dispose());
    this.children.clear();
    this.active = false;
  }
};

// packages/signals/dist/computed.js
function computed(fn, options) {
  return new ComputedImpl(fn, options?.equals ?? Object.is);
}

// packages/signals/dist/owner-impl.js
var OwnerImpl = class {
  active = true;
  cleanups = [];
  children = /* @__PURE__ */ new Set();
  dispose() {
    this.children.forEach((child) => child.dispose());
    this.children.clear();
    runCleanups(this.cleanups);
    this.active = false;
  }
};

// packages/signals/dist/owner.js
var ownerStack = [];
function createOwner() {
  const owner = new OwnerImpl();
  const currentOwner = getCurrentOwner();
  if (currentOwner) {
    currentOwner.children.add(owner);
  }
  return owner;
}
function runWithOwner(owner, fn) {
  if (!owner.active)
    return;
  ownerStack.push(owner);
  try {
    return fn();
  } finally {
    ownerStack.pop();
  }
}
function getCurrentOwner() {
  return ownerStack.at(-1);
}

// packages/signals/dist/effect-impl.js
var EffectImpl = class {
  active = true;
  cleanups = [];
  children = /* @__PURE__ */ new Set();
  _sources;
  _fn;
  constructor(fn) {
    this._fn = fn;
    this.notify = this.notify.bind(this);
    this._run();
    const currentObserver = getCurrentObserver();
    if (currentObserver) {
      currentObserver.children.add(this);
    } else {
      const currentOwner = getCurrentOwner();
      if (currentOwner) {
        currentOwner.children.add(this);
      }
    }
  }
  _tearDown() {
    this.children.forEach((child) => child.dispose());
    this.children.clear();
    runCleanups(this.cleanups);
  }
  _run() {
    this._sources = startTrackingSources();
    try {
      const returnVal = runWithObserver(this, this._fn);
      if (typeof returnVal === "function")
        this.cleanups.push(returnVal);
    } finally {
      stopTrackingSources();
    }
  }
  dispose() {
    this._tearDown();
    this.active = false;
  }
  notify() {
    if (!this.active)
      return;
    if (this._sources.size > 0) {
      let changed = false;
      for (const [source, version] of this._sources) {
        try {
          source.value;
        } catch {
          changed = true;
          break;
        }
        if (source._version !== version) {
          changed = true;
          break;
        }
      }
      if (!changed)
        return;
    }
    this._tearDown();
    this._run();
  }
};

// packages/signals/dist/effect.js
function effect(fn) {
  return new EffectImpl(fn);
}
export {
  batch,
  computed,
  createOwner,
  effect,
  runWithOwner,
  signal,
  untracked
};
