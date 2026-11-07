#!/usr/bin/env python3
"""Background renderer for the SuperTechAi Academy.

Runs on a GitHub-hosted runner, creates narrated slide videos with Kokoro,
then publishes MP4 files into the private Supabase Academy bucket.
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

ROOT = Path(__file__).resolve().parents[2]
WORK = Path(tempfile.mkdtemp(prefix="supertech-academy-"))
MODEL_DIR = Path(os.environ.get("KOKORO_MODEL_DIR", ROOT / ".cache" / "kokoro"))
MODEL_DIR.mkdir(parents=True, exist_ok=True)
SUPABASE_URL = os.environ["SUPABASE_URL"].rstrip("/")
SERVICE_KEY = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
HEADERS = {"apikey": SERVICE_KEY, "Authorization": f"Bearer {SERVICE_KEY}"}

LESSONS = [
    {
        "id": "welcome", "title": "Welcome to SuperTechAi",
        "summary": "Understand what the platform does and where to begin.",
        "objective": "Know where to find the tools you need and what the platform can and cannot do.",
        "steps": ["Open your Dashboard for the market overview and monitored assets.", "Explore signals, crypto, orders, network and earnings.", "Visit Academy whenever you need a guided explanation.", "Signals support decisions; they do not guarantee outcomes."],
        "narration": "Welcome to SuperTechAi. Your platform brings market intelligence, trading signals, crypto monitoring, automation tools and member services into one place. Start with the Dashboard, explore each section at your own pace, and use the Academy whenever you need help. SuperTechAi helps you make more informed decisions. It does not remove market risk or guarantee profits."
    },
    {
        "id": "dashboard", "title": "Your Dashboard explained",
        "summary": "Read the market overview, asset selector, live status and signal cards.",
        "objective": "Find key information without getting lost in technical details.",
        "steps": ["Check the connection and market status at the top.", "Choose the assets you want SuperTechAi to monitor.", "Review signal direction, entry information and current status.", "Open the chart snapshot to understand recent price movement."],
        "narration": "The Dashboard is your starting point. First, check that market data is connected. Next, choose the assets you want to follow. Each signal card presents the current direction and important trade information. Open the chart snapshot to inspect recent price movement. A signal is a prompt to review the market, not an instruction to trade blindly."
    },
    {
        "id": "signals", "title": "Understanding Trading Signals",
        "summary": "Learn BUY and SELL signals, confirmation and trade levels.",
        "objective": "Understand what a signal communicates before deciding whether it fits your plan.",
        "steps": ["BUY indicates conditions may favour an upward move.", "SELL indicates conditions may favour a downward move.", "Review timeframe, entry, stop loss and take-profit information.", "Wait for confirmation and use your own risk controls."],
        "narration": "A BUY signal means the system has detected conditions that may favour an upward move. A SELL signal means conditions may favour a downward move. Neither is a promise. Before taking action, review the timeframe, entry area, stop loss and targets. Respect confirmation rules and never risk money you cannot afford to lose."
    },
    {
        "id": "super", "title": "How Super Signal works",
        "summary": "Understand why agreement across all eight timeframes matters.",
        "objective": "Recognise a high-confluence alert and why confirmation still matters.",
        "steps": ["Super Signal looks for agreement across eight timeframes.", "The alert appears when all required timeframes align.", "Review reversal context and the underlying chart before acting.", "If conditions change, wait for a fresh setup instead of chasing price."],
        "narration": "Super Signal highlights moments when all eight monitored timeframes point in the same direction. This agreement can provide stronger context than a single timeframe alone. It does not guarantee a successful trade. Check the chart, understand the broader move, and apply your risk plan."
    },
    {
        "id": "crypto", "title": "Crypto Watchlist and market movers",
        "summary": "Explore Binance assets, top gainers, losers and alerts.",
        "objective": "Find crypto opportunities without confusing market movement with a confirmed setup.",
        "steps": ["Open Crypto to view monitored assets and market movers.", "Use gainers and losers as a discovery list, not an automatic trade list.", "Open an asset to review its chart and available analysis.", "Add assets to your monitored list when you want them on your Dashboard."],
        "narration": "The Crypto section helps you discover what is moving. Top gainers and losers show movement, not a guaranteed opportunity. Open an asset to inspect its chart and analysis. Add symbols you want to monitor, then review any signal and your risk settings before considering a trade."
    },
    {
        "id": "automation", "title": "Trading automation and pending orders",
        "summary": "Understand connected accounts, automation controls and order monitoring.",
        "objective": "Know the difference between an analysis signal and an executed order.",
        "steps": ["Read connection and account status before enabling automation.", "Review configured assets, order rules and risk limits.", "Use Pending Orders to inspect queued opportunities and their status.", "Monitor execution and account exposure; pause automation if anything looks wrong."],
        "narration": "Automation can help carry out a defined plan, but it makes configuration and monitoring more important. A signal is analysis. A pending order is an instruction waiting for its conditions. An executed order is a live position. Check your connection, allowed assets, risk limits and order details before enabling automation. Monitor activity regularly."
    },
    {
        "id": "network", "title": "Referrals and your network",
        "summary": "Find your referral link and understand how your network grows.",
        "objective": "Share your invitation correctly and distinguish real members from open positions.",
        "steps": ["Open My Referrals to find your personal referral link.", "Share the link with someone who wants to join.", "After payment confirmation, the member becomes active.", "Open Network to explore the structure and available positions."],
        "narration": "Your referral link helps new members register under your invitation. Share the correct link and let the person complete membership payment. Once payment is confirmed, the member becomes active and appears in the network. Open positions are spaces for future members; they are not people or confirmed sales."
    },
    {
        "id": "wallet", "title": "Earnings, wallet and withdrawals",
        "summary": "Understand balances, your TRC20 wallet and withdrawal procedures.",
        "objective": "Know where earnings are shown and how to keep payout details accurate.",
        "steps": ["Open My Earnings to review balances and transaction history.", "Save the correct USDT TRC20 payout address in wallet settings.", "Review any withdrawal fee and net payout before submitting.", "Check withdrawal status and transaction reference after processing."],
        "narration": "Your Earnings area shows balances recorded for your member account. Keep your USDT TRC20 payout wallet accurate and secure. Before submitting a withdrawal, review the amount, fee and net payout. A submitted request does not always mean the blockchain transfer is complete. Check the final status and transaction reference."
    },
]

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

def render_lesson(tts: Kokoro, lesson: dict, output: Path):
    audio_path = WORK / f"{lesson['id']}.wav"
    samples, sample_rate = tts.create(lesson["narration"], voice="af_heart", speed=1.0, lang="en-us")
    sf.write(audio_path, np.asarray(samples), sample_rate, subtype="PCM_16")
    duration = sf.info(audio_path).duration
    scenes = [
        ("SUPERTECHAI ACADEMY", lesson["title"], lesson["summary"]),
        ("LEARNING OBJECTIVE", "What you will learn", lesson["objective"]),
    ] + [(f"LESSON STEP {i + 1} OF {len(lesson['steps'])}", f"Step {i + 1}", step) for i, step in enumerate(lesson["steps"])]
    scenes.append(("IMPORTANT REMINDER", "Learn. Review. Decide.", "SuperTechAi provides tools and information. Always use your own judgement and manage risk. No signal guarantees an outcome."))
    weights = [max(len(h) + len(b), 40) for _, h, b in scenes]
    total_weight = sum(weights)
    concat = WORK / f"{lesson['id']}.txt"
    lines = []
    for index, (eyebrow, heading, body) in enumerate(scenes):
        slide = WORK / f"{lesson['id']}-{index:02d}.png"
        make_slide(slide, eyebrow, heading, body, index, len(scenes), lesson["title"])
        seconds = duration * weights[index] / total_weight
        lines.extend([f"file '{slide.as_posix()}'", f"duration {seconds:.3f}"])
    last_slide = WORK / f"{lesson['id']}-{len(scenes)-1:02d}.png"
    lines.append(f"file '{last_slide.as_posix()}'")
    concat.write_text("\n".join(lines), encoding="utf-8")
    subprocess.run([
        "ffmpeg", "-y", "-loglevel", "error", "-f", "concat", "-safe", "0", "-i", str(concat),
        "-i", str(audio_path), "-t", f"{duration:.3f}", "-r", "30",
        "-vf", "scale=1280:720:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:(oh-ih)/2,format=yuv420p",
        "-c:v", "libx264", "-preset", "veryfast", "-crf", "25",
        "-c:a", "aac", "-b:a", "128k", "-movflags", "+faststart", str(output),
    ], check=True)

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
    existing = api_get("academy_videos", {"select": "lesson_id", "status": "eq.completed"})
    completed = {row["lesson_id"] for row in existing}
    admins = api_get("admin_users", {"select": "user_id", "limit": "1"})
    if not admins:
        raise RuntimeError("No Academy admin account was found for the publisher record.")
    publisher_id = admins[0]["user_id"]
    for lesson in LESSONS:
        if lesson["id"] in completed:
            print(f"Already published: {lesson['id']}")
            continue
        output = WORK / f"{lesson['id']}.mp4"
        print(f"Generating: {lesson['title']}")
        render_lesson(tts, lesson, output)
        if output.stat().st_size > 100 * 1024 * 1024:
            raise RuntimeError(f"{lesson['id']} video exceeds the Academy 100 MB upload limit.")
        object_path = f"lessons/{lesson['id']}-kokoro.mp4"
        upload = requests.post(
            f"{SUPABASE_URL}/storage/v1/object/academy-videos/{object_path}",
            headers={**HEADERS, "Content-Type": "video/mp4", "x-upsert": "true"},
            data=output.read_bytes(), timeout=240,
        )
        upload.raise_for_status()
        insert = requests.post(
            f"{SUPABASE_URL}/rest/v1/academy_videos",
            headers={**HEADERS, "Content-Type": "application/json", "Prefer": "return=minimal"},
            json={"lesson_id": lesson["id"], "lesson_title": lesson["title"], "status": "completed", "video_url": object_path, "created_by": publisher_id},
            timeout=45,
        )
        insert.raise_for_status()
        print(f"Published: {lesson['id']} ({output.stat().st_size} bytes)")
    if hasattr(tts, "voices") and hasattr(tts.voices, "close"):
        tts.voices.close()

if __name__ == "__main__":
    main()
