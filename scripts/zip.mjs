// Unzips files on Windows, macOS and Linux. An xlsx file is a zip file.
// Windows has a built-in tar.exe that reads zip. Git Bash's tar cannot, so the Windows one is used explicitly.
// macOS and Linux use the standard "unzip" command.
import path from 'node:path';
import { execFileSync } from 'node:child_process';

export function extractZip(zipPath, destDir, entries = []) {
  const zip = path.resolve(zipPath);
  if (process.platform === 'win32') {
    const tar = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'tar.exe');
    execFileSync(tar, ['-xf', zip, '-C', destDir, ...entries]);
  } else {
    execFileSync('unzip', ['-o', '-q', zip, ...entries, '-d', destDir]);
  }
}
