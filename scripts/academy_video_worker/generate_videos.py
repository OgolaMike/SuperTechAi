#!/usr/bin/env python3
"""Background renderer for the SuperTechAi Academy.

Runs on a GitHub-hosted runner, creates narrated slide videos with Kokoro,
then records a guided browser walkthrough, adds Kokoro narration, and publishes MP4 files.
"""
from __future__ import annotations

import json
import os
import subprocess
import tempfile
from pathlib import Path
from textwrap import wrap

import numpy as np
import requests
import soundfile as sf
from PIL import Image, ImageDraw, ImageFont
from kokoro_onnx import Kokoro
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[2]
WORK = Path(tempfile.mkdtemp(prefix="supertech-academy-"))
MODEL_DIR = Path(os.environ.get("KOKORO_MODEL_DIR", ROOT / ".cache" / "kokoro"))
MODEL_DIR.mkdir(parents=True, exist_ok=True)
SUPABASE_URL = os.environ["SUPABASE_URL"].rstrip("/")
SERVICE_KEY = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
HEADERS = {"apikey": SERVICE_KEY, "Authorization": f"Bearer {SERVICE_KEY}"}

LESSONS = json.loads((ROOT / "scripts" / "academy_video_worker" / "lessons.json").read_text(encoding="utf-8"))

def download(url: str, target: Path) -> None:
    if target.exists() and target.stat().st_size > 1_000_000:
        return
    response = requests.get(url, timeout=180)
    response.raise_for_status()
    target.write_bytes(response.content)

def get_font(size: int, bold: bool = False):
    candidates = [
        "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf" if bold else "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
        "/usr/share/fonts/truetype/liberation2/LiberationSans-Bold.ttf" if bold else "/usr/share/fonts/truetype/liberation2/LiberationSans-Regular.ttf",
    ]
    for candidate in candidates:
        if Path(candidate).exists():
            return ImageFont.truetype(candidate, size)
    return ImageFont.load_default()

def make_slide(path: Path, eyebrow: str, heading: str, body: str, index: int, total: int, lesson: str):
    image = Image.new("RGB", (1280, 720), "#071426")
    pixels = image.load()
    for y in range(720):
        for x in range(1280):
            mix = (x / 1280) * 0.65 + (y / 720) * 0.35
            pixels[x, y] = (int(4 + 4 * mix), int(12 + 12 * mix), int(27 + 23 * mix))
    draw = ImageDraw.Draw(image, "RGBA")
    draw.ellipse((880, -180, 1430, 370), fill=(34, 211, 238, 25))
    draw.rounded_rectangle((44, 44, 1236, 676), radius=26, outline=(34, 211, 238, 100), width=2)
    draw.rounded_rectangle((82, 100, 91, 172), radius=4, fill="#22d3ee")
    draw.text((116, 112), eyebrow.upper(), font=get_font(22, True), fill="#67e8f9")
    y = 230
    for line in wrap(heading, width=31):
        draw.text((112, y), line, font=get_font(52, True), fill="#ffffff")
        y += 68
    y = max(y + 28, 390)
    for line in wrap(body, width=65):
        draw.text((114, y), line, font=get_font(27), fill="#d6e2f0")
        y += 42
        if y > 585:
            break
    draw.text((82, 624), f"SUPERTECHAI  /  {lesson.upper()[:42]}", font=get_font(16, True), fill="#a8bdcf")
    draw.rounded_rectangle((82, 650, 1198, 657), radius=4, fill=(255, 255, 255, 40))
    draw.rounded_rectangle((82, 650, 82 + int(1116 * (index + 1) / total), 657), radius=4, fill="#22d3ee")
    draw.text((1120, 610), f"{index + 1:02d} / {total:02d}", font=get_font(16, True), fill="#a5f3fc")
    image.save(path, quality=92)

def render_lesson(tts: Kokoro, lesson: dict, output: Path, browser):
    """Record a guided walkthrough in the safe fictional-data demo, then narrate it."""
    audio_path = WORK / f"{lesson['id']}.wav"
    samples, sample_rate = tts.create(lesson["narration"], voice="af_heart", speed=1.0, lang="en-us")
    sf.write(audio_path, np.asarray(samples), sample_rate, subtype="PCM_16")
    duration = sf.info(audio_path).duration
    video_dir = WORK / f"recording-{lesson['id']}"
    video_dir.mkdir(parents=True, exist_ok=True)
    context = browser.new_context(
        viewport={"width": 1440, "height": 900},
        device_scale_factor=1,
        record_video_dir=str(video_dir),
        record_video_size={"width": 1440, "height": 900},
    )
    page = context.new_page()
    page.goto(f"http://127.0.0.1:4173/academy-demo.html?lesson={lesson['id']}", wait_until="networkidle")
    page.wait_for_timeout(1200)
    page.wait_for_timeout(max(1000, int((duration - 1.2) * 1000)))
    context.close()
    recordings = list(video_dir.glob("*.webm"))
    if not recordings:
        raise RuntimeError(f"Chromium did not produce a recording for {lesson['id']}.")
    subprocess.run([
        "ffmpeg", "-y", "-loglevel", "error", "-i", str(recordings[0]), "-i", str(audio_path),
        "-map", "0:v:0", "-map", "1:a:0", "-shortest", "-r", "30",
        "-vf", "scale=1280:720:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:(oh-ih)/2,format=yuv420p",
        "-c:v", "libx264", "-preset", "veryfast", "-crf", "22",
        "-c:a", "aac", "-b:a", "160k", "-af", "loudnorm=I=-16:TP=-1.5:LRA=11",
        "-movflags", "+faststart", str(output),
    ], check=True)
    probe = subprocess.run([
        "ffprobe", "-v", "error", "-show_entries", "stream=codec_type,width,height",
        "-show_entries", "format=duration,size", "-of", "json", str(output),
    ], check=True, capture_output=True, text=True)
    metadata = json.loads(probe.stdout)
    stream_types = {stream.get("codec_type") for stream in metadata.get("streams", [])}
    if not {"video", "audio"}.issubset(stream_types) or float(metadata.get("format", {}).get("duration", 0)) < 5:
        raise RuntimeError(f"Rendered file failed audio/video validation for {lesson['id']}.")

def api_get(path: str, params=None):
    response = requests.get(f"{SUPABASE_URL}/rest/v1/{path}", headers=HEADERS, params=params, timeout=45)
    response.raise_for_status()
    return response.json()

def main():
    model = MODEL_DIR / "kokoro-v1.0.int8.onnx"
    voices = MODEL_DIR / "voices-v1.0.bin"
    download("https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.1/kokoro-v1.0.int8.onnx", model)
    download("https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.1/voices-v1.0.bin", voices)
    tts = Kokoro(str(model), str(voices))
    existing = api_get("academy_videos", {"select": "id,lesson_id,status,video_url,created_at", "order": "created_at.desc"})
    records = {}
    for row in existing:
        records.setdefault(row["lesson_id"], row)
    completed = {lesson_id for lesson_id, row in records.items() if row["status"] == "completed" and isinstance(row.get("video_url"), str) and "-interface-v2.mp4" in row["video_url"]}
    admins = api_get("admin_users", {"select": "user_id", "limit": "1"})
    if not admins:
        raise RuntimeError("No Academy admin account was found for the publisher record.")
    publisher_id = admins[0]["user_id"]
    failures = []
    server = subprocess.Popen(["python", "-m", "http.server", "4173", "--directory", str(ROOT / "dist")], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    import time
    time.sleep(2)
    playwright = sync_playwright().start()
    browser = playwright.chromium.launch(headless=True)
    for index, lesson in enumerate(LESSONS, start=1):
        lesson_id = lesson["id"]
        if lesson_id in completed:
            print(f"[{index}/{len(LESSONS)}] Already published: {lesson_id}")
            continue
        output = WORK / f"{lesson_id}.mp4"
        record = records.get(lesson_id)
        record_id = record["id"] if record else None
        try:
            if record_id:
                queued = requests.patch(
                    f"{SUPABASE_URL}/rest/v1/academy_videos?id=eq.{record_id}",
                    headers={**HEADERS, "Content-Type": "application/json", "Prefer": "return=minimal"},
                    json={"status": "processing", "failure_reason": None}, timeout=45,
                )
                queued.raise_for_status()
            else:
                queued = requests.post(
                    f"{SUPABASE_URL}/rest/v1/academy_videos",
                    headers={**HEADERS, "Content-Type": "application/json", "Prefer": "return=representation"},
                    json={"lesson_id": lesson_id, "lesson_title": lesson["title"], "status": "processing", "created_by": publisher_id},
                    timeout=45,
                )
                queued.raise_for_status()
                record_id = queued.json()[0]["id"]
                records[lesson_id] = {"id": record_id, "lesson_id": lesson_id, "status": "processing"}
            print(f"[{index}/{len(LESSONS)}] Generating: {lesson['title']}", flush=True)
            render_lesson(tts, lesson, output, browser)
            if output.stat().st_size > 100 * 1024 * 1024:
                raise RuntimeError("Video exceeds the Academy 100 MB upload limit.")
            object_path = f"lessons/{lesson_id}-interface-v2.mp4"
            upload = requests.post(
                f"{SUPABASE_URL}/storage/v1/object/academy-videos/{object_path}",
                headers={**HEADERS, "Content-Type": "video/mp4", "x-upsert": "true"},
                data=output.read_bytes(), timeout=240,
            )
            upload.raise_for_status()
            published = requests.patch(
                f"{SUPABASE_URL}/rest/v1/academy_videos?id=eq.{record_id}",
                headers={**HEADERS, "Content-Type": "application/json", "Prefer": "return=minimal"},
                json={"status": "completed", "video_url": object_path, "failure_reason": None},
                timeout=45,
            )
            published.raise_for_status()
            completed.add(lesson_id)
            records[lesson_id]["status"] = "completed"
            print(f"Published: {lesson_id} ({output.stat().st_size} bytes)", flush=True)
        except Exception as error:
            failures.append((lesson_id, str(error)))
            if record_id:
                try:
                    requests.patch(
                        f"{SUPABASE_URL}/rest/v1/academy_videos?id=eq.{record_id}",
                        headers={**HEADERS, "Content-Type": "application/json", "Prefer": "return=minimal"},
                        json={"status": "failed", "failure_reason": str(error)[:1000]}, timeout=45,
                    ).raise_for_status()
                except Exception as status_error:
                    print(f"Could not save failed status for {lesson_id}: {status_error}", flush=True)
            print(f"FAILED: {lesson_id}: {error}", flush=True)
    browser.close()
    playwright.stop()
    server.terminate()
    server.wait(timeout=15)
    print(f"Academy publisher finished: {len(completed)}/{len(LESSONS)} lessons published.", flush=True)
    if failures:
        details = "; ".join(f"{lesson_id}: {reason}" for lesson_id, reason in failures)
        raise RuntimeError(f"{len(failures)} lesson(s) failed and will be retried on the next run: {details}")
    if hasattr(tts, "voices") and hasattr(tts.voices, "close"):
        tts.voices.close()

if __name__ == "__main__":
    main()
