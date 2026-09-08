from io import BytesIO

from fastapi import APIRouter, File, Form, HTTPException, UploadFile
from PIL import Image, UnidentifiedImageError

from app.core.config import DEFAULT_CONFIDENCE
from app.services.inference_service import inference_service

router = APIRouter()


async def _read_upload_image(file: UploadFile):
    if not file.content_type or not file.content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="Please upload a valid image file.")

    try:
        content = await file.read()
        return Image.open(BytesIO(content))
    except UnidentifiedImageError as exc:
        raise HTTPException(status_code=400, detail="Invalid image file.") from exc


@router.post("/infer")
async def infer_image(
    file: UploadFile = File(...),
    confidence: float = Form(DEFAULT_CONFIDENCE),
):
    try:
        image = await _read_upload_image(file)
        prediction = inference_service.predict(image, source="manual_upload", confidence=confidence)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Inference failed: {exc}") from exc

    return {
        "filename": file.filename,
        "source": "manual_upload",
        "message": "巡检图像检测完成。",
        **prediction,
    }


@router.post("/uav/image")
async def receive_uav_image(
    file: UploadFile = File(...),
    uav_id: str = Form("UAV-001"),
    blade_id: str = Form("Blade-A"),
    location: str = Form("WindFarm-01"),
    confidence: float = Form(DEFAULT_CONFIDENCE),
):
    try:
        image = await _read_upload_image(file)
        prediction = inference_service.predict(image, source="uav", confidence=confidence)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"UAV image processing failed: {exc}") from exc

    return {
        "filename": file.filename,
        "source": "uav",
        "uav_task": {
            "uav_id": uav_id,
            "blade_id": blade_id,
            "location": location,
        },
        "message": "无人机巡检图像已接入并完成自动检测。",
        **prediction,
    }
