import { describe, expect, it } from 'vitest';

import type { ProtocolPackageMarker } from './index.js';

describe('protocol workspace package', () => {
  it('can type-check and run a minimal test', () => {
    const marker: ProtocolPackageMarker = 'protocol';

    expect(marker).toBe('protocol');
  });
});
