package com.aicoding.plugin.services

import com.intellij.ide.ActivityTracker
import com.intellij.ide.plugins.PluginManagerCore
import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.extensions.PluginId
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import java.net.URI
import java.net.http.HttpClient
import java.net.http.HttpRequest
import java.net.http.HttpResponse
import java.time.Duration
import java.util.concurrent.CompletableFuture
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit

@Serializable
data class PluginUpdateStatus(
    val hasUpdate: Boolean = false,
    val currentVersion: String = "",
    val latestVersion: String = "",
    val downloadUrl: String = "",
    /** True when the check itself could not run — offline, blocked, or rate limited. */
    val unavailable: Boolean = true,
)

@Serializable
private data class ReleaseResponse(val tag_name: String? = null, val html_url: String? = null)

private enum class ReleaseSource(val api: String, val releases: String) {
    GITEE(
        "https://gitee.com/api/v5/repos/qianguanshui/capybaraAICodingAssistant/releases/latest",
        "https://gitee.com/qianguanshui/capybaraAICodingAssistant/releases",
    ),
    GITHUB(
        "https://api.github.com/repos/Assassin-Q/capybaraAICodingAssistant/releases/latest",
        "https://github.com/Assassin-Q/capybaraAICodingAssistant/releases",
    );

    companion object {
        fun forLanguage(language: String): ReleaseSource =
            if (language.trim().lowercase().startsWith("zh")) GITEE else GITHUB
    }
}

private data class CachedRelease(val checkedAt: Long, val status: PluginUpdateStatus)

/** Checks the locale-appropriate release mirror and exposes a non-blocking cached result to IDEA. */
class PluginUpdateService {
    companion object {
        private const val PLUGIN_ID = "com.aicoding.ai-coding-plugin"
        private const val CACHE_TTL_MS = 30 * 60 * 1000L

        val instance: PluginUpdateService by lazy { PluginUpdateService() }
    }

    private val json = Json { ignoreUnknownKeys = true; encodeDefaults = true }
    private val httpClient: HttpClient = HttpClient.newBuilder()
        .connectTimeout(Duration.ofSeconds(8))
        .followRedirects(HttpClient.Redirect.NORMAL)
        .proxy(java.net.ProxySelector.getDefault())
        .build()
    private val executor = Executors.newSingleThreadExecutor { task ->
        Thread(task, "capybara-update-check").apply { isDaemon = true }
    }
    private val cached = ConcurrentHashMap<ReleaseSource, CachedRelease>()
    private val inFlight = ConcurrentHashMap<ReleaseSource, CompletableFuture<PluginUpdateStatus>>()
    @Volatile private var latestStatus: PluginUpdateStatus? = null

    private val currentVersion: String
        get() = PluginManagerCore.getPlugin(PluginId.getId(PLUGIN_ID))?.version.orEmpty()

    /** The last answer requested by the panel. Never blocks, so title actions can call it safely. */
    fun cachedStatus(): PluginUpdateStatus = latestStatus
        ?: PluginUpdateStatus(currentVersion = currentVersion, latestVersion = currentVersion)

    /** The HTTP route runs off the IDEA UI thread and may wait for the shared request. */
    fun statusForClient(language: String, force: Boolean = false): PluginUpdateStatus {
        val source = ReleaseSource.forLanguage(language)
        val current = cached[source]
        if (!force && current != null && System.currentTimeMillis() - current.checkedAt < CACHE_TTL_MS) {
            latestStatus = current.status
            return current.status
        }
        return runCatching { refresh(source).get(12, TimeUnit.SECONDS) }
            .getOrElse { current?.status ?: cachedStatus() }
    }

    /** Concurrent callers for the same mirror share one network request. */
    private fun refresh(source: ReleaseSource): CompletableFuture<PluginUpdateStatus> = synchronized(inFlight) {
        inFlight[source]?.takeUnless { it.isDone }?.let { return@synchronized it }
        CompletableFuture.supplyAsync({ fetchStatus(source) }, executor).also { future ->
            inFlight[source] = future
            future.thenAccept { result ->
                cached[source] = CachedRelease(System.currentTimeMillis(), result)
                latestStatus = result
                inFlight.remove(source, future)
                ApplicationManager.getApplication().invokeLater { ActivityTracker.getInstance().inc() }
            }
        }
    }

    private fun fetchStatus(source: ReleaseSource): PluginUpdateStatus {
        val version = currentVersion
        return runCatching {
            val response = httpClient.send(
                HttpRequest.newBuilder(URI.create(source.api))
                    .header("Accept", "application/json")
                    .header("User-Agent", "capybara-ai-coding-assistant")
                    .timeout(Duration.ofSeconds(10))
                    .GET()
                    .build(),
                HttpResponse.BodyHandlers.ofString(Charsets.UTF_8),
            )
            require(response.statusCode() in 200..299) { "HTTP ${response.statusCode()}" }
            val release = json.decodeFromString<ReleaseResponse>(response.body())
            val latest = release.tag_name.orEmpty().removePrefix("v").removePrefix("V")
            require(latest.isNotBlank()) { "no tag" }
            PluginUpdateStatus(
                currentVersion = version,
                downloadUrl = release.html_url?.ifBlank { null } ?: source.releases,
                hasUpdate = compareVersions(latest, version) > 0,
                latestVersion = latest,
                unavailable = false,
            )
        }.getOrElse {
            PluginUpdateStatus(currentVersion = version, latestVersion = version, unavailable = true)
        }
    }

    /** Numeric per segment, so 3.10.0 sorts above 3.9.0 rather than below it. */
    internal fun compareVersions(left: String, right: String): Int {
        val a = left.split(".").map { it.takeWhile(Char::isDigit).toIntOrNull() ?: 0 }
        val b = right.split(".").map { it.takeWhile(Char::isDigit).toIntOrNull() ?: 0 }
        for (index in 0 until maxOf(a.size, b.size)) {
            val diff = (a.getOrNull(index) ?: 0) - (b.getOrNull(index) ?: 0)
            if (diff != 0) return diff
        }
        return 0
    }
}
