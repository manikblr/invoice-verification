# Automated Vercel Deployment Monitoring & Auto-Fix

This repository includes tools to automatically monitor Vercel deployments and fix common issues.

## 🚀 Quick Setup

### 1. Get Vercel Token
```bash
# Install Vercel CLI
npm install -g vercel

# Login and get token
vercel login
vercel token create deployment-monitor
```

### 2. Set Environment Variable
```bash
export VERCEL_TOKEN="your_token_here"
```

### 3. Run Monitoring
```bash
# Monitor current deployment
python3 scripts/deployment-monitor.py --auto-fix

# Monitor specific project
python3 scripts/deployment-monitor.py --project invoice-verification --auto-fix
```

## 🛠️ Available Tools

### 1. **Deployment Monitor** (`scripts/deployment-monitor.py`)
- Monitors Vercel deployments in real-time
- Fetches build logs on failure
- Automatically triggers fixes

**Usage:**
```bash
python3 scripts/deployment-monitor.py [options]

Options:
  --project PROJECT     Vercel project name (default: invoice-verification)
  --timeout TIMEOUT     Monitoring timeout in seconds (default: 300)
  --auto-fix           Attempt auto-fix on deployment failure
```

### 2. **Auto-Fix Script** (`scripts/auto-fix-deployment.py`)
- Analyzes error logs and applies common fixes
- Commits and pushes fixes automatically
- Handles common issues like runtime errors, import problems

**Usage:**
```bash
python3 scripts/auto-fix-deployment.py "error_log_text"
```

### 3. **Status Checker** (`scripts/check-vercel-status.sh`)
- Quick deployment status check
- Health endpoint testing
- Manual troubleshooting commands

**Usage:**
```bash
./scripts/check-vercel-status.sh [project-name] [branch]
```

### 4. **GitHub Actions** (`.github/workflows/vercel-monitor.yml`)
- Automated monitoring on push
- Creates GitHub issues on deployment failure
- Integrates with GitHub notifications

## 🔧 Common Auto-Fixes

The system can automatically fix:

1. **Runtime Configuration Issues**
   - Invalid `vercel.json` configurations
   - Python version mismatches

2. **File Access Problems**
   - Supabase migration file errors
   - Missing `.vercelignore` files

3. **Import Path Issues**
   - Module not found errors
   - Relative import problems

4. **Dependency Issues**
   - Missing packages in requirements.txt
   - Version conflicts

## 📊 Usage Examples

### Monitor and Auto-Fix Current Deployment
```bash
python3 scripts/deployment-monitor.py --auto-fix
```

### Check Deployment Health
```bash
./scripts/check-vercel-status.sh invoice-verification staging
```

### Manual Fix Application
```bash
# Copy error log from Vercel dashboard and run:
python3 scripts/auto-fix-deployment.py "Function Runtimes must have a valid version"
```

## 🔔 GitHub Integration

1. **Add Vercel Token to GitHub Secrets:**
   - Go to Repository Settings → Secrets → Actions
   - Add `VERCEL_TOKEN` with your token

2. **Enable GitHub Actions:**
   - The workflow will automatically monitor deployments
   - Creates issues on failures
   - Provides notification links

## 🚨 Manual Intervention

Some issues require manual intervention:
- Complex code errors
- Environment variable problems
- Database connection issues
- Third-party service outages

The monitoring system will identify these and provide guidance.

## 🔍 Troubleshooting

### Common Issues:

1. **"VERCEL_TOKEN not found"**
   ```bash
   export VERCEL_TOKEN="your_token_here"
   ```

2. **"Failed to get deployments"**
   - Check token permissions
   - Verify project name
   - Check Vercel API status

3. **"Auto-fix script not found"**
   ```bash
   chmod +x scripts/*.py scripts/*.sh
   ```

4. **"Git push failed"**
   - Check repository permissions
   - Ensure clean working directory
   - Verify branch exists

## 📈 Monitoring Dashboard

For advanced monitoring, consider:
- Vercel Dashboard: https://vercel.com/dashboard
- GitHub Actions: Repository → Actions tab
- Build logs: Vercel project → Deployments → Build logs

---

**Note:** This system handles common deployment issues automatically. For complex application errors or infrastructure problems, manual investigation may be required.