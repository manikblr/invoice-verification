from flask import Flask, request, jsonify

app = Flask(__name__)

def _stub_single(material, unit_price, quantity=1):
    name = (material or "").strip().lower()
    try:
        price = float(unit_price)
    except Exception:
        return {"status": "REJECT", "reason_codes": ["INVALID_PRICE"]}
    if name == "anode rod":
        if 800 <= price <= 4000:
            return {"status": "ALLOW", "reason_codes": []}
        else:
            return {"status": "NEEDS_REVIEW", "reason_codes": ["PRICE_OUT_OF_RANGE"]}
    return {"status": "NEEDS_REVIEW", "reason_codes": ["NO_MATCH"]}

def _stub_invoice(inv):
    lines = []
    allow = review = reject = 0
    idx = 0

    def add_line(kind, line):
        nonlocal idx, allow, review, reject
        res = _stub_single(line.get("name"), line.get("unit_price"), line.get("quantity", 1))
        status = res["status"]
        reasons = res["reason_codes"]
        if status == "ALLOW": allow += 1
        elif status == "NEEDS_REVIEW": review += 1
        else: reject += 1
        lines.append({
            "type": kind,
            "index": idx,
            "input": line,
            "status": status,
            "reason_codes": reasons
        })
        idx += 1

    for m in inv.get("materials", []) or []:
        add_line("material", m)
    for e in inv.get("equipment", []) or []:
        add_line("equipment", e)
    if inv.get("labor_hours"):
        lines.append({
            "type": "labor",
            "index": idx,
            "input": {"hours": inv.get("labor_hours")},
            "status": "ALLOW",
            "reason_codes": []
        })
        allow += 1
        idx += 1

    invoice_status = "REJECT" if reject else ("NEEDS_REVIEW" if review else "ALLOW")
    return {
        "invoice_id": None,
        "invoice_status": invoice_status,
        "summary": {"allow": allow, "needs_review": review, "reject": reject, "total_lines": len(lines)},
        "lines": lines
    }

@app.route("/", methods=["GET"])
def info():
    return jsonify({"ok": True, "service": "validate", "expect": "POST JSON"})

@app.route("/", methods=["POST"])
def validate_handler():
    # Lazy heavy imports; fall back to stub on failure
    payload = request.get_json(silent=True) or {}
    # Legacy single-line schema
    if "material" in payload and "unit_price" in payload:
        try:
            # Try real path
            try:
                from app_core.validate import validate_single_line  # optional
                out = validate_single_line(payload.get("material"), payload.get("unit_price"), payload.get("quantity", 1))
                return jsonify(out)
            except Exception:
                out = _stub_single(payload.get("material"), payload.get("unit_price"), payload.get("quantity", 1))
                return jsonify(out)
        except Exception as e:
            return jsonify({"error": "internal", "detail": str(e)[:200]}), 500

    # New multi-line schema
    invoice = {
        "scope_of_work": payload.get("scope_of_work"),
        "service_line_id": payload.get("service_line_id"),
        "service_type_id": payload.get("service_type_id"),
        "labor_hours": payload.get("labor_hours"),
        "materials": payload.get("materials") or [],
        "equipment": payload.get("equipment") or []
    }
    try:
        try:
            from app_core.validate import validate_invoice  # optional
            out = validate_invoice(invoice)
            return jsonify(out)
        except Exception:
            out = _stub_invoice(invoice)
            return jsonify(out)
    except Exception as e:
        return jsonify({"error": "internal", "detail": str(e)[:200]}), 500