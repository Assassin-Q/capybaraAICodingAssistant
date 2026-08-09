package com.aicoding.plugin.services

import com.intellij.openapi.components.Service
import com.intellij.openapi.diagnostic.Logger
import com.intellij.openapi.project.Project
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.doubleOrNull
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import java.net.URI
import java.net.URLEncoder
import java.net.http.HttpClient
import java.net.http.HttpRequest
import java.net.http.HttpResponse
import java.time.Duration

@Serializable
data class SkillHubDetailRequest(val slug: String, val namespace: String = "")

@Serializable
data class SkillHubFileRequest(val slug: String, val namespace: String = "", val path: String)

@Serializable
data class SkillHubFileEntry(val path: String, val size: Long = 0)

@Serializable
data class SkillHubVersion(
    val version: String,
    val changelog: String = "",
    val createdAt: Long = 0,
    val latest: Boolean = false,
)

@Serializable
data class SkillHubTraceItem(val key: String, val score: Double, val reason: String)

@Serializable
data class SkillHubTraceDimension(
    val key: String,
    val label: String,
    val score: Double,
    val reason: String,
    val items: List<SkillHubTraceItem> = emptyList(),
)

@Serializable
data class SkillHubEvaluation(
    val overall: Double = 0.0,
    val userSummary: String = "",
    val dimensions: List<SkillHubTraceDimension> = emptyList(),
)

@Serializable
data class SkillHubSecurityReport(
    val lab: String,
    val status: String = "",
    val statusText: String = "",
    val reportUrl: String = "",
)

@Serializable
data class SkillHubDetail(
    val success: Boolean = true,
    val message: String? = null,
    val slug: String = "",
    val canonicalName: String = "",
    val name: String = "",
    val owner: String = "",
    val iconUrl: String = "",
    val description: String = "",
    val category: String = "",
    val subCategories: List<String> = emptyList(),
    val version: String = "",
    val updatedAt: Long = 0,
    val downloads: Long = 0,
    val stars: Long = 0,
    val installs: Long = 0,
    val requiresApiKey: Boolean = false,
    val homepage: String = "",
    val files: List<SkillHubFileEntry> = emptyList(),
    val versions: List<SkillHubVersion> = emptyList(),
    val evaluation: SkillHubEvaluation? = null,
    val security: List<SkillHubSecurityReport> = emptyList(),
)

@Serializable
data class SkillHubFileContent(
    val success: Boolean = true,
    val message: String? = null,
    val path: String = "",
    val text: String = "",
    val truncated: Boolean = false,
)

/**
 * Reads the detail surface the SkillHub website itself uses.
 *
 * `api/v1/skills/{slug}` plus `/files`, `/file`, `/versions` and `/evaluation` were taken from the
 * site's own bundle and verified to answer without auth. They are a different API family from the
 * listing endpoint in [SkillManagementService], hence a separate service.
 *
 * TRACE scores are only published per item; a dimension's score is the mean of its items and the
 * overall score the mean of the dimensions — reproduced the numbers the site renders (4.8 / 4.2 /
 * 4.3 / 4.2 / 4.8 → 4.4) before relying on it.
 */
@Service(Service.Level.PROJECT)
class SkillHubDetailService(private val project: Project) {
    private val logger = Logger.getInstance(SkillHubDetailService::class.java)
    private val json = Json { ignoreUnknownKeys = true }
    private val httpClient: HttpClient = HttpClient.newBuilder()
        .connectTimeout(Duration.ofSeconds(10))
        // `/file` answers with a 302 to object storage.
        .followRedirects(HttpClient.Redirect.NORMAL)
        .build()

    fun detail(request: SkillHubDetailRequest): SkillHubDetail = runCatching {
        val slug = request.slug.trim().substringAfterLast('/')
        require(slug.isNotBlank()) { "缺少技能标识" }
        val namespace = request.namespace.trim().removePrefix("@").substringBefore('/')

        // The namespace is optional and the listing does not always carry a usable one, so a
        // namespaced miss falls back to the bare slug before giving up.
        val root = getJson(detailUrl(slug, namespace, ""))
            ?: getJson(detailUrl(slug, "", "")).also { if (it != null) return detail(SkillHubDetailRequest(slug)) }
            ?: return SkillHubDetail(
                success = false,
                message = "SkillHub 没有返回 $slug 的详情（可能是该技能已下架）",
            )
        val skill = root.obj("skill")
        val stats = skill.obj("stats")

        SkillHubDetail(
            slug = slug,
            canonicalName = root.obj("namespace").str("canonicalName"),
            name = skill.str("displayName").ifBlank { slug },
            owner = root.obj("owner").str("displayName"),
            iconUrl = skill.str("iconUrl"),
            description = skill.str("summary_zh").ifBlank { skill.str("summary") },
            category = skill.str("category"),
            subCategories = skill.arr("subCategories").map { it.jsonObject.str("name") },
            version = root.obj("latestVersion").str("version"),
            updatedAt = skill.num("updatedAt").toLong(),
            downloads = stats.num("downloads").toLong(),
            stars = stats.num("stars").toLong(),
            installs = stats.num("installs").toLong(),
            requiresApiKey = skill.obj("labels").str("requires_api_key") == "true",
            homepage = "https://www.skillhub.cn/skills/$namespace/$slug",
            files = files(slug, namespace),
            versions = versions(slug, namespace),
            evaluation = evaluation(slug, namespace),
            security = security(root),
        )
    }.getOrElse { error ->
        logger.info("SkillHub detail failed: ${error.message}")
        SkillHubDetail(success = false, message = error.message ?: "读取技能详情失败")
    }

    fun file(request: SkillHubFileRequest): SkillHubFileContent = runCatching {
        val slug = request.slug.trim().substringAfterLast('/')
        val path = request.path.trim()
        require(slug.isNotBlank() && path.isNotBlank()) { "缺少技能标识或文件路径" }
        require(!path.contains("..")) { "文件路径不合法" }
        val namespace = request.namespace.trim().removePrefix("@").substringBefore('/')
        val body = getText(detailUrl(slug, namespace, "/file") + "&path=" + encode(path))
            ?: return SkillHubFileContent(success = false, message = "SkillHub 没有返回该文件")
        SkillHubFileContent(
            path = path,
            text = body.take(MAX_FILE_CHARS),
            truncated = body.length > MAX_FILE_CHARS,
        )
    }.getOrElse { error ->
        logger.info("SkillHub file failed: ${error.message}")
        SkillHubFileContent(success = false, message = error.message ?: "读取文件失败")
    }

    private fun files(slug: String, namespace: String): List<SkillHubFileEntry> = runCatching {
        val root = getJson(detailUrl(slug, namespace, "/files")) ?: return emptyList()
        root.arr("files")
            .map { node ->
                SkillHubFileEntry(path = node.jsonObject.str("path"), size = node.jsonObject.num("size").toLong())
            }
            .sortedBy { it.path }
    }.getOrDefault(emptyList())

    private fun versions(slug: String, namespace: String): List<SkillHubVersion> = runCatching {
        val root = getJson(detailUrl(slug, namespace, "/versions")) ?: return emptyList()
        root.arr("versions")
            .map { node ->
                SkillHubVersion(
                    version = node.jsonObject.str("version"),
                    changelog = node.jsonObject.str("changelog"),
                    createdAt = node.jsonObject.num("createdAt").toLong(),
                )
            }
            .mapIndexed { index, version -> version.copy(latest = index == 0) }
    }.getOrDefault(emptyList())

    private fun evaluation(slug: String, namespace: String): SkillHubEvaluation? = runCatching {
        val root = getJson(detailUrl(slug, namespace, "/evaluation")) ?: return null
        val dimensions = root.obj("dimensions")
        val parsed = DIMENSION_LABELS.mapNotNull { (key, label) ->
            val node = dimensions[key] as? JsonObject ?: return@mapNotNull null
            val items = node.obj("items").entries.map { (itemKey, itemNode) ->
                val item = itemNode.jsonObject
                SkillHubTraceItem(
                    key = itemKey,
                    score = item.num("score"),
                    reason = item.str("userReason").ifBlank { item.str("reason") },
                )
            }
            SkillHubTraceDimension(
                key = key,
                label = label,
                // The API publishes no dimension score, only per-item ones.
                score = if (items.isEmpty()) 0.0 else items.sumOf { it.score } / items.size,
                reason = node.str("userReason").ifBlank { node.str("reason") },
                items = items,
            )
        }
        if (parsed.isEmpty()) return null
        SkillHubEvaluation(
            overall = parsed.sumOf { it.score } / parsed.size,
            userSummary = root.str("userSummary").ifBlank { root.str("summary") },
            dimensions = parsed,
        )
    }.getOrNull()

    private fun security(root: JsonObject): List<SkillHubSecurityReport> = runCatching {
        root.obj("securityReports").entries.map { (lab, node) ->
            val report = node.jsonObject
            SkillHubSecurityReport(
                lab = lab,
                status = report.str("status"),
                statusText = report.str("statusText"),
                reportUrl = report.str("reportUrl"),
            )
        }
    }.getOrDefault(emptyList())

    private fun detailUrl(slug: String, namespace: String, suffix: String): String {
        val base = "$BASE/${encode(slug)}$suffix"
        return if (namespace.isBlank()) "$base?" else "$base?namespace=${encode(namespace)}"
    }

    private fun getJson(url: String): JsonObject? = getText(url)
        ?.let { body -> runCatching { json.parseToJsonElement(body).jsonObject }.getOrNull() }

    private fun getText(url: String): String? = runCatching {
        val response = httpClient.send(
            HttpRequest.newBuilder(URI.create(url))
                .header("User-Agent", USER_AGENT)
                .timeout(Duration.ofSeconds(20))
                .GET()
                .build(),
            HttpResponse.BodyHandlers.ofString(Charsets.UTF_8),
        )
        if (response.statusCode() == 200) response.body() else null
    }.getOrNull()

    private fun encode(value: String): String = URLEncoder.encode(value, Charsets.UTF_8)

    private fun JsonObject.obj(key: String): JsonObject = this[key] as? JsonObject ?: EMPTY

    private fun JsonObject.arr(key: String): List<kotlinx.serialization.json.JsonElement> =
        (this[key] as? JsonArray)?.toList().orEmpty()

    private fun JsonObject.str(key: String): String =
        (this[key] as? kotlinx.serialization.json.JsonPrimitive)?.contentOrNull.orEmpty()

    private fun JsonObject.num(key: String): Double =
        (this[key] as? kotlinx.serialization.json.JsonPrimitive)?.doubleOrNull ?: 0.0

    private companion object {
        const val BASE = "https://api.skillhub.cn/api/v1/skills"
        const val USER_AGENT = "capybara-idea-plugin"
        const val MAX_FILE_CHARS = 200_000
        val EMPTY = JsonObject(emptyMap())

        /** Order matters: it is the order the radar and the detail list render in. */
        val DIMENSION_LABELS = listOf(
            "trust" to "可信任度",
            "reliability" to "可靠性",
            "adaptability" to "适用性",
            "convention" to "规范性",
            "effectiveness" to "有效性",
        )
    }
}
