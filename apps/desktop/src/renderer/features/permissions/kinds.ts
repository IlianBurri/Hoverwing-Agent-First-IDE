import {
  Container,
  FileMinus,
  FilePen,
  FileSearch,
  Globe,
  Plug,
  SquareTerminal,
  AppWindow,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { PermissionKind } from '@kestrel/shared';

export const kindIcons: Record<PermissionKind, LucideIcon> = {
  'file.read': FileSearch,
  'file.write': FilePen,
  'file.delete': FileMinus,
  'command.run': SquareTerminal,
  network: Globe,
  browser: AppWindow,
  'mcp.tool': Plug,
  docker: Container,
};

/** i18n key segment for a kind ("file.read" -> "fileRead"). */
export function kindKey(
  kind: PermissionKind,
):
  | 'fileRead'
  | 'fileWrite'
  | 'fileDelete'
  | 'commandRun'
  | 'network'
  | 'browser'
  | 'mcpTool'
  | 'docker' {
  const keys = {
    'file.read': 'fileRead',
    'file.write': 'fileWrite',
    'file.delete': 'fileDelete',
    'command.run': 'commandRun',
    network: 'network',
    browser: 'browser',
    'mcp.tool': 'mcpTool',
    docker: 'docker',
  } as const;
  return keys[kind];
}
