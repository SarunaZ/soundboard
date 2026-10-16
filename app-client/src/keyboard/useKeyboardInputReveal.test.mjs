import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import test from 'node:test';

const hookPath = fileURLToPath(new URL('./useKeyboardInputReveal.ts', import.meta.url));
const geometryUrl = new URL('./keyboardGeometry.ts', import.meta.url).href;

async function makeHarness(t) {
  const directory = mkdtempSync(path.join(tmpdir(), 'soundboard-keyboard-hook-'));
  const state = {
    listeners: new Map(),
    visible: false,
    metrics: undefined,
    frames: new Map(),
    nextFrame: 1,
    measurements: [],
    deferMeasurements: false,
    scrollCalls: [],
    slots: [],
    hookResult: null,
    scrollRef: { current: null },
  };
  globalThis.__keyboardHookHarness = state;

  writeFileSync(path.join(directory, 'fakeReact.mjs'), `
    const current = () => globalThis.__keyboardHookHarness;
    const same = (left, right) => left?.length === right?.length && left.every((value, index) => Object.is(value, right[index]));
    export function useRef(initialValue) {
      const harness = current();
      const index = harness.index++;
      if (!harness.slots[index]) harness.slots[index] = { kind: 'ref', value: { current: initialValue } };
      return harness.slots[index].value;
    }
    export function useCallback(callback, dependencies) {
      const harness = current();
      const index = harness.index++;
      const previous = harness.slots[index];
      if (!previous || !same(previous.dependencies, dependencies)) {
        harness.slots[index] = { kind: 'callback', dependencies, value: callback };
      }
      return harness.slots[index].value;
    }
    export function useEffect(effect, dependencies) {
      const harness = current();
      const index = harness.index++;
      const previous = harness.slots[index];
      if (!previous || !same(previous.dependencies, dependencies)) {
        previous?.cleanup?.();
        harness.slots[index] = { kind: 'effect', dependencies, cleanup: effect() };
      }
    }
  `);
  writeFileSync(path.join(directory, 'fakeNative.mjs'), `
    const current = () => globalThis.__keyboardHookHarness;
    export const Keyboard = {
      isVisible: () => current().visible,
      metrics: () => current().metrics,
      addListener(event, callback) {
        const harness = current();
        const callbacks = harness.listeners.get(event) ?? new Set();
        callbacks.add(callback);
        harness.listeners.set(event, callbacks);
        return { remove: () => callbacks.delete(callback) };
      },
    };
  `);
  const fakeReactUrl = pathToFileURL(path.join(directory, 'fakeReact.mjs')).href;
  const fakeNativeUrl = pathToFileURL(path.join(directory, 'fakeNative.mjs')).href;
  const source = readFileSync(hookPath, 'utf8')
    .replace("from 'react';", `from '${fakeReactUrl}';`)
    .replace("from 'react-native';", `from '${fakeNativeUrl}';`)
    .replace("from './keyboardGeometry';", `from '${geometryUrl}';`);
  const sourcePath = path.join(directory, 'useKeyboardInputReveal.ts');
  writeFileSync(sourcePath, source);
  const priorRequestFrame = globalThis.requestAnimationFrame;
  const priorCancelFrame = globalThis.cancelAnimationFrame;
  globalThis.requestAnimationFrame = (callback) => {
    const id = state.nextFrame++;
    state.frames.set(id, callback);
    return id;
  };
  globalThis.cancelAnimationFrame = (id) => state.frames.delete(id);
  const hookModule = await import(`${pathToFileURL(sourcePath).href}?instance=${Math.random()}`);
  const render = (enabled, scrollView) => {
    state.index = 0;
    state.scrollRef.current = scrollView;
    state.hookResult = hookModule.useKeyboardInputReveal(state.scrollRef, enabled);
    return state.hookResult;
  };
  const unmount = () => {
    for (const slot of state.slots) slot?.cleanup?.();
    state.slots = [];
  };
  const flushFrames = () => {
    while (state.frames.size) {
      const [id, callback] = state.frames.entries().next().value;
      state.frames.delete(id);
      callback(0);
    }
  };
  const emit = (event, payload = {}) => {
    for (const callback of state.listeners.get(event) ?? []) callback(payload);
  };
  const deliverMeasurements = () => {
    while (state.measurements.length) state.measurements.shift()();
  };
  t.after(() => {
    unmount();
    globalThis.requestAnimationFrame = priorRequestFrame;
    globalThis.cancelAnimationFrame = priorCancelFrame;
    delete globalThis.__keyboardHookHarness;
    rmSync(directory, { recursive: true, force: true });
  });
  return { state, render, unmount, flushFrames, emit, deliverMeasurements };
}

function makeScrollView(harness, viewport) {
  return {
    getNativeScrollRef: () => ({
      measureInWindow(callback) {
        const deliver = () => callback(viewport.x, viewport.y, viewport.width, viewport.height);
        if (harness.state.deferMeasurements) harness.state.measurements.push(deliver);
        else deliver();
      },
    }),
    scrollTo: (options) => harness.state.scrollCalls.push(options),
  };
}

function makeInput(harness, rect) {
  return {
    measureInWindow(callback) {
      const deliver = () => callback(rect.x, rect.y, rect.width, rect.height);
      if (harness.state.deferMeasurements) harness.state.measurements.push(deliver);
      else deliver();
    },
  };
}

test('initializes from an already visible keyboard and reveals a newly focused input', async (t) => {
  const harness = await makeHarness(t);
  harness.state.visible = true;
  harness.state.metrics = { screenY: 560 };
  const scrollView = makeScrollView(harness, { x: 0, y: 80, width: 400, height: 700 });
  const result = harness.render(true, scrollView);
  result.onFocus(makeInput(harness, { x: 16, y: 540, width: 300, height: 50 }));
  harness.flushFrames();
  assert.deepEqual(harness.state.scrollCalls, [{ y: 46, animated: true }]);
});

test('blur and keyboard hide cancel queued measurements; unmount removes listeners and frames', async (t) => {
  const harness = await makeHarness(t);
  const scrollView = makeScrollView(harness, { x: 0, y: 80, width: 400, height: 700 });
  const result = harness.render(true, scrollView);
  harness.emit('keyboardDidShow', { endCoordinates: { screenY: 560 } });
  const input = makeInput(harness, { x: 16, y: 540, width: 300, height: 50 });
  result.onFocus(input);
  result.onBlur(input);
  harness.flushFrames();
  assert.deepEqual(harness.state.scrollCalls, []);

  result.onFocus(input);
  harness.emit('keyboardDidHide');
  harness.flushFrames();
  assert.deepEqual(harness.state.scrollCalls, []);
  harness.emit('keyboardDidShow', { endCoordinates: { screenY: 560 } });
  result.onFocus(input);
  assert.ok(harness.state.frames.size > 0);
  harness.unmount();
  assert.equal(harness.state.frames.size, 0);
  assert.equal(harness.state.listeners.get('keyboardDidShow').size, 0);
  assert.equal(harness.state.listeners.get('keyboardDidHide').size, 0);
  harness.flushFrames();
  assert.deepEqual(harness.state.scrollCalls, []);
});

test('closing and reopening the rename modal resets its old scroll offset', async (t) => {
  const harness = await makeHarness(t);
  const scrollView = makeScrollView(harness, { x: 0, y: 100, width: 400, height: 300 });
  const first = harness.render(true, scrollView);
  first.onScroll({ nativeEvent: { contentOffset: { y: 200 } } });
  harness.render(false, scrollView);
  harness.state.visible = true;
  harness.state.metrics = { screenY: 400 };
  const reopened = harness.render(true, scrollView);
  reopened.onFocus(makeInput(harness, { x: 16, y: 340, width: 300, height: 50 }));
  harness.flushFrames();
  assert.deepEqual(harness.state.scrollCalls, [{ y: 6, animated: true }]);
});

test('a late native measurement cannot scroll after the modal closes', async (t) => {
  const harness = await makeHarness(t);
  harness.state.visible = true;
  harness.state.metrics = { screenY: 400 };
  harness.state.deferMeasurements = true;
  const scrollView = makeScrollView(harness, { x: 0, y: 100, width: 400, height: 300 });
  const result = harness.render(true, scrollView);
  result.onFocus(makeInput(harness, { x: 16, y: 340, width: 300, height: 50 }));
  harness.flushFrames();
  harness.render(false, scrollView);
  harness.deliverMeasurements();
  assert.deepEqual(harness.state.scrollCalls, []);
});
