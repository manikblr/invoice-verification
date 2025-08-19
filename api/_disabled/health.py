from flask import Flask, jsonify

app = Flask(__name__)

@app.route('/', methods=['GET'])
@app.route('/health', methods=['GET'])
def health():
    """Minimal health check"""
    return jsonify({"ok": True, "status": "healthy", "service": "invoice-validation"})

# Vercel handler
def handler(event, context):
    return app(event, context)

if __name__ == '__main__':
    app.run(debug=True)