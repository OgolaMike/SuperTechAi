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
  const script = scenes.map((scene) => scene.narration).join(' ');
  const audio = audioToWav(await tts.generate(script, { voice: 'af_heart' }));
  const audioPath = path.join(dir, 'narration.wav');
  await fs.writeFile(audioPath, audio.buffer);
  const weights = scenes.map((scene) => Math.max(8, scene.narration.split(/\s+/).length));
  const total = weights.reduce((sum, item) => sum + item, 0);
  const segments = [];
  for (let i = 0; i < scenes.length; i += 1) {
    const scene = scenes[i];
    const captionPath = path.join(dir, 'caption-' + i + '.txt');
    const headerPath = path.join(dir, 'header-' + i + '.txt');
    const segmentPath = path.join(dir, 'segment-' + String(i + 1).padStart(2, '0') + '.mp4');
    await fs.writeFile(captionPath, wrapCaption(scene.caption));
    await fs.writeFile(headerPath, 'SUPERTECHAI ACADEMY  |  ' + lesson.title.slice(0, 72));
    const duration = audio.duration * weights[i] / total + (i === scenes.length - 1 ? 0.6 : 0);
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
  if ((await fs.stat(finalPath)).size < 100_000) throw new Error('Generated video is unexpectedly small.');
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
