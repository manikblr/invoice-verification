from flask import Flask, jsonify

app = Flask(__name__)

@app.get("/")
def root():
    return jsonify({"ok": True, "service": "simple"})

# keep very small to avoid dependency issues