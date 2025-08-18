import logging
import os
import re
from typing import Dict, List, Optional, Tuple, Any
from functools import lru_cache
from datetime import datetime, timedelta, timezone

import openai
from dotenv import load_dotenv
from rapidfuzz import fuzz
from supabase import create_client, Client

# Module-level caches
_client = None
_openai_client = None
_materials_cache = None

def _get_clients():
    """Initialize and return Supabase and OpenAI clients."""
    global _client, _openai_client
    
    if _client is None or _openai_client is None:
        load_dotenv()
        
        supabase_url = os.getenv('SUPABASE_URL')
        supabase_key = os.getenv('SUPABASE_SERVICE_KEY')
        openai_key = os.getenv('OPENAI_API_KEY')
        
        if not all([supabase_url, supabase_key, openai_key]):
            raise ValueError("SUPABASE_URL, SUPABASE_SERVICE_KEY, and OPENAI_API_KEY must be set in .env")
        
        _client = create_client(supabase_url, supabase_key)
        _openai_client = openai.OpenAI(api_key=openai_key)
    
    return _client, _openai_client

def _get_materials():
    """Get cached materials list."""
    global _materials_cache
    
    if _materials_cache is None:
        client, _ = _get_clients()
        try:
            result = client.table('materials').select('id, name').execute()
            _materials_cache = {row['name']: row['id'] for row in result.data}
            logging.info(f"Loaded {len(_materials_cache)} materials into cache")
        except Exception as e:
            logging.error(f"Failed to load materials: {e}")
            _materials_cache = {}
    
    return _materials_cache

def normalize_text(text: str) -> str:
    """Normalize input text for matching."""
    if not text:
        return ""
    
    # Convert to lowercase and strip
    normalized = text.lower().strip()
    
    # Remove bullets, numbers, punctuation from start
    normalized = re.sub(r'^[\s•\-\–\—\*\d\)\(\.]+\s*', '', normalized)
    
    # Collapse multiple spaces
    normalized = re.sub(r'\s+', ' ', normalized)
    
    return normalized.strip()

def get_service_type_id(service_line: str, service_type: str) -> Optional[int]:
    """Get service_type_id from service_line and service_type names."""
    if not service_line or not service_type:
        return None
    
    client, _ = _get_clients()
    
    try:
        result = client.rpc(
            "get_service_type_id",
            {"p_line": service_line, "p_type": service_type}
        ).execute()
        
        if hasattr(result, "data") and result.data:
            return result.data if isinstance(result.data, int) else result.data[0]
        return None
    except Exception as e:
        logging.warning(f"Failed to get service_type_id for {service_line} - {service_type}: {e}")
        return None

def kb_search(query: str, k: int = 5) -> List[Dict]:
    """Search knowledge base using embeddings."""
    client, openai_client = _get_clients()
    
    try:
        # Get embedding for query
        response = openai_client.embeddings.create(
            model="text-embedding-3-small",
            input=query
        )
        query_embedding = response.data[0].embedding
        
        # Search using RPC
        result = client.rpc('kb_search_chunks', {
            'query_embedding': query_embedding,
            'match_count': k
        }).execute()
        
        hits = []
        for row in result.data or []:
            hits.append({
                "doc_id": row.get('doc_id'),
                "distance": row.get('distance', 1.0),
                "snippet": (row.get('content', '') or '')[:200],
                "source_url": row.get('source_url')
            })
        
        return hits
    except Exception as e:
        logging.error(f"KB search failed: {e}")
        return []

def resolve_material(material_text: str) -> Tuple[Optional[int], Optional[str], float]:
    """Resolve material text to material_id, name and confidence score."""
    if not material_text:
        return None, None, 0.0
    
    materials = _get_materials()
    normalized_input = normalize_text(material_text)
    
    # Try exact case-insensitive match first
    for name, material_id in materials.items():
        if normalize_text(name) == normalized_input:
            return material_id, name, 0.98
    
    # Fuzzy matching with rapidfuzz
    best_score = 0.0
    best_match = None
    best_id = None
    
    for name, material_id in materials.items():
        score = fuzz.token_set_ratio(normalized_input, normalize_text(name)) / 100.0
        if score > best_score and score >= 0.86:
            best_score = score
            best_match = name
            best_id = material_id
    
    if best_match:
        return best_id, best_match, best_score
    
    return None, None, 0.0

def check_material_mapping(service_line: str, service_type: str, material_id: int) -> bool:
    """Check if material is mapped to service type."""
    service_type_id = get_service_type_id(service_line, service_type)
    if not service_type_id:
        return False
    
    client, _ = _get_clients()
    
    try:
        result = client.table('service_material_map').select('*').match({
            'service_type_id': service_type_id,
            'material_id': material_id
        }).execute()
        
        return len(result.data) > 0
    except Exception as e:
        logging.error(f"Failed to check material mapping: {e}")
        return False

def get_price_band(material_id: int, region: str = "US", max_age_days: int = 365) -> Optional[Dict]:
    """
    Returns the latest cached price band for a material_id in a region:
        {"source": str, "min": float|None, "max": float|None, "fetched_at": str}
    or None if not found. Ignores rows older than max_age_days.
    """
    client, _ = _get_clients()
    
    cutoff = datetime.now(timezone.utc) - timedelta(days=max_age_days)
    try:
        result = client.table("price_cache") \
            .select("source,min_price,max_price,fetched_at") \
            .eq("material_id", material_id) \
            .eq("region", region) \
            .gte("fetched_at", cutoff.isoformat()) \
            .order("fetched_at", desc=True) \
            .limit(1) \
            .execute()
        
        rows = getattr(result, "data", []) or []
        if not rows:
            return None
        
        row = rows[0]
        return {
            "source": row.get("source"),
            "min": float(row["min_price"]) if row.get("min_price") is not None else None,
            "max": float(row["max_price"]) if row.get("max_price") is not None else None,
            "fetched_at": row.get("fetched_at"),
        }
    except Exception as e:
        logging.error(f"Failed to get price band: {e}")
        return None

def validate_material(
    service_line: str,
    service_type: str, 
    material_text: str,
    proposed_price: Optional[float] = None,
    region: str = "US"
) -> Dict[str, Any]:
    """Validate a material for a given service type."""
    
    logging.info(f"Validating material: {material_text} for {service_line} - {service_type}")
    
    # Material resolution
    resolved_id, resolved_name, confidence = resolve_material(material_text)
    
    # Check service mapping
    mapped_to_service = False
    if resolved_id:
        mapped_to_service = check_material_mapping(service_line, service_type, resolved_id)
    
    # KB search
    query = f"{service_line} {service_type} {material_text}"
    kb_hits = kb_search(query, k=5)
    
    # Base decision logic (before price considerations)
    reasons = []
    
    if resolved_id and mapped_to_service:
        base_decision = "allow"
        reasons.append("Material resolved and mapped to service type")
    elif resolved_id and kb_hits and kb_hits[0]["distance"] <= 0.45:
        base_decision = "allow" 
        reasons.append("Material resolved and strongly supported by knowledge base")
    elif resolved_id or (kb_hits and kb_hits[0]["distance"] <= 0.70):
        base_decision = "needs_review"
        if resolved_id:
            reasons.append("Material resolved but not mapped to service type")
        if kb_hits and kb_hits[0]["distance"] <= 0.70:
            reasons.append("Knowledge base provides moderate support")
    else:
        base_decision = "reject"
        reasons.append("Material not recognized and no knowledge base support")
    
    # Price validation
    price_info = {"status": "no_price_check", "note": None, "source": None}
    if proposed_price is not None and resolved_id is not None:
        band = get_price_band(resolved_id, region=region)
        if band is None:
            price_info = {"status": "no_cache", "note": "No cached price", "source": None}
        else:
            price_info = {"status": "band_incomplete", "note": "Band missing min/max", "source": band["source"]}
            lo, hi = band["min"], band["max"]
            if lo is not None and hi is not None:
                # Tiers: in-band, borderline (slightly outside), out-of-band (way off)
                if proposed_price < 0.60 * lo or proposed_price > 1.50 * hi:
                    price_info = {
                        "status": "out_of_band",
                        "note": f"Proposed ${proposed_price:.2f} vs cache ${lo:.2f}-${hi:.2f}",
                        "source": band["source"],
                    }
                elif proposed_price < lo or proposed_price > hi:
                    price_info = {
                        "status": "borderline",
                        "note": f"Proposed ${proposed_price:.2f} slightly outside ${lo:.2f}-${hi:.2f}",
                        "source": band["source"],
                    }
                else:
                    price_info = {
                        "status": "in_band",
                        "note": f"Proposed ${proposed_price:.2f} within ${lo:.2f}-${hi:.2f}",
                        "source": band["source"],
                    }
    
    # Adjust decision based on price
    decision = base_decision
    
    if proposed_price is not None:
        if price_info["status"] == "out_of_band":
            # Strong override: never auto-allow if price is wildly off
            decision = "needs_review" if decision == "allow" else decision
            reasons.append("Price far outside cached range")
        elif price_info["status"] == "borderline":
            # Softer nudge: if we were undecided or allow due only to KB, ask for review
            if decision != "allow":
                decision = "needs_review"
            reasons.append("Price slightly outside cached range")
        elif price_info["status"] == "in_band":
            # If we were on the fence and price supports it, allow
            if decision == "needs_review":
                reasons.append("Price within cached range; supports approval")
                decision = "allow"
    
    return {
        "decision": decision,
        "reasons": reasons,
        "material": {
            "input_text": material_text,
            "resolved_material_id": resolved_id,
            "resolved_material_name": resolved_name,
            "match_confidence": confidence
        },
        "relevance": {
            "mapped_to_service_type": mapped_to_service,
            "kb_hits": kb_hits
        },
        "price_check": price_info
    }