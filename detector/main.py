import asyncio
import hashlib
import json
import logging
import os
import shutil
import subprocess
import tempfile
import threading
import time
import uuid
from pathlib import Path
from typing import Any, Literal

import cv2
import numpy as np
import torch
from fastapi import FastAPI, File, Query, Request, UploadFile
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.concurrency import run_in_threadpool

from deepguard.data import get_test_transforms
from inference.image_predictor_prt import ImagePredictor
from inference.utils import PredictorError
from inference.video_predictor_prt import VideoPredictor
from preprocess.face_detector import FaceDetector2

LOGGER = logging.getLogger("deeptrace.detector")
logging.basicConfig(
    level=os.getenv("DETECTOR_LOG_LEVEL", "INFO").upper(),
    format="%(asctime)s %(levelname)s %(name)s %(message)s",
)

MODEL_NAME = os.getenv("DEEPGUARD_MODEL", "ms_eff_gcvit_b0")
DATASET = os.getenv("DEEPGUARD_DATASET", "ff++")
MARGIN_RATIO = float(os.getenv("DEEPGUARD_MARGIN_RATIO", "0.2"))
FACE_CONF_THRESHOLD = float(os.getenv("DEEPGUARD_FACE_CONF", "0.4"))
MAX_IMAGE_MB = int(os.getenv("DETECTOR_MAX_IMAGE_MB", "20"))
MAX_VIDEO_MB = int(os.getenv("DETECTOR_MAX_VIDEO_MB", "80"))
MAX_DURATION_SEC = int(os.getenv("DETECTOR_MAX_DURATION_SEC", "60"))
ANALYSIS_TIMEOUT_SEC = int(os.getenv("DETECTOR_ANALYSIS_TIMEOUT_SEC", "300"))
DETECTOR_PORT = int(os.getenv("DETECTOR_PORT", "8000"))

IMAGE_EXTENSIONS = {
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
    ".webp": "image/webp",
}
VIDEO_EXTENSIONS = {
    ".mp4": "video/mp4",
    ".m4v": "video/x-m4v",
    ".mov": "video/quicktime",
    ".avi": "video/x-msvideo",
    ".mkv": "video/x-matroska",
    ".webm": "video/webm",
}

AUDIO_MESSAGE = "No audio detector configured — analysis incomplete"

_predictors: dict[str, Any] = {}
_predictor_lock = threading.Lock()
_inference_lock = threading.Lock()


class DetectorError(Exception):
    def __init__(self, code: str, message: str, status_code: int):
        super().__init__(message)
        self.code = code
        self.message = message
        self.status_code = status_code


def _error(code: str, message: str, status_code: int, request_id: str) -> JSONResponse:
    return JSONResponse(
        status_code=status_code,
        content={
            "status": "error",
            "request_id": request_id,
            "error": {"code": code, "message": message},
        },
    )


def _device() -> str:
    for predictor in _predictors.values():
        return str(predictor.device)
    return "cpu"


def _detector_meta() -> dict[str, Any]:
    return {
        "name": "DeepGuard",
        "model": MODEL_NAME,
        "dataset": DATASET,
        "margin_ratio": MARGIN_RATIO,
        "face_confidence_threshold": FACE_CONF_THRESHOLD,
        "device": _device(),
        "labels": {"0": "real", "1": "fake"},
        "score_field": "fake_score",
        "score_semantics": (
            "Sigmoid output for DeepGuard's fake class. It is uncalibrated and "
            "must not be read as a calibrated probability. A score of 0.5 is "
            "not a confirmed 50 percent probability."
        ),
        "licenses": {
            "deepguard_code": "MIT",
            "published_checkpoint": "MIT (as declared by the weight publisher)",
            "ultralytics_runtime_dependency": "AGPL-3.0",
        },
    }


def _interpretation() -> dict[str, str]:
    return {
        "note": (
            "Raw detector output only. A high or low score is not proof of "
            "manipulation or authenticity."
        ),
        "score_caveat": (
            "The score is an uncalibrated fake-class score. Do not treat 0.5 "
            "as a confirmed 50 percent probability."
        ),
        "scope": (
            "DeepGuard analyses face crops from images or sampled video frames. "
            "Frame sampling and aggregation are not temporal video understanding."
        ),
        "audio": AUDIO_MESSAGE,
    }


def _get_predictor(kind: Literal["image", "video"]) -> Any:
    with _predictor_lock:
        predictor = _predictors.get(kind)
        if predictor is not None:
            return predictor

        started = time.perf_counter()
        if kind == "image":
            predictor = ImagePredictor(
                margin_ratio=MARGIN_RATIO,
                conf_thres=FACE_CONF_THRESHOLD,
                model_name=MODEL_NAME,
                dataset=DATASET,
            )
        else:
            predictor = VideoPredictor(
                margin_ratio=MARGIN_RATIO,
                conf_thres=FACE_CONF_THRESHOLD,
                model_name=MODEL_NAME,
                dataset=DATASET,
            )

        _predictors[kind] = predictor
        LOGGER.info(
            "loaded predictor kind=%s model=%s dataset=%s seconds=%.3f",
            kind,
            MODEL_NAME,
            DATASET,
            time.perf_counter() - started,
        )
        return predictor


def _compute_forensics(img_bgr: np.ndarray) -> dict[str, Any]:
    gray = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2GRAY)

    # Error Level Analysis (ELA) with JPEG quality 90
    encode_param = [int(cv2.IMWRITE_JPEG_QUALITY), 90]
    _, encimg = cv2.imencode(".jpg", img_bgr, encode_param)
    decompressed = cv2.imdecode(encimg, 1)
    diff = cv2.absdiff(img_bgr, decompressed)
    diff_gray = cv2.cvtColor(diff, cv2.COLOR_BGR2GRAY)
    ela_mean = float(np.mean(diff_gray))
    ela_std = float(np.std(diff_gray))

    # 2D FFT Frequency magnitude spectrum
    f = np.fft.fft2(gray.astype(np.float32))
    fshift = np.fft.fftshift(f)
    mag = 20 * np.log(np.abs(fshift) + 1e-6)
    h, w = gray.shape
    cy, cx = h // 2, w // 2
    r = max(min(h, w) // 4, 8)
    high_freq_mean = float(np.mean(mag[cy - r : cy + r, cx - r : cx + r]))
    total_mean = float(np.mean(mag))
    fft_ratio = float(high_freq_mean / max(total_mean, 1e-6))

    # Laplacian Sharpness Variance
    lap_var = float(cv2.Laplacian(gray, cv2.CV_64F).var())

    # Synthetic/manipulation likelihood score [0.0, 1.0]
    ela_factor = min(1.0, max(0.0, (ela_mean - 0.4) / 4.0))
    fft_factor = min(1.0, max(0.0, (fft_ratio - 1.1) / 0.5))
    heuristic_fake_score = round(0.4 * ela_factor + 0.6 * fft_factor, 4)

    return {
        "ela_mean": round(ela_mean, 4),
        "ela_std": round(ela_std, 4),
        "fft_high_freq_ratio": round(fft_ratio, 4),
        "sharpness_variance": round(lap_var, 2),
        "synthetic_artifact_score": heuristic_fake_score,
    }


def _analyze_image_sync(path: str, tta_hflip: float) -> dict[str, Any]:
    with _inference_lock:
        predictor = _get_predictor("image")
        img_bgr = cv2.imread(path)
        if img_bgr is None:
            raise PredictorError("이미지를 불러올 수 없습니다. 파일이 손상되었거나 지원하지 않는 형식인지 확인해 주세요.")

        img_rgb = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2RGB)
        img_h, img_w = img_rgb.shape[:2]
        total_area = max(1, img_h * img_w)

        forensics = _compute_forensics(img_bgr)

        # 1. Multi-stage face detection
        detect_result = None
        # Try primary face detector (configured threshold e.g. 0.4)
        batch_res = predictor.face_detector.detect_batch([img_rgb], [1.0])
        if batch_res and len(batch_res[0]) > 0:
            detect_result = batch_res[0]
        else:
            # Fallback to lower confidence threshold (0.25) to catch webcam / angled / low-light faces
            try:
                fallback_detector = FaceDetector2(conf_thres=0.25)
                fb_res = fallback_detector.detect_batch([img_rgb], [1.0])
                if fb_res and len(fb_res[0]) > 0:
                    detect_result = fb_res[0]
            except Exception as exc:
                LOGGER.warning("fallback face detector failed: %s", exc)

        # 2. If face found:
        if detect_result is not None:
            bbox = detect_result[:4]
            conf = float(detect_result[4] * 100) if len(detect_result) > 4 else 80.0

            x1, y1, x2, y2 = bbox
            face_w = max(1.0, x2 - x1)
            face_h = max(1.0, y2 - y1)
            face_area = face_w * face_h
            face_ratio = (face_area / total_area) * 100.0

            cropped = predictor._crop_face(img_rgb, bbox)
            if cropped is None or cropped.size == 0:
                cropped = img_rgb

            # Check landmarks safely without raising an error that terminates inference
            landmarks_verified = False
            try:
                keypoint = predictor.landmark_detector.detect_batch([cropped])[0]
                landmarks_verified = len(keypoint) > 0
            except Exception:
                landmarks_verified = False

            face_gray = cv2.cvtColor(cropped, cv2.COLOR_RGB2GRAY)
            face_brightness = float(np.mean(face_gray) / 255.0) * 100.0

            transforms = get_test_transforms(img_size=predictor.img_size, tta_hflip=tta_hflip)
            transformed = transforms(image=cropped)["image"]

            with torch.no_grad():
                tensor = transformed.unsqueeze(0).to(predictor.device)
                out = predictor.model(tensor)
                pred = torch.sigmoid(out).item()

            return {
                "prob": pred,
                "face_conf": conf,
                "face_ratio": face_ratio,
                "face_brightness": face_brightness,
                "analysis_type": "facial_deepfake",
                "landmarks_verified": landmarks_verified,
                "forensics": forensics,
                "face_bbox": [float(x1), float(y1), float(x2), float(y2)],
            }

        # 3. If NO face found in image:
        # Full-frame explainable digital forensics
        synthetic_score = forensics["synthetic_artifact_score"]
        return {
            "prob": synthetic_score,
            "face_conf": None,
            "face_ratio": None,
            "face_brightness": float(np.mean(cv2.cvtColor(img_bgr, cv2.COLOR_BGR2GRAY)) / 255.0) * 100.0,
            "analysis_type": "visual_forensics_non_facial",
            "landmarks_verified": False,
            "forensics": forensics,
            "face_bbox": None,
        }


def _analyze_video_sync(
    path: str,
    agg_mode: Literal["conf", "mean", "vote"],
    tta_hflip: float,
) -> dict[str, Any]:
    with _inference_lock:
        return _get_predictor("video").predict_video(
            path,
            agg_mode=agg_mode,
            tta_hflip=tta_hflip,
        )


def _sniff_media(path: str, suffix: str) -> str | None:
    with open(path, "rb") as media:
        head = media.read(32)

    if suffix in IMAGE_EXTENSIONS:
        if head.startswith(b"\xff\xd8"):
            return "image/jpeg"
        if head.startswith(b"\x89PNG\r\n\x1a\n"):
            return "image/png"
        if head[:4] == b"RIFF" and head[8:12] == b"WEBP":
            return "image/webp"
        return None

    if suffix in VIDEO_EXTENSIONS:
        if len(head) >= 12 and head[4:8] == b"ftyp":
            return "video/mp4"
        if head[:4] == b"RIFF" and head[8:12] == b"AVI ":
            return "video/x-msvideo"
        if head.startswith(b"\x1a\x45\xdf\xa3"):
            return "video/webm"
        return None

    return None


def _looks_like_allowed_content_type(
    content_type: str,
    expected: str,
) -> bool:
    clean = content_type.split(";")[0].strip().lower()
    if clean in {"", "application/octet-stream"}:
        return True
    if clean == expected:
        return True
    if expected == "image/jpeg" and clean in {"image/jpg", "image/pjpeg", "image/jfif"}:
        return True
    if expected == "image/png" and clean in {"image/x-png"}:
        return True
    return False


async def _save_upload(
    upload: UploadFile,
    temp_dir: str,
    max_bytes: int,
    extensions: dict[str, str],
    request_id: str,
) -> dict[str, Any]:
    original_name = Path(upload.filename or "").name
    suffix = Path(original_name).suffix.lower()
    if suffix not in extensions:
        raise DetectorError(
            "UNSUPPORTED_MEDIA_TYPE",
            f"Unsupported file extension. Allowed: {', '.join(sorted(extensions))}",
            415,
        )

    expected_type = extensions[suffix]
    content_type = (upload.content_type or "").lower()
    if not _looks_like_allowed_content_type(content_type, expected_type):
        raise DetectorError(
            "UNSUPPORTED_MEDIA_TYPE",
            f"Content type does not match the file extension ({expected_type}).",
            415,
        )

    destination = os.path.join(temp_dir, f"upload{suffix}")
    digest = hashlib.sha256()
    total = 0

    try:
        with open(destination, "wb") as output:
            while True:
                chunk = await upload.read(1024 * 1024)
                if not chunk:
                    break
                total += len(chunk)
                if total > max_bytes:
                    raise DetectorError(
                        "FILE_TOO_LARGE",
                        f"File exceeds the {max_bytes // (1024 * 1024)} MiB limit.",
                        413,
                    )
                digest.update(chunk)
                output.write(chunk)
    finally:
        await upload.close()

    if total == 0:
        raise DetectorError("EMPTY_FILE", "The uploaded file is empty.", 400)

    detected_type = _sniff_media(destination, suffix)
    if detected_type is None:
        raise DetectorError(
            "UNSUPPORTED_MEDIA_TYPE",
            "The file signature does not match a supported image or video format.",
            415,
        )

    if suffix in IMAGE_EXTENSIONS and not detected_type.startswith("image/"):
        raise DetectorError(
            "UNSUPPORTED_MEDIA_TYPE",
            "The uploaded image did not contain a supported image signature.",
            415,
        )
    if suffix in VIDEO_EXTENSIONS and not detected_type.startswith("video/"):
        raise DetectorError(
            "UNSUPPORTED_MEDIA_TYPE",
            "The uploaded video did not contain a supported video signature.",
            415,
        )

    LOGGER.info(
        "accepted upload request_id=%s bytes=%s detected_type=%s",
        request_id,
        total,
        detected_type,
    )
    return {
        "path": destination,
        "filename": original_name,
        "bytes": total,
        "sha256": digest.hexdigest(),
        "content_type": content_type or detected_type,
        "detected_type": detected_type,
    }


def _probe_video(path: str) -> dict[str, Any]:
    ffprobe = shutil.which("ffprobe")
    if not ffprobe and os.name == "nt":
        local_app = os.getenv("LOCALAPPDATA", "")
        if local_app:
            winget_probe = os.path.join(local_app, "Microsoft", "WinGet", "Links", "ffprobe.exe")
            if os.path.exists(winget_probe):
                ffprobe = winget_probe
    if not ffprobe:
        raise DetectorError(
            "FFPROBE_UNAVAILABLE",
            "ffprobe is not available to the detector service. Install FFmpeg and restart the service.",
            503,
        )

    command = [
        ffprobe,
        "-v",
        "error",
        "-print_format",
        "json",
        "-show_format",
        "-show_streams",
        path,
    ]

    try:
        completed = subprocess.run(
            command,
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
            timeout=15,
            check=False,
        )
    except subprocess.TimeoutExpired as exc:
        raise DetectorError(
            "VIDEO_PROBE_TIMEOUT",
            "ffprobe timed out while inspecting the video.",
            504,
        ) from exc
    except OSError as exc:
        raise DetectorError(
            "FFPROBE_UNAVAILABLE",
            "ffprobe could not be started.",
            503,
        ) from exc

    if completed.returncode != 0:
        raise DetectorError(
            "VIDEO_UNREADABLE",
            "ffprobe could not read the uploaded video.",
            422,
        )

    try:
        probe = json.loads(completed.stdout)
    except json.JSONDecodeError as exc:
        raise DetectorError(
            "VIDEO_PROBE_FAILED",
            "ffprobe returned an unreadable response.",
            502,
        ) from exc

    streams = probe.get("streams") or []
    video_streams = [stream for stream in streams if stream.get("codec_type") == "video"]
    if not video_streams:
        raise DetectorError(
            "NO_VIDEO_STREAM",
            "The uploaded file contains no video stream.",
            422,
        )

    duration_value = (probe.get("format") or {}).get("duration")
    if duration_value in (None, "N/A"):
        duration_value = video_streams[0].get("duration")

    try:
        duration = float(duration_value)
    except (TypeError, ValueError) as exc:
        raise DetectorError(
            "VIDEO_DURATION_UNKNOWN",
            "The video duration could not be determined; analysis was not started.",
            422,
        ) from exc

    if duration <= 0:
        raise DetectorError(
            "VIDEO_DURATION_UNKNOWN",
            "The video duration is invalid; analysis was not started.",
            422,
        )

    if duration > MAX_DURATION_SEC:
        raise DetectorError(
            "VIDEO_TOO_LONG",
            f"Video duration exceeds the {MAX_DURATION_SEC} second limit.",
            413,
        )

    primary = video_streams[0]
    return {
        "duration_seconds": duration,
        "video_stream_count": len(video_streams),
        "width": primary.get("width"),
        "height": primary.get("height"),
        "codec": primary.get("codec_name"),
    }


def _file_meta(upload_meta: dict[str, Any]) -> dict[str, Any]:
    return {
        "filename": upload_meta["filename"],
        "bytes": upload_meta["bytes"],
        "sha256": upload_meta["sha256"],
        "content_type": upload_meta["content_type"],
        "detected_type": upload_meta["detected_type"],
    }


def _classify_predictor_error(message: str) -> tuple[str, str]:
    if "이미지에서 얼굴을 인식하지 못해" in message:
        return (
            "no_face",
            "No usable face was detected in the uploaded image. No score was produced.",
        )
    if "얼굴은 감지되었으나" in message:
        return (
            "landmarks_unusable",
            "A face was detected, but its landmarks were not usable. No score was produced.",
        )
    if "Frame에서 모두 얼굴 탐지에 실패" in message:
        return (
            "no_face_in_sampled_frames",
            "No usable face was detected in the sampled video frames. No score was produced.",
        )
    if "얼굴이 옆모습이거나" in message:
        return (
            "landmarks_unusable",
            "Faces were found in sampled frames, but their landmarks were not usable. No score was produced.",
        )
    if "비디오를 불러올 수 없습니다" in message:
        return (
            "video_decode_failed",
            "The video could not be decoded by OpenCV. No score was produced.",
        )
    if "이미지를 불러올 수 없습니다" in message:
        return (
            "image_decode_failed",
            "The image could not be decoded. No score was produced.",
        )
    if "해당 비디오 파일 경로가 존재하지 않습니다" in message:
        return (
            "video_not_found",
            "The video file was not available to the detector. No score was produced.",
        )
    if "모두 추출에 실패" in message:
        return (
            "frame_extraction_failed",
            "No frames could be extracted from the video. No score was produced.",
        )
    return (
        "predictor_error",
        "DeepGuard could not produce a valid prediction. No score was produced.",
    )


def _inconclusive(
    request_id: str,
    reason: str,
    message: str,
    detector_message: str | None,
    file_meta: dict[str, Any] | None,
    extra: dict[str, Any] | None = None,
) -> JSONResponse:
    body: dict[str, Any] = {
        "status": "inconclusive",
        "reason": reason,
        "request_id": request_id,
        "message": message,
        "detector": _detector_meta(),
        "file": file_meta,
        "result": None,
        "interpretation": _interpretation(),
    }
    if detector_message:
        body["detector_message"] = detector_message
    if extra:
        body.update(extra)
    return JSONResponse(status_code=200, content=body)


def _aggregation_description(mode: str) -> str:
    if mode == "conf":
        return (
            "DeepGuard custom heuristic: if more than 40 percent of frames score above 0.8, "
            "average those frames; otherwise if more than 90 percent score below 0.2, average "
            "those frames; otherwise average all frames. These thresholds are heuristic, not calibrated."
        )
    if mode == "mean":
        return "Arithmetic mean of all sampled frame fake-class scores."
    return "Fraction of sampled frames whose fake-class score is above 0.5."


def _video_frame_view(frame: dict[str, Any]) -> dict[str, Any]:
    return {
        "frame_index": frame["frame_index"],
        "deepguard_frame_time": frame["frame_time"],
        "approx_seconds_at_1fps": frame["frame_time"],
        "fake_score": frame["score"],
        "face_confidence": frame["face_conf"],
        "face_area_percent": frame["face_ratio"],
        "face_brightness_percent": frame["face_brightness"],
        "raw": frame,
    }


app = FastAPI(
    title="DeepTrace detector service",
    version="0.1.0",
    description="Local-only DeepGuard image and video-frame analysis service.",
)


@app.exception_handler(RequestValidationError)
async def _request_validation_error(
    request: Request,
    exc: RequestValidationError,
) -> JSONResponse:
    request_id = uuid.uuid4().hex
    LOGGER.warning(
        "invalid request request_id=%s path=%s errors=%s",
        request_id,
        request.url.path,
        exc.errors(),
    )
    return _error(
        "INVALID_REQUEST",
        "The request did not match the expected multipart form or query parameters.",
        422,
        request_id,
    )


@app.exception_handler(Exception)
async def _unhandled_error(request: Request, exc: Exception) -> JSONResponse:
    request_id = uuid.uuid4().hex
    LOGGER.exception(
        "unhandled error request_id=%s path=%s",
        request_id,
        request.url.path,
    )
    return _error(
        "DETECTOR_INTERNAL_ERROR",
        "The detector service failed unexpectedly.",
        500,
        request_id,
    )


@app.get("/health")
async def health() -> dict[str, Any]:
    return {
        "status": "ok",
        "service": "deeptrace-detector",
        "version": "0.1.0",
        "model": MODEL_NAME,
        "dataset": DATASET,
        "device": _device(),
        "model_loaded": bool(_predictors),
        "limits": {
            "max_image_mb": MAX_IMAGE_MB,
            "max_video_mb": MAX_VIDEO_MB,
            "max_duration_seconds": MAX_DURATION_SEC,
        },
        "capabilities": {
            "image": True,
            "video_frames": True,
            "audio": False,
        },
        "audio_message": AUDIO_MESSAGE,
        "detector": _detector_meta(),
    }


@app.post("/analyze/image")
async def analyze_image(
    file: UploadFile = File(...),
    tta_hflip: float = Query(0.0, ge=0.0, le=1.0),
) -> JSONResponse:
    request_id = uuid.uuid4().hex
    started = time.perf_counter()
    upload_meta: dict[str, Any] | None = None

    try:
        with tempfile.TemporaryDirectory(prefix="deeptrace-image-") as temp_dir:
            upload_meta = await _save_upload(
                file,
                temp_dir,
                MAX_IMAGE_MB * 1024 * 1024,
                IMAGE_EXTENSIONS,
                request_id,
            )

            try:
                raw = await asyncio.wait_for(
                    run_in_threadpool(
                        _analyze_image_sync,
                        upload_meta["path"],
                        tta_hflip,
                    ),
                    timeout=ANALYSIS_TIMEOUT_SEC,
                )
            except PredictorError as exc:
                detector_message = getattr(exc, "message", str(exc))
                reason, message = _classify_predictor_error(detector_message)
                LOGGER.info(
                    "image inconclusive request_id=%s reason=%s seconds=%.3f",
                    request_id,
                    reason,
                    time.perf_counter() - started,
                )
                return _inconclusive(
                    request_id,
                    reason,
                    message,
                    detector_message,
                    _file_meta(upload_meta),
                )
            except asyncio.TimeoutError:
                LOGGER.warning(
                    "image timeout request_id=%s seconds=%.3f",
                    request_id,
                    time.perf_counter() - started,
                )
                return _inconclusive(
                    request_id,
                    "analysis_timeout",
                    "DeepGuard did not finish within the configured analysis timeout. No score was produced.",
                    None,
                    _file_meta(upload_meta),
                )
            except Exception as exc:
                LOGGER.exception(
                    "image inference error request_id=%s seconds=%.3f",
                    request_id,
                    time.perf_counter() - started,
                )
                return _inconclusive(
                    request_id,
                    "inference_error",
                    "DeepGuard failed while analysing the image. No score was produced.",
                    str(exc),
                    _file_meta(upload_meta),
                )

            analysis_type = raw.get("analysis_type", "facial_deepfake")
            if analysis_type == "visual_forensics_non_facial":
                message = "No human face detected. DeepTrace performed full-frame digital forensics (Error Level Analysis & FFT spectral anomaly)."
            else:
                message = "DeepGuard produced an image-level fake-class score. This is one signal, not a conclusion."

            body = {
                "status": "evaluated",
                "reason": "ok",
                "request_id": request_id,
                "message": message,
                "detector": _detector_meta(),
                "file": _file_meta(upload_meta),
                "result": {
                    "fake_score": raw["prob"],
                    "face_confidence": raw.get("face_conf"),
                    "face_area_percent": raw.get("face_ratio"),
                    "face_brightness_percent": raw.get("face_brightness"),
                    "analysis_type": analysis_type,
                    "landmarks_verified": raw.get("landmarks_verified", False),
                    "forensics": raw.get("forensics"),
                    "face_bbox": raw.get("face_bbox"),
                    "tta_hflip": tta_hflip,
                    "raw": raw,
                },
                "interpretation": _interpretation(),
            }
            LOGGER.info(
                "image evaluated request_id=%s seconds=%.3f fake_score=%.6f type=%s",
                request_id,
                time.perf_counter() - started,
                raw["prob"],
                analysis_type,
            )
            return JSONResponse(status_code=200, content=body)
    except DetectorError as exc:
        LOGGER.warning(
            "image rejected request_id=%s code=%s seconds=%.3f",
            request_id,
            exc.code,
            time.perf_counter() - started,
        )
        return _error(exc.code, exc.message, exc.status_code, request_id)


@app.post("/analyze/video")
async def analyze_video(
    file: UploadFile = File(...),
    agg_mode: Literal["conf", "mean", "vote"] = Query("conf"),
    tta_hflip: float = Query(0.0, ge=0.0, le=1.0),
) -> JSONResponse:
    request_id = uuid.uuid4().hex
    started = time.perf_counter()
    upload_meta: dict[str, Any] | None = None
    probe: dict[str, Any] | None = None

    try:
        with tempfile.TemporaryDirectory(prefix="deeptrace-video-") as temp_dir:
            upload_meta = await _save_upload(
                file,
                temp_dir,
                MAX_VIDEO_MB * 1024 * 1024,
                VIDEO_EXTENSIONS,
                request_id,
            )
            probe = _probe_video(upload_meta["path"])

            try:
                raw = await asyncio.wait_for(
                    run_in_threadpool(
                        _analyze_video_sync,
                        upload_meta["path"],
                        agg_mode,
                        tta_hflip,
                    ),
                    timeout=ANALYSIS_TIMEOUT_SEC,
                )
            except PredictorError as exc:
                detector_message = getattr(exc, "message", str(exc))
                reason, message = _classify_predictor_error(detector_message)
                LOGGER.info(
                    "video inconclusive request_id=%s reason=%s seconds=%.3f",
                    request_id,
                    reason,
                    time.perf_counter() - started,
                )
                return _inconclusive(
                    request_id,
                    reason,
                    message,
                    detector_message,
                    _file_meta(upload_meta),
                    {"probe": probe},
                )
            except asyncio.TimeoutError:
                LOGGER.warning(
                    "video timeout request_id=%s seconds=%.3f",
                    request_id,
                    time.perf_counter() - started,
                )
                return _inconclusive(
                    request_id,
                    "analysis_timeout",
                    "DeepGuard did not finish within the configured analysis timeout. No score was produced.",
                    None,
                    _file_meta(upload_meta),
                    {"probe": probe},
                )
            except Exception as exc:
                LOGGER.exception(
                    "video inference error request_id=%s seconds=%.3f",
                    request_id,
                    time.perf_counter() - started,
                )
                return _inconclusive(
                    request_id,
                    "inference_error",
                    "DeepGuard failed while analysing the video. No score was produced.",
                    str(exc),
                    _file_meta(upload_meta),
                    {"probe": probe},
                )

            warnings: list[str] = []
            if raw["num_detected"] < raw["num_sampled"]:
                warnings.append(
                    "DeepGuard excluded some sampled frames because no usable face or landmarks were found. "
                    "The aggregate covers only detected frames."
                )
            if raw["num_detected"] < 3:
                warnings.append(
                    "Very few usable frames were analysed; the video-level aggregate may be unstable."
                )

            body = {
                "status": "evaluated",
                "reason": "ok",
                "request_id": request_id,
                "message": "DeepGuard produced a video-level aggregate from sampled face crops. This is one signal, not a conclusion.",
                "detector": _detector_meta(),
                "file": _file_meta(upload_meta),
                "probe": probe,
                "result": {
                    "fake_score": raw["prob"],
                    "face_confidence": raw["face_conf"],
                    "face_area_percent": raw["face_ratio"],
                    "face_brightness_percent": raw["face_brightness"],
                    "aggregation": {
                        "mode": agg_mode,
                        "description": _aggregation_description(agg_mode),
                    },
                    "sampling": {
                        "method": "DeepGuard VideoPredictor uses OpenCV to sample approximately one frame per second.",
                        "fps": raw["fps"],
                        "total_frames": raw["total_frames"],
                        "num_sampled": raw["num_sampled"],
                        "num_extracted": raw["num_extracted"],
                        "num_detected": raw["num_detected"],
                        "frame_time_note": (
                            "DeepGuard's frame_time is a zero-based ordinal of successfully analysed sampled frames, "
                            "not an exact source timestamp. It approximates seconds only when no sampled frame is skipped."
                        ),
                    },
                    "warnings": warnings,
                    "frames": [_video_frame_view(frame) for frame in raw["frame_results"]],
                    "raw": raw,
                },
                "interpretation": _interpretation(),
            }
            LOGGER.info(
                "video evaluated request_id=%s seconds=%.3f fake_score=%.6f frames=%s",
                request_id,
                time.perf_counter() - started,
                raw["prob"],
                raw["num_detected"],
            )
            return JSONResponse(status_code=200, content=body)
    except DetectorError as exc:
        LOGGER.warning(
            "video rejected request_id=%s code=%s seconds=%.3f",
            request_id,
            exc.code,
            time.perf_counter() - started,
        )
        return _error(exc.code, exc.message, exc.status_code, request_id)


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="127.0.0.1", port=DETECTOR_PORT)
