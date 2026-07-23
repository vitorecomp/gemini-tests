# Project Notes

We are evaluating latency characteristics of Gemini across two serving
surfaces: the AI Studio (Generative Language) API and Vertex AI's global
endpoint. The hypothesis is that the global endpoint routes requests to the
nearest available region, which may reduce tail latency for multi-region
workloads, while AI Studio offers a simpler developer experience.

Key questions:

1. Is average latency meaningfully different between the two surfaces?
2. Does payload size (attached files) change the gap?
3. How stable are the numbers across runs at different times of day?
