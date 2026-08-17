package com.aicoding.plugin.services

import com.aicoding.plugin.services.MemoryConfigFile.string
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import java.io.File
import java.net.HttpURLConnection
import java.net.URL
import java.util.concurrent.atomic.AtomicBoolean

@Serializable
data class EmbeddingModelOption(
    val id: String,
    val name: String,
    val dimensions: Int,
    val contextTokens: Int,
    /** Measured size of the quantised ONNX weights on the mirror, in bytes. */
    val downloadBytes: Long,
    /** Resident-set growth once the runtime and weights are loaded, in bytes. */
    val residentBytes: Long,
    /** Resident-set growth after embedding a near-maximum-length input, in bytes. */
    val peakBytes: Long,
    val multilingual: Boolean,
    val note: String,
)

@Serializable
data class InstalledEmbeddingModel(
    val id: String,
    val bytes: Long,
    val complete: Boolean,
)

@Serializable
data class MemoryEmbeddingStatus(
    /** "local" runs ONNX in-process; "remote" calls an OpenAI-compatible /embeddings endpoint. */
    val mode: String,
    val localModel: String,
    val remoteBaseUrl: String = "",
    val remoteModel: String = "",
    /** Whether a key is stored. The key itself is never sent to the panel. */
    val remoteKeySet: Boolean = false,
    val options: List<EmbeddingModelOption> = emptyList(),
    val installed: List<InstalledEmbeddingModel> = emptyList(),
    val cacheDirectory: String = "",
    val cacheBytes: Long = 0,
    val downloading: Boolean = false,
    val downloadModel: String = "",
    val downloadReceived: Long = 0,
    val downloadTotal: Long = 0,
    val downloadError: String = "",
    /** The chat model used for auto-capture and profile learning — a different role entirely. */
    val textProvider: String = "",
    val textModel: String = "",
    val restartRequired: Boolean = false,
    val error: String = "",
)

@Serializable
data class MemoryEmbeddingRequest(
    val mode: String,
    val localModel: String = "",
    val remoteBaseUrl: String = "",
    val remoteModel: String = "",
    /** Absent or blank keeps whatever key is already stored. */
    val remoteApiKey: String? = null,
)

@Serializable
data class MemoryEmbeddingDownloadRequest(val model: String = "")

@Serializable
data class MemoryEmbeddingResponse(
    val success: Boolean,
    val status: MemoryEmbeddingStatus? = null,
    val message: String = "",
)

/**
 * Owns the embedding half of the memory engine: which vector model runs, whether it runs locally
 * or against a remote endpoint, and provisioning the local model files.
 *
 * Three facts about opencode-mem drive the whole design, all of them verified against the shipped
 * plugin rather than its docs:
 *
 *  1. It overrides the transformers cache to `{storagePath}/.cache` and never sets
 *     `localModelPath`, so model files only count when they sit under that directory as
 *     `<repo-id>/<file>`.
 *  2. It calls `pipeline()` without a `dtype`, so transformers asks for `onnx/model.onnx` and
 *     never `onnx/model_quantized.onnx`. There is no configuration knob for this.
 *  3. huggingface.co is unreachable from parts of the world where this plugin ships, and the
 *     resulting failure surfaces as "Unable to connect. Is the computer able to access the url?"
 *     on every memory call — which reads like a database fault, not a missing download.
 *
 * So the downloader fetches the *quantised* weights and stores them under the `model.onnx` name.
 * `dtype` only selects a filename; onnxruntime reads whatever graph the file actually contains, so
 * this is a legitimate substitution that costs roughly a quarter of the memory. The full-precision
 * weights are four times larger and made onnxruntime abort with `bad allocation` on a machine
 * sitting at 83% commit, which is an ordinary state for an IDE host.
 */
class MemoryEmbeddingService {
    companion object {
        const val DEFAULT_MODEL = "Xenova/nomic-embed-text-v1"

        /**
         * Mirrors are tried in order. hf-mirror.com comes first because the primary host times out
         * in the regions this plugin is used from; it is a read-only mirror of the same content.
         */
        private val HOSTS = listOf("https://hf-mirror.com", "https://huggingface.co")

        /** Optional files are skipped when the repository does not publish them. */
        private val REQUIRED_FILES = listOf("config.json", "tokenizer.json", "tokenizer_config.json")
        private val OPTIONAL_FILES = listOf("special_tokens_map.json")
        private const val WEIGHTS_SOURCE = "onnx/model_quantized.onnx"
        private const val WEIGHTS_TARGET = "onnx/model.onnx"

        /**
         * Every number here was measured, not estimated: download sizes are the mirror's real
         * content-length, and the two memory figures are resident-set growth observed while
         * loading each model and then embedding a near-maximum-length input.
         *
         * Memory deliberately is not derived from file size. The ratio between them ranges from
         * 2.7x to 14.4x across this list, because the dominant cost is the run workspace, which
         * scales with the context window rather than the weights. jina-v2-small-en is the case
         * that makes the point: a 31 MB download that peaks at 448 MB because it accepts 8192
         * tokens, where the 105 MB all-mpnet-base-v2 peaks at 284 MB on a 512-token window.
         */
        val CATALOG = listOf(
            EmbeddingModelOption(
                id = "Xenova/all-MiniLM-L6-v2",
                name = "all-MiniLM-L6-v2",
                dimensions = 384,
                contextTokens = 512,
                downloadBytes = 22_972_370,
                residentBytes = 108_226_150,
                peakBytes = 139_675_238,
                multilingual = false,
                note = "fastest",
            ),
            EmbeddingModelOption(
                id = "Xenova/jina-embeddings-v2-small-en",
                name = "jina-embeddings-v2-small-en",
                dimensions = 512,
                contextTokens = 8192,
                downloadBytes = 32_765_276,
                residentBytes = 123_100_365,
                peakBytes = 469_762_048,
                multilingual = false,
                note = "long-context-english",
            ),
            EmbeddingModelOption(
                id = "Xenova/all-mpnet-base-v2",
                name = "all-mpnet-base-v2",
                dimensions = 768,
                contextTokens = 512,
                downloadBytes = 110_086_122,
                residentBytes = 276_824_064,
                peakBytes = 297_898_803,
                multilingual = false,
                note = "quality-english",
            ),
            EmbeddingModelOption(
                id = "Xenova/jina-embeddings-v2-base-en",
                name = "jina-embeddings-v2-base-en",
                dimensions = 768,
                contextTokens = 8192,
                downloadBytes = 138_050_625,
                residentBytes = 334_361_395,
                peakBytes = 697_002_393,
                multilingual = false,
                note = "long-context-english",
            ),
            EmbeddingModelOption(
                id = DEFAULT_MODEL,
                name = "nomic-embed-text-v1",
                dimensions = 768,
                contextTokens = 8192,
                downloadBytes = 138_355_983,
                residentBytes = 345_284_608,
                peakBytes = 553_057_485,
                multilingual = true,
                note = "recommended",
            ),
        )
    }

    private val downloading = AtomicBoolean(false)

    @Volatile private var downloadModel: String = ""
    @Volatile private var downloadReceived: Long = 0
    @Volatile private var downloadTotal: Long = 0
    @Volatile private var downloadError: String = ""
    @Volatile private var restartRequired: Boolean = false

    fun status(): MemoryEmbeddingStatus {
        val config = MemoryConfigFile.load()
        val remoteUrl = config.string("embeddingApiUrl").orEmpty()
        val remoteKey = config.string("embeddingApiKey").orEmpty()
        val remote = remoteUrl.isNotBlank() && remoteKey.isNotBlank()
        val model = config.string("embeddingModel") ?: DEFAULT_MODEL
        val cache = cacheDirectory(config)
        return MemoryEmbeddingStatus(
            mode = if (remote) "remote" else "local",
            localModel = if (remote) DEFAULT_MODEL else model,
            remoteBaseUrl = remoteUrl,
            remoteModel = if (remote) model else "",
            remoteKeySet = remoteKey.isNotBlank(),
            options = CATALOG,
            installed = installedModels(cache),
            cacheDirectory = cache.absolutePath,
            cacheBytes = directorySize(cache),
            downloading = downloading.get(),
            downloadModel = downloadModel,
            downloadReceived = downloadReceived,
            downloadTotal = downloadTotal,
            downloadError = downloadError,
            textProvider = config.string("opencodeProvider") ?: config.string("memoryProvider").orEmpty(),
            textModel = config.string("opencodeModel") ?: config.string("memoryModel").orEmpty(),
            restartRequired = restartRequired,
        )
    }

    fun updateSettings(request: MemoryEmbeddingRequest): MemoryEmbeddingResponse {
        val root = MemoryConfigFile.load().toMutableMap()
        val previousModel = (root["embeddingModel"] as? JsonPrimitive)?.content ?: DEFAULT_MODEL
        if (request.mode == "remote") {
            val baseUrl = request.remoteBaseUrl.trim().trimEnd('/')
            val model = request.remoteModel.trim()
            if (baseUrl.isEmpty()) return MemoryEmbeddingResponse(false, status(), "embedding.error.baseUrlRequired")
            if (model.isEmpty()) return MemoryEmbeddingResponse(false, status(), "embedding.error.modelRequired")
            val key = request.remoteApiKey?.trim()
                ?.takeIf { it.isNotEmpty() }
                ?: (root["embeddingApiKey"] as? JsonPrimitive)?.content.orEmpty()
            if (key.isEmpty()) return MemoryEmbeddingResponse(false, status(), "embedding.error.keyRequired")
            root["embeddingApiUrl"] = JsonPrimitive(baseUrl)
            root["embeddingApiKey"] = JsonPrimitive(key)
            root["embeddingModel"] = JsonPrimitive(model)
        } else {
            val model = request.localModel.trim().ifEmpty { DEFAULT_MODEL }
            // opencode-mem selects the remote backend whenever both the URL and the key are set, so
            // dropping the URL alone would be enough to switch back to local. The key goes too:
            // keeping a secret in a plaintext config for a backend the user just turned off is the
            // worse trade, and the panel stops claiming a key is stored once it is gone.
            root.remove("embeddingApiUrl")
            root.remove("embeddingApiKey")
            root["embeddingModel"] = JsonPrimitive(model)
        }
        MemoryConfigFile.write(JsonObject(root))
        restartRequired = true
        val nextModel = (root["embeddingModel"] as? JsonPrimitive)?.content ?: DEFAULT_MODEL
        val changed = dimensionsOf(previousModel) != dimensionsOf(nextModel)
        return MemoryEmbeddingResponse(
            true,
            status(),
            if (changed) "embedding.saved.dimensionsChanged" else "embedding.saved",
        )
    }

    /** Starts a background download; the panel polls [status] for progress. */
    fun startDownload(modelId: String): MemoryEmbeddingResponse {
        val model = modelId.trim().ifEmpty { DEFAULT_MODEL }
        if (!downloading.compareAndSet(false, true)) {
            return MemoryEmbeddingResponse(false, status(), "embedding.error.downloadBusy")
        }
        downloadModel = model
        downloadReceived = 0
        downloadTotal = CATALOG.firstOrNull { it.id == model }?.downloadBytes ?: 0
        downloadError = ""
        Thread({
            runCatching { download(model) }
                .onFailure { downloadError = it.message ?: it.javaClass.simpleName }
                .onSuccess { restartRequired = true }
            downloading.set(false)
        }, "capybara-embedding-download").apply { isDaemon = true }.start()
        return MemoryEmbeddingResponse(true, status(), "embedding.download.started")
    }

    fun deleteModel(modelId: String): MemoryEmbeddingResponse {
        if (downloading.get()) return MemoryEmbeddingResponse(false, status(), "embedding.error.downloadBusy")
        val model = modelId.trim()
        if (model.isEmpty() || CATALOG.none { it.id == model }) {
            return MemoryEmbeddingResponse(false, status(), "embedding.error.notInstalled")
        }
        val cache = cacheDirectory(MemoryConfigFile.load()).canonicalFile
        val target = File(cache, model).canonicalFile
        if (target == cache || !target.toPath().startsWith(cache.toPath())) {
            return MemoryEmbeddingResponse(false, status(), "embedding.error.notInstalled")
        }
        if (!target.isDirectory) return MemoryEmbeddingResponse(false, status(), "embedding.error.notInstalled")
        val removed = runCatching { target.deleteRecursively() }.getOrDefault(false)
        return MemoryEmbeddingResponse(removed, status(), if (removed) "embedding.deleted" else "embedding.error.deleteFailed")
    }

    private fun download(model: String) {
        val cache = cacheDirectory(MemoryConfigFile.load())
        val root = File(cache, model)
        File(root, "onnx").mkdirs()
        REQUIRED_FILES.forEach { fetch(model, it, File(root, it), required = true) }
        OPTIONAL_FILES.forEach { fetch(model, it, File(root, it), required = false) }
        fetch(model, WEIGHTS_SOURCE, File(root, WEIGHTS_TARGET), required = true, track = true)
    }

    private fun fetch(model: String, remotePath: String, target: File, required: Boolean, track: Boolean = false) {
        var lastError: Exception? = null
        for (host in HOSTS) {
            val url = "$host/$model/resolve/main/$remotePath"
            try {
                val connection = (URL(url).openConnection() as HttpURLConnection).apply {
                    connectTimeout = 20_000
                    readTimeout = 120_000
                    instanceFollowRedirects = true
                    setRequestProperty("User-Agent", "capybara-ai-coding-assistant")
                }
                val status = connection.responseCode
                if (status == 404 && !required) {
                    connection.disconnect()
                    return
                }
                if (status !in 200..299) {
                    connection.disconnect()
                    lastError = IllegalStateException("HTTP $status for $remotePath")
                    continue
                }
                val expected = connection.contentLengthLong
                if (track && expected > 0) downloadTotal = expected
                target.parentFile?.mkdirs()
                // Written beside the target and renamed, so an interrupted download never leaves a
                // truncated file that transformers would happily try to load.
                val partial = File(target.parentFile, target.name + ".part")
                connection.inputStream.use { input ->
                    partial.outputStream().use { output ->
                        val buffer = ByteArray(1 shl 16)
                        var received = 0L
                        while (true) {
                            val read = input.read(buffer)
                            if (read <= 0) break
                            output.write(buffer, 0, read)
                            received += read
                            if (track) downloadReceived = received
                        }
                        if (expected > 0 && received != expected) {
                            throw IllegalStateException("truncated $remotePath: $received/$expected")
                        }
                    }
                }
                connection.disconnect()
                if (target.exists()) target.delete()
                if (!partial.renameTo(target)) throw IllegalStateException("cannot place $remotePath")
                return
            } catch (error: Exception) {
                lastError = error
                File(target.parentFile, target.name + ".part").delete()
            }
        }
        if (required) throw (lastError ?: IllegalStateException("cannot download $remotePath"))
    }

    private fun cacheDirectory(config: JsonObject): File {
        val storage = MemoryConfigFile.expandPath(config.string("storagePath") ?: "~/.opencode-mem/data")
        return File(storage, ".cache")
    }

    private fun installedModels(cache: File): List<InstalledEmbeddingModel> = CATALOG.mapNotNull { option ->
        val root = File(cache, option.id)
        if (!root.isDirectory) return@mapNotNull null
        val weights = File(root, WEIGHTS_TARGET)
        val complete = weights.isFile && REQUIRED_FILES.all { File(root, it).isFile }
        InstalledEmbeddingModel(option.id, directorySize(root), complete)
    }

    private fun directorySize(directory: File): Long {
        if (!directory.isDirectory) return 0
        return runCatching {
            directory.walkTopDown().filter { it.isFile }.sumOf { it.length() }
        }.getOrDefault(0)
    }

    private fun dimensionsOf(model: String): Int? = CATALOG.firstOrNull { it.id == model }?.dimensions
}
