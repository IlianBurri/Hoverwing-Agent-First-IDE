import { create } from 'zustand';
import type { DockerOverview } from '@kestrel/shared';

/** An open log or build output tab in the bottom panel. */
export interface DockerStream {
  streamId: string;
  kind: 'logs' | 'build';
  /** Container name or image tag. */
  title: string;
  /** null while running; true/false once ended (false = failed build). */
  result: boolean | null;
}

interface DockerState {
  overview: DockerOverview | null;
  dockerfiles: readonly string[];
  /** Show only containers of the open project. */
  onlyProject: boolean;
  /** Containers/images with an action in progress. */
  busy: readonly string[];
  streams: readonly DockerStream[];
  activeStream: string | null;
}

export const useDockerStore = create<DockerState>()(() => ({
  overview: null,
  dockerfiles: [],
  onlyProject: false,
  busy: [],
  streams: [],
  activeStream: null,
}));

export function setBusy(id: string, busy: boolean): void {
  useDockerStore.setState((state) => ({
    busy: busy ? [...state.busy, id] : state.busy.filter((entry) => entry !== id),
  }));
}

export function runningContainers(overview: DockerOverview | null): number {
  return overview?.containers.filter((container) => container.state === 'running').length ?? 0;
}

type OutputListener = (data: string) => void;
const listeners = new Map<string, OutputListener>();
/** Output per stream, replayed when a view mounts again (bottom panel tab switch). */
const history = new Map<string, { chunks: string[]; size: number }>();
const MAX_HISTORY = 2_000_000;

/** Routes stream output to the xterm view of a tab, replaying what came before. */
export function subscribeStream(streamId: string, listener: OutputListener): () => void {
  listeners.set(streamId, listener);
  for (const chunk of history.get(streamId)?.chunks ?? []) listener(chunk);
  return () => {
    if (listeners.get(streamId) === listener) listeners.delete(streamId);
  };
}

export function deliverStream(streamId: string, data: string): void {
  const entry = history.get(streamId) ?? { chunks: [], size: 0 };
  entry.chunks.push(data);
  entry.size += data.length;
  while (entry.size > MAX_HISTORY && entry.chunks.length > 1) {
    entry.size -= entry.chunks.shift()?.length ?? 0;
  }
  history.set(streamId, entry);
  listeners.get(streamId)?.(data);
}

export function endStream(streamId: string, ok: boolean): void {
  useDockerStore.setState((state) => ({
    streams: state.streams.map((stream) =>
      stream.streamId === streamId ? { ...stream, result: ok } : stream,
    ),
  }));
}

export function addStream(stream: DockerStream): void {
  useDockerStore.setState((state) => ({
    streams: [...state.streams, stream],
    activeStream: stream.streamId,
  }));
}

export function removeStream(streamId: string): void {
  history.delete(streamId);
  listeners.delete(streamId);
  useDockerStore.setState((state) => {
    const index = state.streams.findIndex((stream) => stream.streamId === streamId);
    const streams = state.streams.filter((stream) => stream.streamId !== streamId);
    const neighbour = streams[index] ?? streams[index - 1] ?? null;
    return {
      streams,
      activeStream:
        state.activeStream === streamId ? (neighbour?.streamId ?? null) : state.activeStream,
    };
  });
}
