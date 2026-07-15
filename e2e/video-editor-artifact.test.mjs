import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import test from 'node:test';

import { chromium } from 'playwright';

const repositoryRoot = resolve(import.meta.dirname, '..');
const cliEntry = resolve(repositoryRoot, 'apps/cli/dist/cli/index.js');
const artifactRoot = resolve(repositoryRoot, 'packages/artifact-video-editor');

function buildCli() {
  const result = spawnSync('npm', ['run', 'build', '--workspace', '@open-artifacts/cli'], {
    cwd: repositoryRoot,
    encoding: 'utf8',
  });

  assert.equal(result.status, 0, result.stderr || result.stdout);
}

function runCli(arguments_, home) {
  return spawnSync(process.execPath, [cliEntry, ...arguments_], {
    cwd: repositoryRoot,
    encoding: 'utf8',
    env: { ...process.env, HOME: home },
    timeout: 30_000,
  });
}

async function stopSession(home, sessionId) {
  const sessionDirectory = join(home, '.open-artifacts', 'sessions', sessionId);
  const record = JSON.parse(await readFile(join(sessionDirectory, 'record.json'), 'utf8'));

  try {
    process.kill(record.pid, 'SIGTERM');
  } catch (error) {
    if (error.code !== 'ESRCH') throw error;
  }

  await rm(sessionDirectory, { force: true, recursive: true });
}

test('oa serves a collaborative and synchronized Video Editor Artifact', async (t) => {
  buildCli();
  const home = await mkdtemp(join(tmpdir(), 'open-artifacts-video-editor-'));
  let browser;
  let sessionId;

  t.after(async () => {
    await browser?.close();
    if (sessionId) await stopSession(home, sessionId);
    await rm(home, { force: true, recursive: true });
  });

  const result = runCli(['run', artifactRoot, '--json', '--no-open'], home);
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const session = JSON.parse(result.stdout);
  sessionId = session.sessionId;

  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1080, height: 680 } });
  await page.goto(session.url);

  const editorBounds = await page.getByRole('main').boundingBox();
  assert.equal(editorBounds?.width, 1080);
  assert.equal(editorBounds?.height, 680);
  assert.deepEqual(
    await page.locator('html').evaluate((element) => ({
      horizontal: element.scrollWidth > element.clientWidth,
      vertical: element.scrollHeight > element.clientHeight,
    })),
    { horizontal: false, vertical: false },
  );

  for (const surface of [
    'project-bar',
    'agent-surface',
    'media-library',
    'preview-surface',
    'timeline-surface',
  ]) {
    await page.getByTestId(surface).waitFor({ state: 'visible' });
  }

  for (const locator of [
    page.getByTestId('project-bar'),
    page.getByTestId('agent-surface'),
    page.getByTestId('media-library'),
    page.getByTestId('preview-surface'),
    page.getByTestId('timeline-surface'),
    page.getByRole('button', { name: 'Export draft' }),
    page.getByRole('button', { name: 'Apply brief' }),
    page.getByRole('button', { name: 'Play preview' }),
    page.getByTestId('timeline-clip-demo-video'),
  ]) {
    await assertWithinViewport(locator, { width: 1080, height: 680 });
  }

  const mediaCard = page.getByTestId('media-card-demo-video');
  const timelineClip = page.getByTestId('timeline-clip-demo-video');
  await mediaCard.click();
  await assertSelected(mediaCard, true);
  await assertSelected(timelineClip, true);

  await page.reload();
  await assertSelected(mediaCard, false);
  await timelineClip.click();
  await assertSelected(timelineClip, true);
  await assertSelected(mediaCard, true);

  const video = page.getByTestId('preview-video');
  const playToggle = page.getByRole('button', { name: 'Play preview' });
  await playToggle.click();
  const playbackDeadline = Date.now() + 5_000;
  let playbackTime = 0;
  while (Date.now() < playbackDeadline) {
    playbackTime = await video.evaluate((element) => element.currentTime);
    if (playbackTime > 0.1) break;
    await delay(50);
  }
  assert.ok(playbackTime > 0.1, `playback did not advance: currentTime=${playbackTime}`);
  assert.equal(await video.evaluate((element) => element.paused), false);

  await page.getByRole('button', { name: 'Pause preview' }).click();
  assert.equal(await video.evaluate((element) => element.paused), true);

  const scrubber = page.getByRole('slider', { name: 'Timeline scrubber' });
  await scrubber.fill('0.75');
  const scrubbedTime = await video.evaluate((element) => element.currentTime);
  assert.ok(scrubbedTime >= 0.65 && scrubbedTime <= 0.85, `currentTime=${scrubbedTime}`);
  assert.equal(await page.getByTestId('timeline-time').getAttribute('data-time'), '0.75');
  const playheadPercent = await page
    .getByTestId('timeline-playhead')
    .evaluate((element) => Number.parseFloat(element.style.left));
  assert.ok(playheadPercent >= 45 && playheadPercent <= 60, `left=${playheadPercent}%`);

  const previewFrame = page.getByTestId('preview-frame');
  assert.equal(await previewFrame.getAttribute('data-aspect-ratio'), '16:9');
  await assertAspectRatio(previewFrame, 16 / 9, 'landscape');

  const applyBrief = page.getByRole('button', { name: 'Apply brief' });
  assert.equal(await applyBrief.isDisabled(), true);

  await page.getByRole('checkbox', { name: 'Tighten pacing' }).uncheck();
  await page.getByRole('checkbox', { name: 'Captions' }).check();
  await page.getByRole('checkbox', { name: 'Music bed' }).check();
  await page.getByLabel('Target platform').selectOption('tiktok');
  await page.getByLabel('Aspect ratio').selectOption('9:16');
  assert.equal(await applyBrief.isDisabled(), false);
  await applyBrief.click();

  assert.equal(await page.getByTestId('project-status').textContent(), 'Unexported changes');
  assert.equal(await previewFrame.getAttribute('data-aspect-ratio'), '9:16');
  assert.equal(
    await previewFrame.evaluate(
      (element) => element.ownerDocument.defaultView?.getComputedStyle(element).aspectRatio,
    ),
    '9 / 16',
  );
  await assertAspectRatio(previewFrame, 9 / 16, 'portrait');

  const summaries = page.getByTestId('conversation-summary');
  assert.equal(await summaries.count(), 1);
  assert.equal(await applyBrief.isDisabled(), true);
  await summaries.nth(0).getByText('Captions, Music bed', { exact: true }).waitFor();
  await summaries.nth(0).getByText('TikTok · 9:16', { exact: true }).waitFor();

  const treatmentTracks = page.getByTestId('treatment-tracks');
  assert.deepEqual(await treatmentTracks.getByRole('listitem').allTextContents(), [
    'Captions',
    'Music bed',
  ]);

  await page.getByRole('checkbox', { name: 'Captions' }).uncheck();
  await page.getByLabel('Target platform').selectOption('instagram-reels');
  await page.getByLabel('Aspect ratio').selectOption('1:1');
  assert.equal(await applyBrief.isDisabled(), false);
  await applyBrief.click();

  assert.equal(await summaries.count(), 2);
  assert.deepEqual(await treatmentTracks.getByRole('listitem').allTextContents(), ['Music bed']);
  assert.equal(await previewFrame.getAttribute('data-aspect-ratio'), '1:1');
  await assertAspectRatio(previewFrame, 1, 'square');
  assert.equal(await applyBrief.isDisabled(), true);

  const exportDraft = page.getByRole('button', { name: 'Export draft' });
  await exportDraft.focus();
  await exportDraft.click();
  const exportSummary = page.getByRole('dialog', { name: 'Export summary' });
  await exportSummary.getByText('Simulation only', { exact: true }).waitFor();
  await exportSummary.getByText('Instagram Reels · 1:1', { exact: true }).waitFor();
  await exportSummary.getByText('Music bed', { exact: true }).waitFor();
  assert.equal(await page.getByTestId('project-status').textContent(), 'Unexported changes');
  assert.equal(await exportSummary.evaluate((element) => element.localName), 'dialog');
  assert.equal(await exportSummary.evaluate((element) => element.matches(':modal')), true);
  await page.keyboard.press('Escape');
  await exportSummary.waitFor({ state: 'hidden' });
  assert.equal(
    await exportDraft.evaluate((element) => element === element.ownerDocument.activeElement),
    true,
  );

  await page.reload();
  assert.equal(await page.getByTestId('project-status').textContent(), 'All changes local');
  assert.equal(await page.getByTestId('conversation-summary').count(), 0);
  assert.equal(await page.getByTestId('preview-frame').getAttribute('data-aspect-ratio'), '16:9');
  assert.deepEqual(
    await page.getByTestId('treatment-tracks').getByRole('listitem').allTextContents(),
    ['Tighten pacing'],
  );
  assert.equal(await page.getByRole('dialog', { name: 'Export summary' }).count(), 0);

  await page.setViewportSize({ width: 1440, height: 900 });
  assert.deepEqual(await page.getByRole('main').evaluate(measureElement), {
    clientHeight: 900,
    clientWidth: 1440,
    scrollHeight: 900,
    scrollWidth: 1440,
  });
});

async function assertSelected(locator, expected) {
  assert.equal(await locator.getAttribute('aria-selected'), String(expected));
  assert.equal((await locator.getAttribute('class')).includes('is-selected'), expected);
}

async function assertAspectRatio(locator, expected, label) {
  const bounds = await locator.boundingBox();
  assert.ok(bounds, `${label} preview frame is visible`);
  assert.ok(
    Math.abs(bounds.width / bounds.height - expected) < 0.02,
    `${label} frame=${bounds.width}x${bounds.height}`,
  );
}

async function assertWithinViewport(locator, viewport) {
  const bounds = await locator.boundingBox();
  const description = await locator.evaluate(
    (element) =>
      element.getAttribute('data-testid') ??
      element.getAttribute('aria-label') ??
      element.textContent,
  );
  assert.ok(bounds, 'key editor element is visible');
  assert.ok(bounds.x >= 0, `${description} starts left of viewport: x=${bounds.x}`);
  assert.ok(bounds.y >= 0, `${description} starts above viewport: y=${bounds.y}`);
  assert.ok(
    bounds.x + bounds.width <= viewport.width,
    `${description} extends beyond viewport width`,
  );
  assert.ok(
    bounds.y + bounds.height <= viewport.height,
    `${description} extends beyond viewport height: bottom=${bounds.y + bounds.height}`,
  );
}

function measureElement(element) {
  return {
    clientHeight: element.clientHeight,
    clientWidth: element.clientWidth,
    scrollHeight: element.scrollHeight,
    scrollWidth: element.scrollWidth,
  };
}
