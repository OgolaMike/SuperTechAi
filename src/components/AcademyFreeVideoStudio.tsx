import { useEffect, useRef, useState } from 'react';
import { Download, Mic, MicOff, Play, RefreshCw, Upload, Video, WandSparkles } from 'lucide-react';
import { supabase } from '@/lib/supabase';

type LessonForVideo = {
  id: string;
  title: string;
  category: string;
  level: string;
  duration: string;
  summary: string;
  objective: string;
  steps: string[];
  narration: string;
};

type Props = { lesson: LessonForVideo; isAdmin: boolean };

type Scene = { eyebrow: string; heading: string; body: string; weight: number };

function buildScenes(lesson: LessonForVideo): Scene[] {
  return [
    { eyebrow: 'SUPERTECHAI ACADEMY', heading: lesson.title, body: lesson.summary, weight: Math.max(lesson.title.length + lesson.summary.length, 40) },
    { eyebrow: 'LEARNING OBJECTIVE', heading: 'What you will learn', body: lesson.objective, weight: Math.max(lesson.objective.length, 40) },
    ...lesson.steps.map((step, index) => ({
      eyebrow: 'LESSON STEP ' + (index + 1) + ' OF ' + lesson.steps.length,
      heading: 'Step ' + (index + 1),
      body: step,
      weight: Math.max(step.length, 30),
    })),
    { eyebrow: 'IMPORTANT REMINDER', heading: 'Learn. Review. Decide.', body: 'SuperTechAi provides tools and information. Always use your own judgement and manage risk. No signal guarantees an outcome.', weight: 120 },
  ];
}

function drawWrapped(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, maxWidth: number, lineHeight: number, maxLines: number) {
  const words = text.split(/\s+/);
  let line = '';
  let lines = 0;
  for (const word of words) {
    const test = line ? line + ' ' + word : word;
    if (ctx.measureText(test).width > maxWidth && line) {
      ctx.fillText(line, x, y + lines * lineHeight);
      lines += 1;
      line = word;
      if (lines >= maxLines) break;
    } else line = test;
  }
  if (lines < maxLines && line) ctx.fillText(line, x, y + lines * lineHeight);
}

function paintScene(canvas: HTMLCanvasElement, scene: Scene, index: number, total: number, lessonTitle: string) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const w = canvas.width;
  const h = canvas.height;
  const gradient = ctx.createLinearGradient(0, 0, w, h);
  gradient.addColorStop(0, '#050b18');
  gradient.addColorStop(0.55, '#0b1830');
  gradient.addColorStop(1, '#07101e');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, w, h);

  const glow = ctx.createRadialGradient(w * 0.82, h * 0.12, 10, w * 0.82, h * 0.12, 430);
  glow.addColorStop(0, 'rgba(34,211,238,0.22)');
  glow.addColorStop(1, 'rgba(34,211,238,0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, w, h);

  ctx.strokeStyle = 'rgba(34,211,238,0.28)';
  ctx.lineWidth = 2;
  ctx.strokeRect(46, 46, w - 92, h - 92);
  ctx.fillStyle = '#22d3ee';
  ctx.fillRect(82, 100, 7, 72);
  ctx.font = '600 22px Arial, sans-serif';
  ctx.fillStyle = '#67e8f9';
  ctx.fillText(scene.eyebrow.toUpperCase(), 112, 126);

  ctx.font = '700 58px Arial, sans-serif';
  ctx.fillStyle = '#ffffff';
  drawWrapped(ctx, scene.heading, 112, 245, w - 224, 72, 2);

  ctx.font = '400 31px Arial, sans-serif';
  ctx.fillStyle = '#d6e2f0';
  drawWrapped(ctx, scene.body, 114, 420, w - 260, 48, 4);

  ctx.font = '600 18px Arial, sans-serif';
  ctx.fillStyle = 'rgba(255,255,255,0.58)';
  ctx.fillText('SUPERTECHAI  /  ' + lessonTitle.toUpperCase(), 82, h - 78);

  ctx.fillStyle = 'rgba(255,255,255,0.15)';
  ctx.fillRect(82, h - 54, w - 164, 5);
  ctx.fillStyle = '#22d3ee';
  ctx.fillRect(82, h - 54, (w - 164) * ((index + 1) / total), 5);
  ctx.font = '500 17px Arial, sans-serif';
  ctx.fillStyle = '#a5f3fc';
  ctx.textAlign = 'right';
  ctx.fillText(String(index + 1).padStart(2, '0') + ' / ' + String(total).padStart(2, '0'), w - 82, h - 78);
  ctx.textAlign = 'left';
}

export function AcademyFreeVideoStudio({ lesson, isAdmin }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const micRecorderRef = useRef<MediaRecorder | null>(null);
  const micStreamRef = useRef<MediaStream | null>(null);
  const micChunksRef = useRef<BlobPart[]>([]);
  const [recording, setRecording] = useState(false);
  const [voiceBlob, setVoiceBlob] = useState<Blob | null>(null);
  const [voiceUrl, setVoiceUrl] = useState('');
  const [rendering, setRendering] = useState(false);
  const [videoUrl, setVideoUrl] = useState('');
  const [videoBlob, setVideoBlob] = useState<Blob | null>(null);
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  useEffect(() => () => {
    if (voiceUrl) URL.revokeObjectURL(voiceUrl);
    if (videoUrl) URL.revokeObjectURL(videoUrl);
    micStreamRef.current?.getTracks().forEach((track) => track.stop());
  }, [voiceUrl, videoUrl]);

  const startNarration = async () => {
    setError(''); setMessage('');
    try {
      if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
        throw new Error('This browser does not support microphone recording. Try the latest Chrome or Edge.');
      }
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
      micStreamRef.current = stream;
      micChunksRef.current = [];
      const preferred = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4'].find((type) => MediaRecorder.isTypeSupported(type));
      const recorder = preferred ? new MediaRecorder(stream, { mimeType: preferred }) : new MediaRecorder(stream);
      micRecorderRef.current = recorder;
      recorder.ondataavailable = (event) => { if (event.data.size) micChunksRef.current.push(event.data); };
      recorder.onstop = () => {
        const blob = new Blob(micChunksRef.current, { type: recorder.mimeType || 'audio/webm' });
        setVoiceBlob(blob);
        setVoiceUrl(URL.createObjectURL(blob));
        stream.getTracks().forEach((track) => track.stop());
        micStreamRef.current = null;
        setRecording(false);
        setMessage('Narration saved in this browser. You can now render it into the lesson video.');
      };
      recorder.start(500);
      setRecording(true);
      setMessage('Recording. Read the lesson narration clearly, then press Stop narration.');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not start microphone recording.');
    }
  };

  const stopNarration = () => {
    if (micRecorderRef.current?.state === 'recording') micRecorderRef.current.stop();
  };

  const renderVideo = async () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    setRendering(true); setError(''); setMessage('');
    let audioContext: AudioContext | null = null;
    let recorder: MediaRecorder | null = null;
    let frameId = 0;
    try {
      const scenes = buildScenes(lesson);
      const canvasStream = canvas.captureStream(30);
      let combined = new MediaStream([...canvasStream.getVideoTracks()]);
      let audioElement: HTMLAudioElement | null = null;
      let totalDuration = scenes.length * 6;

      if (voiceBlob && voiceUrl) {
        audioElement = new Audio(voiceUrl);
        audioElement.preload = 'auto';
        await new Promise<void>((resolve, reject) => {
          audioElement!.onloadedmetadata = () => resolve();
          audioElement!.onerror = () => reject(new Error('Could not load the recorded narration.'));
          audioElement!.load();
        });
        totalDuration = Math.max(5, audioElement.duration || 0);
        audioContext = new AudioContext();
        const source = audioContext.createMediaElementSource(audioElement);
        const destination = audioContext.createMediaStreamDestination();
        source.connect(destination);
        combined = new MediaStream([...canvasStream.getVideoTracks(), ...destination.stream.getAudioTracks()]);
      }

      const mime = ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm'].find((type) => MediaRecorder.isTypeSupported(type));
      if (!mime) throw new Error('This browser cannot export WebM video. Try the latest Chrome or Edge.');
      const chunks: BlobPart[] = [];
      recorder = new MediaRecorder(combined, { mimeType: mime, videoBitsPerSecond: 2400000 });
      const finished = new Promise<Blob>((resolve, reject) => {
        recorder!.ondataavailable = (event) => { if (event.data.size) chunks.push(event.data); };
        recorder!.onstop = () => resolve(new Blob(chunks, { type: mime }));
        recorder!.onerror = () => reject(new Error('Video rendering failed in this browser.'));
      });

      const totalWeight = scenes.reduce((sum, scene) => sum + scene.weight, 0);
      const startedAt = performance.now();
      const draw = (now: number) => {
        const elapsed = (now - startedAt) / 1000;
        const progress = Math.min(0.999, elapsed / totalDuration);
        let accumulated = 0;
        let sceneIndex = scenes.length - 1;
        for (let i = 0; i < scenes.length; i += 1) {
          accumulated += scenes[i].weight / totalWeight;
          if (progress < accumulated) { sceneIndex = i; break; }
        }
        paintScene(canvas, scenes[sceneIndex], sceneIndex, scenes.length, lesson.title);
        if (elapsed < totalDuration && recorder?.state === 'recording') frameId = requestAnimationFrame(draw);
        else if (recorder?.state === 'recording') recorder.stop();
      };
      paintScene(canvas, scenes[0], 0, scenes.length, lesson.title);
      recorder.start(500);
      frameId = requestAnimationFrame(draw);
      if (audioElement && audioContext) {
        await audioContext.resume();
        await audioElement.play();
        audioElement.onended = () => { if (recorder?.state === 'recording') recorder.stop(); };
      }
      const blob = await finished;
      cancelAnimationFrame(frameId);
      canvasStream.getTracks().forEach((track) => track.stop());
      combined.getAudioTracks().forEach((track) => track.stop());
      if (audioContext) await audioContext.close();
      if (videoUrl) URL.revokeObjectURL(videoUrl);
      setVideoBlob(blob);
      setVideoUrl(URL.createObjectURL(blob));
      setMessage('Your branded lesson video is ready. Download it or publish it to the shared Academy library.');
    } catch (cause) {
      if (recorder?.state === 'recording') recorder.stop();
      if (audioContext && audioContext.state !== 'closed') await audioContext.close().catch(() => undefined);
      setError(cause instanceof Error ? cause.message : 'Could not render this lesson video.');
    } finally {
      setRendering(false);
    }
  };

  const publishVideo = async () => {
    if (!videoBlob) return;
    setUploading(true); setError(''); setMessage('');
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      if (!sessionData.session) throw new Error('Please sign in again before publishing.');
      const safeTitle = lesson.id + '-' + Date.now() + '.webm';
      const path = 'lessons/' + safeTitle;
      const { error: uploadError } = await supabase.storage.from('academy-videos').upload(path, videoBlob, {
        contentType: 'video/webm',
        cacheControl: '3600',
        upsert: false,
      });
      if (uploadError) throw uploadError;
      const { data: publicData } = supabase.storage.from('academy-videos').getPublicUrl(path);
      const { error: insertError } = await supabase.from('academy_videos').insert({
        lesson_id: lesson.id,
        lesson_title: lesson.title,
        status: 'completed',
        video_url: publicData.publicUrl,
        created_by: sessionData.session.user.id,
      });
      if (insertError) throw insertError;
      setMessage('Published. Members can now watch this video in the Academy lesson.');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not publish this video.');
    } finally {
      setUploading(false);
    }
  };

  return (
    <section className="space-y-4 rounded-2xl border border-cyan-300/20 bg-surface/[0.035] p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-accent">Free local video studio</p>
          <h3 className="mt-1 text-lg font-semibold text-ink">Create: {lesson.title}</h3>
          <p className="mt-1 text-xs text-ink-3">Open-source browser recording · no AI API · no subscription · no server rendering</p>
        </div>
        <span className="rounded-full border border-emerald-400/30 bg-emerald-400/10 px-3 py-1 text-xs font-semibold text-emerald-500">No provider fees</span>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-xl border border-line/10 p-3">
          <div className="flex items-center gap-2 text-sm font-semibold text-ink"><Mic className="h-4 w-4 text-accent" /> 1. Record narration</div>
          <p className="mt-2 text-xs leading-5 text-ink-3">Read the lesson script below in your own voice. The recording stays in this browser until you publish the finished video.</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {!recording
              ? <button onClick={startNarration} className="rounded-lg bg-accent px-3 py-2 text-xs font-semibold text-white"><Mic className="mr-1 inline h-3.5 w-3.5" /> {voiceBlob ? 'Record again' : 'Start narration'}</button>
              : <button onClick={stopNarration} className="rounded-lg bg-rose-500 px-3 py-2 text-xs font-semibold text-white"><MicOff className="mr-1 inline h-3.5 w-3.5" /> Stop narration</button>}
            {voiceUrl && <audio controls src={voiceUrl} className="h-9 max-w-full" />}
          </div>
        </div>
        <div className="rounded-xl border border-line/10 p-3">
          <div className="flex items-center gap-2 text-sm font-semibold text-ink"><Video className="h-4 w-4 text-accent" /> 2. Render lesson video</div>
          <p className="mt-2 text-xs leading-5 text-ink-3">The studio creates animated SuperTechAi slides, captions and progress graphics locally on your device.</p>
          <button onClick={renderVideo} disabled={rendering || recording} className="mt-3 rounded-lg bg-accent px-3 py-2 text-xs font-semibold text-white disabled:opacity-50"><WandSparkles className="mr-1 inline h-3.5 w-3.5" /> {rendering ? 'Rendering on this device…' : 'Generate video'}</button>
        </div>
      </div>

      <div className="rounded-xl border border-line/10 bg-surface/[0.025] p-3">
        <p className="text-xs font-semibold uppercase tracking-wider text-ink-3">Narration script</p>
        <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-ink-2">{lesson.narration}</p>
        <p className="mt-2 text-xs text-ink-3">Tip: speak clearly and pause briefly between sentences. You can preview the recording before rendering.</p>
      </div>

      <canvas ref={canvasRef} width={1280} height={720} className="hidden" />

      {videoUrl && <div className="space-y-3 rounded-xl border border-line/10 p-3">
        <video controls playsInline className="aspect-video w-full rounded-lg bg-black" src={videoUrl} />
        <div className="flex flex-wrap gap-2">
          <a href={videoUrl} download={'SuperTechAi-' + lesson.id + '.webm'} className="rounded-lg border border-line/15 px-3 py-2 text-xs font-semibold text-ink-2"><Download className="mr-1 inline h-3.5 w-3.5" /> Download video</a>
          {isAdmin && <button onClick={publishVideo} disabled={uploading} className="rounded-lg bg-accent px-3 py-2 text-xs font-semibold text-white disabled:opacity-50"><Upload className="mr-1 inline h-3.5 w-3.5" /> {uploading ? 'Publishing…' : 'Publish for all members'}</button>}
          <button onClick={renderVideo} disabled={rendering} className="rounded-lg border border-line/15 px-3 py-2 text-xs font-semibold text-ink-2"><RefreshCw className="mr-1 inline h-3.5 w-3.5" /> Render again</button>
        </div>
      </div>}

      {message && <p className="rounded-lg border border-emerald-400/20 bg-emerald-400/5 p-3 text-xs text-emerald-500">{message}</p>}
      {error && <p className="rounded-lg border border-rose-400/20 bg-rose-400/5 p-3 text-xs text-rose-400">{error}</p>}
    </section>
  );
}
