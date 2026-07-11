import { describe, expect, it } from 'vitest';

import { normalizeImageRequestGeometry } from './imageRequestGeometry';

describe('normalizeImageRequestGeometry', () => {
  it('lets an explicit pixel size override auto/reference geometry', () => {
    expect(normalizeImageRequestGeometry({
      selectedResolution: '2048x2048',
      selectedAspectRatio: 'auto',
      referenceAspectRatio: '53:79',
      supportedAspectRatios: ['auto', '16:9', '9:16', '1:1', '4:3', '3:4'],
    })).toEqual(expect.objectContaining({
      requestSize: '2048x2048',
      requestAspectRatio: 'auto',
      promptAspectRatio: '1:1',
      resolutionLabel: '2048x2048',
      ratioSource: 'pixel-size',
    }));
  });

  it('maps an arbitrary reference ratio to the nearest supported standard ratio for tiers', () => {
    expect(normalizeImageRequestGeometry({
      selectedResolution: '2K',
      selectedAspectRatio: 'auto',
      referenceAspectRatio: '53:79',
      supportedAspectRatios: ['auto', '16:9', '9:16', '1:1', '4:3', '3:4', '2:3'],
    })).toEqual(expect.objectContaining({
      requestSize: '2K',
      requestAspectRatio: '2:3',
      promptAspectRatio: '2:3',
      ratioSource: 'reference',
    }));
  });

  it('keeps an explicit ratio for abstract resolution tiers', () => {
    expect(normalizeImageRequestGeometry({
      selectedResolution: '4k',
      selectedAspectRatio: '16:9',
      referenceAspectRatio: '1:1',
      supportedAspectRatios: ['auto', '16:9', '1:1'],
    })).toEqual(expect.objectContaining({
      requestSize: '4k',
      requestAspectRatio: '16:9',
      promptAspectRatio: '16:9',
      ratioSource: 'explicit',
    }));
  });
});
