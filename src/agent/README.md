# Jersey design Agent

The jersey design endpoint now uses a LangGraph tool-calling loop with Zhipu GLM as its primary reasoning model.

## Environment

Required for the real Agent path:

```dotenv
ZHIPUAI_API_KEY=your-zhipu-api-key
ZHIPU_MODEL=your-enabled-glm-model
ZHIPU_BASE_URL=https://open.bigmodel.cn/api/paas/v4
```

Set `ZHIPU_MODEL` to the exact model identifier enabled for your BigModel account. The selected model must support OpenAI-compatible function/tool calling.

Gemini remains a separate image-generation provider for the existing logo, SVG and model-preview features:

```dotenv
GEMINI_API_KEY=your-gemini-api-key
GEMINI_TEXT_MODEL=gemini-3.1-flash-lite
GEMINI_IMAGE_MODEL=gemini-2.5-flash-image
GEMINI_API_BASE=https://generativelanguage.googleapis.com/v1beta
```

## Current graph

```text
START
  |
  v
agent (Zhipu GLM + LangChain tools)
  |
  +---- no tool calls ----> END
  |
  +---- tool calls -------> tools (Zod validation + backend execution)
                              |
                              +------> agent
```

The first registered tools inspect the actual SVG boundary and validate candidate image placement. Tool failures are returned to the model as tool messages so it can adjust its next action.

## Conversation state

The optional `conversationId` field on `POST /ai/design` selects a LangGraph thread scoped to the authenticated user. Reuse the same ID to continue a design conversation.

The current checkpointer is `MemorySaver`, intended for local development. It loses state on process restart and is not shared across multiple backend instances. Replace it with a durable PostgreSQL checkpointer before production deployment.

## Install

After pulling the branch, run `npm install` to install the new LangChain dependencies and regenerate `package-lock.json`.

## Image generation providers

Text-to-image requests (such as standalone badge images) use the provider selected by `IMAGE_GENERATION_PROVIDER`:

- `gemini` (default): uses `GEMINI_API_KEY` and `GEMINI_IMAGE_MODEL`.
- `comfyui`: submits an API-format workflow to a local or remote ComfyUI server.

Example ComfyUI configuration:

```dotenv
IMAGE_GENERATION_PROVIDER=comfyui
COMFYUI_BASE_URL=http://127.0.0.1:8188
COMFYUI_WORKFLOW_PATH=./workflows/jersey-badge-api.json
COMFYUI_PROMPT_NODE_ID=6
COMFYUI_PROMPT_INPUT=text
COMFYUI_NEGATIVE_PROMPT_NODE_ID=7
COMFYUI_NEGATIVE_PROMPT_INPUT=text
COMFYUI_SEED_NODE_ID=3
COMFYUI_SEED_INPUT=seed
COMFYUI_OUTPUT_NODE_ID=9
COMFYUI_MAX_IMAGE_DIMENSION=1024
COMFYUI_TIMEOUT_MS=180000
```

Export the workflow from ComfyUI in **API format**, place the JSON file at the configured path, and set node IDs/input names to match that workflow. The positive prompt node is required. Negative prompt, seed, width, height, and output node settings are optional. Keep the workflow server-side; do not accept arbitrary workflow JSON from end users or the LLM.
