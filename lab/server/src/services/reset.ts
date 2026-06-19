import { activeVaultRoot, resetScriptPath } from '../config.js';
import { runProcess } from './process.js';

export async function resetWiki(execute: boolean) {
  const args = ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', resetScriptPath];
  if (execute) args.push('-Execute');
  return runProcess('powershell.exe', args, activeVaultRoot);
}
