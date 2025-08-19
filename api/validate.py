from flask import Flask, request, jsonify

app = Flask(__name__)

@app.route("/", defaults={"path": ""}, methods=["GET","POST"])
@app.route("/<path:path>", methods=["GET","POST"])
def validate(path):
    if request.method == "GET":
        return jsonify({"ok": True, "service": "validate", "mode": "flask", "method": "GET", "path_seen": request.path})

    payload = request.get_json(silent=True) or {}
    # Accept both schemas; for now just echo with a stub verdict
    is_single = "material" in payload and "unit_price" in payload
    if is_single:
        result = {"status": "ALLOW" if str(payload.get("material","")).strip().lower()=="anode rod" else "NEEDS_REVIEW"}
        return jsonify({"ok": True, "service": "validate", "mode": "flask", "schema": "single", "result": result})

    # multi-line schema stub
    summary = {"allow": 0, "needs_review": 0, "reject": 0}
    lines = []
    for section, kind in (("materials","material"), ("equipment","equipment")):
        for i, line in enumerate(payload.get(section) or []):
            status = "ALLOW" if (str(line.get("name","")).strip().lower()=="anode rod" and 800 <= float(line.get("unit_price",0)) <= 4000) else "NEEDS_REVIEW"
            summary["allow" if status=="ALLOW" else "needs_review"] += 1
            lines.append({"type": kind, "index": i, "input": line, "status": status, "reason_codes": [] if status=="ALLOW" else ["PRICE_OUT_OF_RANGE"]})

    invoice_status = "REJECT" if summary["reject"] else ("NEEDS_REVIEW" if summary["needs_review"] else "ALLOW")
    return jsonify({"ok": True, "service": "validate", "mode": "flask", "schema": "invoice", "invoice_status": invoice_status, "summary": summary, "lines": lines})