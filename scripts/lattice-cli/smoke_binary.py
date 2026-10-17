"""Exercise the packaged executable in an empty working directory and home."""
import json
import os
import subprocess
import sys
import tempfile
from pathlib import Path
from lattice_cli import __version__


def smoke(path):
    binary = str(Path(path).resolve())
    with tempfile.TemporaryDirectory() as temp:
        env = {**os.environ, 'LATTICE_HOME': temp, 'PYTHONPATH': '', 'PYTHONUTF8': '1'}
        def run(*args):
            return subprocess.run([binary, *args], cwd=temp, env=env, capture_output=True, text=True,
                                  encoding='utf-8', timeout=60)
        result = run('--version')
        assert result.returncode == 0 and result.stdout.strip() == f'lattice {__version__}', result
        for group in ['auth', 'deploy', 'license', 'health', 'upgrade', 'backup', 'org', 'task', 'doctor']:
            result = run(group, '--help')
            assert result.returncode == 0 and 'usage:' in result.stdout, (group, result)
        result = run('doctor', '--offline', '--json')
        assert result.returncode == 0 and json.loads(result.stdout)['passed'] is True, result
        result = run('--quiet', 'license', 'activate', 'invalid')
        assert result.returncode != 0, 'CLI swallowed an operation failure'
        result = run('does-not-exist')
        assert result.returncode == 2, result
        assert not list(Path(temp).iterdir()), 'Smoke test unexpectedly wrote user state'
    print('Packaged CLI smoke passed')

if __name__ == '__main__':
    smoke(sys.argv[1])
