from fastapi import APIRouter

router = APIRouter()


@router.get("/health")
def health_check():
    return {
        "status": "ok",
        "message": "Wind turbine blade defect detection backend is running."
    }
