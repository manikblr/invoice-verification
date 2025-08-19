from flask import Flask, jsonify, request

app = Flask(__name__)

@app.route("/", defaults={"path": ""}, methods=["GET"])
@app.route("/<path:path>", methods=["GET"])
def meta(path):
    try:
        from app_core.db import get_supabase
        supabase = get_supabase()

        # fetch service lines
        sl = supabase.table("service_lines").select("id,name,is_active").eq("is_active", True).order("name").execute().data or []

        # fetch service types
        st = supabase.table("service_types").select("id,service_line_id,name,is_active").eq("is_active", True).order("name").execute().data or []

        # group types under their line
        types_by_line = {}
        for t in st:
            types_by_line.setdefault(t["service_line_id"], []).append({"id": t["id"], "name": t["name"]})

        out_lines = [{"id": s["id"], "name": s["name"]} for s in sl]
        out_types = [{"service_line_id": k, "types": v} for k, v in types_by_line.items()]

        return jsonify({"ok": True, "service_lines": out_lines, "service_types": out_types})
    except Exception as e:
        return jsonify({"ok": False, "error": str(e)[:200]}), 500