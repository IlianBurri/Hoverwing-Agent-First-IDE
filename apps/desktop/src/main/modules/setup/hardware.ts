// Windows paths are built with win32 helpers on every host (tests simulate platforms).
import { win32 } from 'node:path';
import { findProgram } from '../../lib/which';
import type { Backend, GpuInfo, HardwareInfo } from '@kestrel/shared';

/** The parts of `systeminformation` we use (injectable for tests). */
export interface SystemInfo {
  graphics(): Promise<{
    controllers: {
      vendor: string;
      model: string;
      vram: number | null;
      vramDynamic: boolean;
    }[];
  }>;
  mem(): Promise<{ total: number }>;
  cpu(): Promise<{ manufacturer: string; brand: string; cores: number; physicalCores: number }>;
  osInfo(): Promise<{ platform: string; distro: string; release: string; arch: string }>;
  fsSize(): Promise<{ mount: string; available: number }[]>;
}

export interface HardwareDeps {
  si: SystemInfo;
  platform: NodeJS.Platform;
  arch: string;
  env: NodeJS.ProcessEnv;
  homeDir: string;
  exists: (path: string) => Promise<boolean>;
}

export { pathExists } from '../../lib/which';

/** Finds a program in PATH (with .exe and friends on Windows). */
export function findInPath(
  name: string,
  platform: NodeJS.Platform,
  env: NodeJS.ProcessEnv,
  exists: (path: string) => Promise<boolean>,
): Promise<string | null> {
  return findProgram(name, { platform, env, exists });
}

const MB = 1024 ** 2;

/** Maps systeminformation's controllers; virtual adapters are dropped. */
export function toGpus(
  controllers: Awaited<ReturnType<SystemInfo['graphics']>>['controllers'],
): GpuInfo[] {
  return controllers
    .filter((gpu) => !/microsoft basic|remote display|virtual|vmware|virtualbox/i.test(gpu.model))
    .map((gpu) => ({
      vendor: gpu.vendor,
      model: gpu.model,
      vramBytes: gpu.vram && gpu.vram > 0 ? gpu.vram * MB : null,
      // Integrated GPUs (dynamic VRAM, Intel without "Arc A") share the main memory.
      shared: gpu.vramDynamic || (/intel/i.test(gpu.vendor) && !/arc\(tm\) a\d/i.test(gpu.model)),
    }));
}

function vulkanLoaders(platform: NodeJS.Platform, env: NodeJS.ProcessEnv): string[] {
  if (platform === 'win32') {
    return [win32.join(env['SystemRoot'] ?? 'C:\\Windows', 'System32', 'vulkan-1.dll')];
  }
  return [
    '/usr/lib/x86_64-linux-gnu/libvulkan.so.1',
    '/usr/lib/aarch64-linux-gnu/libvulkan.so.1',
    '/usr/lib64/libvulkan.so.1',
    '/usr/lib/libvulkan.so.1',
  ];
}

/** Which acceleration Ollama/llama.cpp can likely use here. */
export async function detectBackend(
  gpus: readonly GpuInfo[],
  deps: Pick<HardwareDeps, 'platform' | 'arch' | 'env' | 'exists'>,
): Promise<Backend> {
  if (deps.platform === 'darwin') return deps.arch === 'arm64' ? 'metal' : 'cpu';
  const has = (pattern: RegExp) => gpus.some((gpu) => pattern.test(`${gpu.vendor} ${gpu.model}`));
  if (has(/nvidia/i) && (await findInPath('nvidia-smi', deps.platform, deps.env, deps.exists))) {
    return 'cuda';
  }
  if (has(/amd|advanced micro|radeon/i) && deps.platform === 'linux') {
    if (await deps.exists('/opt/rocm')) return 'rocm';
  }
  if (gpus.length > 0) {
    for (const loader of vulkanLoaders(deps.platform, deps.env)) {
      if (await deps.exists(loader)) return 'vulkan';
    }
  }
  return 'cpu';
}

/** Hardware facts for the setup assistant. Takes a few seconds on Windows. */
export async function detectHardware(deps: HardwareDeps): Promise<HardwareInfo> {
  const [graphics, mem, cpu, os, disks] = await Promise.all([
    deps.si.graphics().catch(() => ({ controllers: [] })),
    deps.si.mem(),
    deps.si.cpu(),
    deps.si.osInfo(),
    deps.si.fsSize().catch(() => []),
  ]);
  const gpus = toGpus(graphics.controllers);
  // The disk that holds the home folder (where Ollama stores models).
  const home =
    deps.platform === 'win32' ? win32.parse(deps.homeDir).root.replace(/\\$/, '') : deps.homeDir;
  const disk = disks
    .filter((entry) =>
      deps.platform === 'win32'
        ? entry.mount.toLowerCase() === home.toLowerCase()
        : home.startsWith(entry.mount),
    )
    .sort((a, b) => b.mount.length - a.mount.length)[0];
  return {
    os: { platform: os.platform, name: os.distro, release: os.release, arch: os.arch },
    cpu: {
      name: `${cpu.manufacturer} ${cpu.brand}`.trim(),
      cores: cpu.cores,
      physicalCores: cpu.physicalCores,
    },
    ramBytes: mem.total,
    gpus,
    backend: await detectBackend(gpus, deps),
    diskFreeBytes: disk?.available ?? null,
  };
}
