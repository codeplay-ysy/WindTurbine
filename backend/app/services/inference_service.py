import base64
from io import BytesIO
from pathlib import Path
from time import perf_counter

import numpy as np
from PIL import Image
from ultralytics import YOLO

from app.core.config import DEFAULT_CONFIDENCE, DEFAULT_IMAGE_SIZE, MODEL_PATH
from app.services.yolo_custom_modules import register_custom_modules

CLASS_NAMES = {
    0: "脏污",
    1: "损坏",
}
MAX_PROCESS_WIDTH = 1920
MAX_PROCESS_HEIGHT = 1080
MIN_CONFIDENCE = 0.05
MAX_CONFIDENCE = 0.95


class InferenceService:
    def __init__(self):
        backend_dir = Path(__file__).resolve().parents[2]
        self.model_path = (backend_dir / MODEL_PATH).resolve()
        self.model = None

    def load_model(self):
        if self.model is None:
            if not self.model_path.exists():
                raise FileNotFoundError(f"Model file not found: {self.model_path}")
            register_custom_modules()
            self.model = YOLO(str(self.model_path))
        return self.model

    def predict(self, image: Image.Image, source="manual_upload", confidence=DEFAULT_CONFIDENCE):
        confidence = self._normalize_confidence(confidence)
        model = self.load_model()
        original_size = {"width": image.width, "height": image.height}
        processed_image, preprocessing = self._preprocess_image(image)
        image_array = np.array(processed_image.convert("RGB"))

        start_time = perf_counter()
        results = model.predict(
            source=image_array,
            imgsz=DEFAULT_IMAGE_SIZE,
            conf=confidence,
            verbose=False,
        )
        elapsed_ms = round((perf_counter() - start_time) * 1000, 2)

        result = results[0]
        detections = self._build_detections(result, model)
        alert = self._build_alert(detections, source)
        annotated_image = self._encode_annotated_image(result)

        return {
            "detections": detections,
            "image_size": original_size,
            "preprocessing": preprocessing,
            "summary": {
                "defect_count": len(detections),
                "elapsed_ms": elapsed_ms,
                "confidence_threshold": confidence,
                "input_size": DEFAULT_IMAGE_SIZE,
            },
            "alert": alert,
            "annotated_image": annotated_image,
            "model_loaded": True,
        }

    def _normalize_confidence(self, confidence):
        try:
            confidence = float(confidence)
        except (TypeError, ValueError):
            confidence = DEFAULT_CONFIDENCE
        return min(max(confidence, MIN_CONFIDENCE), MAX_CONFIDENCE)

    def _preprocess_image(self, image: Image.Image):
        image = image.convert("RGB")
        original_width, original_height = image.size
        scale = min(MAX_PROCESS_WIDTH / original_width, MAX_PROCESS_HEIGHT / original_height, 1)

        if scale < 1:
            resized = image.resize(
                (int(original_width * scale), int(original_height * scale)),
                Image.Resampling.LANCZOS,
            )
            action = "resize"
        else:
            resized = image
            action = "keep_original"

        return resized, {
            "action": action,
            "original_width": original_width,
            "original_height": original_height,
            "processed_width": resized.width,
            "processed_height": resized.height,
        }

    def _build_detections(self, result, model):
        detections = []
        for index, box in enumerate(result.boxes, start=1):
            xyxy = box.xyxy[0].tolist()
            class_id = int(box.cls[0].item())
            confidence = float(box.conf[0].item())
            detections.append({
                "index": index,
                "class_id": class_id,
                "class_name": CLASS_NAMES.get(class_id, model.names.get(class_id, str(class_id))),
                "confidence": round(confidence, 4),
                "severity": self._get_severity(class_id, confidence),
                "bbox": {
                    "x1": round(float(xyxy[0]), 2),
                    "y1": round(float(xyxy[1]), 2),
                    "x2": round(float(xyxy[2]), 2),
                    "y2": round(float(xyxy[3]), 2),
                },
            })
        return detections

    def _build_alert(self, detections, source):
        if not detections:
            return {
                "triggered": False,
                "level": "正常",
                "message": "未检测到明显缺陷，巡检图像状态正常。",
                "channels": [],
            }

        has_damage = any(item["class_id"] == 1 for item in detections)
        high_confidence = max(item["confidence"] for item in detections) >= 0.75
        level = "严重" if has_damage and high_confidence else "关注"

        return {
            "triggered": True,
            "level": level,
            "message": f"来自{self._source_name(source)}的巡检图像检测到{len(detections)}处疑似缺陷，建议生成工单并安排复核。",
            "channels": ["系统告警", "巡检记录", "维护工单"],
        }

    def _get_severity(self, class_id, confidence):
        if class_id == 1 and confidence >= 0.75:
            return "严重"
        if confidence >= 0.6:
            return "关注"
        return "轻微"

    def _source_name(self, source):
        return "无人机" if source == "uav" else "人工上传"

    def _encode_annotated_image(self, result):
        annotated_array = result.plot()
        annotated_image = Image.fromarray(annotated_array[..., ::-1])
        buffer = BytesIO()
        annotated_image.save(buffer, format="JPEG", quality=90)
        return base64.b64encode(buffer.getvalue()).decode("utf-8")


inference_service = InferenceService()
