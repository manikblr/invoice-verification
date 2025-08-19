from flask import Flask, jsonify, request

app = Flask(__name__)

# Match "/" and any nested path (e.g. "/api/health", "/something")
@app.route("/", defaults={"path": ""}, methods=["GET"])
@app.route("/<path:path>", methods=["GET"])
def health(path):
    return jsonify({
        "ok": True,
        "service": "health",
        "path_seen": request.path
    })

# Exported `app` is the WSGI entrypoint.