from flask import Flask, jsonify

app = Flask(__name__)

@app.get("/")
def root():
    return jsonify({"ok": True, "service": "ping", "path": "/"})

@app.get("/ping")
def ping():
    return jsonify({"ok": True, "service": "ping", "path": "/ping"})

# vercel's python runtime will look for `app`