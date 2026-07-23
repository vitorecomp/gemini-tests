# AI Studio vs Vertex AI (global endpoint) latency benchmark

Sends the same prompt plus a series of files to Gemini through two backends of
the unified [`@google/genai`](https://www.npmjs.com/package/@google/genai) SDK:

- **AI Studio** — Generative Language API, authenticated with an API key
- **Vertex AI** — `location: 'global'` endpoint, authenticated with Application
  Default Credentials (ADC)

Runs are interleaved (AI Studio, Vertex, AI Studio, Vertex, ...) so network
drift affects both backends equally, with a discarded warmup call per backend.

## Environment variables

### Required

| Variable               | Description                                                                 |
| ---------------------- | --------------------------------------------------------------------------- |
| `GEMINI_API_KEY`       | AI Studio API key. Create one at <https://aistudio.google.com/apikey>.       |
| `GOOGLE_CLOUD_PROJECT` | GCP project ID with the Vertex AI API enabled (`aiplatform.googleapis.com`). |

### Vertex AI authentication (one of)

| Variable / method                | Description                                                                                     |
| -------------------------------- | ----------------------------------------------------------------------------------------------- |
| `gcloud auth application-default login` | Local runs: creates ADC at `~/.config/gcloud/application_default_credentials.json`.       |
| `GOOGLE_APPLICATION_CREDENTIALS` | Path to a service-account JSON key file (needs the `roles/aiplatform.user` role). Required form for Docker, where you mount the key/ADC file into the container. |

### Optional

| Variable       | Default            | Description                        |
| -------------- | ------------------ | ---------------------------------- |
| `GEMINI_MODEL` | `gemini-2.5-flash` | Model ID used on both backends     |
| `RUNS`         | `5`                | Timed runs per backend             |
| `WARMUP`       | `1`                | Discarded warmup calls per backend |

## Run locally

```bash
npm install

export GEMINI_API_KEY=your-key
export GOOGLE_CLOUD_PROJECT=your-project-id
gcloud auth application-default login   # if you haven't already

# Uses the files in ./sample-files
npm start

# Or pass your own files (text, markdown, csv, json, pdf, images)
node index.js ../../README.md ./report.pdf ./diagram.png
```

## Run with Docker

```bash
docker build -t gemini-latency-bench .

# Using local ADC (created by `gcloud auth application-default login`)
docker run --rm \
  -e GEMINI_API_KEY=your-key \
  -e GOOGLE_CLOUD_PROJECT=your-project-id \
  -e GOOGLE_APPLICATION_CREDENTIALS=/gcp/adc.json \
  -v ~/.config/gcloud/application_default_credentials.json:/gcp/adc.json:ro \
  gemini-latency-bench

# Or using a service-account key file
docker run --rm \
  -e GEMINI_API_KEY=your-key \
  -e GOOGLE_CLOUD_PROJECT=your-project-id \
  -e GOOGLE_APPLICATION_CREDENTIALS=/gcp/sa-key.json \
  -v /path/to/sa-key.json:/gcp/sa-key.json:ro \
  gemini-latency-bench

# Benchmark your own files by mounting them and passing paths as arguments
docker run --rm \
  -e GEMINI_API_KEY=your-key \
  -e GOOGLE_CLOUD_PROJECT=your-project-id \
  -e GOOGLE_APPLICATION_CREDENTIALS=/gcp/adc.json \
  -v ~/.config/gcloud/application_default_credentials.json:/gcp/adc.json:ro \
  -v /path/to/my-files:/data:ro \
  gemini-latency-bench /data/report.pdf /data/notes.md
```

The image bundles `./sample-files`, so running it with no arguments works out
of the box.

## Example output

```
Model:   gemini-2.5-flash
Files:   config.json, inventory.csv, notes.md (~2.1 KB payload)
Runs:    5 per backend (+1 warmup)

run  1   AI Studio            ... 1843 ms (412 chars out)
run  1   Vertex AI (global)   ... 1610 ms (398 chars out)
...

=== Results ===
AI Studio            avg 1795 ms | median 1782 ms | min 1650 ms | max 1990 ms
Vertex AI (global)   avg 1633 ms | median 1620 ms | min 1544 ms | max 1751 ms

Vertex AI (global) was faster by 162 ms on average (9.0% vs AI Studio).
```

Note: generation length varies between calls, which adds noise to total
latency. Increase `RUNS` for more stable numbers.
