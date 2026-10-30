import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { until, pause } from './qualification-webdriver.mjs';

const execute = promisify(execFile);
const titles = { folder: 'Select a folder for read access', read: 'Confirm folder read access', write: 'Confirm reviewed file changes' };
const helper = fileURLToPath(new URL('./windows-native-dialog.ps1', import.meta.url));
export async function nativeDialog(kind, action, folder, screenshot) {
  if (!Object.hasOwn(titles, kind) || !['accept', 'cancel'].includes(action)) throw new Error('Invalid native dialog test action');
  if (process.platform === 'win32') {
    await execute('powershell.exe', ['-NoProfile', '-STA', '-File', helper,
      '-Title', titles[kind], '-Kind', kind, '-Action', action,
      '-Folder', folder ?? '', '-Screenshot', screenshot], { timeout: 35000 });
    return;
  }
  if (process.platform !== 'linux') throw new Error('Unsupported native dialog test platform');
  const run = (...args) => execute('xdotool', args, { timeout: 8000 });
  const visible = async () => {
    try { return (await run('search', '--onlyvisible', '--name', `^${titles[kind]}$`)).stdout.trim().split('\n').filter(Boolean); }
    catch (error) { if (error.code === 1) return []; throw error; }
  };
  let ids;
  try { ids = await until(visible, values => values.length > 0); }
  catch (error) {
    await execute('import', ['-window', 'root', screenshot], { timeout: 8000 }).catch(() => {});
    throw new Error(`Native ${kind} dialog did not appear`, { cause: error });
  }
  if (ids.length !== 1 || !/^\d+$/.test(ids[0])) throw new Error('Native dialog identity is ambiguous');
  const id = ids[0];
  await execute('import', ['-window', 'root', screenshot], { timeout: 8000 });
  await run('windowactivate', '--sync', id);
  await run('windowfocus', '--sync', id);
  if (action === 'cancel') { await run('key', 'Escape'); return; }
  if (kind === 'folder') {
    await run('key', 'ctrl+l'); await pause(200);
    await run('type', '--clearmodifiers', '--delay', '1', `${folder}/`); await run('key', 'Return');
    await pause(1000);
    if ((await visible()).includes(id)) {
      // Folder selection can navigate first and require the default Select response.
      await run('windowfocus', '--sync', id); await run('key', 'alt+o');
    }
  } else await run('key', 'Return');
}
