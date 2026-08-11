/** English counterpart of [zhEmbedding]. Keys must stay in sync with it. */
export const enEmbedding = {
  "memEmb.title": "Vector model",
  "memEmb.subtitle":
    "Storing and searching memories both depend on this. Semantic search compares vectors, not keywords.",

  "memEmb.roles.title": "Two models, two different jobs",
  "memEmb.roles.vector": "Vector model",
  "memEmb.roles.vectorDesc":
    "Turns text into a fixed-length numeric vector. Memory cannot store or search without it, and a chat model cannot stand in — it returns text, not vectors.",
  "memEmb.roles.text": "Curation model",
  "memEmb.roles.textDesc":
    "An ordinary chat model, used only for automatic capture and profile learning. Without it you can still store and search by hand; nothing is distilled for you.",
  "memEmb.roles.current": "Current: {model}",
  "memEmb.roles.none": "Not configured",
  "memEmb.roles.textHint": "Set it under \"Memory curation model\" below.",

  "memEmb.mode.title": "How it runs",
  "memEmb.mode.local": "Locally",
  "memEmb.mode.localDesc":
    "Runs ONNX on this machine, fully offline, with no API cost. The model files have to be downloaded first.",
  "memEmb.mode.remote": "Remote endpoint",
  "memEmb.mode.remoteDesc":
    "Calls an OpenAI-compatible /embeddings endpoint. Uses no disk or memory, but every memory read and write makes an API call.",

  "memEmb.local.pick": "Choose a local model",
  "memEmb.local.dims": "{count} dims",
  "memEmb.local.context": "{count} context",
  "memEmb.local.multilingual": "Multilingual",
  "memEmb.local.englishOnly": "English-leaning",
  "memEmb.local.download": "Download",
  "memEmb.local.redownload": "Download again",
  "memEmb.local.installed": "Downloaded",
  "memEmb.local.incomplete": "Incomplete files",
  "memEmb.local.delete": "Delete local files",
  "memEmb.local.downloading": "Downloading {received} / {total}",
  "memEmb.local.downloadFailed": "Download failed: {error}",
  "memEmb.local.selected": "In use",
  "memEmb.local.notes.recommended": "Recommended",
  "memEmb.local.notes.fastest": "Fastest",
  "memEmb.local.notes.quality-english": "Best English quality",
  "memEmb.local.notes.long-context-english": "Long English text",

  "memEmb.footprint.title": "What it costs",
  "memEmb.footprint.disk": "Disk: about {size} for the selected model, under {path}",
  "memEmb.footprint.memory":
    "Memory: about {size}, loaded on the first search and then resident in the OpenCode process",
  "memEmb.footprint.quantized":
    "The download is the quantised weights, roughly a quarter of the full-precision size on both disk and memory. Full precision makes the ONNX runtime fail to allocate on a machine under memory pressure, and the quality difference does not matter for memory search.",
  "memEmb.footprint.mirror":
    "Some networks time out against huggingface.co, so downloads go through the hf-mirror.com mirror first and fall back to the official host.",
  "memEmb.footprint.cacheUsed": "The cache directory currently holds {size}.",

  "memEmb.remote.baseUrl": "Endpoint",
  "memEmb.remote.baseUrlPlaceholder": "https://api.openai.com/v1",
  "memEmb.remote.baseUrlHint": "OpenAI-compatible base URL. The plugin requests {path}.",
  "memEmb.remote.model": "Model name",
  "memEmb.remote.modelPlaceholder": "text-embedding-3-small",
  "memEmb.remote.key": "API key",
  "memEmb.remote.keyPlaceholder": "sk-…",
  "memEmb.remote.keyStored": "A key is stored. Leave empty to keep it.",
  "memEmb.remote.keyPrivacy": "The key is written to the local config file only and never sent back to this panel.",
  "memEmb.remote.hint":
    "Not every relay offers embedding models. A model_not_found reply means the account group has none configured.",

  "memEmb.save": "Save vector model settings",
  "memEmb.saving": "Saving…",
  "memEmb.reload": "Refresh",

  "embedding.saved": "Saved. Applies once OpenCode reloads.",
  "embedding.saved.dimensionsChanged":
    "Saved. The new model has different vector dimensions, so existing memories need re-embedding before they can be found.",
  "embedding.download.started": "Download started. You can leave this page; it continues in the background.",
  "embedding.deleted": "Local model files deleted.",
  "embedding.error.baseUrlRequired": "Enter the endpoint",
  "embedding.error.modelRequired": "Enter the model name",
  "embedding.error.keyRequired": "Enter the API key",
  "embedding.error.downloadBusy": "A download is already running",
  "embedding.error.notInstalled": "This model has no local files",
  "embedding.error.deleteFailed": "Cannot delete the local files",
} as const;
