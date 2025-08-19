from flask import Flask, jsonify

app = Flask(__name__)

@app.get("/")
def root():
    return jsonify({"ok": True, "service": "health"})

# Exported `app` is the WSGI entrypoint for Vercel's Python runtime.