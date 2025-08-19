#!/usr/bin/env python3
"""
Auto-fix common Vercel deployment issues
"""
import os
import re
import subprocess
import sys
from pathlib import Path

class DeploymentFixer:
    def __init__(self, repo_path="."):
        self.repo_path = Path(repo_path)
        
    def analyze_error(self, error_log):
        """Analyze error log and return potential fixes"""
        fixes = []
        
        # Common error patterns and fixes
        patterns = {
            r"Function Runtimes must have a valid version": {
                "issue": "Invalid Vercel runtime configuration",
                "fix": "remove_vercel_json"
            },
            r"ENOENT.*supabase.*migrations.*\.sql": {
                "issue": "Supabase migration files accessed during build",
                "fix": "add_vercel_ignore"
            },
            r"spawn pip3\.\d+ ENOENT": {
                "issue": "Python version mismatch",
                "fix": "fix_python_runtime"
            },
            r"Module not found.*app_core": {
                "issue": "Import path issues",
                "fix": "fix_import_paths"
            }
        }
        
        for pattern, solution in patterns.items():
            if re.search(pattern, error_log, re.IGNORECASE):
                fixes.append(solution)
        
        return fixes
    
    def remove_vercel_json(self):
        """Remove problematic vercel.json"""
        vercel_json = self.repo_path / "vercel.json"
        if vercel_json.exists():
            vercel_json.unlink()
            return "Removed vercel.json"
        return "vercel.json not found"
    
    def add_vercel_ignore(self):
        """Add .vercelignore to exclude problematic files"""
        vercel_ignore = self.repo_path / ".vercelignore"
        ignore_content = """supabase/
db/
*.py
!api/*.py
seed_*.py
import_*.py
bootstrap_*.py
kb_search.py
material_validator.py
.env
.env.*
__pycache__/
*.pyc
.pytest_cache/
"""
        vercel_ignore.write_text(ignore_content)
        return "Added .vercelignore"
    
    def fix_python_runtime(self):
        """Fix Python runtime in vercel.json"""
        vercel_json = self.repo_path / "vercel.json"
        if vercel_json.exists():
            # Remove the file to use auto-detection
            vercel_json.unlink()
            return "Removed vercel.json for auto-detection"
        return "No vercel.json to fix"
    
    def fix_import_paths(self):
        """Fix import paths in API files"""
        api_dir = self.repo_path / "api"
        fixes_applied = []
        
        for py_file in api_dir.glob("*.py"):
            content = py_file.read_text()
            
            # Fix relative imports
            if "from app_core" in content:
                # Ensure proper sys.path setup
                if "sys.path.append" not in content:
                    lines = content.split('\n')
                    import_line = -1
                    for i, line in enumerate(lines):
                        if "from app_core" in line:
                            import_line = i
                            break
                    
                    if import_line > 0:
                        lines.insert(import_line, "import sys")
                        lines.insert(import_line + 1, "import os")
                        lines.insert(import_line + 2, "sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))")
                        
                        py_file.write_text('\n'.join(lines))
                        fixes_applied.append(f"Fixed imports in {py_file.name}")
        
        return "; ".join(fixes_applied) if fixes_applied else "No import fixes needed"
    
    def apply_fixes(self, fixes):
        """Apply the suggested fixes"""
        results = []
        
        fix_methods = {
            "remove_vercel_json": self.remove_vercel_json,
            "add_vercel_ignore": self.add_vercel_ignore,
            "fix_python_runtime": self.fix_python_runtime,
            "fix_import_paths": self.fix_import_paths
        }
        
        for fix in fixes:
            if fix["fix"] in fix_methods:
                try:
                    result = fix_methods[fix["fix"]]()
                    results.append(f"✅ {fix['issue']}: {result}")
                except Exception as e:
                    results.append(f"❌ {fix['issue']}: Failed - {str(e)}")
            else:
                results.append(f"⚠️  Unknown fix: {fix['fix']}")
        
        return results
    
    def commit_and_push(self, fixes_applied, branch="staging"):
        """Commit fixes and push to trigger redeployment"""
        try:
            # Add all changes
            subprocess.run(["git", "add", "."], cwd=self.repo_path, check=True)
            
            # Create commit message
            fix_summary = "; ".join([fix["issue"] for fix in fixes_applied])
            commit_msg = f"""Auto-fix deployment issues: {fix_summary}

🤖 Generated with [Claude Code](https://claude.ai/code)

Co-Authored-By: Claude <noreply@anthropic.com>"""
            
            # Commit
            subprocess.run(["git", "commit", "-m", commit_msg], cwd=self.repo_path, check=True)
            
            # Push
            subprocess.run(["git", "push", "origin", branch], cwd=self.repo_path, check=True)
            
            return f"✅ Committed and pushed fixes to {branch}"
            
        except subprocess.CalledProcessError as e:
            return f"❌ Failed to commit/push: {str(e)}"

def main():
    if len(sys.argv) < 2:
        print("Usage: python3 auto-fix-deployment.py 'error_log_text'")
        sys.exit(1)
    
    error_log = sys.argv[1]
    fixer = DeploymentFixer()
    
    print("🔍 Analyzing deployment error...")
    fixes = fixer.analyze_error(error_log)
    
    if not fixes:
        print("❌ No known fixes for this error")
        sys.exit(1)
    
    print(f"🔧 Found {len(fixes)} potential fixes:")
    for fix in fixes:
        print(f"  - {fix['issue']}")
    
    print("\n🛠️  Applying fixes...")
    results = fixer.apply_fixes(fixes)
    
    for result in results:
        print(result)
    
    # Commit and push
    print("\n📤 Committing and pushing fixes...")
    push_result = fixer.commit_and_push(fixes)
    print(push_result)
    
    print("\n✅ Auto-fix complete! New deployment should start automatically.")

if __name__ == "__main__":
    main()