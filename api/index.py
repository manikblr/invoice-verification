"""Default index endpoint for Vercel deployment"""

from flask import Flask, jsonify
import os

app = Flask(__name__)

@app.route('/', methods=['GET'])
def index():
    """Default route"""
    return jsonify({
        "service": "invoice-verification",
        "status": "active",
        "endpoints": ["/health", "/validate-invoice", "/test", "/debug"],
        "deployment": "main-branch"
    })

@app.route('/health', methods=['GET'])
def health():
    """Health check endpoint"""
    return jsonify({
        "ok": True,
        "service": "invoice-verification", 
        "status": "healthy",
        "branch": "main"
    })

# Vercel handler
def handler(event, context):
    return app(event, context)

if __name__ == '__main__':
    app.run(debug=False)