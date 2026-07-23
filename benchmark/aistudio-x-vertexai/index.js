/**
 * Latency benchmark: Gemini via AI Studio vs Vertex AI (global endpoint).
 *
 * Sends the same prompt + set of files to both backends using the unified
 * @google/genai SDK, alternating between them each run so network conditions
 * affect both equally, then reports per-backend stats and the difference.
 *
 * Usage:
 *   GEMINI_API_KEY=...  GOOGLE_CLOUD_PROJECT=...  node index.js [file1 file2 ...]
 *
 * Env vars:
 *   GEMINI_API_KEY        - AI Studio API key (https://aistudio.google.com/apikey)
 *   GOOGLE_CLOUD_PROJECT  - GCP project for Vertex AI (auth via ADC:
 *                           `gcloud auth application-default login`)
 *   GEMINI_MODEL          - model id (default: gemini-2.5-flash)
 *   RUNS                  - timed runs per backend (default: 5)
 *   WARMUP                - untimed warmup calls per backend (default: 1)
 *
 * If no files are given, every file in ./sample-files is attached.
 */

import { GoogleGenAI } from '@google/genai';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { performance } from 'node:perf_hooks';

const MODEL = process.env.GEMINI_MODEL ?? 'gemini-2.5-flash';
const RUNS = Number(process.env.RUNS ?? 5);
const WARMUP = Number(process.env.WARMUP ?? 1);
const PROMPT = 'Summarize the attached files in one short paragraph.';

const MIME_TYPES = {
  '.txt': 'text/plain',
  '.md': 'text/markdown',
  '.csv': 'text/csv',
  '.html': 'text/html',
  '.json': 'application/json',
  '.pdf': 'application/pdf',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
};

async function resolveFiles(argv) {
  if (argv.length > 0) return argv;
  const sampleDir = path.join(path.dirname(fileURLToPath(import.meta.url)), 'sample-files');
  const entries = await readdir(sampleDir);
  if (entries.length === 0) throw new Error('No files given and sample-files/ is empty.');
  return entries.map((name) => path.join(sampleDir, name));
}

async function buildParts(files) {
  const parts = [{ text: PROMPT }];
  for (const file of files) {
    const ext = path.extname(file).toLowerCase();
    const mimeType = MIME_TYPES[ext] ?? 'text/plain';
    const data = await readFile(file);
    if (mimeType.startsWith('text/') || mimeType === 'application/json') {
      parts.push({ text: `\n--- ${path.basename(file)} ---\n${data.toString('utf8')}` });
    } else {
      parts.push({ inlineData: { mimeType, data: data.toString('base64') } });
    }
  }
  return parts;
}

async function timedCall(client, parts) {
  const start = performance.now();
  const response = await client.models.generateContent({
    model: MODEL,
    contents: [{ role: 'user', parts }],
  });
  const ms = performance.now() - start;
  return { ms, outputChars: (response.text ?? '').length };
}

function stats(timings) {
  const sorted = [...timings].sort((a, b) => a - b);
  const avg = sorted.reduce((sum, t) => sum + t, 0) / sorted.length;
  const median = sorted[Math.floor(sorted.length / 2)];
  return { avg, median, min: sorted[0], max: sorted[sorted.length - 1] };
}

const fmt = (ms) => `${ms.toFixed(0)} ms`;

async function main() {
  const backends = [];

  if (process.env.GEMINI_API_KEY) {
    backends.push({
      name: 'AI Studio',
      client: new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY }),
      timings: [],
    });
  }
  if (process.env.GOOGLE_CLOUD_PROJECT) {
    backends.push({
      name: 'Vertex AI (global)',
      client: new GoogleGenAI({
        vertexai: true,
        project: process.env.GOOGLE_CLOUD_PROJECT,
        location: 'global',
      }),
      timings: [],
    });
  }

  if (backends.length < 2) {
    console.error(
      'Set both GEMINI_API_KEY (AI Studio) and GOOGLE_CLOUD_PROJECT (Vertex AI, ' +
        'authenticated via `gcloud auth application-default login`) to compare backends.',
    );
    process.exit(1);
  }

  const files = await resolveFiles(process.argv.slice(2));
  const parts = await buildParts(files);
  const payloadKb = Buffer.byteLength(JSON.stringify(parts)) / 1024;

  console.log(`Model:   ${MODEL}`);
  console.log(`Files:   ${files.map((f) => path.basename(f)).join(', ')} (~${payloadKb.toFixed(1)} KB payload)`);
  console.log(`Runs:    ${RUNS} per backend (+${WARMUP} warmup)\n`);

  for (const backend of backends) {
    for (let i = 0; i < WARMUP; i++) {
      process.stdout.write(`warmup   ${backend.name.padEnd(20)} ... `);
      const { ms } = await timedCall(backend.client, parts);
      console.log(`${fmt(ms)} (discarded)`);
    }
  }

  // Alternate backends each run so network drift affects both equally.
  for (let run = 1; run <= RUNS; run++) {
    for (const backend of backends) {
      process.stdout.write(`run ${String(run).padStart(2)}   ${backend.name.padEnd(20)} ... `);
      const { ms, outputChars } = await timedCall(backend.client, parts);
      backend.timings.push(ms);
      console.log(`${fmt(ms)} (${outputChars} chars out)`);
    }
  }

  console.log('\n=== Results ===');
  for (const backend of backends) {
    const s = stats(backend.timings);
    console.log(
      `${backend.name.padEnd(20)} avg ${fmt(s.avg)} | median ${fmt(s.median)} | ` +
        `min ${fmt(s.min)} | max ${fmt(s.max)}`,
    );
  }

  const [a, b] = backends;
  const diff = stats(a.timings).avg - stats(b.timings).avg;
  const faster = diff > 0 ? b : a;
  const slower = diff > 0 ? a : b;
  const pct = (Math.abs(diff) / stats(slower.timings).avg) * 100;
  console.log(
    `\n${faster.name} was faster by ${fmt(Math.abs(diff))} on average (${pct.toFixed(1)}% vs ${slower.name}).`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
