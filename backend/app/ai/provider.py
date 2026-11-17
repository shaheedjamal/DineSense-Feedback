import base64
import io
import os
from dataclasses import dataclass
from typing import Optional
import cv2
import numpy as np
from PIL import Image
from ..core.config import settings

UNABLE_MESSAGE = "Unable to assess – Please use another feedback method."
ETHICAL_NOTE = "This is an uncertain visual cue, not a measure of customer satisfaction."


@dataclass
class ImageQualityResult:
    face_detected: bool
    brightness: float
    blur_score: float
    framing_score: float
    acceptable: bool
    aligned_tensor: Optional[np.ndarray] = None


def check_quality_and_preprocess(image_bytes: bytes) -> ImageQualityResult:
    """
    Validates image brightness, blur (Laplacian variance), and temporary face presence
    using OpenCV Haar cascade. Never stores raw image or facial templates.
    """
    pil_img = Image.open(io.BytesIO(image_bytes)).convert("RGB")
    rgb = np.array(pil_img)
    gray = cv2.cvtColor(rgb, cv2.COLOR_RGB2GRAY)

    brightness = float(np.mean(gray) / 255.0)
    lap_var = float(cv2.Laplacian(gray, cv2.CV_64F).var())
    blur_score = min(1.0, lap_var / 250.0)

    cascade_path = cv2.data.haarcascades + "haarcascade_frontalface_default.xml"
    face_cascade = cv2.CascadeClassifier(cascade_path)
    faces = face_cascade.detectMultiScale(gray, scaleFactor=1.1, minNeighbors=4, minSize=(48, 48))

    if len(faces) == 0:
        return ImageQualityResult(
            face_detected=False,
            brightness=brightness,
            blur_score=blur_score,
            framing_score=0.0,
            acceptable=False,
        )

    x, y, w, h = max(faces, key=lambda box: box[2] * box[3])
    img_h, img_w = gray.shape
    area_ratio = (w * h) / max(1, img_w * img_h)
    framing_score = min(1.0, area_ratio * 4.5)

    lighting_ok = 0.20 <= brightness <= 0.90
    sharpness_ok = blur_score >= 0.25
    framing_ok = framing_score >= 0.30

    if not (lighting_ok and sharpness_ok and framing_ok):
        return ImageQualityResult(
            face_detected=True,
            brightness=brightness,
            blur_score=blur_score,
            framing_score=framing_score,
            acceptable=False,
        )

    # Temporary crop and normalize to MobileNetV2 224x224 tensor
    crop = rgb[y : y + h, x : x + w]
    resized = cv2.resize(crop, (224, 224)).astype(np.float32) / 255.0
    mean = np.array([0.485, 0.456, 0.406], dtype=np.float32)
    std = np.array([0.229, 0.224, 0.225], dtype=np.float32)
    normalized = (resized - mean) / std
    tensor = np.transpose(normalized, (2, 0, 1))[None, ...]

    return ImageQualityResult(
        face_detected=True,
        brightness=brightness,
        blur_score=blur_score,
        framing_score=framing_score,
        acceptable=True,
        aligned_tensor=tensor,
    )


class ExpressionCueProvider:
    """
    Modular expression-cue inference provider.
    Uses ONNX Runtime MobileNetV2 when a validated model exists at MODEL_PATH
    and INFERENCE_PROVIDER='onnx', otherwise uses a clearly labeled Demo Provider.
    """

    CLASSES = ["smile_like", "neutral_like", "other_expression"]

    def __init__(self) -> None:
        self.session = None
        self.model_version = "demo-v1"
        self.is_demo = True

        if settings.INFERENCE_PROVIDER == "onnx" and os.path.exists(settings.MODEL_PATH):
            try:
                import onnxruntime as ort

                self.session = ort.InferenceSession(
                    settings.MODEL_PATH, providers=["CPUExecutionProvider"]
                )
                self.model_version = "mobilenetv2-onnx-v1"
                self.is_demo = False
            except Exception:
                self.session = None
                self.model_version = "demo-v1-fallback"
                self.is_demo = True

    def predict(
        self,
        *,
        image_base64: Optional[str] = None,
        quality_metrics: Optional[dict] = None,
    ) -> dict:
        if image_base64:
            raw_bytes = base64.b64decode(image_base64.split(",")[-1])
            q = check_quality_and_preprocess(raw_bytes)
            del raw_bytes  # Immediate disposal

            if not q.acceptable:
                return {
                    "status": "abstention",
                    "expression_cue": "uncertain",
                    "confidence": 0.0,
                    "confidence_band": "low",
                    "quality_status": "insufficient",
                    "model_version": self.model_version,
                    "is_demo": self.is_demo,
                    "message": UNABLE_MESSAGE,
                    "note": ETHICAL_NOTE,
                }

            if self.session is not None and q.aligned_tensor is not None:
                input_name = self.session.get_inputs()[0].name
                logits = self.session.run(None, {input_name: q.aligned_tensor})[0][0]
                exp = np.exp(logits - np.max(logits))
                probs = exp / np.sum(exp)
                idx = int(np.argmax(probs))
                conf = float(probs[idx])
                cue = self.CLASSES[idx]
                return self._format_output(cue, conf)

            # Demo fallback if ONNX model file is not supplied
            return self._demo_from_signal(0.55, q.blur_score, q.framing_score)

        if quality_metrics:
            face_detected = bool(quality_metrics.get("face_detected", False))
            brightness = float(quality_metrics.get("brightness", 0.0))
            blur_score = float(quality_metrics.get("blur_score", 0.0))
            framing_score = float(quality_metrics.get("framing_score", 0.0))

            if not face_detected or not (0.20 <= brightness <= 0.90) or blur_score < 0.25 or framing_score < 0.40:
                return {
                    "status": "abstention",
                    "expression_cue": "uncertain",
                    "confidence": 0.0,
                    "confidence_band": "low",
                    "quality_status": "insufficient",
                    "model_version": self.model_version,
                    "is_demo": True,
                    "message": UNABLE_MESSAGE,
                    "note": ETHICAL_NOTE,
                }

            signal = float(quality_metrics.get("smile_signal", 0.5))
            return self._demo_from_signal(signal, blur_score, framing_score)

        return {
            "status": "abstention",
            "expression_cue": "uncertain",
            "confidence": 0.0,
            "confidence_band": "low",
            "quality_status": "insufficient",
            "model_version": self.model_version,
            "is_demo": True,
            "message": UNABLE_MESSAGE,
            "note": ETHICAL_NOTE,
        }

    def _demo_from_signal(self, signal: float, blur_score: float, framing_score: float) -> dict:
        if signal >= 0.63:
            cue = "smile_like"
            raw_conf = min(0.84, 0.58 + (signal - 0.60) * 0.65)
        elif signal <= 0.34:
            cue = "other_expression"
            raw_conf = min(0.76, 0.50 + (0.35 - signal) * 0.70)
        else:
            cue = "neutral_like"
            raw_conf = min(0.79, 0.56 + (0.15 - abs(signal - 0.48)) * 0.90)

        quality_factor = min(1.0, (blur_score + framing_score) / 1.5)
        conf = round(raw_conf * (0.75 + 0.25 * quality_factor), 2)
        return self._format_output(cue, conf, force_demo=True)

    def _format_output(self, cue: str, confidence: float, force_demo: bool = False) -> dict:
        if confidence < settings.ABSTENTION_THRESHOLD:
            return {
                "status": "abstention",
                "expression_cue": "uncertain",
                "confidence": round(confidence, 2),
                "confidence_band": "low",
                "quality_status": "acceptable",
                "model_version": self.model_version,
                "is_demo": True if force_demo else self.is_demo,
                "message": UNABLE_MESSAGE,
                "note": ETHICAL_NOTE,
            }
        band = "high" if confidence >= 0.78 else "medium" if confidence >= 0.62 else "low"
        return {
            "status": "success",
            "expression_cue": cue,
            "confidence": round(confidence, 2),
            "confidence_band": band,
            "quality_status": "acceptable",
            "model_version": self.model_version,
            "is_demo": True if force_demo else self.is_demo,
            "note": ETHICAL_NOTE,
        }


provider = ExpressionCueProvider()
