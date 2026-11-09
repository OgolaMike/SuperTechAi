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
  const words = text.split(/\\s+/);
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

async function generateLessonVideo(lesson: LessonForRender, tts: { generate: (text: string, options: { voice: string }) => Promise<KokoroAudio> }) {
  const canvas = document.createElement('canvas');
  canvas.width = 1280; canvas.height = 720;
  const script = [
    lesson.title + '.',
    lesson.summary + '.',
    'By the end of this lesson, you will be able to: ' + lesson.objective,
    lesson.narration,
    ...lesson.steps.map((step, index) => 'Step ' + (index + 1) + '. ' + step),
    'Knowledge check. ' + lesson.quiz.question + ' The correct answer is: ' + lesson.quiz.answers[lesson.quiz.correct] + '. ' + lesson.quiz.explanation,
    'Key reminder. ' + 'Use your own judgement, verify important details and manage risk. This is educational content, not a promise of results.',
  ].join(' ');
  const audio = await tts.generate(script, { voice: 'af_heart' });
  const samples = audio.audio || audio.data;
  const sampleRate = audio.sampling_rate || audio.samplingRate || 24000;
  if (!samples?.length) throw new Error('Kokoro returned empty narration audio.');
  const audioContext = new AudioContext();
  await audioContext.resume();
  const audioBuffer = audioContext.createBuffer(1, samples.length, sampleRate);
  // Kokoro may return Float32Array backed by SharedArrayBuffer or another ArrayBufferLike.
  // Copy into a fresh, standard ArrayBuffer-backed array for the Web Audio API typings.
  const compatibleSamples = new Float32Array(samples.length);
  compatibleSamples.set(samples);
  audioBuffer.copyToChannel(compatibleSamples, 0);
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
    let index = sceneEnds.findIndex((end) => ratio <= end);
    if (index < 0) index = scenes.length - 1;
    drawScreen(canvas, lesson, scenes[index], index, scenes.length, elapsed);
    if (elapsed < duration && recorder.state === 'recording') frame = requestAnimationFrame(paint);
    else if (recorder.state === 'recording') recorder.stop();
  };
  drawScreen(canvas, lesson, scenes[0], 0, scenes.length, 0);
  recorder.start(500);
  frame = requestAnimationFrame(paint);
  source.onended = () => { if (recorder.state === 'recording') recorder.stop(); };
  source.start();
  try {
    const blob = await finished;
    cancelAnimationFrame(frame);
    if (blob.size < 50_000) throw new Error('The rendered tutorial was unexpectedly small.');
    return blob;
  } finally {
    if (recorder.state === 'recording') recorder.stop();
    stream.getTracks().forEach((track) => track.stop());
    canvasStream.getTracks().forEach((track) => track.stop());
    await audioContext.close();
  }
}

export function AcademyBackgroundPublisher({ lessons, isAdmin }: { lessons: LessonForRender[]; isAdmin: boolean }) {
  const startedRef = useRef(false);
  const cancelledRef = useRef(false);
  const [running, setRunning] = useState(false);
  const [completed, setCompleted] = useState(0);
  const [total, setTotal] = useState(0);
  const [current, setCurrent] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (!isAdmin || startedRef.current) return;
    startedRef.current = true;
    cancelledRef.current = false;
    let alive = true;

    const runQueue = async () => {
      setRunning(true); setError('');
      try {
        const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
        if (sessionError) throw sessionError;
        if (!sessionData.session) throw new Error('Sign in again to publish Academy lessons.');
        const { data: existing, error: listError } = await supabase.from('academy_videos').select('lesson_id,status');
        if (listError) throw listError;
        const unavailable = new Set((existing || []).filter((row) => row.status !== 'failed').map((row) => row.lesson_id));
        const queue = lessons.filter((lesson) => !unavailable.has(lesson.id));
        setTotal(queue.length);
        setCompleted(lessons.length - queue.length);
        if (!queue.length) { setMessage('All Academy lessons already have a video or an active publishing job.'); return; }

        setMessage('Loading the free Kokoro voice model on this device. Videos will publish automatically while this Academy tab remains open.');
        const moduleUrl = 'https://cdn.jsdelivr.net/npm/kokoro-js@1.2.1/+esm';
        const runtime = await import(/* @vite-ignore */ moduleUrl) as KokoroRuntime;
        const hasWebGPU = Boolean((navigator as Navigator & { gpu?: unknown }).gpu);
        const tts = await runtime.KokoroTTS.from_pretrained('onnx-community/Kokoro-82M-v1.0-ONNX', {
          dtype: 'q8', device: hasWebGPU ? 'webgpu' : 'wasm',
        });

        for (const lesson of queue) {
          if (!alive || cancelledRef.current) break;
          setCurrent(lesson.title);
          setMessage('Creating narrated screen walkthrough: ' + lesson.title);
          const videoBlob = await generateLessonVideo(lesson, tts);
          const path = 'lessons/' + lesson.id + '-auto-' + Date.now() + '.webm';
          const { error: uploadError } = await supabase.storage.from('academy-videos').upload(path, videoBlob, {
            contentType: 'video/webm', cacheControl: '3600', upsert: false,
          });
          if (uploadError) throw uploadError;
          const { error: insertError } = await supabase.from('academy_videos').insert({
            lesson_id: lesson.id, lesson_title: lesson.title, status: 'completed',
            video_url: path, created_by: sessionData.session.user.id,
          });
          if (insertError) {
            await supabase.storage.from('academy-videos').remove([path]);
            throw insertError;
          }
          setCompleted((value) => value + 1);
        }
        if (alive && !cancelledRef.current) setMessage('Background publishing complete. New narrated tutorials are now available in the Academy.');
      } catch (cause) {
        if (alive) setError(cause instanceof Error ? cause.message : 'Academy background publishing failed.');
      } finally {
        if (alive) setRunning(false);
      }
    };
    void runQueue();
    return () => { alive = false; cancelledRef.current = true; };
  }, [isAdmin, lessons]);

  if (!isAdmin) return null;
  return (
    <section className="rounded-2xl border border-cyan-300/20 bg-surface/[0.035] p-4">
      <div className="flex flex-wrap items-center gap-3">
        <span className="flex h-10 w-10 items-center justify-center rounded-xl border border-cyan-300/20 bg-cyan-300/10 text-cyan-300"><Sparkles className="h-5 w-5" /></span>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-accent">Illustrated lesson studio</p>
          <p className="mt-1 text-sm font-semibold text-ink">{running ? 'Creating narrated tutorials in the background' : 'Background publishing status'}</p>
          <p className="mt-1 text-xs text-ink-3">{message || 'Creates narrated teaching videos with illustrative visuals. Use the exact screen recorder above for real SuperTechAi walkthroughs.'}</p>
          <p className="mt-1 text-[11px] text-ink-3">Illustrated explainer only — it does not show the exact live app screen. Use the screen recorder above to capture real buttons, charts and pages.</p>
          {current && running && <p className="mt-1 text-xs text-cyan-400">Now creating: {current}</p>}
          {total > 0 && <p className="mt-1 text-xs text-ink-3">{completed} lessons ready · {Math.max(0, total - (completed - (lessons.length - total)))} remaining in this run</p>}
        </div>
        {running ? <span className="inline-flex items-center gap-1 rounded-full bg-cyan-400/10 px-3 py-1 text-xs font-semibold text-cyan-300"><Video className="h-3.5 w-3.5" /> Rendering</span> : <span className="inline-flex items-center gap-1 rounded-full bg-emerald-400/10 px-3 py-1 text-xs font-semibold text-emerald-400"><PlayCircle className="h-3.5 w-3.5" /> Ready</span>}
      </div>
      {running && <button type="button" onClick={() => { cancelledRef.current = true; setMessage('The current video will finish before the queue pauses.'); }} className="mt-3 inline-flex items-center gap-2 rounded-lg border border-line/15 px-3 py-2 text-xs text-ink-2"><PauseCircle className="h-4 w-4" /> Pause queue</button>}
      {error && <p role="alert" className="mt-3 rounded-lg border border-rose-400/20 bg-rose-400/5 p-3 text-xs text-rose-400">{error}</p>}
    </section>
  );
}
