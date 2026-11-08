import { useEffect, useRef, useState } from 'react';
import { Mic, Monitor, Play, Square, Upload, Video } from 'lucide-react';
import { supabase } from '@/lib/supabase';

type Props = {
  lessonId: string;
  lessonTitle: string;
};

export function AcademyScreenRecorder({ lessonId, lessonTitle }: Props) {
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [videoBlob, setVideoBlob] = useState<Blob | null>(null);
  const [previewUrl, setPreviewUrl] = useState('');
  const [screenshots, setScreenshots] = useState<Array<{ blob: Blob; url: string; capturedAt: string }>>([]);
  const screenVideoRef = useRef<HTMLVideoElement | null>(null);
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (!recording) return undefined;
    const timer = window.setInterval(() => setSeconds((value) => value + 1), 1000);
    return () => window.clearInterval(timer);
  }, [recording]);

  useEffect(() => () => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    screenshots.forEach((shot) => URL.revokeObjectURL(shot.url));
  }, [previewUrl, screenshots]);

  const startRecording = async () => {
    setError('');
    setMessage('');
    setVideoBlob(null);
    screenshots.forEach((shot) => URL.revokeObjectURL(shot.url));
    setScreenshots([]);
    setSeconds(0);
    if (!navigator.mediaDevices?.getDisplayMedia || !navigator.mediaDevices?.getUserMedia) {
      setError('Screen recording is not supported by this browser. Try the latest Chrome or Edge on a secure connection.');
      return;
    }

    let displayStream: MediaStream | null = null;
    let microphoneStream: MediaStream | null = null;
    try {
      displayStream = await navigator.mediaDevices.getDisplayMedia({
        video: { frameRate: { ideal: 30, max: 30 } },
        audio: false,
      });
      microphoneStream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true },
      });
      const combinedStream = new MediaStream([
        ...displayStream.getVideoTracks(),
        ...microphoneStream.getAudioTracks(),
      ]);
      streamRef.current = new MediaStream([...displayStream.getTracks(), ...microphoneStream.getTracks()]);
      const screenPreview = document.createElement('video');
      screenPreview.srcObject = displayStream;
      screenPreview.muted = true;
      screenPreview.playsInline = true;
      await screenPreview.play();
      screenVideoRef.current = screenPreview;
      const mimeType = [
        'video/webm;codecs=vp9,opus',
        'video/webm;codecs=vp8,opus',
        'video/webm',
      ].find((type) => MediaRecorder.isTypeSupported(type));
      if (!mimeType) throw new Error('This browser cannot export WebM recordings. Try the latest Chrome or Edge.');

      chunksRef.current = [];
      const recorder = new MediaRecorder(combinedStream, {
        mimeType,
        videoBitsPerSecond: 3500000,
      });
      recorderRef.current = recorder;
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunksRef.current.push(event.data);
      };
      recorder.onerror = () => setError('The screen recording stopped because the browser reported an error.');
      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: mimeType });
        if (blob.size > 0) {
          setVideoBlob(blob);
          setPreviewUrl(URL.createObjectURL(blob));
          setMessage('Screen recording ready. Preview it, then publish it to this lesson.');
        } else {
          setError('The browser did not produce a recording. Please try again.');
        }
        streamRef.current?.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
        setRecording(false);
      };
      displayStream.getVideoTracks()[0]?.addEventListener('ended', () => {
        if (recorder.state === 'recording') recorder.stop();
      }, { once: true });
      recorder.start(1000);
      setRecording(true);
      setMessage('Recording screen and microphone together. Explain each action as you demonstrate it.');
    } catch (cause) {
      displayStream?.getTracks().forEach((track) => track.stop());
      microphoneStream?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
      setRecording(false);
      setError(cause instanceof Error ? cause.message : 'Could not start screen recording. Check screen and microphone permissions.');
    }
  };

  const captureScreenshot = async () => {
    const source = screenVideoRef.current;
    if (!source || !source.videoWidth || !source.videoHeight) {
      setError('The shared screen is not ready yet. Start recording and try again.');
      return;
    }
    const canvas = document.createElement('canvas');
    const scale = Math.min(1, 1920 / source.videoWidth);
    canvas.width = Math.round(source.videoWidth * scale);
    canvas.height = Math.round(source.videoHeight * scale);
    const context = canvas.getContext('2d');
    if (!context) return;
    context.drawImage(source, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.88));
    if (!blob) {
      setError('Could not capture this screen. Please try again.');
      return;
    }
    const url = URL.createObjectURL(blob);
    setScreenshots((current) => [...current, { blob, url, capturedAt: new Date().toISOString() }]);
    setMessage('Exact screen screenshot captured. Capture another screen whenever the lesson moves to a new section.');
    setError('');
  };

  const stopRecording = () => {
    if (recorderRef.current?.state === 'recording') recorderRef.current.stop();
  };

  const publishRecording = async () => {
    if (!videoBlob) return;
    setUploading(true);
    setError('');
    setMessage('');
    let path = '';
    try {
      const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
      if (sessionError) throw sessionError;
      if (!sessionData.session) throw new Error('Please sign in again before publishing.');
      path = 'lessons/' + lessonId + '-screen-' + Date.now() + '.webm';
      const { error: uploadError } = await supabase.storage.from('academy-videos').upload(path, videoBlob, {
        contentType: 'video/webm',
        cacheControl: '3600',
        upsert: false,
      });
      if (uploadError) throw uploadError;
      const screenshotRecords: Array<{ path: string; captured_at: string }> = [];
      for (let index = 0; index < screenshots.length; index += 1) {
        const shot = screenshots[index];
        const screenshotPath = 'lessons/' + lessonId + '-screens-' + Date.now() + '-' + (index + 1) + '.jpg';
        const { error: screenshotUploadError } = await supabase.storage.from('academy-videos').upload(screenshotPath, shot.blob, {
          contentType: 'image/jpeg',
          cacheControl: '3600',
          upsert: false,
        });
        if (screenshotUploadError) throw screenshotUploadError;
        screenshotRecords.push({ path: screenshotPath, captured_at: shot.capturedAt });
      }
      const { error: insertError } = await supabase.from('academy_videos').insert({
        lesson_id: lessonId,
        lesson_title: lessonTitle,
        status: 'completed',
        video_url: path,
        screenshots: screenshotRecords,
        created_by: sessionData.session.user.id,
      });
      if (insertError) {
        await supabase.storage.from('academy-videos').remove([path, ...screenshotRecords.map((shot) => shot.path)]);
        throw insertError;
      }
      setMessage('Published. Members can watch the real screen video and open the exact screenshots captured during the lesson.');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not publish the screen recording.');
    } finally {
      setUploading(false);
    }
  };

  const timeLabel = String(Math.floor(seconds / 60)).padStart(2, '0') + ':' + String(seconds % 60).padStart(2, '0');

  return (
    <section className="space-y-3 rounded-2xl border border-cyan-300/25 bg-surface/[0.035] p-4 sm:p-5">
      <div className="flex flex-wrap items-center gap-2">
        <span className="flex h-9 w-9 items-center justify-center rounded-xl border border-cyan-300/25 bg-cyan-300/10 text-cyan-300"><Monitor className="h-4 w-4" /></span>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-accent">Real screen tutorial studio</p>
          <h3 className="mt-1 text-sm font-semibold text-ink">Record the actual platform with your explanation</h3>
        </div>
        {recording && <span className="rounded-full bg-rose-500/10 px-3 py-1 text-xs font-semibold text-rose-400">● REC {timeLabel}</span>}
      </div>

      <p className="text-xs leading-5 text-ink-3">
        Share the SuperTechAi browser tab or app window, allow microphone access, then demonstrate the lesson while explaining each click. Screen video and your voice are captured together.
      </p>

      <div className="rounded-xl border border-line/10 bg-surface/[0.025] p-3">
        <p className="text-xs font-semibold text-ink">Recommended recording steps</p>
        <ol className="mt-2 list-decimal space-y-1 pl-5 text-xs leading-5 text-ink-3">
          <li>Open SuperTechAi in another browser tab or window.</li>
          <li>Press Record and choose that tab or window in the browser sharing prompt.</li>
          <li>Explain what you are doing as you click, scroll and open each feature.</li>
          <li>Use Capture screenshot whenever an important screen, button or chart is visible.</li>
          <li>Press Stop, review the recording, then publish the video and screenshots for members.</li>
        </ol>
      </div>

      <div className="flex flex-wrap gap-2">
        {!recording
          ? <button type="button" onClick={startRecording} className="inline-flex items-center gap-2 rounded-xl bg-accent px-4 py-2.5 text-xs font-semibold text-white"><Play className="h-4 w-4" /> {videoBlob ? 'Record again' : 'Record screen + voice'}</button>
          : <>
              <button type="button" onClick={captureScreenshot} className="inline-flex items-center gap-2 rounded-xl border border-cyan-300/30 bg-cyan-300/10 px-4 py-2.5 text-xs font-semibold text-cyan-200"><Monitor className="h-4 w-4" /> Capture screenshot</button>
              <button type="button" onClick={stopRecording} className="inline-flex items-center gap-2 rounded-xl bg-rose-500 px-4 py-2.5 text-xs font-semibold text-white"><Square className="h-4 w-4" /> Stop recording</button>
            </>
        {videoBlob && !recording && <button type="button" onClick={publishRecording} disabled={uploading} className="inline-flex items-center gap-2 rounded-xl border border-emerald-400/30 bg-emerald-400/10 px-4 py-2.5 text-xs font-semibold text-emerald-400 disabled:opacity-50"><Upload className="h-4 w-4" /> {uploading ? 'Publishing…' : 'Publish tutorial'}</button>}
      </div>

      {screenshots.length > 0 && <div className="space-y-2 rounded-xl border border-line/10 p-3">
        <div className="flex items-center justify-between gap-2"><p className="text-xs font-semibold text-ink">Exact screen screenshots</p><span className="text-[11px] text-ink-3">{screenshots.length} captured</span></div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">{screenshots.map((shot, index) => <div key={shot.url} className="space-y-1"><img src={shot.url} alt={'Captured SuperTechAi screen ' + (index + 1)} className="aspect-video w-full rounded-lg border border-line/10 object-contain bg-black" /><p className="text-[10px] text-ink-3">Screen {index + 1}</p></div>)}</div>
      </div>}
      {previewUrl && <div className="space-y-2 rounded-xl border border-line/10 p-2">
        <div className="flex items-center gap-2 text-xs font-semibold text-ink"><Video className="h-4 w-4 text-accent" /> Recording preview · pause and replay before publishing</div>
        <video controls playsInline preload="metadata" className="aspect-video w-full rounded-lg bg-black" src={previewUrl}>Your browser does not support video playback.</video>
      </div>}

      {message && <p role="status" className="rounded-lg border border-emerald-400/20 bg-emerald-400/5 p-3 text-xs text-emerald-500">{message}</p>}
      {error && <p role="alert" className="rounded-lg border border-rose-400/20 bg-rose-400/5 p-3 text-xs text-rose-400">{error}</p>}
      <p className="flex items-center gap-2 text-[11px] text-ink-3"><Mic className="h-3.5 w-3.5" /> Share only the SuperTechAi tab with test/demo data. Hide private account, wallet, member and API-key details before recording. Videos and screenshots are saved to the private Academy library.</p>
    </section>
  );
}
