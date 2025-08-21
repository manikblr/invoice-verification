from flask import Flask, request, jsonify

app = Flask(__name__)

@app.route("/", defaults={"path": ""}, methods=["GET"])
@app.route("/<path:path>", methods=["GET"])
def suggest(path):
    try:
        from app_core.db import get_supabase
        supabase = get_supabase()

        q = (request.args.get("q") or "").strip()
        kind = (request.args.get("kind") or "material").strip()  # 'material' | 'equipment'
        sl = request.args.get("service_line_id")
        st = request.args.get("service_type_id")
        if not q or len(q) < 2:
            return jsonify({"ok": True, "items": []})

        # 1) canonical name matches
        canon = supabase.table("canonical_items").select("id, canonical_name, kind, service_line_id, service_type_id") \
            .eq("kind", kind).ilike("canonical_name", f"%{q}%").limit(10).execute().data or []

        # 2) synonym matches (inner join to canonical)
        syn = supabase.table("item_synonyms").select(
            "synonym, canonical_items!inner(id, canonical_name, kind, service_line_id, service_type_id)"
        ).ilike("synonym", f"%{q}%").execute().data or []

        items = []
        seen = set()
        for r in canon:
            key = r["id"]
            if key in seen: continue
            seen.add(key)
            items.append({"canonical_id": r["id"], "label": r["canonical_name"], "source": "name"})

        for s in syn:
            base = s.get("canonical_items") or {}
            key = base.get("id")
            if key in seen: continue
            seen.add(key)
            items.append({"canonical_id": key, "label": base.get("canonical_name"), "synonym": s.get("synonym"), "source": "synonym"})

        return jsonify({"ok": True, "items": items[:10]})
    except Exception as e:
        return jsonify({"ok": False, "error": str(e)[:200]}), 500