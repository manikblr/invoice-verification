"""Minimal debug endpoint to test Vercel function deployment"""

from flask import Flask, jsonify
import sys
import os

app = Flask(__name__)

@app.route('/', methods=['GET'])
@app.route('/health', methods=['GET'])
def debug_health():
    """Minimal debug health check"""
    try:
        return jsonify({
            "ok": True,
            "message": "Debug endpoint working",
            "python_version": sys.version,
            "working_dir": os.getcwd(),
            "env_vars": list(os.environ.keys())[:5]  # Show first 5 env vars
        })
    except Exception as e:
        return jsonify({
            "ok": False,
            "error": str(e)
        }), 500

# For Vercel compatibility
def handler(event, context):
    return app(event, context)

if __name__ == '__main__':
    app.run(debug=True)