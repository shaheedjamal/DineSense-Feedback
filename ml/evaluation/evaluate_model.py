"""
DineSense Feedback — Model Evaluation & Calibration Suite
Computes Macro F1, Precision, Recall, Confusion Matrix, Brier Score,
and abstention coverage for a trained MobileNetV2 ONNX model.
"""

import json
from pathlib import Path
import numpy as np
from sklearn.metrics import (
    brier_score_loss,
    classification_report,
    confusion_matrix,
    f1_score,
)


def evaluate_predictions(y_true: np.ndarray, probs: np.ndarray, abstention_threshold: float = 0.55) -> dict:
    max_probs = np.max(probs, axis=1)
    preds = np.argmax(probs, axis=1)

    accepted_mask = max_probs >= abstention_threshold
    coverage = float(np.mean(accepted_mask))

    eval_true = y_true[accepted_mask] if np.any(accepted_mask) else y_true
    eval_preds = preds[accepted_mask] if np.any(accepted_mask) else preds

    macro_f1 = float(f1_score(eval_true, eval_preds, average="macro", zero_division=0))
    cm = confusion_matrix(eval_true, eval_preds).tolist()
    report = classification_report(eval_true, eval_preds, output_dict=True, zero_division=0)

    # Multi-class Brier score
    n_classes = probs.shape[1]
    one_hot = np.eye(n_classes)[y_true]
    brier = float(np.mean(np.sum((probs - one_hot) ** 2, axis=1)))

    return {
        "abstention_threshold": abstention_threshold,
        "coverage": round(coverage, 4),
        "abstention_rate": round(1.0 - coverage, 4),
        "macro_f1": round(macro_f1, 4),
        "brier_score": round(brier, 4),
        "confusion_matrix": cm,
        "per_class_report": report,
        "note": "Metrics evaluate visible expression-cue matching only, never guest satisfaction.",
    }


if __name__ == "__main__":
    # Self-test on synthetic validation arrays when no dataset is mounted
    rng = np.random.default_rng(42)
    y_sample = rng.integers(0, 3, size=120)
    raw = rng.dirichlet(np.ones(3), size=120)
    summary = evaluate_predictions(y_sample, raw, abstention_threshold=0.55)
    print(json.dumps(summary, indent=2))
