import { useEffect, useRef, useState } from 'react';
import { PauseCircle, PlayCircle, Sparkles, Video } from 'lucide-react';
import { supabase } from '@/lib/supabase';

type LessonForRender = {
  id: string;
  title: string;
  category: string;
  level: string;
  duration: string;
  summary: string;
  objective: string;
  steps: string[];
  narration: string;
  quiz: { question: string; answers: string[]; correct: number; explanation: string };
};

type KokoroAudio = { audio?: Float32Array; data?: Float32Array; sampling_rate?: number; samplingRate?: number };
type KokoroRuntime = {
  KokoroTTS: {
    from_pretrained: (model: string, options: { dtype: string; device: string }) => Promise<{
      generate: (text: string, options: { voice: string }) => Promise<KokoroAudio>;
    }>;
  };
};

type Scene = { eyebrow: string; heading: string; body: string; step: number; weight: number };

function makeScenes(lesson: LessonForRender): Scene[] {
  const scenes: Scene[] = [
    { eyebrow: 'SUPERTECHAI ACADEMY', heading: lesson.title, body: lesson.summary, step: 0, weight: 55 },
    { eyebrow: 'YOUR LEARNING OUTCOME', heading: 'What you will learn', body: lesson.objective, step: 0, weight: 45 },
  ];
  lesson.steps.forEach((step, index) => scenes.push({
    eyebrow: 'LIVE WALKTHROUGH · STEP ' + (index + 1) + ' OF ' + lesson.steps.length,
    heading: ['Find the right place', 'Understand what you see', 'Follow the process', 'Check before you act'][index % 4],
    body: step,
    step: index + 1,
    weight: Math.max(45, step.length),
  }));
  scenes.push({
    eyebrow: 'KNOWLEDGE CHECK', heading: lesson.quiz.question, body: 'Correct answer: ' + lesson.quiz.answers[lesson.quiz.correct] + '. ' + lesson.quiz.explanation, step: lesson.steps.length, weight: 65,
  });
  scenes.push({
    eyebrow: 'KEY TAKEAWAY',
    heading: 'Learn it. Check it. Apply it carefully.',
    body: 'Use the process consistently. Verify important details and manage risk. This lesson is educational and does not promise results.',
    step: lesson.steps.length,
    weight: 55,
  });
  return scenes;
}

function wrapText(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, maxWidth: number, lineHeight: number, maxLines: number) {
  const words = text.split(/\s+/);
  let line = '';
  let count = 0;
  for (const word of words) {
    const candidate = line ? line + ' ' + word : word;
    if (ctx.measureText(candidate).width > maxWidth && line) {
      ctx.fillText(line, x, y + count * lineHeight);
      count += 1;
      line = word;
      if (count >= maxLines) break;
    } else line = candidate;
  }
  if (line && count < maxLines) ctx.fillText(line, x, y + count * lineHeight);
}

function drawScreen(canvas: HTMLCanvasElement, lesson: LessonForRender, scene: Scene, index: number, total: number, elapsed: number) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const w = canvas.width;
  const h = canvas.height;
  const bg = ctx.createLinearGradient(0, 0, w, h);
  bg.addColorStop(0, '#07101f');
  bg.addColorStop(0.55, '#0b1930');
  bg.addColorStop(1, '#030813');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, w, h);

  // A realistic, illustrative software window is composed locally; no user screen or private account data is captured.
  ctx.fillStyle = '#0d1728';
  ctx.fillRect(28, 28, w - 56, h - 56);
  ctx.fillStyle = '#111f33';
  ctx.fillRect(28, 28, w - 56, 54);
  ['#fb7185', '#fbbf24', '#34d399'].forEach((color, i) => {
    ctx.beginPath(); ctx.fillStyle = color; ctx.arc(54 + i * 24, 55, 6, 0, Math.PI * 2); ctx.fill();
  });
  ctx.fillStyle = '#a5f3fc'; ctx.font = '600 16px Arial'; ctx.fillText('SUPERTECHAI', 150, 60);
  ctx.fillStyle = '#26364c'; ctx.fillRect(28, 82, 205, h - 110);
  const nav = ['Dashboard', 'Signals', 'Crypto', 'Orders', 'Academy'];
  const category = lesson.category.toLowerCase();
  const activeNav = category.includes('crypto') ? 2 : category.includes('automation') ? 3 : category.includes('membership') ? 4 : category.includes('trading intelligence') ? 1 : 0;
  nav.forEach((item, i) => {
    const y = 135 + i * 54;
    if (i === activeNav) {
      ctx.fillStyle = 'rgba(34,211,238,.15)'; ctx.fillRect(42, y - 26, 175, 40);
      ctx.fillStyle = '#22d3ee'; ctx.fillRect(42, y - 26, 4, 40);
    }
    ctx.fillStyle = i === activeNav ? '#a5f3fc' : '#8da0b8';
    ctx.font = '500 17px Arial'; ctx.fillText(item, 60, y);
  });

  const panelX = 260;
  ctx.fillStyle = '#e5f2ff'; ctx.font = '700 30px Arial';
  wrapText(ctx, lesson.title, panelX, 135, w - panelX - 75, 38, 1);
  ctx.fillStyle = '#8fa5bf'; ctx.font = '15px Arial';
  ctx.fillText('ACADEMY  /  ' + lesson.category.toUpperCase() + '  /  ' + lesson.level.toUpperCase(), panelX, 166);

  // Teaching panel
  ctx.fillStyle = '#13243a'; ctx.fillRect(panelX, 198, w - panelX - 70, 365);
  ctx.strokeStyle = 'rgba(34,211,238,.22)'; ctx.lineWidth = 2; ctx.strokeRect(panelX, 198, w - panelX - 70, 365);
  ctx.fillStyle = '#67e8f9'; ctx.font = '700 15px Arial'; ctx.fillText(scene.eyebrow, panelX + 34, 245);
  ctx.fillStyle = '#ffffff'; ctx.font = '700 37px Arial'; wrapText(ctx, scene.heading, panelX + 34, 315, w - panelX - 140, 46, 2);
  ctx.fillStyle = '#d5e3f2'; ctx.font = '23px Arial'; wrapText(ctx, scene.body, panelX + 34, 410, w - panelX - 145, 35, 4);

  // Scene-aware visual cue: adapt the illustration to the explanation instead of reusing one generic background.
  const cue = (scene.heading + ' ' + scene.body + ' ' + lesson.category).toLowerCase();
  const visualX = w - 330;
  const visualY = 215;
  ctx.fillStyle = '#0a1728';
  ctx.fillRect(visualX, visualY, 245, 250);
  ctx.strokeStyle = 'rgba(34,211,238,.35)';
  ctx.strokeRect(visualX, visualY, 245, 250);
  ctx.fillStyle = '#67e8f9';
  ctx.font = '700 12px Arial';
  let visualTitle = 'LESSON VISUAL';
  if (/chart|candle|price|trend|market|bollinger|signal/.test(cue)) visualTitle = 'MARKET CHART';
  else if (/account|connect|login|profile|password/.test(cue)) visualTitle = 'ACCOUNT SETUP';
  else if (/order|entry|stop loss|take profit|trade/.test(cue)) visualTitle = 'TRADE PROCESS';
  else if (/security|risk|protect|verify|safe/.test(cue)) visualTitle = 'SAFETY CHECK';
  else if (/crypto|bitcoin|binance|wallet/.test(cue)) visualTitle = 'CRYPTO CONCEPT';
  else if (/step|process|how to|follow/.test(cue)) visualTitle = 'STEP-BY-STEP';
  ctx.fillText(visualTitle, visualX + 16, visualY + 25);
  if (visualTitle === 'MARKET CHART' || visualTitle === 'CRYPTO CONCEPT') {
    ctx.strokeStyle = '#22d3ee'; ctx.lineWidth = 2; ctx.beginPath();
    const points = [0.68,0.62,0.7,0.48,0.54,0.36,0.43,0.25,0.31,0.18];
    points.forEach((value, i) => {
      const px = visualX + 18 + i * 22;
      const py = visualY + 65 + value * 145;
      if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    });
    ctx.stroke();
    ctx.fillStyle = '#8fa5bf'; ctx.font = '11px Arial';
    ctx.fillText('Illustrative example', visualX + 16, visualY + 225);
  } else if (visualTitle === 'ACCOUNT SETUP' || visualTitle === 'TRADE PROCESS' || visualTitle === 'SAFETY CHECK') {
    const labels = visualTitle === 'ACCOUNT SETUP'
      ? ['1. Open the correct page', '2. Enter details carefully', '3. Review and confirm']
      : visualTitle === 'TRADE PROCESS'
        ? ['1. Understand the setup', '2. Check entry and risk', '3. Confirm before action']
        : ['1. Stop and review', '2. Verify the details', '3. Proceed carefully'];
    labels.forEach((label, i) => {
      ctx.fillStyle = '#172b42'; ctx.fillRect(visualX + 14, visualY + 52 + i * 52, 215, 38);
      ctx.fillStyle = '#d5e3f2'; ctx.font = '12px Arial'; ctx.fillText(label, visualX + 24, visualY + 75 + i * 52);
    });
  } else {
    ctx.fillStyle = '#172b42'; ctx.fillRect(visualX + 14, visualY + 52, 215, 155);
    ctx.fillStyle = '#d5e3f2'; ctx.font = '13px Arial';
    wrapText(ctx, scene.body, visualX + 26, visualY + 82, 190, 21, 5);
    ctx.fillStyle = '#67e8f9'; ctx.font = '11px Arial';
    ctx.fillText('Follow the explanation', visualX + 26, visualY + 190);
  }

  // Animated pointer and focus ring give the lesson a screen-demonstration feel.
  const progress = (elapsed % 4) / 4;
  const cursorX = panelX + 90 + progress * (w - panelX - 260);
  const cursorY = 520 + Math.sin(progress * Math.PI * 2) * 18;
  ctx.beginPath(); ctx.strokeStyle = 'rgba(34,211,238,.9)'; ctx.lineWidth = 3;
  ctx.arc(cursorX, cursorY, 27 + Math.sin(elapsed * 3) * 3, 0, Math.PI * 2); ctx.stroke();
  ctx.fillStyle = '#f8fafc'; ctx.beginPath(); ctx.moveTo(cursorX, cursorY); ctx.lineTo(cursorX + 2, cursorY + 28); ctx.lineTo(cursorX + 9, cursorY + 21); ctx.lineTo(cursorX + 18, cursorY + 35); ctx.lineTo(cursorX + 24, cursorY + 31); ctx.lineTo(cursorX + 15, cursorY + 18); ctx.lineTo(cursorX + 25, cursorY + 16); ctx.closePath(); ctx.fill();

  ctx.fillStyle = '#25364b'; ctx.fillRect(260, h - 92, w - 330, 5);
  ctx.fillStyle = '#22d3ee'; ctx.fillRect(260, h - 92, (w - 330) * ((index + 1) / total), 5);
  ctx.fillStyle = '#9fb3c9'; ctx.font = '14px Arial';
  ctx.fillText('SCREEN WALKTHROUGH  ·  ' + lesson.title.toUpperCase(), 260, h - 58);
  ctx.textAlign = 'right'; ctx.fillText((index + 1) + ' / ' + total, w - 72, h - 58); ctx.textAlign = 'left';
}

function splitNarration(text: string, maxChars = 320): string[] {
  const sentences = text.replace(/\s+/g, ' ').match(/[^.!?]+[.!?]+|[^.!?]+$/g) || [text];
  const chunks: string[] = [];
  let current = '';
  for (const raw of sentences) {
    const sentence = raw.trim();
    if (!sentence) continue;
    if (sentence.length > maxChars) {
      if (current) { chunks.push(current); current = ''; }
      const words = sentence.split(/\s+/);
      let part = '';
      for (const word of words) {
        const candidate = part ? part + ' ' + word : word;
        if (candidate.length > maxChars && part) { chunks.push(part); part = word; }
        else part = candidate;
      }
      if (part) chunks.push(part);
      continue;
    }
    const candidate = current ? current + ' ' + sentence : sentence;
    if (candidate.length > maxChars && current) {
      chunks.push(current);
      current = sentence;
    } else current = candidate;
  }
  if (current) chunks.push(current);
  return chunks;
}

function buildCompleteNarration(lesson: LessonForRender): string {
  const sections = [
    'Welcome to SuperTechAI Academy. In this lesson, we will learn ' + lesson.title + '. You do not need previous experience. Follow each part at your own pace. You can pause and replay any section.',
    'First, here is the big picture. ' + lesson.summary,
    'Your learning goal is this. ' + lesson.objective,
    'Let us explain the lesson from the beginning. ' + lesson.narration,
    ...lesson.steps.map((step, index) =>
      'Now let us work through step ' + (index + 1) + ' of ' + lesson.steps.length + '. ' +
      step + ' Take a moment to understand this step before moving on.'
    ),
    'Let us review the key ideas. The most important things to remember from this lesson are: ' +
      lesson.steps.map((step, index) => 'Step ' + (index + 1) + ': ' + step).join(' '),
    'Knowledge check. ' + lesson.quiz.question + ' The answer choices are: ' +
      lesson.quiz.answers.map((answer, index) => 'Option ' + (index + 1) + ': ' + answer).join('. ') +
      '. The correct answer is ' + lesson.quiz.answers[lesson.quiz.correct] + '. ' + lesson.quiz.explanation,
    'Before you finish, explain the main idea to yourself in your own words. If anything is unclear, replay that section. ' +
      'You have now completed this lesson. In the next lesson, you can build on what you have learned. ' +
      'Remember to verify important details, practise carefully and manage risk. This lesson is for education and does not promise results.',
  ];
  return sections.filter(Boolean).join('\n\n');
}

async function generateLessonVideo(lesson: LessonForRender, tts: { generate: (text: string, options: { voice: string }) => Promise<KokoroAudio> }) {
  const canvas = document.createElement('canvas');
  canvas.width = 1280; canvas.height = 720;
  const script = buildCompleteNarration(lesson);
  const narrationChunks = splitNarration(script);
  if (!narrationChunks.length) throw new Error('This lesson has no narration to publish.');

  // Generate speech in short sections. Sending a full lesson in one TTS request can silently truncate long lessons.
  const audioParts: Float32Array[] = [];
  let sampleRate = 24000;
  let sampleCount = 0;
  for (let index = 0; index < narrationChunks.length; index += 1) {
    const part = await tts.generate(narrationChunks[index], { voice: 'af_heart' });
    const samples = part.audio || part.data;
    if (!samples?.length) throw new Error('Narration section ' + (index + 1) + ' returned empty audio.');
    const partRate = part.sampling_rate || part.samplingRate || 24000;
    if (index === 0) sampleRate = partRate;
    if (partRate !== sampleRate) throw new Error('Narration sections returned different audio sample rates.');
    const copy = new Float32Array(samples.length);
    copy.set(samples);
    audioParts.push(copy);
    sampleCount += copy.length + (index < narrationChunks.length - 1 ? Math.round(sampleRate * 0.22) : 0);
  }
  const completeSamples = new Float32Array(sampleCount);
  let sampleOffset = 0;
  audioParts.forEach((part, index) => {
    completeSamples.set(part, sampleOffset);
    sampleOffset += part.length;
    if (index < audioParts.length - 1) sampleOffset += Math.round(sampleRate * 0.22);
  });

  const audioContext = new AudioContext();
  await audioContext.resume();
  const audioBuffer = audioContext.createBuffer(1, completeSamples.length, sampleRate);
  audioBuffer.copyToChannel(completeSamples, 0);
  const source = audioContext.createBufferSource();
  source.buffer = audioBuffer;
  const destination = audioContext.createMediaStreamDestination();
  source.connect(destination);

  const canvasStream = canvas.captureStream(24);
  const stream = new MediaStream([...canvasStream.getVideoTracks(), ...destination.stream.getAudioTracks()]);
  const mimeType = ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm'].find((type) => MediaRecorder.isTypeSupported(type));
  if (!mimeType) throw new Error('This browser cannot encode WebM. Use a current desktop Chrome or Edge browser.');
  const scenes = makeScenes(lesson);
  const totalWeight = scenes.reduce((sum, scene) => sum + scene.weight, 0);
  const sceneEnds: number[] = [];
  let running = 0;
  scenes.forEach((scene) => { running += scene.weight / totalWeight; sceneEnds.push(running); });
  const chunks: BlobPart[] = [];
  const recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 500000 });
  const finished = new Promise<Blob>((resolve, reject) => {
    recorder.ondataavailable = (event) => { if (event.data.size) chunks.push(event.data); };
    recorder.onerror = () => reject(new Error('Browser video encoding failed.'));
    recorder.onstop = () => resolve(new Blob(chunks, { type: mimeType }));
  });
  const duration = audioBuffer.duration;
  const started = performance.now();
  let frame = 0;
  const paint = (now: number) => {
    const elapsed = Math.min(duration, (now - started) / 1000);
    const ratio = elapsed / duration;
    let index = sceneEnds.findIndex((finish) => ratio <= finish);
    if (index < 0) index = scenes.length - 1;
    drawScreen(canvas, lesson, scenes[index], index, scenes.length, elapsed);
    if (elapsed < duration && recorder.state === 'recording') frame = requestAnimationFrame(paint);
    else if (recorder.state === 'recording') recorder.stop();
  };
  drawScreen(canvas, lesson, scenes[0], 0, scenes.length, 0);
  recorder.start(1000);
  frame = requestAnimationFrame(paint);
  source.onended = () => { if (recorder.state === 'recording') recorder.stop(); };
  source.start();
  try {
    const blob = await finished;
    cancelAnimationFrame(frame);
    if (blob.size < 50_000) throw new Error('The rendered tutorial was unexpectedly small.');
    if (duration < 30) throw new Error('The complete narration is unexpectedly short. Review the lesson content before publishing.');
    return blob;
  } finally {
    if (recorder.state === 'recording') recorder.stop();
    stream.getTracks().forEach((track) => track.stop());
    canvasStream.getTracks().forEach((track) => track.stop());
    await audioContext.close();
  }
}

export function AcademyBackgroundPublisher({ isAdmin }: { lessons: LessonForRender[]; isAdmin: boolean }) {
  // Video rendering and publishing are handled by the backend GitHub Actions worker.
  // Never start a second browser-bound publishing queue when an administrator opens Academy.
  if (!isAdmin) return null;
  return (
    <section className="rounded-2xl border border-cyan-300/20 bg-surface/[0.035] p-4">
      <div className="flex items-center gap-3">
        <span className="flex h-10 w-10 items-center justify-center rounded-xl border border-cyan-300/20 bg-cyan-300/10 text-cyan-300">
          <Sparkles className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-accent">Academy publishing</p>
          <p className="mt-1 text-sm font-semibold text-ink">Backend publishing only</p>
          <p className="mt-1 text-xs text-ink-3">Videos are rendered by the automated publishing worker. Opening this page will not start a browser-based rendering job.</p>
        </div>
        <span className="rounded-full border border-cyan-300/20 px-3 py-1 text-xs font-semibold text-cyan-300">Backend</span>
      </div>
    </section>
  );
}
