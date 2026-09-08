from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.routes.health import router as health_router
from app.api.routes.inference import router as inference_router
from app.core.config import PROJECT_NAME, PROJECT_VERSION

app = FastAPI(title=PROJECT_NAME, version=PROJECT_VERSION)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(health_router, prefix="/api", tags=["health"])
app.include_router(inference_router, prefix="/api", tags=["inference"])


@app.get("/")
def root():
    return {
        "project": PROJECT_NAME,
        "version": PROJECT_VERSION,
        "message": "Backend service is ready."
    }
