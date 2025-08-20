"""
Unit tests for offline evaluation metrics
Pure functions, no database dependencies
"""

from typing import List, Optional


# Metrics functions (will be imported from main script)
def compute_macro_f1(y_true: List[str], y_pred: List[str], labels: List[str]) -> dict:
    """Compute macro-averaged precision, recall, F1"""
    if not y_true or not y_pred or len(y_true) != len(y_pred):
        return {"precision": 0.0, "recall": 0.0, "f1": 0.0}
    
    metrics = {}
    
    for label in labels:
        tp = sum(1 for t, p in zip(y_true, y_pred) if t == label and p == label)
        fp = sum(1 for t, p in zip(y_true, y_pred) if t != label and p == label)
        fn = sum(1 for t, p in zip(y_true, y_pred) if t == label and p != label)
        
        precision = tp / (tp + fp) if (tp + fp) > 0 else 0.0
        recall = tp / (tp + fn) if (tp + fn) > 0 else 0.0
        f1 = 2 * precision * recall / (precision + recall) if (precision + recall) > 0 else 0.0
        
        metrics[f"{label}_precision"] = precision
        metrics[f"{label}_recall"] = recall
        metrics[f"{label}_f1"] = f1
    
    # Macro averages
    precisions = [metrics[f"{label}_precision"] for label in labels]
    recalls = [metrics[f"{label}_recall"] for label in labels]
    f1s = [metrics[f"{label}_f1"] for label in labels]
    
    return {
        "precision": sum(precisions) / len(precisions),
        "recall": sum(recalls) / len(recalls),
        "f1": sum(f1s) / len(f1s),
        **metrics
    }


def compute_hit_at_k(gold_item: Optional[str], candidates: Optional[List[str]], k: int) -> bool:
    """Compute Hit@K for item matching"""
    if not gold_item or not candidates or k <= 0:
        return False
    
    # Check if gold item is in top-k candidates
    return gold_item in candidates[:k]


def compute_mrr(gold_item: Optional[str], candidates: Optional[List[str]]) -> float:
    """Compute Mean Reciprocal Rank for item matching"""
    if not gold_item or not candidates:
        return 0.0
    
    try:
        rank = candidates.index(gold_item) + 1  # 1-indexed
        return 1.0 / rank
    except ValueError:
        return 0.0  # Item not found in candidates


# Test cases
class TestMetrics:
    
    def test_macro_f1_perfect_scores(self):
        """Test macro F1 with perfect predictions"""
        y_true = ["ALLOW", "DENY", "NEEDS_MORE_INFO"]
        y_pred = ["ALLOW", "DENY", "NEEDS_MORE_INFO"] 
        labels = ["ALLOW", "DENY", "NEEDS_MORE_INFO"]
        
        result = compute_macro_f1(y_true, y_pred, labels)
        
        assert result["precision"] == 1.0
        assert result["recall"] == 1.0
        assert result["f1"] == 1.0

    def test_macro_f1_mixed_performance(self):
        """Test macro F1 with mixed predictions"""
        y_true = ["ALLOW", "ALLOW", "DENY", "DENY", "NEEDS_MORE_INFO"]
        y_pred = ["ALLOW", "DENY", "DENY", "ALLOW", "NEEDS_MORE_INFO"]
        labels = ["ALLOW", "DENY", "NEEDS_MORE_INFO"]
        
        result = compute_macro_f1(y_true, y_pred, labels)
        
        # ALLOW: TP=1, FP=1, FN=1 -> P=0.5, R=0.5, F1=0.5  
        # DENY: TP=1, FP=1, FN=1 -> P=0.5, R=0.5, F1=0.5
        # NEEDS_MORE_INFO: TP=1, FP=0, FN=0 -> P=1.0, R=1.0, F1=1.0
        # Macro avg: P=0.67, R=0.67, F1=0.67
        
        assert abs(result["precision"] - 0.6666666666666666) < 1e-10
        assert abs(result["recall"] - 0.6666666666666666) < 1e-10
        assert abs(result["f1"] - 0.6666666666666666) < 1e-10

    def test_macro_f1_empty_input(self):
        """Test macro F1 with empty inputs"""
        result = compute_macro_f1([], [], ["ALLOW", "DENY"])
        
        assert result["precision"] == 0.0
        assert result["recall"] == 0.0
        assert result["f1"] == 0.0

    def test_hit_at_k_success(self):
        """Test Hit@K when gold item is in top-k"""
        gold_item = "item_002"
        candidates = ["item_001", "item_002", "item_003", "item_004"]
        
        assert compute_hit_at_k(gold_item, candidates, 1) == False  # Not in top-1
        assert compute_hit_at_k(gold_item, candidates, 2) == True   # In top-2
        assert compute_hit_at_k(gold_item, candidates, 3) == True   # In top-3

    def test_hit_at_k_failure(self):
        """Test Hit@K when gold item is not in candidates"""
        gold_item = "item_005"
        candidates = ["item_001", "item_002", "item_003"]
        
        assert compute_hit_at_k(gold_item, candidates, 1) == False
        assert compute_hit_at_k(gold_item, candidates, 3) == False
        assert compute_hit_at_k(gold_item, candidates, 5) == False

    def test_hit_at_k_edge_cases(self):
        """Test Hit@K edge cases"""
        assert compute_hit_at_k(None, ["item_001"], 1) == False
        assert compute_hit_at_k("item_001", None, 1) == False
        assert compute_hit_at_k("item_001", [], 1) == False
        assert compute_hit_at_k("item_001", ["item_001"], 0) == False

    def test_mrr_success(self):
        """Test MRR calculation"""
        gold_item = "item_003"
        candidates = ["item_001", "item_002", "item_003", "item_004"]
        
        mrr = compute_mrr(gold_item, candidates)
        assert abs(mrr - 1.0/3.0) < 1e-10  # Item at position 3, MRR = 1/3

    def test_mrr_first_position(self):
        """Test MRR when gold item is first"""
        gold_item = "item_001"
        candidates = ["item_001", "item_002", "item_003"]
        
        mrr = compute_mrr(gold_item, candidates)
        assert mrr == 1.0

    def test_mrr_not_found(self):
        """Test MRR when gold item not in candidates"""
        gold_item = "item_999"
        candidates = ["item_001", "item_002", "item_003"]
        
        mrr = compute_mrr(gold_item, candidates)
        assert mrr == 0.0

    def test_mrr_edge_cases(self):
        """Test MRR edge cases"""
        assert compute_mrr(None, ["item_001"]) == 0.0
        assert compute_mrr("item_001", None) == 0.0
        assert compute_mrr("item_001", []) == 0.0