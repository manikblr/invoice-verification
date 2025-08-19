from flask import Flask, jsonify

app = Flask(__name__)

@app.route("/", defaults={"path": ""}, methods=["GET"])
@app.route("/<path:path>", methods=["GET"])
def check(path):
    try:
        from app_core.db import get_supabase
        supabase = get_supabase()
        # Simple read that should bypass RLS with service role:
        rows = supabase.table("canonical_items").select("id, canonical_name", count="exact").limit(1).execute()
        data = rows.data or []
        return jsonify({
            "ok": True,
            "supabase_connected": True,
            "count_hint": rows.count if hasattr(rows, "count") else None,
            "sample": (data[0] if data else None)
        })
    except Exception as e:
        return jsonify({"ok": False, "supabase_connected": False, "error": str(e)[:200]}), 500