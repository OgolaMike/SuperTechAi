import fs from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import ts from 'typescript';
import { chromium } from 'playwright';
import { KokoroTTS } from 'kokoro-js';
import { createClient } from '@supabase/supabase-js';

const APP_URL = 'https://deriv-sma-signal-das-04us.bolt.host/';
const DEMO_EMAIL = (process.env.ACADEMY_DEMO_EMAIL || '').trim().toLowerCase();
const DEMO_PASSWORD = process.env.ACADEMY_DEMO_PASSWORD || '';
const EXPECTED_DEMO_EMAIL = 'supertechai.254@gmail.com';
const TEST_LESSON_ID = (process.env.ACADEMY_TEST_LESSON_ID || '').trim();
const OUTPUT_DIR = path.resolve('academy-worker-output');
const FONT_BOLD = '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf';

function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ['ignore', 'pipe', 'pipe'], ...options });
    let stderr = '';
    child.stderr.on('data', (chunk) => { stderr += chunk.toString(); });
    child.on('error', reject);
    child.on('close', (code) => code === 0 ? resolve() : reject(new Error(command + ' failed: ' + stderr.slice(-1600))));
  });
}

function parseLiteral(node, source) {
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return node.text;
  if (ts.isNumericLiteral(node)) return Number(node.text);
  if (node.kind === ts.SyntaxKind.TrueKeyword) return true;
  if (node.kind === ts.SyntaxKind.FalseKeyword) return false;
  if (node.kind === ts.SyntaxKind.NullKeyword) return null;
  if (ts.isArrayLiteralExpression(node)) return node.elements.map((item) => parseLiteral(item, source));
  if (ts.isObjectLiteralExpression(node)) {
    const value = {};
    for (const property of node.properties) {
      if (!ts.isPropertyAssignment(property)) continue;
      const key = ts.isIdentifier(property.name) || ts.isStringLiteral(property.name)
        ? property.name.text : property.name.getText(source).replace(/^['"]|['"]$/g, '');
      value[key] = parseLiteral(property.initializer, source);
    }
    return value;
  }
  if (ts.isParenthesizedExpression(node)) return parseLiteral(node.expression, source);
  throw new Error('Unsupported Academy lesson value: ' + node.getText(source).slice(0, 80));
}

async function readLessons() {
  const text = await fs.readFile('src/components/SuperTechAcademy.tsx', 'utf8');
  const source = ts.createSourceFile('SuperTechAcademy.tsx', text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let initializer;
  const visit = (node) => {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.name.text === 'LESSONS') initializer = node.initializer;
    ts.forEachChild(node, visit);
  };
  visit(source);
  if (!initializer || !ts.isArrayLiteralExpression(initializer)) throw new Error('Could not load Academy lessons.');
  return parseLiteral(initializer, source);
}

function resolveView(text) {
  const value = String(text || '').toLowerCase();
  if (/super signal|eight timeframes|8 timeframes|multi[- ]timeframe/.test(value)) return 'Super Signal';
  if (/pending order|limit order|stop order|entry zone|order execution|market order|slippage/.test(value)) return 'Pending Orders';
  if (/binance futures|futures|funding rate|perpetual|derivative/.test(value)) return 'Binance Futures';
  if (/binance spot/.test(value)) return 'Binance Spot';
  if (/crypto|bitcoin|ethereum|coin|token/.test(value)) return 'Crypto';
  if (/referral|commission|membership|member benefit/.test(value)) return 'My Referrals';
  if (/network|binary|team structure/.test(value)) return 'Network';
  if (/earning|withdrawal|wallet|income/.test(value)) return 'My Earnings';
  if (/alert|notification/.test(value)) return 'Alerts';
  if (/signal|buy setup|sell setup|buy signal|sell signal/.test(value)) return 'Signals';
  return 'Dashboard';
}

function wrapCaption(value, maxChars = 52) {
  const lines = [];
  let line = '';
  for (const word of String(value || '').split(/\s+/)) {
    const next = line ? line + ' ' + word : word;
    if (next.length > maxChars && line) { lines.push(line); line = word; }
    else line = next;
  }
  if (line) lines.push(line);
  return lines.slice(0, 4).join('\n');
}

function audioToWav(audio) {
  const samples = audio.audio || audio.data;
  const rate = audio.sampling_rate || audio.samplingRate || 24000;
  if (!samples?.length) throw new Error('Kokoro returned no audio samples.');
  const out = Buffer.alloc(44 + samples.length * 2);
  out.write('RIFF', 0); out.writeUInt32LE(36 + samples.length * 2, 4);
  out.write('WAVE', 8); out.write('fmt ', 12); out.writeUInt32LE(16, 16);
  out.writeUInt16LE(1, 20); out.writeUInt16LE(1, 22);
  out.writeUInt32LE(rate, 24); out.writeUInt32LE(rate * 2, 28);
  out.writeUInt16LE(2, 32); out.writeUInt16LE(16, 34);
  out.write('data', 36); out.writeUInt32LE(samples.length * 2, 40);
  for (let i = 0; i < samples.length; i += 1) {
    const sample = Math.max(-1, Math.min(1, samples[i]));
    out.writeInt16LE(sample < 0 ? sample * 32768 : sample * 32767, 44 + i * 2);
  }
  return { buffer: out, duration: samples.length / rate };
}


function splitNarration(text, maxChars = 300) {
  const sentences = String(text || '').replace(/\s+/g, ' ').match(/[^.!?]+[.!?]+|[^.!?]+$/g) || [];
  const chunks = []; let current = '';
  for (const raw of sentences) {
    const sentence = raw.trim(); if (!sentence) continue;
    if (sentence.length > maxChars) {
      if (current) { chunks.push(current); current = ''; }
      let part = '';
      for (const word of sentence.split(/\s+/)) {
        const candidate = part ? part + ' ' + word : word;
        if (candidate.length > maxChars && part) { chunks.push(part); part = word; } else part = candidate;
      }
      if (part) chunks.push(part); continue;
    }
    const candidate = current ? current + ' ' + sentence : sentence;
    if (candidate.length > maxChars && current) { chunks.push(current); current = sentence; } else current = candidate;
  }
  if (current) chunks.push(current);
  return chunks;
}

function combineAudioParts(parts) {
  if (!parts.length) throw new Error('Kokoro returned no narration sections.');
  const rate = parts[0].rate;
  if (parts.some((part) => part.rate !== rate)) throw new Error('Kokoro narration sections returned inconsistent sample rates.');
  const gap = Math.round(rate * 0.22);
  const length = parts.reduce((sum, part, i) => sum + part.samples.length + (i < parts.length - 1 ? gap : 0), 0);
  const samples = new Float32Array(length); const sceneDurations = []; let offset = 0;
  for (let i = 0; i < parts.length; i += 1) {
    samples.set(parts[i].samples, offset); offset += parts[i].samples.length;
    sceneDurations.push(parts[i].samples.length / rate); if (i < parts.length - 1) offset += gap;
  }
  const buffer = Buffer.alloc(44 + samples.length * 2);
  buffer.write('RIFF',0); buffer.writeUInt32LE(36 + samples.length * 2,4); buffer.write('WAVE',8);
  buffer.write('fmt ',12); buffer.writeUInt32LE(16,16); buffer.writeUInt16LE(1,20); buffer.writeUInt16LE(1,22);
  buffer.writeUInt32LE(rate,24); buffer.writeUInt32LE(rate*2,28); buffer.writeUInt16LE(2,32); buffer.writeUInt16LE(16,34);
  buffer.write('data',36); buffer.writeUInt32LE(samples.length*2,40);
  for (let i=0;i<samples.length;i+=1) { const v=Math.max(-1,Math.min(1,samples[i])); buffer.writeInt16LE(v<0?v*32768:v*32767,44+i*2); }
  return { buffer, duration:samples.length/rate, sceneDurations };
}

function makeScenes(lesson) {
  const primary = resolveView(lesson.title + ' ' + lesson.category);
  return [
    { caption: lesson.title + '\n' + lesson.summary, narration: lesson.narration || lesson.summary, view: primary },
    { caption: 'LEARNING OBJECTIVE\n' + lesson.objective, narration: 'By the end of this lesson, you will be able to: ' + lesson.objective, view: primary },
    ...lesson.steps.map((step, index) => ({
      caption: 'STEP ' + (index + 1) + '\n' + step,
      narration: 'Step ' + (index + 1) + '. ' + step,
      view: resolveView(lesson.title + ' ' + lesson.category + ' ' + step),
    })),
    { caption: 'KEY TAKEAWAY\nLearn it. Review it. Apply it carefully. Trading involves risk.', narration: 'Key reminder. Learn the process, review the information and apply it carefully. Trading involves risk. No signal guarantees an outcome.', view: primary },
  ];
}

async function readAccessToken(page) {
  return page.evaluate(() => {
    for (let i = 0; i < localStorage.length; i += 1) {
      const key = localStorage.key(i) || '';
      if (!key.includes('auth-token')) continue;
      try {
        const value = JSON.parse(localStorage.getItem(key) || '{}');
        if (value.access_token) return value.access_token;
        if (value.currentSession?.access_token) return value.currentSession.access_token;
      } catch { /* ignore non-session values */ }
    }
    return null;
  });
}

async function captureScreenshots(page, lesson, scenes, dir) {
  const byView = new Map();
  const screenshotFiles = [];
  for (const scene of scenes) {
    let view = scene.view;
    const nav = page.locator('nav[aria-label="Sections"]');
    if (!byView.has(view)) {
      let button = nav.getByRole('button', { name: view, exact: true });
      if (await button.count() === 0) {
        view = 'Dashboard';
        button = nav.getByRole('button', { name: view, exact: true });
      }
      await button.click({ timeout: 15000 });
      await page.waitForTimeout(1600);
      if (await button.getAttribute('aria-current') !== 'page') throw new Error('Could not open the real ' + view + ' screen.');
      const localPath = path.join(dir, 'screen-' + String(byView.size + 1).padStart(2, '0') + '.png');
      await page.screenshot({ path: localPath, fullPage: false, animations: 'disabled' });
      const row = { localPath, caption: view + ' · ' + lesson.title };
      byView.set(view, row);
      screenshotFiles.push(row);
    }
    scene.imagePath = byView.get(view).localPath;
  }
  return screenshotFiles;
}

async function renderVideo(lesson, scenes, tts, dir) {
  // Chunk speech and render scene-by-scene to avoid long Kokoro requests truncating silently.
  const parts = [];
  for (let sceneIndex = 0; sceneIndex < scenes.length; sceneIndex += 1) {
    const chunks = splitNarration(scenes[sceneIndex].narration);
    if (!chunks.length) throw new Error('Scene ' + (sceneIndex + 1) + ' has no narration.');
    const samplesList = []; let rate = null;
    for (let chunkIndex = 0; chunkIndex < chunks.length; chunkIndex += 1) {
      const generated = await tts.generate(chunks[chunkIndex], { voice: 'af_heart' });
      const data = generated.audio || generated.data;
      const sampleRate = generated.sampling_rate || generated.samplingRate || 24000;
      if (!data?.length) throw new Error('Kokoro returned empty narration at scene ' + (sceneIndex + 1) + '.');
      if (rate !== null && rate !== sampleRate) throw new Error('Kokoro sample rate changed within a scene.');
      rate = sampleRate; const copy = new Float32Array(data.length); copy.set(data); samplesList.push(copy);
    }
    const count = samplesList.reduce((n,x)=>n+x.length,0); const joined = new Float32Array(count); let pos=0;
    for (const part of samplesList) { joined.set(part,pos); pos+=part.length; }
    parts.push({samples:joined,rate});
  }
  const audio = combineAudioParts(parts);
  const audioPath = path.join(dir, 'narration.wav');
  await fs.writeFile(audioPath, audio.buffer);
  const segments = [];
  for (let i = 0; i < scenes.length; i += 1) {
    const scene = scenes[i];
    const captionPath = path.join(dir, 'caption-' + i + '.txt');
    const headerPath = path.join(dir, 'header-' + i + '.txt');
    const segmentPath = path.join(dir, 'segment-' + String(i + 1).padStart(2, '0') + '.mp4');
    await fs.writeFile(captionPath, wrapCaption(scene.caption));
    await fs.writeFile(headerPath, 'SUPERTECHAI ACADEMY  |  ' + lesson.title.slice(0, 72));
    const duration = audio.sceneDurations[i] + 0.35;
    const filter = [
      'scale=1920:1080:force_original_aspect_ratio=decrease',
      'pad=1920:1080:(ow-iw)/2:(oh-ih)/2:color=0x050b18',
      'drawbox=x=0:y=0:w=iw:h=84:color=0x06101f@0.90:t=fill',
      'drawtext=fontfile=' + FONT_BOLD + ':textfile=' + headerPath + ':fontcolor=0x67e8f9:fontsize=27:x=70:y=24:expansion=none',
      'drawbox=x=0:y=810:w=iw:h=270:color=0x050b18@0.92:t=fill',
      'drawtext=fontfile=' + FONT_BOLD + ':textfile=' + captionPath + ':fontcolor=white:fontsize=42:line_spacing=10:x=72:y=850:expansion=none',
    ].join(',');
    await run('ffmpeg', ['-y', '-loop', '1', '-framerate', '30', '-i', scene.imagePath, '-t', duration.toFixed(3), '-vf', filter, '-an', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '23', '-pix_fmt', 'yuv420p', '-r', '30', segmentPath]);
    segments.push(segmentPath);
  }
  const concatPath = path.join(dir, 'concat.txt');
  await fs.writeFile(concatPath, segments.map((item) => "file '" + path.basename(item) + "'").join('\n'));
  const silentPath = path.join(dir, 'silent.mp4');
  await run('ffmpeg', ['-y', '-f', 'concat', '-safe', '0', '-i', concatPath, '-c', 'copy', silentPath], { cwd: dir });
  const finalPath = path.join(dir, 'lesson.mp4');
  await run('ffmpeg', ['-y', '-i', silentPath, '-i', audioPath, '-c:v', 'copy', '-c:a', 'aac', '-b:a', '160k', '-shortest', '-movflags', '+faststart', finalPath]);
  const stat = await fs.stat(finalPath);
  if (stat.size < 100_000) throw new Error('Generated video is unexpectedly small.');
  const probe = await new Promise((resolve,reject) => {
    const child=spawn('ffprobe',['-v','error','-show_entries','format=duration:stream=codec_type','-of','json',finalPath],{stdio:['ignore','pipe','pipe']});
    let out=''; let err=''; child.stdout.on('data',x=>out+=x.toString()); child.stderr.on('data',x=>err+=x.toString());
    child.on('error',reject); child.on('close',code=>code===0?resolve(out):reject(new Error('ffprobe failed: '+err.slice(-1000))));
  });
  const meta=JSON.parse(probe); const duration=Number(meta.format?.duration||0);
  const types=new Set((meta.streams||[]).map(x=>x.codec_type));
  if(!types.has('video')||!types.has('audio')) throw new Error('Rendered MP4 is missing video or narration audio.');
  if(duration<audio.duration*0.9) throw new Error('Rendered MP4 is shorter than its narration; refusing incomplete lesson.');
  if(stat.size>45*1024*1024) throw new Error('Rendered MP4 exceeds the 45 MB Academy upload limit.');
  return finalPath;
}

async function invokeAcademyFunction(accessToken, anonKey, body) {
  const response = await fetch('https://jtfsqhewotinvlrcadwq.supabase.co/functions/v1/academy-videos', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + accessToken, apikey: anonKey, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || ('Academy publishing endpoint returned ' + response.status));
  return payload;
}

async function publishLesson(accessToken, anonKey, storageClient, lesson, screenshotFiles, videoPath, runTag) {
  const providerSessionId = 'github-actions-' + runTag + '-' + lesson.id;
  const prepared = await invokeAcademyFunction(accessToken, anonKey, {
    action: 'prepare',
    lessonId: lesson.id,
    lessonTitle: lesson.title,
    providerSessionId,
    screenshots: screenshotFiles.map((item) => ({ caption: item.caption })),
  });
  const uploadedPaths = [];
  try {
    const videoBytes = await fs.readFile(videoPath);
    if (videoBytes.length > 45 * 1024 * 1024) throw new Error('The rendered MP4 is larger than the 45 MB Academy upload limit.');
    const videoUpload = await storageClient.storage.from('academy-videos').uploadToSignedUrl(
      prepared.video.path,
      prepared.video.token,
      new Blob([videoBytes], { type: 'video/mp4' }),
      { contentType: 'video/mp4', cacheControl: '31536000' },
    );
    if (videoUpload.error) throw videoUpload.error;
    uploadedPaths.push(prepared.video.path);

    for (let index = 0; index < screenshotFiles.length; index += 1) {
      const imageBytes = await fs.readFile(screenshotFiles[index].localPath);
      const target = prepared.screenshots[index];
      const imageUpload = await storageClient.storage.from('academy-videos').uploadToSignedUrl(
        target.path,
        target.token,
        new Blob([imageBytes], { type: 'image/png' }),
        { contentType: 'image/png', cacheControl: '31536000' },
      );
      if (imageUpload.error) throw imageUpload.error;
      uploadedPaths.push(target.path);
    }

    return await invokeAcademyFunction(accessToken, anonKey, {
      action: 'complete',
      lessonId: lesson.id,
      lessonTitle: lesson.title,
      providerSessionId,
      videoPath: prepared.video.path,
      screenshots: prepared.screenshots.map((item) => ({ path: item.path, caption: item.caption })),
    });
  } catch (error) {
    if (uploadedPaths.length) {
      await invokeAcademyFunction(accessToken, anonKey, { action: 'cancel', paths: uploadedPaths }).catch(() => undefined);
    }
    throw error;
  }
}

async function main() {
  if (DEMO_EMAIL !== EXPECTED_DEMO_EMAIL || !DEMO_PASSWORD) {
    throw new Error('Add the approved demo account email and password as GitHub Actions secrets before running this worker.');
  }
  const config = await fs.readFile('src/lib/supabase.ts', 'utf8');
  const supabaseUrl = config.match(/const supabaseUrl = '([^']+)'/)?.[1];
  const anonKey = config.match(/const supabaseAnonKey = '([^']+)'/)?.[1];
  if (!supabaseUrl || !anonKey) throw new Error('Could not read the SuperTechAi Supabase configuration.');
  const storageClient = createClient(supabaseUrl, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
  await fs.mkdir(OUTPUT_DIR, { recursive: true });

  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  const report = { started_at: new Date().toISOString(), completed: [], skipped: [], failed: [] };
  try {
    const context = await browser.newContext({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: 1 });
    const page = await context.newPage();
    await page.goto(APP_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
    const nav = page.locator('nav[aria-label="Sections"]');
    if (await nav.count() === 0) {
      await page.locator('input[type="email"]').fill(DEMO_EMAIL);
      await page.locator('input[type="password"]').fill(DEMO_PASSWORD);
      await page.locator('form button[type="submit"]').click();
      await nav.waitFor({ state: 'visible', timeout: 60000 });
    }
    if (await page.getByRole('button', { name: 'Members', exact: true }).count() > 0 ||
        await page.getByRole('button', { name: 'Finance Admin', exact: true }).count() > 0) {
      throw new Error('The configured account has admin access. The Academy worker only accepts the read-only demo member.');
    }
    const accessToken = await readAccessToken(page);
    if (!accessToken) throw new Error('Could not read the signed-in demo session. Sign in again and retry.');

    const response = await fetch('https://jtfsqhewotinvlrcadwq.supabase.co/rest/v1/academy_videos?select=lesson_id,status,video_url,screenshots,created_at&order=created_at.desc', {
      headers: { apikey: anonKey, Authorization: 'Bearer ' + accessToken },
    });
    if (!response.ok) throw new Error('Could not read current Academy video status (' + response.status + ').');
    const rows = await response.json();
    const latest = new Map();
    for (const row of rows) if (!latest.has(row.lesson_id)) latest.set(row.lesson_id, row);

    const lessons = await readLessons();
    if (TEST_LESSON_ID && !lessons.some((lesson) => lesson.id === TEST_LESSON_ID)) {
      throw new Error('The requested test lesson ID does not exist: ' + TEST_LESSON_ID);
    }
    const candidateLessons = TEST_LESSON_ID
      ? lessons.filter((lesson) => lesson.id === TEST_LESSON_ID)
      : lessons;
    const force = process.env.ACADEMY_FORCE_REFRESH === 'true';
    const queue = candidateLessons.filter((lesson) => {
      if (force) return true;
      const row = latest.get(lesson.id);
      return !row || row.status !== 'completed' || !row.video_url || !Array.isArray(row.screenshots) || row.screenshots.length === 0;
    });
    report.total_lessons = lessons.length;
    report.test_lesson_id = TEST_LESSON_ID || null;
    report.candidate_count = candidateLessons.length;
    report.queued = queue.length;
    report.skipped = lessons.filter((lesson) => !queue.some((item) => item.id === lesson.id)).map((lesson) => lesson.id);
    if (TEST_LESSON_ID && queue.length > 1) {
      throw new Error('Safety check failed: a single-lesson test cannot queue more than one lesson.');
    }
    if (!queue.length) {
      await fs.writeFile('academy-worker-report.json', JSON.stringify(report, null, 2));
      console.log('All Academy lessons already have real screenshots and videos.');
      return;
    }

    console.log('Preparing ' + queue.length + ' Academy lessons using the real SuperTechAi app.');
    const tts = await KokoroTTS.from_pretrained('onnx-community/Kokoro-82M-ONNX', { dtype: 'q8' });
    const runTag = (process.env.GITHUB_RUN_ID || String(Date.now())) + '-a' + (process.env.GITHUB_RUN_ATTEMPT || '1');
    for (const lesson of queue) {
      const dir = path.join(OUTPUT_DIR, lesson.id);
      await fs.mkdir(dir, { recursive: true });
      try {
        const scenes = makeScenes(lesson);
        const screenshots = await captureScreenshots(page, lesson, scenes, dir);
        const videoPath = await renderVideo(lesson, scenes, tts, dir);
        await publishLesson(accessToken, anonKey, storageClient, lesson, screenshots, videoPath, runTag);
        report.completed.push(lesson.id);
        console.log('Published ' + lesson.id + ' with ' + screenshots.length + ' real screen screenshots.');
      } catch (error) {
        report.failed.push({ lesson_id: lesson.id, reason: error instanceof Error ? error.message : String(error) });
        console.error('Failed lesson ' + lesson.id + ': ' + (error instanceof Error ? error.message : String(error)));
      }
    }
    await context.close();
  } finally {
    await browser.close();
  }
  report.finished_at = new Date().toISOString();
  await fs.writeFile('academy-worker-report.json', JSON.stringify(report, null, 2));
  console.log('Academy result: ' + report.completed.length + ' published, ' + report.failed.length + ' failed, ' + report.skipped.length + ' skipped.');
  if (report.failed.length) process.exitCode = 1;
}

main().catch((error) => {
  console.error('Academy worker stopped: ' + (error instanceof Error ? error.message : String(error)));
  process.exitCode = 1;
});
