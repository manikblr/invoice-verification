# evaluate rules across a set of canonical items with quantities
# rule_type ∈ {'CANNOT_DUPLICATE','MUTEX','REQUIRES','MAX_QTY'}
from collections import defaultdict

def load_rules(supabase, ids):
    if not ids: return []
    res = supabase.table("item_rules").select("*").in_("a_item_id", list(ids)).execute().data or []
    # include symmetric MUTEX by also checking b_item_id in ids
    mutex_extra = supabase.table("item_rules").select("*").eq("rule_type","MUTEX").in_("b_item_id", list(ids)).execute().data or []
    by_id = {(r.get("id")): r for r in res}
    for r in mutex_extra:
        by_id[r["id"]] = r
    return list(by_id.values())

def evaluate(all_lines):
    # all_lines: list of {"canonical_id", "quantity", "line_index", "type"}
    # returns dict: line_index -> list of reason codes
    qty_by = defaultdict(float)
    by_item_lines = defaultdict(list)
    for ln in all_lines:
        cid = ln.get("canonical_id")
        if not cid: continue
        qty_by[cid] += float(ln.get("quantity") or 0)
        by_item_lines[cid].append(ln["line_index"])
    sup = set(qty_by.keys())
    return qty_by, by_item_lines, sup

def apply_rules(rules, qty_by, by_item_lines, present_ids):
    reasons_by_line = defaultdict(list)
    for r in rules:
        rt = r["rule_type"]
        a = r["a_item_id"]; b = r.get("b_item_id")
        if rt == "CANNOT_DUPLICATE":
            if qty_by.get(a, 0) > 1 or (a in present_ids and len(by_item_lines.get(a,[])) > 1):
                for li in by_item_lines.get(a, []):
                    reasons_by_line[li].append("DUPLICATE_ITEM")
        elif rt == "MAX_QTY":
            maxq = r.get("max_qty")
            if maxq is not None and qty_by.get(a, 0) > float(maxq):
                for li in by_item_lines.get(a, []):
                    reasons_by_line[li].append("QUANTITY_EXCEEDS_MAX")
        elif rt == "MUTEX":
            if (a in present_ids and b in present_ids):
                for li in by_item_lines.get(a, []):
                    reasons_by_line[li].append("MUTEX_CONFLICT")
                for li in by_item_lines.get(b, []):
                    reasons_by_line[li].append("MUTEX_CONFLICT")
        elif rt == "REQUIRES":
            if (a in present_ids) and (b not in present_ids):
                for li in by_item_lines.get(a, []):
                    reasons_by_line[li].append("MISSING_REQUIRED_ITEM")
    return reasons_by_line