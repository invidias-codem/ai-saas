import os
import shutil
import subprocess
import json
import logging

def find_gcloud():
    gcloud_path = shutil.which('gcloud')
    if gcloud_path:
        return gcloud_path
    
    fallback_path = os.path.expanduser('~/.openclaw/workspace/google-cloud-sdk/bin/gcloud')
    if os.path.exists(fallback_path):
        return fallback_path
    
    # Just return 'gcloud' and hope it works or fails cleanly
    return 'gcloud'

def run_gcloud(args, project=None, use_json=True):
    gcloud_bin = find_gcloud()
    
    cmd = [gcloud_bin] + args
    
    if project:
        cmd.extend(['--project', project])
        
    if use_json:
        # Avoid duplicate --format if the user already passed one, though generally we rely on our use_json
        if not any(arg.startswith('--format') for arg in cmd):
            cmd.extend(['--format', 'json'])
            
    try:
        result = subprocess.run(cmd, capture_output=True, text=True, check=False)
        return {
            "success": result.returncode == 0,
            "stdout": result.stdout,
            "stderr": result.stderr,
            "returncode": result.returncode
        }
    except Exception as e:
        return {
            "success": False,
            "stdout": "",
            "stderr": str(e),
            "returncode": 1
        }

def get_default_project():
    result = run_gcloud(['config', 'get-value', 'project'], use_json=False)
    if result['success']:
        return result['stdout'].strip()
    return None

def parse_json_output(output):
    if not output:
        return []
    try:
        return json.loads(output)
    except json.JSONDecodeError:
        return {"error": "Failed to parse JSON", "raw_output": output}
