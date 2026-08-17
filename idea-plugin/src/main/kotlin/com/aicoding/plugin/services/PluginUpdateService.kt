package com.aicoding.plugin.services

import com.intellij.ide.plugins.PluginManagerCore
import com.intellij.ide.ActivityTracker
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
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit

@Serializable
data class PluginUpdateStatus(
    val hasUpdate: Boolean = false,
    val currentVersion: String = "",
    val latestVersion: String = "",
    val downloadUrl: String = "",
    /** True when the check itself could not run — offline, blocked, rate limited. */
    val unavailable: Boolean = true,
)

@Serializable
private data class GiteeRelease(val tag_name: String? = null, val html_url: String? = null)

/**
 * Checks Gitee for a newer release, and caches the answer.
 *
 * This lives in the plugin rather than the panel because the tool-window title action needs it:
 * `AnAction.update` runs on every toolbar refresh and must not touch the network, so it can only
 * read a value someone else has already fetched. Keeping the check here means the icon and the
 * panel report the same thing instead of each asking Gitee on its own schedule.
 */
class PluginUpdateService {
    companion object {
        private const val PLUGIN_ID = "com.aicoding.ai-coding-plugin"
        private const val REPO = "qianguanshui/capybaraAICodingAssistant"
        private const val API = "https://gitee.com/api/v5/repos/$REPO/releases/latest"
        private const val RELEASES = "https://gitee.com/$REPO/releases"
        private const val CACHE_TTL_MS = 6 * 60 * 60 * 1000L

        val instance: PluginUpdateService by lazy { PluginUpdateService() }
    }

    private val json = Json { ignoreUnknownKeys = true; encodeDefaults = true }
    private val httpClient: HttpClient = HttpClient.newBuilder()
        .connectTimeout(Duration.ofSeconds(8))
        .followRedirects(HttpClient.Redirect.NORMAL)
        .build()
    private val executor = Executors.newSingleThreadExecutor { task ->
        Thread(task, "capybara-update-check").apply { isDaemon = true }
    }

    @Volatile private var cached: PluginUpdateStatus? = null
    @Volatile private var checkedAt: Long = 0
    @Volatile private var inFlight: CompletableFuture<PluginUpdateStatus>? = null

    private val currentVersion: String
        get() = PluginManagerCore.getPlugin(PluginId.getId(PLUGIN_ID))?.version.orEmpty()

    /** The last known answer. Never blocks, so it is safe to call from `AnAction.update`. */
    fun cachedStatus(): PluginUpdateStatus =
        cached ?: PluginUpdateStatus(currentVersion = currentVersion, latestVersion = currentVersion)

    /** Fetches when the cache is cold or stale; returns the cached value either way. */
    fun status(force: Boolean = false): PluginUpdateStatus {
        val now = System.currentTimeMillis()
        val stale = cached == null || now - checkedAt > CACHE_TTL_MS
        if (force || stale) refresh()
        return cachedStatus()
    }

    /** The HTTP route may wait because it already runs off the IDEA UI thread. */
    fun statusForClient(): PluginUpdateStatus {
        val fresh = cached?.takeIf { System.currentTimeMillis() - checkedAt <= CACHE_TTL_MS }
        if (fresh != null) return fresh
        return runCatching { refresh().get(12, TimeUnit.SECONDS) }.getOrElse { cachedStatus() }
    }

    /** Refreshes off the calling thread; concurrent callers share one request. */
    @Synchronized
    fun refresh(): CompletableFuture<PluginUpdateStatus> {
        inFlight?.takeUnless { it.isDone }?.let { return it }
        val future = CompletableFuture.supplyAsync(::fetchStatus, executor)
        inFlight = future
        future.thenAccept { result ->
            cached = result
            checkedAt = System.currentTimeMillis()
            ApplicationManager.getApplication().invokeLater {
                ActivityTracker.getInstance().inc()
            }
        }
        return future
    }

    private fun fetchStatus(): PluginUpdateStatus {
        val version = currentVersion
        return runCatching {
            val response = httpClient.send(
                HttpRequest.newBuilder(URI.create(API))
                    .header("Accept", "application/json")
                    .header("User-Agent", "capybara-ai-coding-assistant")
                    .timeout(Duration.ofSeconds(10))
                    .GET()
                    .build(),
                HttpResponse.BodyHandlers.ofString(Charsets.UTF_8),
            )
            require(response.statusCode() in 200..299) { "HTTP ${response.statusCode()}" }
            val release = json.decodeFromString<GiteeRelease>(response.body())
            val latest = release.tag_name.orEmpty().removePrefix("v").removePrefix("V")
            require(latest.isNotBlank()) { "no tag" }
            PluginUpdateStatus(
                currentVersion = version,
                downloadUrl = release.html_url?.ifBlank { null } ?: RELEASES,
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
