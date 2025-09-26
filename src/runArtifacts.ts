// src/runArtifacts.ts
import { Browser, BrowserContext, Page } from 'playwright';
import { promises as fs } from 'fs';
import path from 'path';

type RunCtx = {
  context: BrowserContext;
  page: Page;
  baseDir: string;
  videoPath?: string;
  harPath: string;
  tracePath: string;
};

export async function startRun(browser: Browser, projectId: string, runId: string): Promise<RunCtx> {
  const baseDir = `/data/${projectId}/${runId}`;
  await fs.mkdir(baseDir, { recursive: true });

  const context = await browser.newContext({
    recordVideo: { dir: baseDir, size: { width: 1280, height: 720 } },
    recordHar: { path: path.join(baseDir, 'network.har') },
  });

  await context.tracing.start({ screenshots: true, snapshots: true });

  const page = await context.newPage();
  return { context, page, baseDir, harPath: path.join(baseDir, 'network.har'), tracePath: path.join(baseDir, 'trace.zip') };
}

export async function finishRun(rc: RunCtx) {
  try {
    // Получим путь к видео до закрытия контекста (объект Video ещё доступен):
    const v = rc.page.video();
    if (v) {
      const raw = await v.path(); // путь временного файла
      const target = path.join(rc.baseDir, 'video.webm');
      await fs.rename(raw, target).catch(async () => {
        // fallback: если файл уже финализировался после close() — оставим как есть
        await fs.copyFile(raw, target).catch(() => {});
      });
      rc.videoPath = target;
    }
  } catch {}
  await rc.context.tracing.stop({ path: rc.tracePath });
  await rc.context.close();

  return {
    videoPath: rc.videoPath,
    harPath: rc.harPath,
    tracePath: rc.tracePath,
    publicVideoUrl: rc.videoPath?.replace('/data/', 'https://videos.qabot.app/'),
    publicHarUrl: rc.harPath.replace('/data/', 'https://videos.qabot.app/'),
    publicTraceUrl: rc.tracePath.replace('/data/', 'https://videos.qabot.app/'),
  };
}
