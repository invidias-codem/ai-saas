"""Verify a published candidate before proposing a reviewed downloads catalog.

Writes a proposal only. Commit the result through PR review; never publish a draft
or promote a release to stable using this command. Requires an authenticated gh.
"""
import argparse
import hashlib
import json
import os
import re
import subprocess
import tempfile
from pathlib import Path

REPO = 'invidias-codem/ai-saas'
WORKFLOW = f'{REPO}/.github/workflows/build-lattice-cli.yml'
TARGETS = {'linux-amd64', 'linux-arm64', 'macos-amd64', 'macos-arm64', 'windows-amd64'}


def gh(*args):
    return subprocess.check_output(['gh', *args], text=True, timeout=120, env={**os.environ, 'GH_HOST': 'github.com'})


def propose(tag):
    if not re.fullmatch(r'cli-v\d+\.\d+\.\d+-rc\.\d+', tag):
        raise ValueError('An exact candidate tag is required')
    release = json.loads(gh('release', 'view', tag, '--repo', REPO, '--json', 'isDraft,isPrerelease,publishedAt,tagName'))
    if release['isDraft'] or not release['isPrerelease'] or not release['publishedAt'] or release['tagName'] != tag:
        raise ValueError('Only published prereleases can enter the candidate catalog')
    commit = gh('api', f'repos/{REPO}/commits/{tag}', '--jq', '.sha').strip()
    if not re.fullmatch('[a-f0-9]{40}', commit): raise ValueError('Invalid tag commit')
    with tempfile.TemporaryDirectory() as temp:
        root = Path(temp)
        gh('release', 'download', tag, '--repo', REPO, '--dir', temp)
        def verify(name):
            if not re.fullmatch(r'[A-Za-z0-9._-]+', name): raise ValueError('Invalid asset name')
            gh('attestation', 'verify', str(root / name), '--repo', REPO, '--signer-workflow', WORKFLOW,
               '--source-ref', 'refs/heads/main', '--source-digest', commit)
        verify('release-manifest.json')
        manifest = json.loads((root / 'release-manifest.json').read_text())
        if manifest['sourceCommit'] != commit or 'cli-v' + manifest['version'] != tag:
            raise ValueError('Manifest does not match the published tag')
        artifacts = manifest['artifacts']
        if len(artifacts) != 5 or {a['target'] for a in artifacts} != TARGETS:
            raise ValueError('Incomplete target matrix')
        for a in artifacts:
            name = 'lattice-' + a['target'] + ('.exe' if a['target'].startswith('windows') else '')
            binary = root / name
            if hashlib.sha256(binary.read_bytes()).hexdigest() != a['sha256'] or binary.stat().st_size != a['size'] or not a['smokeTested']:
                raise ValueError('Artifact integrity mismatch')
            verify(name)
            report_name = f"sbom-{a['target']}.json"
            verify(report_name)
            sbom = json.loads((root / report_name).read_text())
            if sbom.get('bomFormat') != 'CycloneDX' or not sbom.get('components') or sbom.get('vulnerabilities'):
                raise ValueError('Dependency audit missing or not clean')
        for name in ['install.sh', 'install.ps1', 'SHA256SUMS']:
            verify(name)
        return {'schemaVersion': 1, 'release': {
            'version': manifest['version'], 'channel': 'candidate', 'sourceCommit': commit,
            'publishedAt': release['publishedAt'], 'provenanceVerified': True, 'securityReviewed': True,
            'deploymentSmokeTested': False, 'rollbackTested': False, 'artifacts': artifacts,
        }}

if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('tag')
    parser.add_argument('--output', required=True)
    args = parser.parse_args()
    Path(args.output).write_text(json.dumps(propose(args.tag), indent=2) + '\n')
