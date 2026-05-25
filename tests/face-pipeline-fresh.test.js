import test from 'node:test';
import assert from 'node:assert/strict';

import { FacePipeline } from '../src/pipeline/face.js';

test('marks detector-produced faces fresh and cached faces stale', async () => {
  const pipeline = new FacePipeline();
  pipeline.human = {
    detect: async () => ({
      face: [{ box: [1, 2, 3, 4], score: 0.9 }],
    }),
  };
  pipeline._cropToCanvas = async () => ({});

  const track = {
    id: 42,
    x1: 10,
    y1: 20,
    x2: 50,
    y2: 80,
    lastFaceFrameIdx: -10_000_000,
    lastFaces: null,
  };
  const source = { width: 100, height: 100 };

  const detected = await pipeline.detect(source, [track], { frameIdx: 10, fps: 30 });
  const cached = await pipeline.detect(source, [track], { frameIdx: 11, fps: 30 });

  assert.equal(detected.faces[0].fresh, true);
  assert.equal(cached.faces[0].fresh, false);
});
