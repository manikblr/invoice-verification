# name normalization + canonical match using our new tables
# Strategy:
# - normalize name (lower/strip/punct collapse)
# - exact match on canonical_items(canonical_name, kind, is_active)
# - lookup in item_synonyms(lower(synonym))
# - if still not found and rapidfuzz available, fuzzy over union of names+synonyms
# - prefer matches scoped to provided service_line_id/service_type_id when available
# Return dict: { "canonical_id", "canonical", "confidence" } or None
from typing import Optional, Dict, Any
import re

def normalize(s: str) -> str:
    s = (s or "").strip().lower()
    s = re.sub(r"[^\w\s\.-]+", " ", s)
    s = re.sub(r"\s+", " ", s).strip()
    return s

def choose_best(candidates):
    # candidates: list of (score, rowdict)
    if not candidates: return None
    candidates.sort(key=lambda x: x[0], reverse=True)
    return candidates[0][1]

def match_item(supabase, name: str, kind: str, service_line_id=None, service_type_id=None) -> Optional[Dict[str, Any]]:
    n = normalize(name)
    # 1) exact canonical
    q = supabase.table("canonical_items").select("*").eq("is_active", True).eq("kind", kind)
    # prefer scoped rows first
    rows = q.execute().data or []
    exact = [r for r in rows if r.get("canonical_name","").strip().lower() == n]
    if service_type_id: exact = [r for r in exact if r.get("service_type_id")==service_type_id] or exact
    if service_line_id: exact = [r for r in exact if r.get("service_line_id")==service_line_id] or exact
    if exact:
        r = exact[0]
        return {"canonical_id": r["id"], "canonical": r["canonical_name"], "confidence": 1.0}

    # 2) synonyms
    syn = supabase.table("item_synonyms").select("*, canonical_items!inner(id,canonical_name,kind,service_line_id,service_type_id)") \
        .eq("canonical_items.kind", kind).execute().data or []
    cand = []
    for s in syn:
        syn_l = (s["synonym"] or "").strip().lower()
        if syn_l == n:
            base = s["canonical_items"]
            # small preference for scoped matches
            bonus = 0.02 * ((service_type_id and base.get("service_type_id")==service_type_id) + (service_line_id and base.get("service_line_id")==service_line_id))
            cand.append((1.0 + bonus, {"canonical_id": base["id"], "canonical": base["canonical_name"], "confidence": 0.95}))
    best = choose_best(cand)
    if best:
        return best

    # 3) fuzzy optional
    try:
        from rapidfuzz import process, fuzz
        names = [{"id": r["id"], "name": r["canonical_name"], "row": r} for r in rows]
        syn_pairs = []
        for s in syn:
            base = s["canonical_items"]
            syn_pairs.append({"id": base["id"], "name": s["synonym"], "row": base})
        universe = names + syn_pairs
        choices = [x["name"] for x in universe]
        match = process.extractOne(n, choices, scorer=fuzz.WRatio)
        if match and match[1] >= 80:
            pick = universe[choices.index(match[0])]
            return {"canonical_id": pick["id"], "canonical": pick["name"], "confidence": match[1]/100.0}
    except Exception:
        pass

    return None