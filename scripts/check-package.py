"""Verify the signed APK, updater metadata and every bundled offline file."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess
import zipfile

ROOT = Path(__file__).resolve().parents[1]
parser = argparse.ArgumentParser()
parser.add_argument('--previous-apk', type=Path)
parser.add_argument('--report', type=Path, default=ROOT / 'artifacts/enterprise-audit/package-validation.json')
args = parser.parse_args()
release = json.loads((ROOT / 'release.json').read_text())
apk = ROOT / 'artifacts' / (release['appName'] + '-' + release['version'] + '.apk')
update = json.loads((ROOT / 'artifacts/update.json').read_text())
sdk = Path(os.environ.get('ANDROID_SDK_ROOT', ROOT / '.tooling/sdk'))
build_tools = sdk / 'build-tools/35.0.0'
environment = os.environ.copy()
local_jdk = ROOT / '.tooling/jdk/Contents/Home'
if 'JAVA_HOME' not in environment and local_jdk.exists():
    environment['JAVA_HOME'] = str(local_jdk)


def certificate(file):
    result = subprocess.check_output(
        [str(build_tools / 'apksigner'), 'verify', '--print-certs', str(file)],
        text=True, env=environment,
    )
    return re.search(r'certificate SHA-256 digest: (\w+)', result).group(1)


apk_hash = hashlib.sha256(apk.read_bytes()).hexdigest()
assert apk_hash == update['sha256']
assert apk.stat().st_size == update['bytes']
assert update['versionName'] == release['version']
assert update['versionCode'] == release['versionCode']
badging = subprocess.check_output(
    [str(build_tools / 'aapt2'), 'dump', 'badging', str(apk)], text=True,
)
assert f"versionCode='{release['versionCode']}'" in badging
assert f"versionName='{release['version']}'" in badging
assert "minSdkVersion:'29'" in badging and "targetSdkVersion:'36'" in badging
certificate_hash = certificate(apk)
if args.previous_apk:
    assert certificate_hash == certificate(args.previous_apk)
with zipfile.ZipFile(apk) as archive:
    inventory = json.loads(archive.read('assets/resources.json'))
    assert inventory['version'] == release['version']
    assert inventory['contentVersion'] == json.loads((ROOT / 'resources/CONTENT/manifest.json').read_text())['auditRelease']
    for entry in inventory['files']:
        data = archive.read('assets/' + entry['path'])
        assert len(data) == entry['bytes'], entry['path']
        assert hashlib.sha256(data).hexdigest() == entry['sha256'], entry['path']
    datasets = json.loads(archive.read('assets/databases.json'))['datasets']
    assert len(datasets) == 7
    for dataset in datasets:
        assert hashlib.sha256(archive.read('assets/' + dataset['path'])).hexdigest() == dataset['sha256']
        assert hashlib.sha256(archive.read('assets/' + dataset['schemaPath'])).hexdigest() == dataset['schemaSha256']
report = {
    'pass': True, 'version': release['version'], 'versionCode': release['versionCode'],
    'minSdk': 29, 'targetSdk': 36, 'contentVersion': inventory['contentVersion'],
    'sha256': apk_hash, 'bytes': apk.stat().st_size, 'certificateSha256': certificate_hash,
    'sameCertificateAsPrevious': True if args.previous_apk else None,
    'verifiedOfflineFiles': len(inventory['files']), 'databaseAndDictionaryPairs': len(datasets),
}
output = args.report
output.parent.mkdir(parents=True, exist_ok=True)
output.write_text(json.dumps(report, indent=2) + '\n')
print('APK, update manifest, signature and offline files verified', apk_hash)
