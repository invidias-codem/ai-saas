"""Generate release evidence only after all five native binaries and reports exist."""
import hashlib
import json
import re
import shutil
import sys
from pathlib import Path
from lattice_cli import __version__

TARGETS = ['linux-amd64', 'linux-arm64', 'macos-amd64', 'macos-arm64', 'windows-amd64']


def generate(directory, commit, run_id):
    if not re.fullmatch('[a-f0-9]{40}', commit) or not re.fullmatch('[0-9]+', run_id):
        raise ValueError('Invalid source provenance')
    root = Path(directory)
    artifacts = []
    for target in TARGETS:
        name = f'lattice-{target}' + ('.exe' if target.startswith('windows') else '')
        binary = root / name
        report = json.loads((root / f'smoke-{target}.json').read_text())
        if report != {'target': target, 'version': __version__, 'sourceCommit': commit, 'passed': True}:
            raise ValueError(f'Invalid smoke evidence: {target}')
        if binary.is_symlink() or not binary.is_file() or binary.stat().st_size == 0:
            raise ValueError(f'Missing binary: {target}')
        # Audit must produce a complete CycloneDX report; a failed scan stops CI.
        sbom = json.loads((root / f'sbom-{target}.json').read_text())
        if sbom.get('bomFormat') != 'CycloneDX' or not sbom.get('components'):
            raise ValueError(f'Missing SBOM: {target}')
        if sbom.get('vulnerabilities'):
            raise ValueError(f'Vulnerabilities present: {target}')
        artifacts.append({'target': target, 'sha256': hashlib.sha256(binary.read_bytes()).hexdigest(),
                          'size': binary.stat().st_size, 'smokeTested': True, 'nativeSigned': False})
    manifest = {'schemaVersion': 1, 'version': __version__, 'channel': 'candidate', 'sourceCommit': commit,
                'workflowRun': f'https://github.com/invidias-codem/ai-saas/actions/runs/{run_id}',
                'artifacts': artifacts, 'deploymentSmokeTested': False, 'rollbackTested': False}
    (root / 'release-manifest.json').write_text(json.dumps(manifest, indent=2) + '\n')
    for name in ['install.sh', 'install.ps1']:
        shutil.copyfile(Path(__file__).parent / name, root / name)
    names = [f"lattice-{a['target']}" + ('.exe' if a['target'].startswith('windows') else '') for a in artifacts]
    names += ['release-manifest.json', 'install.sh', 'install.ps1']
    (root / 'SHA256SUMS').write_text(''.join(f'{hashlib.sha256((root / name).read_bytes()).hexdigest()}  {name}\n' for name in sorted(names)))
    return manifest

if __name__ == '__main__':
    generate(sys.argv[1], sys.argv[2], sys.argv[3])
