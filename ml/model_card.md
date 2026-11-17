# Model Card — DineSense Expression-Cue Model (`mobilenetv2-cue-v1` / `demo-v1`)

## 1. Model Details
- **Architecture**: MobileNetV2 transfer-learning image classifier (224x224 RGB aligned face crop) exported to ONNX Runtime for CPU edge inference, paired with a clearly labeled Demonstration Provider (`demo-v1`) when no validated ONNX weights are loaded.
- **Output Classes**:
  - `smile_like` (broad visible smile-like pattern)
  - `neutral_like` (broad neutral-like facial pattern)
  - `other_expression` (other non-neutral, non-smile pattern)
  - `uncertain` (abstention output when quality is poor or calibrated confidence < 0.55)

## 2. Intended Use
- **Primary Purpose**: Supplementary, optional, aggregate hospitality signal collected only after affirmative guest consent.
- **Users**: Restaurant managers viewing de-identified, $k$-anonymized ($n \ge 5$) aggregate charts alongside direct star ratings and comments.

## 3. Prohibited Uses
- Face recognition, guest identification, or cross-visit tracking.
- Measuring or claiming a person's true internal emotion, satisfaction, honesty, or intent.
- Employee performance evaluation or disciplinary scoring.
- Covert camera capture, continuous monitoring, or automated access decisions.

## 4. Dataset Provenance & Training Governance
- This repository does **not** redistribute third-party facial datasets. Operators deploying a trained ONNX model must supply an appropriately licensed dataset, record dataset provenance, and run subgroup fairness evaluations (across lighting, age groups, and skin tones) prior to production activation.
- Never extrapolate demonstration metrics (`demo-v1`) as real-world model accuracy.

## 5. Limitations & Calibration
- Facial expressions vary widely across cultures, contexts, lighting, and individual habits.
- Predictions are gated by an explicit abstention threshold (`0.55`) and pre-inference quality checks (lighting luminance, Laplacian blur variance, and face framing). When uncertain, the system returns `"Unable to assess – Please use another feedback method."`
