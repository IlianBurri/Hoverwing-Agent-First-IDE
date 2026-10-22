import {
  File,
  FileCode,
  FileImage,
  FileJson,
  FileLock,
  FileText,
  FileTerminal,
  Folder,
  FolderGit2,
  FolderOpen,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { DirEntry } from '@kestrel/shared';

const byExtension: Record<string, LucideIcon> = {
  ts: FileCode,
  tsx: FileCode,
  js: FileCode,
  jsx: FileCode,
  mjs: FileCode,
  cjs: FileCode,
  py: FileCode,
  rs: FileCode,
  go: FileCode,
  java: FileCode,
  c: FileCode,
  cpp: FileCode,
  h: FileCode,
  cs: FileCode,
  rb: FileCode,
  php: FileCode,
  css: FileCode,
  scss: FileCode,
  html: FileCode,
  vue: FileCode,
  svelte: FileCode,
  json: FileJson,
  jsonc: FileJson,
  md: FileText,
  mdx: FileText,
  txt: FileText,
  yml: FileText,
  yaml: FileText,
  toml: FileText,
  png: FileImage,
  jpg: FileImage,
  jpeg: FileImage,
  gif: FileImage,
  svg: FileImage,
  webp: FileImage,
  ico: FileImage,
  sh: FileTerminal,
  bash: FileTerminal,
  zsh: FileTerminal,
  ps1: FileTerminal,
  lock: FileLock,
};

export function iconForEntry(entry: DirEntry, expanded: boolean): LucideIcon {
  if (entry.kind === 'directory') {
    if (entry.name === '.git') return FolderGit2;
    return expanded ? FolderOpen : Folder;
  }
  if (entry.name.startsWith('.env')) return FileLock;
  const extension = entry.name.slice(entry.name.lastIndexOf('.') + 1).toLowerCase();
  return byExtension[extension] ?? File;
}
