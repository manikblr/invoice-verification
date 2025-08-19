from flask import Flask, request, jsonify
import os

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

@app.route("/", defaults={"path": ""}, methods=["GET","POST"])
@app.route("/<path:path>", methods=["GET","POST"])
def validate(path):
    if request.method == "GET":
        return jsonify({
            "ok": True, 
            "service": "validate", 
            "mode": "flask", 
            "method": "GET", 
            "path_seen": request.path,
            "validator_mode": os.environ.get("VALIDATOR_MODE", "NOT_SET"),
            "supabase_url_set": bool(os.environ.get("SUPABASE_URL")),
            "supabase_key_set": bool(os.environ.get("SUPABASE_SERVICE_KEY"))
        })

    payload = request.get_json(silent=True) or {}
    mode_fallback = False
    
    # Check env toggle - default to stub for safety
    validator_mode = os.environ.get("VALIDATOR_MODE", "stub")
    
    if validator_mode != "real":
        # Use stub logic
        is_single = "material" in payload and "unit_price" in payload
        if is_single:
            result = _stub_single(payload.get("material"), payload.get("unit_price"), payload.get("quantity", 1))
            return jsonify({"ok": True, "service": "validate", "mode": "stub", "schema": "single", "result": result})
        else:
            # multi-line invoice
            invoice = {
                "scope_of_work": payload.get("scope_of_work"),
                "service_line_id": payload.get("service_line_id"),
                "service_type_id": payload.get("service_type_id"),
                "labor_hours": payload.get("labor_hours"),
                "materials": payload.get("materials") or [],
                "equipment": payload.get("equipment") or []
            }
            result = _stub_invoice(invoice)
            return jsonify({"ok": True, "service": "validate", "mode": "stub", "schema": "invoice", **result})
    
    # Try real validation with lazy imports
    try:
        from app_core.validate import validate_invoice, validate_single_line
        
        is_single = "material" in payload and "unit_price" in payload
        if is_single:
            result = validate_single_line(payload.get("material"), payload.get("unit_price"), payload.get("quantity", 1))
            return jsonify({"ok": True, "service": "validate", "mode": "real", "schema": "single", **result})
        else:
            # multi-line invoice
            invoice = {
                "scope_of_work": payload.get("scope_of_work"),
                "service_line_id": payload.get("service_line_id"),
                "service_type_id": payload.get("service_type_id"),
                "labor_hours": payload.get("labor_hours"),
                "materials": payload.get("materials") or [],
                "equipment": payload.get("equipment") or []
            }
            result = validate_invoice(invoice)
            return jsonify({"ok": True, "service": "validate", "mode": "real", "schema": "invoice", **result})
            
    except Exception as e:
        # Fall back to stub with fallback flag
        mode_fallback = True
        is_single = "material" in payload and "unit_price" in payload
        if is_single:
            result = _stub_single(payload.get("material"), payload.get("unit_price"), payload.get("quantity", 1))
            return jsonify({"ok": True, "service": "validate", "mode": "stub", "mode_fallback": True, "fallback_reason": str(e)[:100], "schema": "single", "result": result})
        else:
            # multi-line invoice fallback
            invoice = {
                "scope_of_work": payload.get("scope_of_work"),
                "service_line_id": payload.get("service_line_id"),
                "service_type_id": payload.get("service_type_id"),
                "labor_hours": payload.get("labor_hours"),
                "materials": payload.get("materials") or [],
                "equipment": payload.get("equipment") or []
            }
            result = _stub_invoice(invoice)
            return jsonify({"ok": True, "service": "validate", "mode": "stub", "mode_fallback": True, "fallback_reason": str(e)[:100], "schema": "invoice", **result})