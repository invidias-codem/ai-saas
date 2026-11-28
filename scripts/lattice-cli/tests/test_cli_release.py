import contextlib
import importlib.util
import io
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from lattice_cli import __version__, doctor


class CliContracts(unittest.TestCase):
    def test_operation_failures_reach_the_shell(self):
        with tempfile.TemporaryDirectory() as home:
            result = subprocess.run([sys.executable, str(ROOT / 'lattice'), '--quiet', 'license', 'activate', 'invalid'],
                                    env={**os.environ, 'LATTICE_HOME': home}, capture_output=True, text=True)
            self.assertEqual(result.returncode, 1)
            self.assertFalse(list(Path(home).iterdir()))

    def test_help_version_and_every_command_group(self):
        for args in [['--version'], ['--help']] + [[group, '--help'] for group in ['auth', 'deploy', 'license', 'health', 'upgrade', 'backup', 'org', 'task', 'doctor']]:
            result = subprocess.run([sys.executable, str(ROOT / 'lattice'), *args], capture_output=True, text=True)
            self.assertEqual(result.returncode, 0, (args, result.stderr))

    def test_offline_doctor_exercises_crypto_without_docker(self):
        with patch.object(doctor.preflight, 'check_docker_daemon', side_effect=AssertionError('Docker must not run')):
            with contextlib.redirect_stdout(io.StringIO()) as output:
                result = doctor.cmd_doctor(type('Args', (), {'offline': True, 'json': True})())
            self.assertEqual(result, 0)
            self.assertTrue(json.loads(output.getvalue())['passed'])

    def test_doctor_fails_closed_when_crypto_missing(self):
        with patch.object(doctor.crypto_license, 'CRYPTO_AVAILABLE', False):
            with contextlib.redirect_stdout(io.StringIO()):
                self.assertEqual(doctor.cmd_doctor(type('Args', (), {'offline': True, 'json': True})()), 1)

    def test_cannot_label_a_foreign_binary_as_native(self):
        spec = importlib.util.spec_from_file_location('cli_build', ROOT / 'build.py')
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        with patch.object(module, 'detect_platform', return_value=('linux', 'amd64')):
            with self.assertRaisesRegex(ValueError, 'Native builds only'):
                module.build('macos-arm64')


@unittest.skipIf(sys.platform == 'win32', 'POSIX installer; PowerShell parser is checked separately')
class InstallerContracts(unittest.TestCase):
    def run_installer(self, failure):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            tools = root / 'tools'
            tools.mkdir()
            fake_gh = tools / 'gh'
            fake_gh.write_text('''#!/usr/bin/env python3
import os,sys,pathlib,hashlib
args=sys.argv[1:]
if args[:2]==['release','view']:
 print('false');sys.exit(0)
if args[:2]==['release','download']:
 root=pathlib.Path(args[args.index('--dir')+1])
 asset=args[args.index('--pattern')+1]
 content=b'#!/usr/bin/env bash\\ntouch "$SENTINEL"\\necho "lattice 0.3.1-rc.1"\\n'
 (root/asset).write_bytes(content)
 digest=hashlib.sha256(content).hexdigest() if os.environ['FAILURE']!='checksum' else '0'*64
 (root/'SHA256SUMS').write_text(digest+'  '+asset+'\\n');sys.exit(0)
if args[:2]==['attestation','verify']:
 assert '--source-digest' in args and '--signer-workflow' in args
 sys.exit(1 if os.environ['FAILURE']=='attestation' else 0)
sys.exit(99)
''')
            fake_gh.chmod(0o755)
            env = {**os.environ, 'PATH': str(tools) + os.pathsep + os.environ['PATH'], 'FAILURE': failure,
                   'SENTINEL': str(root / 'executed'), 'LATTICE_INSTALL_DIR': str(root / 'install')}
            result = subprocess.run(['bash', str(ROOT / 'install.sh'), f'cli-v{__version__}', 'a' * 40], env=env, capture_output=True, text=True, timeout=15)
            return result, (root / 'executed').exists(), (root / 'install' / 'lattice').exists()

    def test_corrupt_download_is_never_executed(self):
        result, executed, installed = self.run_installer('checksum')
        self.assertNotEqual(result.returncode, 0)
        self.assertFalse(executed)
        self.assertFalse(installed)

    def test_untrusted_download_is_never_executed(self):
        result, executed, installed = self.run_installer('attestation')
        self.assertNotEqual(result.returncode, 0)
        self.assertFalse(executed)
        self.assertFalse(installed)

    def test_verified_download_installs_without_elevation(self):
        result, executed, installed = self.run_installer('none')
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertTrue(executed)
        self.assertTrue(installed)

    def test_invalid_version_is_rejected_before_network_or_execution(self):
        result = subprocess.run(['bash', str(ROOT / 'install.sh'), 'latest', 'a' * 40], capture_output=True, text=True)
        self.assertNotEqual(result.returncode, 0)
        self.assertIn('Usage:', result.stderr)


class ReleaseManifestContracts(unittest.TestCase):
    def test_incomplete_matrix_never_produces_a_release(self):
        from release_manifest import generate
        with tempfile.TemporaryDirectory() as temp:
            with self.assertRaises(FileNotFoundError): generate(temp, 'a' * 40, '123')
            self.assertFalse((Path(temp) / 'release-manifest.json').exists())

    def test_powershell_installer_parses(self):
        if not shutil.which('pwsh'): self.skipTest('PowerShell is checked on the Windows release runner')
        script = str(ROOT / 'install.ps1').replace("'", "''")
        result = subprocess.run(['pwsh', '-NoProfile', '-Command', f"$e=$null; [System.Management.Automation.Language.Parser]::ParseFile('{script}',[ref]$null,[ref]$e) > $null; if($e.Count){{$e;exit 1}}"], capture_output=True, text=True)
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)

class AggregateEvidenceContracts(unittest.TestCase):
    def fixture(self, root):
        from release_manifest import TARGETS
        for target in TARGETS:
            name = 'lattice-' + target + ('.exe' if target.startswith('windows') else '')
            (root / name).write_bytes(b'native binary fixture ' + target.encode())
            (root / f'smoke-{target}.json').write_text(json.dumps({'target': target, 'version': __version__, 'sourceCommit': 'a' * 40, 'passed': True}))
            (root / f'sbom-{target}.json').write_text(json.dumps({'bomFormat': 'CycloneDX', 'components': [{'name': 'cryptography'}]}))

    def test_complete_matrix_generates_exact_checksums_and_candidate_metadata(self):
        import hashlib
        from release_manifest import generate
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            self.fixture(root)
            result = generate(root, 'a' * 40, '123')
            self.assertEqual(result['channel'], 'candidate')
            self.assertEqual(len(result['artifacts']), 5)
            for row in (root / 'SHA256SUMS').read_text().splitlines():
                digest, filename = row.split('  ')
                self.assertEqual(digest, hashlib.sha256((root / filename).read_bytes()).hexdigest())

    def test_mismatched_commit_or_vulnerable_dependencies_block_aggregation(self):
        from release_manifest import generate
        for failure in ['commit', 'vulnerability']:
            with self.subTest(failure=failure), tempfile.TemporaryDirectory() as temp:
                root = Path(temp)
                self.fixture(root)
                if failure == 'commit':
                    (root / 'smoke-linux-amd64.json').write_text(json.dumps({'passed': True, 'sourceCommit': 'b' * 40}))
                else:
                    (root / 'sbom-linux-amd64.json').write_text(json.dumps({'bomFormat': 'CycloneDX', 'components': [{'name': 'crypto'}], 'vulnerabilities': [{'id': 'test'}]}))
                with self.assertRaises(ValueError): generate(root, 'a' * 40, '123')
                self.assertFalse((root / 'release-manifest.json').exists())

    def test_catalog_tool_rejects_drafts_and_ambiguous_versions(self):
        import prepare_catalog
        with self.assertRaises(ValueError): prepare_catalog.propose('latest')
        with patch.object(prepare_catalog, 'gh', return_value=json.dumps({'isDraft': True, 'isPrerelease': True, 'publishedAt': None, 'tagName': 'cli-v0.3.1-rc.1'})):
            with self.assertRaisesRegex(ValueError, 'published prereleases'): prepare_catalog.propose('cli-v0.3.1-rc.1')
