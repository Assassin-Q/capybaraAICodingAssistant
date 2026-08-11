package com.aicoding.plugin.services

import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import java.net.URI
import java.net.URLEncoder
import java.net.http.HttpClient
import java.net.http.HttpRequest
import java.net.http.HttpResponse
import java.time.Duration

@Serializable
private data class ClawHubStats(
    val comments: Long = 0,
    val downloads: Long = 0,
    val installs: Long = 0,
    val stars: Long = 0,
    val versions: Long = 0,
)

@Serializable
private data class ClawHubVersion(
    val version: String = "",
    val createdAt: Long = 0,
    val changelog: String? = null,
    val license: String? = null,
)

@Serializable
private data class ClawHubItem(
    val slug: String = "",
    val displayName: String? = null,
    val summary: String? = null,
    val description: String? = null,
    val topics: List<String> = emptyList(),
    val stats: ClawHubStats = ClawHubStats(),
    val createdAt: Long = 0,
    val updatedAt: Long = 0,
    val latestVersion: ClawHubVersion? = null,
)

@Serializable
private data class ClawHubOwner(val handle: String? = null)

@Serializable
private data class ClawHubMatch(val ownerHandle: String? = null, val slug: String? = null)

/** Detail response, plus the shape returned when a slug is published by more than one owner. */
@Serializable
private data class ClawHubDetail(
    val owner: ClawHubOwner? = null,
    val code: String? = null,
    val matches: List<ClawHubMatch> = emptyList(),
)

@Serializable
private data class ClawHubPage(
    val items: List<ClawHubItem> = emptyList(),
    val nextCursor: String? = null,
)

/**
 * The English-language skill catalogue, backed by clawhub.ai.
 *
 * Its API is not a drop-in replacement for skillhub.cn and the difference drives this whole class.
 * Verified against the live service:
 *
 *  - Paging is by opaque cursor, not page number.
 *  - `q`, `search`, `topic` and `sort` are accepted and then ignored — every one returns the
 *    unfiltered first page — so searching, filtering and ordering have to happen here.
 *  - Categories are free-form `topics` per skill rather than a fixed scene list, so the filter
 *    options are derived from whatever the catalogue currently holds.
 *  - There is no endpoint that returns file content. `/versions/{v}` lists paths, sizes and
 *    hashes only, and every download-shaped path returns 404. Installing straight into the
 *    workspace is therefore impossible; the panel opens the skill's page instead.
 *
 * Because filtering is local, the whole catalogue is pulled once and cached: paging through it
 * otherwise re-downloads every page on every keystroke.
 */
class ClawHubCatalogService {
    companion object {
        const val SITE = "https://clawhub.ai"
        const val CATALOG_ENDPOINT = "$SITE/api/v1/skills"
        private const val USER_AGENT = "capybara-ai-coding-assistant"

        /** Upper bound on what one refresh pulls, so a growing catalogue cannot stall the panel. */
        private const val MAX_ITEMS = 600
        private const val PAGE_SIZE = 100
        private const val CACHE_TTL_MS = 5 * 60 * 1000L

        fun skillUrl(slug: String): String = "$SITE/skills/$slug"
    }

    private val json = Json { ignoreUnknownKeys = true; encodeDefaults = true }
    private val httpClient: HttpClient = HttpClient.newBuilder()
        .connectTimeout(Duration.ofSeconds(15))
        .followRedirects(HttpClient.Redirect.NORMAL)
        .build()

    @Volatile private var cache: List<SkillHubSkill> = emptyList()
    @Volatile private var cachedAt: Long = 0

    fun status(): SkillHubStatus = runCatching {
        val response = httpClient.send(
            HttpRequest.newBuilder(URI.create("$CATALOG_ENDPOINT?limit=1"))
                .header("Accept", "application/json")
                .header("User-Agent", USER_AGENT)
                .timeout(Duration.ofSeconds(15))
                .GET()
                .build(),
            HttpResponse.BodyHandlers.discarding(),
        )
        SkillHubStatus(available = response.statusCode() == 200, endpoint = CATALOG_ENDPOINT)
    }.getOrElse {
        SkillHubStatus(available = false, endpoint = CATALOG_ENDPOINT, message = it.message)
    }

    /** Topics present in the catalogue, most common first — the English answer to scene categories. */
    fun topics(limit: Int = 12): List<String> = snapshot()
        .flatMap { it.tags }
        .groupingBy { it }
        .eachCount()
        .entries
        .sortedWith(compareByDescending<Map.Entry<String, Int>> { it.value }.thenBy { it.key })
        .take(limit)
        .map { it.key }

    fun search(request: SkillHubSearchRequest): SkillHubSearchResponse {
        val all = runCatching { snapshot() }.getOrElse {
            return SkillHubSearchResponse(
                success = false,
                page = 1,
                pageSize = request.limit,
                message = it.message,
            )
        }
        val query = request.query.trim().lowercase()
        val topic = request.category?.trim()?.lowercase().orEmpty()

        val filtered = all
            .filter { skill ->
                query.isEmpty() ||
                    skill.slug.lowercase().contains(query) ||
                    skill.name.orEmpty().lowercase().contains(query) ||
                    skill.description.orEmpty().lowercase().contains(query) ||
                    skill.tags.any { it.lowercase().contains(query) }
            }
            .filter { skill -> topic.isEmpty() || skill.tags.any { it.equals(topic, ignoreCase = true) } }

        val sorted = when (request.sortBy.lowercase()) {
            "downloads" -> filtered.sortedByDescending { it.downloads }
            "stars" -> filtered.sortedByDescending { it.stars }
            "installs" -> filtered.sortedByDescending { it.installs }
            "updated_at", "updatedat" -> filtered.sortedByDescending { it.updatedAt }
            // "score" is skillhub's own ranking and has no equivalent here. Downloads is the closest
            // honest stand-in, and it keeps the default ordering stable rather than arbitrary.
            else -> filtered.sortedByDescending { it.downloads }
        }.let { if (request.order.equals("asc", ignoreCase = true)) it.reversed() else it }

        val pageSize = request.limit.coerceIn(1, 100)
        val page = request.page.coerceAtLeast(1)
        val from = (page - 1) * pageSize

        return SkillHubSearchResponse(
            success = true,
            query = request.query.trim(),
            results = if (from >= sorted.size) emptyList() else sorted.subList(from, minOf(from + pageSize, sorted.size)),
            total = sorted.size,
            page = page,
            pageSize = pageSize,
        )
    }

    /**
     * The download URL for a skill, or null when the owner cannot be resolved.
     *
     * `ownerHandle` is required and the listing does not carry it, so the detail endpoint is asked
     * first. A slug published by more than one owner answers with `AMBIGUOUS_SKILL_SLUG` and the
     * candidates; the first is used and the caller reports which `@owner/slug` it actually took,
     * because silently installing one of several same-named skills is worse than saying so.
     */
    fun downloadUrl(slug: String, version: String? = null): Pair<String, String>? {
        val handle = resolveOwnerHandle(slug) ?: return null
        val url = buildString {
            append(SITE).append("/api/v1/download")
            append("?slug=").append(URLEncoder.encode(slug, Charsets.UTF_8))
            append("&ownerHandle=").append(URLEncoder.encode(handle, Charsets.UTF_8))
            version?.takeIf { it.isNotBlank() }?.let {
                append("&version=").append(URLEncoder.encode(it, Charsets.UTF_8))
            }
        }
        return url to "@$handle/$slug"
    }

    private fun resolveOwnerHandle(slug: String): String? = runCatching {
        val response = httpClient.send(
            HttpRequest.newBuilder(URI.create("$CATALOG_ENDPOINT/${URLEncoder.encode(slug, Charsets.UTF_8)}"))
                .header("Accept", "application/json")
                .header("User-Agent", USER_AGENT)
                .timeout(Duration.ofSeconds(20))
                .GET()
                .build(),
            HttpResponse.BodyHandlers.ofString(Charsets.UTF_8),
        )
        if (response.statusCode() !in 200..299 && response.statusCode() != 409) return@runCatching null
        val detail = json.decodeFromString<ClawHubDetail>(response.body())
        detail.owner?.handle?.takeIf { it.isNotBlank() }
            ?: detail.matches.firstOrNull()?.ownerHandle?.takeIf { it.isNotBlank() }
    }.getOrNull()

    private fun snapshot(): List<SkillHubSkill> {
        val now = System.currentTimeMillis()
        val cached = cache
        if (cached.isNotEmpty() && now - cachedAt < CACHE_TTL_MS) return cached

        val collected = mutableListOf<SkillHubSkill>()
        var cursor: String? = null
        while (collected.size < MAX_ITEMS) {
            val url = buildString {
                append(CATALOG_ENDPOINT)
                append("?limit=").append(PAGE_SIZE)
                cursor?.let { append("&cursor=").append(URLEncoder.encode(it, Charsets.UTF_8)) }
            }
            val response = httpClient.send(
                HttpRequest.newBuilder(URI.create(url))
                    .header("Accept", "application/json")
                    .header("User-Agent", USER_AGENT)
                    .timeout(Duration.ofSeconds(25))
                    .GET()
                    .build(),
                HttpResponse.BodyHandlers.ofString(Charsets.UTF_8),
            )
            require(response.statusCode() == 200) { "ClawHub returned HTTP ${response.statusCode()}" }
            val parsed = json.decodeFromString<ClawHubPage>(response.body())
            if (parsed.items.isEmpty()) break
            parsed.items.forEach { item -> collected += toSkill(item) }
            cursor = parsed.nextCursor?.takeIf { it.isNotBlank() } ?: break
        }

        val distinct = collected.distinctBy { it.slug }
        cache = distinct
        cachedAt = now
        return distinct
    }

    private fun toSkill(item: ClawHubItem): SkillHubSkill = SkillHubSkill(
        slug = item.slug,
        publicSlug = item.slug,
        name = item.displayName?.ifBlank { null } ?: item.slug,
        description = item.summary?.ifBlank { null } ?: item.description?.ifBlank { null },
        version = item.latestVersion?.version?.ifBlank { null },
        source = "clawhub",
        // Its first topic doubles as the category so the existing filter chip has something to bind
        // to; the full list stays in `tags`.
        category = item.topics.firstOrNull(),
        homepage = skillUrl(item.slug),
        downloads = item.stats.downloads,
        installs = item.stats.installs,
        stars = item.stats.stars,
        createdAt = item.createdAt,
        updatedAt = item.updatedAt,
        tags = item.topics,
    )
}
