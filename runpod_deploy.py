#!/usr/bin/env python3
"""
Deploy Lattice-1 merge + vLLM on RunPod.
Cheaper than Modal, no spend limits.
"""

import os
import subprocess
import sys
import time
import requests
import json


def create_runpod_pod(
    api_key: str,
    name: str = "lattice-1-merge",
    gpu_type: str = "A100-40GB",  # or "A100-80GB", "H100"
    image: str = "runpod/pytorch:2.5.1-py3.11-cuda12.1-devel",
    docker_args: str = "",
    volume_mount_path: str = "/workspace",
    container_disk_gb: int = 200,
) -> str:
    """Create a RunPod pod and return pod ID."""
    
    url = "https://api.runpod.io/graphql"
    
    mutation = """
    mutation createPod(
        $name: String!
        $imageName: String!
        $gpuTypeId: String!
        $cloudType: CloudType!
        $gpuCount: Int!
        $volumeInGb: Int!
        $containerDiskInGb: Int!
        $dockerArgs: String
        $volumeMountPath: String
    ) {
        podCreate(
            input: {
                name: $name
                imageName: $imageName
                gpuTypeId: $gpuTypeId
                cloudType: $cloudType
                gpuCount: $gpuCount
                volumeInGb: $volumeInGb
                containerDiskInGb: $containerDiskInGb
                dockerArgs: $dockerArgs
                volumeMountPath: $volumeMountPath
            }
        ) {
            id
            desiredStatus
        }
    }
    """
    
    # Map GPU types to RunPod IDs
    gpu_map = {
        "A100-40GB": "NVIDIA_A100-40GB",
        "A100-80GB": "NVIDIA_A100-80GB", 
        "H100": "NVIDIA_H100",
        "RTX3090": "NVIDIA_RTX_3090",
        "RTX4090": "NVIDIA_RTX_4090",
    }
    
    variables = {
        "name": name,
        "imageName": image,
        "gpuTypeId": gpu_map.get(gpu_type, "NVIDIA_A100-40GB"),
        "cloudType": "SECURE",
        "gpuCount": 1,
        "volumeInGb": 100,  # Network volume for model cache
        "containerDiskInGb": container_disk_gb,
        "dockerArgs": docker_args,
        "volumeMountPath": volume_mount_path,
    }
    
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }
    
    response = requests.post(
        url,
        json={"query": mutation, "variables": variables},
        headers=headers,
    )
    
    result = response.json()
    if "errors" in result:
        raise RuntimeError(f"RunPod API error: {result['errors']}")
    
    pod_id = result["data"]["podCreate"]["id"]
    print(f"Created pod: {pod_id}")
    return pod_id


def wait_for_pod_ready(api_key: str, pod_id: str, timeout: int = 300) -> dict:
    """Wait for pod to be RUNNING and get connection info."""
    
    url = "https://api.runpod.io/graphql"
    query = """
    query getPod($podId: String!) {
        pod(podId: $podId) {
            id
            name
            runtime {
                uptimeInSeconds
                ports {
                    ip
                    isIpPublic
                    privatePort
                    publicPort
                    type
                }
            }
            desiredStatus
            lastStatusChange
        }
    }
    """
    
    start = time.time()
    while time.time() - start < timeout:
        response = requests.post(
            url,
            json={"query": query, "variables": {"podId": pod_id}},
            headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
        )
        result = response.json()
        pod = result.get("data", {}).get("pod", {})
        
        if pod.get("desiredStatus") == "RUNNING" and pod.get("runtime", {}).get("ports"):
            return pod
        
        print(f"Pod status: {pod.get('desiredStatus')}... waiting")
        time.sleep(10)
    
    raise TimeoutError(f"Pod {pod_id} not ready after {timeout}s")


def run_on_pod(pod: dict, command: str) -> str:
    """Execute command on pod via SSH (requires SSH key setup)."""
    # This is a placeholder - in practice you'd use SSH
    # For now, we'll use RunPod's exec API
    pass


def main():
    api_key = os.getenv("RUNPOD_API_KEY")
    if not api_key:
        print("Set RUNPOD_API_KEY environment variable")
        print("Get it from: https://runpod.io/console/user/settings")
        sys.exit(1)
    
    print("Creating RunPod pod for Lattice-1 merge...")
    pod_id = create_runpod_pod(
        api_key=api_key,
        name="lattice-1-merge",
        gpu_type="A100-40GB",
        container_disk_gb=200,
    )
    
    print("Waiting for pod to be ready...")
    pod = wait_for_pod_ready(api_key, pod_id)
    
    print(f"Pod ready! Connection info:")
    for port in pod["runtime"]["ports"]:
        if port["isIpPublic"]:
            print(f"  SSH: ssh root@{port['ip']} -p {port['publicPort']}")
            print(f"  Or use RunPod web terminal")
    
    print("\nNext steps:")
    print("1. SSH into pod")
    print("2. Run the merge commands below")
    print("3. Then deploy vLLM")


if __name__ == "__main__":
    main()