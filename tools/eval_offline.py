#!/usr/bin/env python3
"""
Offline evaluator for agent decisions against golden labels
Computes policy accuracy and item matching metrics from stored data
"""

import os
import sys
import json
import csv
from datetime import datetime
from pathlib import Path
from typing import List, Optional, Dict, Any, Tuple
import typer
import psycopg
from pydantic import BaseModel


app = typer.Typer(help="Offline agent evaluation tool")


# Data models
class GoldenLabel(BaseModel):
    line_id: str
    dataset: str
    gold_policy: str
    gold_canonical_item_id: Optional[str]


class Decision(BaseModel):
    line_id: str
    pred_policy: str
    pred_canonical_item_id: Optional[str]
    candidates: Optional[List[str]] = None
    metadata: Optional[Dict[str, Any]] = None


class JudgeScore(BaseModel):
    line_id: str
    decision_correct: Optional[float]
    policy_justified: Optional[float]
    price_check_valid: Optional[float]
    explanation_quality: Optional[float]
    overall_score: Optional[float]


class EvalResult(BaseModel):
    line_id: str
    gold_policy: str
    pred_policy: str
    policy_correct: bool
    gold_item_id: Optional[str]
    pred_item_id: Optional[str]
    hit_at_1: Optional[bool]
    hit_at_3: Optional[bool]
    hit_at_5: Optional[bool]
    mrr: Optional[float]
    judge_scores: Optional[JudgeScore]
    notes: str = ""


# Metrics functions (imported by tests)
def compute_macro_f1(y_true: List[str], y_pred: List[str], labels: List[str]) -> Dict[str, float]:
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


def compute_hit_at_k(gold_item: Optional[str], candidates: Optional[List[str]], k: int) -> Optional[bool]:
    """Compute Hit@K for item matching"""
    if not gold_item:
        return None
    if not candidates:
        return None if k > 1 else (gold_item is not None)  # Hit@1 can be computed from exact match
    
    return gold_item in candidates[:k]


def compute_mrr(gold_item: Optional[str], candidates: Optional[List[str]]) -> Optional[float]:
    """Compute Mean Reciprocal Rank for item matching"""
    if not gold_item or not candidates:
        return None
    
    try:
        rank = candidates.index(gold_item) + 1  # 1-indexed
        return 1.0 / rank
    except ValueError:
        return 0.0  # Item not found in candidates


def load_queries() -> Dict[str, str]:
    """Load SQL queries from queries.sql file"""
    queries_file = Path(__file__).parent / "sql" / "queries.sql"
    if not queries_file.exists():
        typer.echo(f"Error: queries.sql not found at {queries_file}", err=True)
        raise typer.Exit(1)
    
    queries = {}
    current_query = None
    query_lines = []
    
    with open(queries_file, 'r') as f:
        for line in f:
            line = line.strip()
            if line.startswith('-- ') and '(' in line:
                # Save previous query
                if current_query and query_lines:
                    queries[current_query] = '\n'.join(query_lines)
                
                # Extract query name
                current_query = line[3:].split('(')[0]
                query_lines = []
            elif line and not line.startswith('--'):
                query_lines.append(line)
        
        # Save last query
        if current_query and query_lines:
            queries[current_query] = '\n'.join(query_lines)
    
    return queries


def get_db_connection() -> psycopg.Connection:
    """Get database connection from environment"""
    database_url = os.getenv("DATABASE_URL")
    if not database_url:
        typer.echo("Error: DATABASE_URL environment variable not set", err=True)
        raise typer.Exit(1)
    
    try:
        return psycopg.connect(database_url)
    except Exception as e:
        typer.echo(f"Error: Failed to connect to database: {e}", err=True)
        raise typer.Exit(1)


def resolve_run_id(conn: psycopg.Connection, dataset: str, run_id_input: str, queries: Dict[str, str]) -> str:
    """Resolve run_id, handling 'latest' special case"""
    if run_id_input != "latest":
        return run_id_input
    
    with conn.cursor() as cur:
        cur.execute(queries["get_latest_run_id"], (dataset,))
        result = cur.fetchone()
        
        if not result:
            typer.echo(f"Error: No completed runs found for dataset '{dataset}'", err=True)
            raise typer.Exit(1)
        
        return result[0]


@app.command()
def run(
    dataset: str = typer.Option(..., "--dataset", help="Dataset name to evaluate"),
    run_id: str = typer.Option(..., "--run-id", help="Run ID or 'latest'"),
    out: str = typer.Option(..., "--out", help="Output directory")
):
    """Run offline evaluation against golden labels"""
    
    # Setup
    queries = load_queries()
    conn = get_db_connection()
    output_dir = Path(out)
    output_dir.mkdir(parents=True, exist_ok=True)
    
    try:
        # Resolve run_id
        actual_run_id = resolve_run_id(conn, dataset, run_id, queries)
        typer.echo(f"Evaluating run_id: {actual_run_id} for dataset: {dataset}")
        
        # Load golden labels
        with conn.cursor() as cur:
            cur.execute(queries["verify_dataset_exists"], (dataset,))
            if cur.fetchone()[0] == 0:
                typer.echo(f"Error: No golden labels found for dataset '{dataset}'", err=True)
                raise typer.Exit(1)
            
            cur.execute(queries["get_golden_labels"], (dataset,))
            golden_data = [GoldenLabel(line_id=row[0], dataset=row[1], gold_policy=row[2], gold_canonical_item_id=row[3]) for row in cur.fetchall()]
        
        # Load predictions
        with conn.cursor() as cur:
            cur.execute(queries["get_run_decisions"], (actual_run_id,))
            decision_rows = cur.fetchall()
            
            decisions = {}
            for row in decision_rows:
                line_id, pred_policy, pred_canonical_item_id, candidates_json, created_at, metadata = row
                
                # Parse candidates from JSON
                candidates = None
                if candidates_json:
                    try:
                        if isinstance(candidates_json, str):
                            candidates_data = json.loads(candidates_json)
                        else:
                            candidates_data = candidates_json
                        
                        # Handle different candidate formats
                        if isinstance(candidates_data, list):
                            candidates = candidates_data
                        elif isinstance(candidates_data, dict) and 'items' in candidates_data:
                            candidates = [item.get('id') for item in candidates_data.get('items', [])]
                    except (json.JSONDecodeError, TypeError):
                        candidates = None
                
                decisions[line_id] = Decision(
                    line_id=line_id,
                    pred_policy=pred_policy or "UNKNOWN",
                    pred_canonical_item_id=pred_canonical_item_id,
                    candidates=candidates
                )
        
        # Load judge scores (optional)
        judge_scores = {}
        try:
            with conn.cursor() as cur:
                cur.execute(queries["get_judge_scores"], (actual_run_id,))
                for row in cur.fetchall():
                    line_id = row[0]
                    judge_scores[line_id] = JudgeScore(
                        line_id=line_id,
                        decision_correct=row[2],
                        policy_justified=row[3],
                        price_check_valid=row[4],
                        explanation_quality=row[5],
                        overall_score=row[6]
                    )
        except Exception:
            typer.echo("Warning: Could not load judge scores (optional)", err=True)
        
        # Compute metrics
        results = []
        labels = ["ALLOW", "DENY", "NEEDS_MORE_INFO"]
        
        for golden in golden_data:
            decision = decisions.get(golden.line_id)
            if not decision:
                results.append(EvalResult(
                    line_id=golden.line_id,
                    gold_policy=golden.gold_policy,
                    pred_policy="MISSING",
                    policy_correct=False,
                    gold_item_id=golden.gold_canonical_item_id,
                    pred_item_id=None,
                    hit_at_1=None,
                    hit_at_3=None,
                    hit_at_5=None,
                    mrr=None,
                    judge_scores=judge_scores.get(golden.line_id),
                    notes="No decision found for this line"
                ))
                continue
            
            # Policy accuracy
            policy_correct = decision.pred_policy == golden.gold_policy
            
            # Item matching metrics
            hit_at_1 = None
            hit_at_3 = None
            hit_at_5 = None
            mrr = None
            
            if golden.gold_canonical_item_id:
                if decision.candidates:
                    # Use candidate ranking
                    hit_at_1 = compute_hit_at_k(golden.gold_canonical_item_id, decision.candidates, 1)
                    hit_at_3 = compute_hit_at_k(golden.gold_canonical_item_id, decision.candidates, 3)
                    hit_at_5 = compute_hit_at_k(golden.gold_canonical_item_id, decision.candidates, 5)
                    mrr = compute_mrr(golden.gold_canonical_item_id, decision.candidates)
                else:
                    # Fallback: exact match for Hit@1 only
                    hit_at_1 = (decision.pred_canonical_item_id == golden.gold_canonical_item_id)
                    # Hit@3/5/MRR remain None when no candidates available
            
            results.append(EvalResult(
                line_id=golden.line_id,
                gold_policy=golden.gold_policy,
                pred_policy=decision.pred_policy,
                policy_correct=policy_correct,
                gold_item_id=golden.gold_canonical_item_id,
                pred_item_id=decision.pred_canonical_item_id,
                hit_at_1=hit_at_1,
                hit_at_3=hit_at_3,
                hit_at_5=hit_at_5,
                mrr=mrr,
                judge_scores=judge_scores.get(golden.line_id),
                notes=""
            ))
        
        # Aggregate metrics
        y_true = [r.gold_policy for r in results]
        y_pred = [r.pred_policy for r in results]
        
        policy_metrics = compute_macro_f1(y_true, y_pred, labels)
        accuracy = sum(1 for r in results if r.policy_correct) / len(results)
        
        # Item matching aggregates
        hit_1_values = [r.hit_at_1 for r in results if r.hit_at_1 is not None]
        hit_3_values = [r.hit_at_3 for r in results if r.hit_at_3 is not None]
        hit_5_values = [r.hit_at_5 for r in results if r.hit_at_5 is not None]
        mrr_values = [r.mrr for r in results if r.mrr is not None]
        
        item_metrics = {
            "hit_at_1": sum(hit_1_values) / len(hit_1_values) if hit_1_values else None,
            "hit_at_3": sum(hit_3_values) / len(hit_3_values) if hit_3_values else None,
            "hit_at_5": sum(hit_5_values) / len(hit_5_values) if hit_5_values else None,
            "mean_reciprocal_rank": sum(mrr_values) / len(mrr_values) if mrr_values else None,
            "candidates_available": len([r for r in results if r.hit_at_3 is not None])
        }
        
        # Summary output
        summary = {
            "dataset": dataset,
            "run_id": actual_run_id,
            "timestamp": datetime.now().isoformat(),
            "total_lines": len(results),
            "policy_accuracy": accuracy,
            "policy_metrics": policy_metrics,
            "item_matching": item_metrics,
            "notes": {
                "candidates_note": "Hit@3/5/MRR are null when no candidate rankings available",
                "hit_1_fallback": "Hit@1 computed from exact match when no candidates"
            }
        }
        
        # Write outputs
        with open(output_dir / "summary.json", "w") as f:
            json.dump(summary, f, indent=2)
        
        with open(output_dir / "by_line.csv", "w", newline="") as f:
            writer = csv.writer(f)
            writer.writerow([
                "line_id", "gold_policy", "pred_policy", "policy_correct",
                "gold_item_id", "pred_item_id", 
                "hit_at_1", "hit_at_3", "hit_at_5", "mrr",
                "judge_decision_correct", "judge_policy_justified", 
                "judge_price_valid", "judge_explanation_quality", "judge_overall",
                "notes"
            ])
            
            for result in results:
                judge = result.judge_scores
                writer.writerow([
                    result.line_id, result.gold_policy, result.pred_policy, result.policy_correct,
                    result.gold_item_id, result.pred_item_id,
                    result.hit_at_1, result.hit_at_3, result.hit_at_5, result.mrr,
                    judge.decision_correct if judge else None,
                    judge.policy_justified if judge else None,
                    judge.price_check_valid if judge else None,
                    judge.explanation_quality if judge else None,
                    judge.overall_score if judge else None,
                    result.notes
                ])
        
        # Console summary
        typer.echo("\n=== Evaluation Results ===")
        typer.echo(f"Dataset: {dataset}")
        typer.echo(f"Run ID: {actual_run_id}")
        typer.echo(f"Total lines: {len(results)}")
        typer.echo(f"Policy accuracy: {accuracy:.3f}")
        typer.echo(f"Macro F1: {policy_metrics['f1']:.3f}")
        
        if item_metrics["hit_at_1"] is not None:
            typer.echo(f"Hit@1: {item_metrics['hit_at_1']:.3f}")
        if item_metrics["hit_at_3"] is not None:
            typer.echo(f"Hit@3: {item_metrics['hit_at_3']:.3f}")
        if item_metrics["mean_reciprocal_rank"] is not None:
            typer.echo(f"MRR: {item_metrics['mean_reciprocal_rank']:.3f}")
        
        typer.echo(f"\nOutputs written to: {output_dir}")
        typer.echo(f"- summary.json: Overall metrics")
        typer.echo(f"- by_line.csv: Per-line details")
        
    except Exception as e:
        typer.echo(f"Error during evaluation: {e}", err=True)
        raise typer.Exit(1)
    finally:
        conn.close()


if __name__ == "__main__":
    app()