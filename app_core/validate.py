# Orchestrate full invoice validation
# status escalation:
#   REJECT if any of: MUTEX_CONFLICT, MISSING_REQUIRED_ITEM, QUANTITY_EXCEEDS_MAX
#   NEEDS_REVIEW if any of: PRICE_HIGH/LOW/UNKNOWN, NO_MATCH (unless already REJECT)
# else ALLOW
import os
from .db import get_supabase
from .matching import match_item
from .pricing import get_price_range, price_reason
from .rules import load_rules, evaluate, apply_rules

REJECT_CODES = {"MUTEX_CONFLICT","MISSING_REQUIRED_ITEM","QUANTITY_EXCEEDS_MAX"}
REVIEW_CODES = {"PRICE_HIGH","PRICE_LOW","PRICE_UNKNOWN","NO_MATCH","INVALID_PRICE"}

def validate_invoice(invoice):
    supabase = get_supabase()
    sl = invoice.get("service_line_id")
    st = invoice.get("service_type_id")
    lines_out = []
    mat = invoice.get("materials") or []
    eqp = invoice.get("equipment") or []
    idx = 0

    # 1) match + price checks for material/equipment
    flat = []
    for kind, seq in (("material", mat), ("equipment", eqp)):
        for item in seq:
            nm = (item.get("name") or "").strip()
            if not nm:
                # skip blank name rows entirely
                continue
            qty = item.get("quantity", 1)
            up  = item.get("unit_price")
            m = match_item(supabase, nm, kind, sl, st)
            pr = None; pr_reason = None; cid = None; canonical = None; conf = None
            if m:
                cid = m["canonical_id"]; canonical = m["canonical"]; conf = m.get("confidence")
                pr = get_price_range(supabase, cid, "INR")
                pr_reason = price_reason(up, pr)
            else:
                pr_reason = "NO_MATCH"
            lines_out.append({
                "type": kind,
                "index": idx,
                "input": item,
                "match": ({"canonical_id": cid, "canonical": canonical, "confidence": conf} if cid else None),
                "pricing": ({"unit_price": up, **(pr or {"currency":"INR"})} if up is not None else None),
                "status": "ALLOW",   # will finalize later
                "reason_codes": ([pr_reason] if pr_reason else [])
            })
            flat.append({"canonical_id": cid, "quantity": qty, "line_index": idx, "type": kind})
            idx += 1

    # optional labor as informational
    if invoice.get("labor_hours"):
        lines_out.append({"type":"labor","index": idx,"input":{"hours":invoice["labor_hours"]},"status":"ALLOW","reason_codes":[]})
        idx += 1

    # 2) rules across all items
    present_ids = set([f["canonical_id"] for f in flat if f["canonical_id"]])
    rules = load_rules(supabase, present_ids)
    qty_by, by_item_lines, sup_ids = evaluate(flat)
    rmap = apply_rules(rules, qty_by, by_item_lines, present_ids)
    for li, reasons in rmap.items():
        lines_out[li]["reason_codes"].extend(reasons)

    # 3) finalize statuses
    allow = review = reject = 0
    for ln in lines_out:
        codes = set(ln["reason_codes"])
        if codes & REJECT_CODES:
            ln["status"] = "REJECT"; reject += 1
        elif codes & REVIEW_CODES:
            ln["status"] = "NEEDS_REVIEW"; review += 1
        else:
            ln["status"] = "ALLOW"; allow += 1

    invoice_status = "REJECT" if reject else ("NEEDS_REVIEW" if review else "ALLOW")
    return {
        "invoice_id": None,
        "invoice_status": invoice_status,
        "summary": {"allow": allow, "needs_review": review, "reject": reject, "total_lines": len(lines_out)},
        "lines": lines_out
    }

def validate_single_line(material, unit_price, quantity=1):
    # simple wrapper using invoice path
    inv = {"materials":[{"name":material,"quantity":quantity,"unit_price":unit_price}],"equipment":[]}
    return validate_invoice(inv)