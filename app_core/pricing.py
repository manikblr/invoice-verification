# fetch price range & compare
def get_price_range(supabase, canonical_id, currency="INR"):
    res = supabase.table("item_price_ranges").select("*").eq("canonical_item_id", canonical_id).eq("currency", currency).execute().data or []
    # pick most recent
    if not res: return None
    res.sort(key=lambda r: r.get("updated_at",""), reverse=True)
    r = res[0]
    return {"min": r.get("min_price"), "max": r.get("max_price"), "currency": r.get("currency","INR")}

def price_reason(unit_price, pr):
    if pr is None: return "PRICE_UNKNOWN"
    try:
        p = float(unit_price)
    except Exception:
        return "INVALID_PRICE"
    if pr["min"] is not None and p < float(pr["min"]): return "PRICE_LOW"
    if pr["max"] is not None and p > float(pr["max"]): return "PRICE_HIGH"
    return None