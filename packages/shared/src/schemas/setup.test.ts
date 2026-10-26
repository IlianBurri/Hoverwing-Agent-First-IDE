import { describe, expect, it } from 'vitest';
import type { CatalogModel, HardwareInfo, ModelCatalog } from './setup';
import { memoryBudget, rateSpeed, recommendModels } from './setup';

const GB = 1024 ** 3;

const model = (id: string, purpose: CatalogModel['purpose'], memoryGb: number): CatalogModel => ({
  id,
  name: id,
  purpose,
  sizeBytes: memoryGb * GB * 0.7,
  memoryBytes: memoryGb * GB,
  fim: purpose === 'completion',
  license: 'x',
});

const catalog: ModelCatalog = {
  version: 1,
  checked: '2026-10-26',
  updateUrl: null,
  models: [
    model('c-small', 'completion', 1),
    model('c-mid', 'completion', 2),
    model('c-big', 'completion', 3.5),
    model('chat-7b', 'chat', 7),
    model('chat-14b', 'chat', 12),
    model('chat-30b', 'chat', 22),
  ],
};

function hardware(patch: Partial<HardwareInfo>): HardwareInfo {
  return {
    os: { platform: 'Windows', name: 'Windows 11', release: '10', arch: 'x64' },
    cpu: { name: 'CPU', cores: 8, physicalCores: 8 },
    ramBytes: 16 * GB,
    gpus: [],
    backend: 'cpu',
    diskFreeBytes: 100 * GB,
    ...patch,
  };
}

describe('recommendModels', () => {
  it('uses dedicated VRAM on a discrete GPU', () => {
    const result = recommendModels(
      hardware({
        backend: 'cuda',
        gpus: [{ vendor: 'NVIDIA', model: 'RTX', vramBytes: 24 * GB, shared: false }],
      }),
      catalog,
    );
    expect(result.budget.kind).toBe('gpu');
    expect(result.completion?.id).toBe('c-big');
    expect(result.chat?.id).toBe('chat-14b');
  });

  it('keeps completion small on CPU-only machines', () => {
    const result = recommendModels(hardware({ ramBytes: 32 * GB }), catalog);
    expect(result.budget.kind).toBe('cpu');
    expect(result.completion?.id).toBe('c-mid');
    expect(result.chat?.id).toBe('chat-14b');
  });

  it('uses shared memory for integrated GPUs and Apple Silicon', () => {
    const shared = hardware({
      ramBytes: 32 * GB,
      backend: 'vulkan',
      gpus: [{ vendor: 'Intel', model: 'Arc 140V', vramBytes: 2 * GB, shared: true }],
    });
    expect(memoryBudget(shared)).toEqual({ bytes: 16 * GB, kind: 'shared' });
    expect(memoryBudget(hardware({ backend: 'metal', ramBytes: 16 * GB })).kind).toBe('shared');
  });

  it('recommends nothing for chat when memory is tight', () => {
    const result = recommendModels(hardware({ ramBytes: 8 * GB }), catalog);
    expect(result.completion?.id).toBe('c-small');
    expect(result.chat).toBeNull();
  });
});

describe('rateSpeed', () => {
  it('needs more speed for completion than for chat', () => {
    expect(rateSpeed('completion', 20)).toBe('usable');
    expect(rateSpeed('chat', 20)).toBe('fluid');
    expect(rateSpeed('chat', 3)).toBe('slow');
  });
});
