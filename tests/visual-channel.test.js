import test from 'node:test';
import assert from 'node:assert/strict';

import { VisualChannel } from '../src/presence/channels/visual.js';

function fakeElement() {
  const classes = new Set();
  return {
    dataset: {},
    attrs: {},
    classList: {
      toggle(name, enabled) {
        if (enabled) classes.add(name);
        else classes.delete(name);
      },
      contains(name) {
        return classes.has(name);
      },
    },
    setAttribute(name, value) {
      this.attrs[name] = value;
    },
  };
}

test('sets lamp and stage state for face alerts', () => {
  const stage = fakeElement();
  const lamp = fakeElement();
  const visual = new VisualChannel({ stage, lamp });

  visual.setState('face', '偵測到臉');

  assert.equal(stage.classList.contains('presence-present'), true);
  assert.equal(stage.classList.contains('presence-face'), true);
  assert.equal(lamp.dataset.state, 'face');
  assert.equal(lamp.attrs['aria-label'], '偵測到臉');
});

test('clear resets visual state to none', () => {
  const stage = fakeElement();
  const lamp = fakeElement();
  const visual = new VisualChannel({ stage, lamp });

  visual.setState('face', '偵測到臉');
  visual.clear();

  assert.equal(stage.classList.contains('presence-present'), false);
  assert.equal(stage.classList.contains('presence-face'), false);
  assert.equal(lamp.dataset.state, 'none');
  assert.equal(lamp.attrs['aria-label'], '無人');
});
