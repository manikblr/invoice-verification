#!/usr/bin/env python3
"""
Vercel Deployment Monitor with Auto-Fix
Monitors deployments and automatically fixes common issues
"""
import os
import time
import requests
import subprocess
import json
from datetime import datetime

class VercelMonitor:
    def __init__(self, project_name="invoice-verification", token=None):
        self.project_name = project_name
        self.token = token or os.getenv('VERCEL_TOKEN')
        self.base_url = "https://api.vercel.com"
        
        if not self.token:
            raise ValueError("VERCEL_TOKEN environment variable required")
    
    def get_headers(self):
        return {
            "Authorization": f"Bearer {self.token}",
            "Content-Type": "application/json"
        }
    
    def get_latest_deployment(self, branch="staging"):
        """Get the latest deployment for a branch"""
        url = f"{self.base_url}/v6/deployments"
        params = {"projectId": self.project_name, "limit": 10}
        
        response = requests.get(url, headers=self.get_headers(), params=params)
        
        if response.status_code != 200:
            print(f"Failed to get deployments: {response.status_code}")
            return None
        
        deployments = response.json().get("deployments", [])
        
        # Find latest deployment for the branch
        for deployment in deployments:
            if deployment.get("meta", {}).get("githubCommitRef") == branch:
                return deployment
        
        return None
    
    def get_deployment_status(self, deployment_id):
        """Get detailed deployment status"""
        url = f"{self.base_url}/v13/deployments/{deployment_id}"
        
        response = requests.get(url, headers=self.get_headers())
        
        if response.status_code != 200:
            print(f"Failed to get deployment status: {response.status_code}")
            return None
        
        return response.json()
    
    def get_build_logs(self, deployment_id):
        """Get build logs for a deployment"""
        url = f"{self.base_url}/v2/deployments/{deployment_id}/events"
        
        response = requests.get(url, headers=self.get_headers())
        
        if response.status_code != 200:
            print(f"Failed to get build logs: {response.status_code}")
            return None
        
        events = response.json()
        
        # Extract error logs
        error_logs = []
        for event in events:
            if event.get("type") in ["stderr", "error", "build-error"]:
                error_logs.append(event.get("payload", {}).get("text", ""))
        
        return "\n".join(error_logs)
    
    def monitor_deployment(self, timeout=300):
        """Monitor a deployment until completion"""
        print(f"🔍 Monitoring deployment for {self.project_name}...")
        
        start_time = time.time()
        
        while time.time() - start_time < timeout:
            deployment = self.get_latest_deployment()
            
            if not deployment:
                print("No deployment found")
                time.sleep(30)
                continue
            
            status = deployment.get("state", "").upper()
            deployment_id = deployment.get("uid")
            
            print(f"📊 Status: {status} ({deployment_id})")
            
            if status == "READY":
                print("✅ Deployment successful!")
                return True
            elif status in ["ERROR", "FAILED"]:
                print("❌ Deployment failed!")
                
                # Get error logs
                error_logs = self.get_build_logs(deployment_id)
                if error_logs:
                    print("\n📋 Build Errors:")
                    print(error_logs)
                    
                    # Attempt auto-fix
                    self.attempt_auto_fix(error_logs)
                
                return False
            elif status in ["BUILDING", "QUEUED", "INITIALIZING"]:
                print("⏳ Deployment in progress...")
                time.sleep(30)
            else:
                print(f"🔄 Unknown status: {status}")
                time.sleep(30)
        
        print("⏰ Monitoring timeout reached")
        return False
    
    def attempt_auto_fix(self, error_logs):
        """Attempt to automatically fix deployment issues"""
        print("\n🔧 Attempting auto-fix...")
        
        try:
            # Use the auto-fix script
            result = subprocess.run([
                "python3", 
                "scripts/auto-fix-deployment.py", 
                error_logs
            ], capture_output=True, text=True)
            
            if result.returncode == 0:
                print("✅ Auto-fix applied successfully")
                print(result.stdout)
            else:
                print("❌ Auto-fix failed")
                print(result.stderr)
                
        except Exception as e:
            print(f"❌ Auto-fix error: {str(e)}")

def main():
    import argparse
    
    parser = argparse.ArgumentParser(description="Monitor Vercel deployments")
    parser.add_argument("--project", default="invoice-verification", help="Vercel project name")
    parser.add_argument("--timeout", type=int, default=300, help="Monitoring timeout in seconds")
    parser.add_argument("--auto-fix", action="store_true", help="Attempt auto-fix on failure")
    
    args = parser.parse_args()
    
    try:
        monitor = VercelMonitor(project_name=args.project)
        success = monitor.monitor_deployment(timeout=args.timeout)
        
        if not success and args.auto_fix:
            print("\n🔄 Waiting 30 seconds before retry...")
            time.sleep(30)
            
            # Monitor the new deployment after auto-fix
            print("🔍 Monitoring new deployment after auto-fix...")
            monitor.monitor_deployment(timeout=args.timeout)
        
    except Exception as e:
        print(f"❌ Monitor error: {str(e)}")
        exit(1)

if __name__ == "__main__":
    main()