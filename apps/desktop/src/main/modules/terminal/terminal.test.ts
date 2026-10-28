import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { OutputBatcher } from './batcher';
import { TerminalManager } from './manager';
import type { PtyProcess } from './manager';
import { defaultShell, terminalEnv } from './shell';

describe('defaultShell', () => {
  it('uses $SHELL on Linux and a login shell on macOS', () => {
    expect(defaultShell('linux', { SHELL: '/usr/bin/fish' })).toEqual({
      file: '/usr/bin/fish',
      args: [],
    });
    expect(defaultShell('darwin', {})).toEqual({ file: '/bin/zsh', args: ['-l'] });
  });

  it('uses PowerShell on Windows', () => {
    expect(defaultShell('win32', {}).file).toBe('powershell.exe');
  });
});

describe('terminalEnv', () => {
  it('removes internal variables and sets terminal capabilities', () => {
    const env = terminalEnv(
      {
        PATH: '/bin',
        ELECTRON_RUN_AS_NODE: '1',
        KESTREL_USER_DATA_DIR: '/tmp/x',
        LANG: 'de_CH.UTF-8',
      },
      '1.0.0',
    );
    expect(env).toMatchObject({
      PATH: '/bin',
      TERM: 'xterm-256color',
      TERM_PROGRAM: 'Hoverwing',
      LANG: 'de_CH.UTF-8',
    });
    expect(env).not.toHaveProperty('ELECTRON_RUN_AS_NODE');
    expect(env).not.toHaveProperty('KESTREL_USER_DATA_DIR');
  });
});

describe('OutputBatcher', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('joins small chunks into one message', () => {
    const deliver = vi.fn();
    const batcher = new OutputBatcher(deliver, 8);
    batcher.push('a');
    batcher.push('b');
    vi.advanceTimersByTime(8);
    expect(deliver).toHaveBeenCalledExactlyOnceWith('ab');
  });

  it('flushes immediately when a lot of output arrives', () => {
    const deliver = vi.fn();
    const batcher = new OutputBatcher(deliver, 8, 10);
    batcher.push('0123456789');
    expect(deliver).toHaveBeenCalledWith('0123456789');
  });
});

function fakePty() {
  let dataListener: (data: string) => void = () => undefined;
  let exitListener: (event: { exitCode: number }) => void = () => undefined;
  const pty: PtyProcess & { emit: (data: string) => void; exit: (code: number) => void } = {
    onData: (listener) => {
      dataListener = listener;
    },
    onExit: (listener) => {
      exitListener = listener;
    },
    write: vi.fn(),
    resize: vi.fn(),
    kill: vi.fn(),
    emit: (data) => {
      dataListener(data);
    },
    exit: (code) => {
      exitListener({ exitCode: code });
    },
  };
  return pty;
}

describe('TerminalManager', () => {
  const shell = { file: '/bin/bash', args: [] };
  const options = { cwd: '/tmp', cols: 80, rows: 24, env: {} };

  it('routes output and exit events to the owning window', () => {
    vi.useFakeTimers();
    const pty = fakePty();
    const events = { onData: vi.fn(), onExit: vi.fn() };
    const manager = new TerminalManager(() => pty, events);
    const id = manager.create(7, shell, options);
    pty.emit('hello');
    vi.advanceTimersByTime(10);
    expect(events.onData).toHaveBeenCalledWith(7, id, 'hello');
    pty.exit(0);
    expect(events.onExit).toHaveBeenCalledWith(7, id, 0);
    expect(manager.count(7)).toBe(0);
    vi.useRealTimers();
  });

  it('only lets the owner write to a terminal', () => {
    const pty = fakePty();
    const manager = new TerminalManager(() => pty, { onData: vi.fn(), onExit: vi.fn() });
    const id = manager.create(1, shell, options);
    manager.write(1, id, 'ls\r');
    expect(pty.write).toHaveBeenCalledWith('ls\r');
    expect(() => {
      manager.write(2, id, 'rm -rf ~\r');
    }).toThrow(expect.objectContaining({ code: 'not_found' }));
  });

  it('kills all terminals of a window', () => {
    const ptys = [fakePty(), fakePty(), fakePty()];
    let index = 0;
    const manager = new TerminalManager(() => ptys[index++] ?? fakePty(), {
      onData: vi.fn(),
      onExit: vi.fn(),
    });
    manager.create(1, shell, options);
    manager.create(1, shell, options);
    manager.create(2, shell, options);
    manager.killAll(1);
    expect(ptys[0]?.kill).toHaveBeenCalled();
    expect(ptys[1]?.kill).toHaveBeenCalled();
    expect(ptys[2]?.kill).not.toHaveBeenCalled();
    expect(manager.count(2)).toBe(1);
  });
});
