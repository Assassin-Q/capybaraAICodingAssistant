package com.aicoding.plugin.services

import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.fileChooser.FileChooser
import com.intellij.openapi.fileChooser.FileChooserDescriptor
import com.intellij.openapi.project.Project
import com.intellij.openapi.vfs.VirtualFileManager
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import java.io.ByteArrayInputStream
import java.net.URI
import java.net.URLEncoder
import java.net.http.HttpClient
import java.net.http.HttpRequest
import java.net.http.HttpResponse
import java.nio.file.Files
import java.nio.file.Path
import java.nio.file.StandardCopyOption
import java.time.Duration
import java.util.Comparator
import java.util.zip.ZipInputStream
import kotlin.io.path.isDirectory
import kotlin.io.path.name

@Serializable
data class ManagedSkillInfo(
    val name: String,
    val description: String? = null,
    val location: String,
    val scope: String,
    val source: String,
    val enabled: Boolean,
    val editable: Boolean = true,
    /** The containing directory, which is the key OpenCode registers the skill under. */
    val directoryName: String = "",
    /** From the SKILL.md frontmatter, so SkillHub can mark which release is installed locally. */
    val version: String? = null,
)

@Serializable
data class SkillLocationRequest(val location: String, val enabled: Boolean? = null)

@Serializable
data class SkillImportRequest(val scope: String, val overwrite: Boolean = false)

@Serializable
data class SkillHubInstallRequest(
    val coordinate: String,
    val scope: String,
    val overwrite: Boolean = false,
    /** Community namespace handle, mirrors `skillhub install --namespace`. */
    val namespace: String? = null,
)

/** Mirrors the filters exposed by `skillhub search`: query words, --search-limit and --org. */
@Serializable
data class SkillHubSearchRequest(
    val query: String,
    val limit: Int = 20,
    val org: String? = null,
    val sortBy: String = "score",
    val order: String = "desc",
    val page: Int = 1,
    val category: String? = null,
    val source: String? = null,
    val requiresApiKey: Boolean? = null,
    /** "en" routes to clawhub.ai; anything else keeps the Chinese catalogue. */
    val locale: String = "zh",
)

@Serializable
private data class SkillHubNamespace(
    val handle: String? = null,
    val canonicalName: String? = null,
    val publicSlug: String? = null,
)

/** Mirrors the `api/v1/search` payload; unknown fields are ignored. */
@Serializable
private data class SkillHubRawResult(
    val slug: String = "",
    val publicSlug: String? = null,
    val name: String? = null,
    val displayName: String? = null,
    val description: String? = null,
    val description_zh: String? = null,
    val summary: String? = null,
    val version: String? = null,
    val source: String? = null,
    val category: String? = null,
    val icon_url: String? = null,
    val homepage: String? = null,
    val owner_name: String? = null,
    val downloads: Long = 0,
    val installs: Long = 0,
    val stars: Long = 0,
    val created_at: Long = 0,
    val updated_at: Long = 0,
    val tags: List<String> = emptyList(),
    val labels: Map<String, String>? = null,
    val namespace: SkillHubNamespace? = null,
)

@Serializable
private data class SkillHubRawSearch(val results: List<SkillHubRawResult> = emptyList())

@Serializable
private data class SkillHubCatalogRawResult(
    val slug: String = "",
    val name: String? = null,
    val description: String? = null,
    val description_zh: String? = null,
    val version: String? = null,
    val source: String? = null,
    val category: String? = null,
    val iconUrl: String? = null,
    val homepage: String? = null,
    val ownerName: String? = null,
    val downloads: Long = 0,
    val installs: Long = 0,
    val stars: Long = 0,
    val created_at: Long = 0,
    val updated_at: Long = 0,
    val tags: List<String>? = null,
    val labels: Map<String, String>? = null,
    val namespace: SkillHubNamespace? = null,
)

@Serializable
private data class SkillHubCatalogData(
    val skills: List<SkillHubCatalogRawResult> = emptyList(),
    val total: Int = 0,
)

@Serializable
private data class SkillHubCatalogResponse(
    val code: Int = -1,
    val data: SkillHubCatalogData? = null,
    val message: String? = null,
)

@Serializable
data class SkillHubSkill(
    val slug: String,
    val publicSlug: String? = null,
    val name: String? = null,
    val description: String? = null,
    val version: String? = null,
    val source: String? = null,
    val namespaceHandle: String? = null,
    val category: String? = null,
    val iconUrl: String? = null,
    val homepage: String? = null,
    val owner: String? = null,
    val downloads: Long = 0,
    val installs: Long = 0,
    val stars: Long = 0,
    val createdAt: Long = 0,
    val updatedAt: Long = 0,
    val tags: List<String> = emptyList(),
    val requiresApiKey: Boolean = false,
)

@Serializable
data class SkillHubSearchResponse(
    val success: Boolean,
    val query: String = "",
    val results: List<SkillHubSkill> = emptyList(),
    val warnings: List<String> = emptyList(),
    val total: Int = 0,
    /**
     * No defaults on these two. The server serialises with `encodeDefaults = false`, so a page of 1
     * or a size of 20 was omitted entirely; the client then read `undefined`, rendered "第 /5553 页",
     * and computed `undefined + 1` for the next page — which is how paging broke.
     */
    val page: Int,
    val pageSize: Int,
    val message: String? = null,
)

@Serializable
data class SkillHubStatus(
    /** Whether skillhub.cn answered. No CLI, Python or Git Bash is involved any more. */
    val available: Boolean,
    val endpoint: String,
    val message: String? = null,
)

@Serializable
data class SkillActionResponse(
    val success: Boolean,
    val message: String? = null,
    val imported: ManagedSkillInfo? = null,
    val status: SkillHubStatus? = null,
)

private data class SkillRoot(val path: Path, val scope: String, val source: String)

/**
 * Turns a network failure into something the user can act on.
 *
 * The raw text surfaced verbatim before, so a blocked connection reached the page as
 * "Remote host terminated the handshake" — accurate, and useless to anyone reading it.
 */
internal fun networkFailureMessage(error: Throwable, fallback: String): String = when (error) {
    is java.net.UnknownHostException -> "无法解析 SkillHub 域名，请检查网络或 DNS 设置"
    is javax.net.ssl.SSLException ->
        "与 SkillHub 建立安全连接失败，通常是代理或防火墙拦截了请求。" +
            "若你使用代理，请在 设置 → 外观与行为 → 系统设置 → HTTP 代理 中配置后重启 IDEA"
    is java.net.http.HttpConnectTimeoutException, is java.net.ConnectException ->
        "连接 SkillHub 超时，请检查网络后重试"
    else -> error.message ?: fallback
}

class SkillManagementService(private val project: Project) {
    private val clawHub = ClawHubCatalogService()

    private val json = Json { ignoreUnknownKeys = true }
    private val httpClient: HttpClient = HttpClient.newBuilder()
        .connectTimeout(Duration.ofSeconds(6))
        .followRedirects(HttpClient.Redirect.NORMAL)
        // Without this the client is NO_PROXY — it ignores even the system settings, so a user
        // behind a proxy gets a connection reset that reads as a TLS handshake failure. IDEA
        // publishes its own proxy configuration through the default selector.
        .proxy(java.net.ProxySelector.getDefault())
        .build()
    private val home = Path.of(System.getProperty("user.home")).toAbsolutePath().normalize()
    private val projectRoot = project.basePath?.let(Path::of)?.toAbsolutePath()?.normalize()

    fun list(): List<ManagedSkillInfo> = roots().flatMap { root ->
        if (!Files.isDirectory(root.path)) return@flatMap emptyList()
        Files.walk(root.path, 8).use { paths ->
            paths
                .filter { path ->
                    Files.isRegularFile(path) &&
                        (path.fileName.toString() == "SKILL.md" || path.fileName.toString() == "SKILL.md.disabled")
                }
                .map { path -> parseSkill(path, root) }
                .toList()
        }
        // Everything found on disk is listed. An earlier version dropped anything nested deeper
        // than `<root>/<name>/SKILL.md`, on the belief that OpenCode only scans one level. The
        // live list disproves it: all eight gsap skills load from
        // `~/.claude/skills/gsap-skills-main/skills/<name>/SKILL.md`, three levels down. Filtering
        // on that guess hid working skills and left no way to manage them.
    }.distinctBy { it.location.lowercase() }.sortedWith(
        compareBy<ManagedSkillInfo> { it.scope }.thenBy { it.name.lowercase() },
    )

    fun import(request: SkillImportRequest): SkillActionResponse = runCatching {
        val selected = chooseSkill() ?: return SkillActionResponse(false, "已取消导入")
        val sourceFile = when {
            Files.isRegularFile(selected) && selected.fileName.toString().equals("SKILL.md", true) -> selected
            Files.isDirectory(selected) -> Files.walk(selected, 5).use { paths ->
                paths.filter { Files.isRegularFile(it) && it.fileName.toString().equals("SKILL.md", true) }
                    .findFirst()
                    .orElse(null)
            }
            else -> null
        } ?: error("所选位置中没有 SKILL.md")
        val sourceDirectory = sourceFile.parent
        val parsed = parseSkill(sourceFile, SkillRoot(sourceDirectory, request.scope, "import"))
        val targetRoot = targetRoot(request.scope)
        val targetDirectory = targetRoot.resolve(safeName(parsed.name)).normalize()
        require(targetDirectory.startsWith(targetRoot)) { "技能名称生成了无效目录" }
        if (Files.exists(targetDirectory) && !request.overwrite) {
            error("目标中已存在同名技能：${parsed.name}")
        }
        if (Files.exists(targetDirectory)) deleteTree(targetDirectory)
        copyTree(sourceDirectory, targetDirectory)
        refreshFiles()
        SkillActionResponse(
            success = true,
            message = "已导入 ${parsed.name}",
            imported = parseSkill(targetDirectory.resolve("SKILL.md"), rootFor(targetDirectory)),
        )
    }.getOrElse { SkillActionResponse(false, it.message ?: "技能导入失败") }

    fun setEnabled(request: SkillLocationRequest): SkillActionResponse = runCatching {
        val path = validatedSkillFile(request.location)
        val enabled = request.enabled ?: true
        val targetName = if (enabled) "SKILL.md" else "SKILL.md.disabled"
        val target = path.resolveSibling(targetName)
        if (path != target) Files.move(path, target, StandardCopyOption.REPLACE_EXISTING)
        refreshFiles()
        SkillActionResponse(true, if (enabled) "技能已启用" else "技能已停用")
    }.getOrElse { SkillActionResponse(false, it.message ?: "无法更新技能状态") }

    fun delete(request: SkillLocationRequest): SkillActionResponse = runCatching {
        val path = validatedSkillFile(request.location)
        val root = roots().first { path.startsWith(it.path) }
        require(path.parent != root.path) { "不能删除技能根目录" }
        deleteTree(path.parent)
        refreshFiles()
        SkillActionResponse(true, "技能已删除")
    }.getOrElse { SkillActionResponse(false, it.message ?: "无法删除技能") }

    fun skillHubStatus(locale: String = "zh"): SkillHubStatus {
        if (locale.equals("en", ignoreCase = true)) return clawHub.status()
        return skillHubStatusCn()
    }

    /** Topics for the English catalogue; the Chinese one ships a fixed scene list instead. */
    fun clawHubTopics(): List<String> = runCatching { clawHub.topics() }.getOrDefault(emptyList())

    private fun skillHubStatusCn(): SkillHubStatus = runCatching {
        val response = httpClient.send(
            HttpRequest.newBuilder(URI.create("$CATALOG_ENDPOINT?page=1&pageSize=1&sortBy=score&order=desc&keyword="))
                .header("Accept", "application/json")
                .header("User-Agent", USER_AGENT)
                .timeout(Duration.ofSeconds(8))
                .GET()
                .build(),
            HttpResponse.BodyHandlers.discarding(),
        )
        SkillHubStatus(available = response.statusCode() == 200, endpoint = CATALOG_ENDPOINT)
    }.getOrElse {
        SkillHubStatus(
            available = false,
            endpoint = CATALOG_ENDPOINT,
            message = networkFailureMessage(it, "无法连接 SkillHub"),
        )
    }

    /**
     * Calls the same `api/v1/search` endpoint the official CLI uses, without needing the CLI.
     * An empty query is allowed and returns the default listing, which is what SkillHub's own
     * "all skills" page shows. The endpoint ignores sort parameters, so ordering and filtering
     * happen client-side over the returned page.
     */
    private fun searchSkillHubLegacy(request: SkillHubSearchRequest): SkillHubSearchResponse = runCatching {
        val query = request.query.trim()
        require(query.length <= 120) { "搜索关键词过长" }
        val limit = request.limit.coerceIn(1, 100)
        val url = "$SEARCH_ENDPOINT?q=${encode(query)}&limit=$limit"
        val response = httpClient.send(
            HttpRequest.newBuilder(URI.create(url))
                .header("Accept", "application/json")
                .header("User-Agent", USER_AGENT)
                .timeout(Duration.ofSeconds(20))
                .GET()
                .build(),
            HttpResponse.BodyHandlers.ofString(Charsets.UTF_8),
        )
        require(response.statusCode() == 200) { "SkillHub 搜索返回 HTTP ${response.statusCode()}" }
        val parsed = json.decodeFromString<SkillHubRawSearch>(response.body())
        SkillHubSearchResponse(
            success = true,
            query = query,
            // The legacy endpoint has no paging of its own, so the caller is told so plainly
            // rather than being handed a page number the results do not actually correspond to.
            page = 1,
            pageSize = limit,
            results = parsed.results.mapNotNull { item ->
                val publicSlug = item.slug.ifBlank { item.publicSlug.orEmpty() }
                if (publicSlug.isBlank()) return@mapNotNull null
                SkillHubSkill(
                    // Display the canonical @handle/slug when the API provides one.
                    slug = item.namespace?.canonicalName?.ifBlank { null } ?: publicSlug,
                    publicSlug = publicSlug,
                    name = item.displayName?.ifBlank { null } ?: item.name?.ifBlank { null },
                    // Chinese summary first — the catalogue is mostly Chinese-facing.
                    description = item.description_zh?.ifBlank { null }
                        ?: item.summary?.ifBlank { null }
                        ?: item.description?.ifBlank { null },
                    version = item.version?.ifBlank { null },
                    source = item.source ?: "community",
                    namespaceHandle = item.namespace?.handle?.ifBlank { null },
                    category = item.category?.ifBlank { null },
                    iconUrl = item.icon_url?.ifBlank { null },
                    homepage = item.homepage?.ifBlank { null },
                    owner = item.owner_name?.ifBlank { null },
                    downloads = item.downloads,
                    installs = item.installs,
                    stars = item.stars,
                    createdAt = item.created_at,
                    updatedAt = item.updated_at,
                    tags = item.tags,
                    requiresApiKey = item.labels?.get("requires_api_key") == "true",
                )
            },
        )
    }.getOrElse { SkillHubSearchResponse(false, page = 1, pageSize = 20, message = networkFailureMessage(it, "SkillHub 搜索失败")) }

    fun searchSkillHub(request: SkillHubSearchRequest): SkillHubSearchResponse {
        if (request.locale.equals("en", ignoreCase = true)) return clawHub.search(request)
        return searchSkillHubCn(request)
    }

    private fun searchSkillHubCn(request: SkillHubSearchRequest): SkillHubSearchResponse = runCatching {
        val query = request.query.trim()
        require(query.length <= 120) { "SkillHub 搜索关键词过长" }
        val limit = request.limit.coerceIn(1, 100)
        val page = request.page.coerceAtLeast(1)
        val sortBy = request.sortBy.takeIf { it in CATALOG_SORTS } ?: "score"
        val order = request.order.takeIf { it == "asc" || it == "desc" } ?: "desc"
        val catalogUrl = buildString {
            append(CATALOG_ENDPOINT)
            append("?page=").append(page)
            append("&pageSize=").append(limit)
            append("&sortBy=").append(encode(sortBy))
            append("&order=").append(encode(order))
            append("&keyword=").append(encode(query))
            request.category?.takeUnless { it == "all" || it.isBlank() }?.let {
                append("&category=").append(encode(it))
            }
            request.source?.takeUnless { it == "all" || it.isBlank() }?.let {
                append("&source=").append(encode(it))
            }
            request.requiresApiKey?.let { append("&requiresApiKey=").append(it) }
        }
        val response = httpClient.send(
            HttpRequest.newBuilder(URI.create(catalogUrl))
                .header("Accept", "application/json")
                .header("User-Agent", USER_AGENT)
                .timeout(Duration.ofSeconds(20))
                .GET()
                .build(),
            HttpResponse.BodyHandlers.ofString(Charsets.UTF_8),
        )
        if (response.statusCode() >= 500) return@runCatching searchSkillHubLegacy(request)
        require(response.statusCode() == 200) {
            "SkillHub 列表接口返回 HTTP ${response.statusCode()}：${response.body().take(240)}"
        }
        val parsed = json.decodeFromString<SkillHubCatalogResponse>(response.body())
        val data = parsed.data ?: return@runCatching searchSkillHubLegacy(request)
        require(parsed.code == 0) { parsed.message ?: "SkillHub 列表接口返回失败" }
        SkillHubSearchResponse(
            success = true,
            query = query,
            results = data.skills.mapNotNull { item ->
                if (item.slug.isBlank()) return@mapNotNull null
                SkillHubSkill(
                    slug = item.namespace?.canonicalName?.ifBlank { null } ?: item.slug,
                    publicSlug = item.namespace?.publicSlug?.ifBlank { null } ?: item.slug,
                    name = item.name?.ifBlank { null },
                    description = item.description_zh?.ifBlank { null } ?: item.description?.ifBlank { null },
                    version = item.version?.ifBlank { null },
                    source = item.source ?: "community",
                    namespaceHandle = item.namespace?.handle?.ifBlank { null },
                    category = item.category?.ifBlank { null },
                    iconUrl = item.iconUrl?.ifBlank { null },
                    homepage = item.homepage?.ifBlank { null },
                    owner = item.ownerName?.ifBlank { null },
                    downloads = item.downloads,
                    installs = item.installs,
                    stars = item.stars,
                    createdAt = item.created_at,
                    updatedAt = item.updated_at,
                    tags = item.tags.orEmpty(),
                    requiresApiKey = item.labels?.get("requires_api_key") == "true",
                )
            },
            total = data.total,
            page = page,
            pageSize = limit,
        )
    }.getOrElse { SkillHubSearchResponse(false, page = 1, pageSize = 20, message = networkFailureMessage(it, "SkillHub 搜索失败")) }

    /**
     * Downloads the skill archive from `api/v1/download` and unpacks it into the chosen scope.
     * The archives are flat (SKILL.md at the root), so each one gets its own directory.
     */
    fun installFromSkillHub(request: SkillHubInstallRequest): SkillActionResponse = runCatching {
        val coordinate = request.coordinate.trim()
        require(Regex("^@?[A-Za-z0-9_.-]+(?:/[A-Za-z0-9_.-]+)?$").matches(coordinate)) {
            "SkillHub 技能坐标格式无效"
        }
        val directoryName = safeName(coordinate.substringAfterLast('/'))
        val root = targetRoot(request.scope)
        val target = root.resolve(directoryName).normalize()
        require(target.startsWith(root)) { "技能名称生成了无效目录" }
        if (Files.exists(target)) {
            require(request.overwrite) { "目标中已存在同名技能：$directoryName" }
            deleteTree(target)
        }

        val response = httpClient.send(
            HttpRequest.newBuilder(URI.create("$DOWNLOAD_ENDPOINT?slug=${encode(coordinate)}"))
                .header("User-Agent", USER_AGENT)
                .timeout(Duration.ofSeconds(120))
                .GET()
                .build(),
            HttpResponse.BodyHandlers.ofByteArray(),
        )
        require(response.statusCode() == 200) { "SkillHub 下载返回 HTTP ${response.statusCode()}" }
        val entries = unzipInto(response.body(), target)
        require(entries > 0) { "下载的技能包是空的" }
        require(Files.exists(target.resolve("SKILL.md"))) { "下载的技能包中没有 SKILL.md" }
        refreshFiles()
        SkillActionResponse(
            success = true,
            message = "已安装 $coordinate（$entries 个文件）",
            imported = parseSkill(target.resolve("SKILL.md"), rootFor(target)),
        )
    }.getOrElse { SkillActionResponse(false, it.message ?: "SkillHub 技能安装失败") }

    private fun encode(value: String): String = URLEncoder.encode(value, Charsets.UTF_8)

    /** Extracts a zip while rejecting entries that would escape the destination directory. */
    private fun unzipInto(archive: ByteArray, target: Path): Int {
        Files.createDirectories(target)
        var count = 0
        ZipInputStream(ByteArrayInputStream(archive)).use { zip ->
            while (true) {
                val entry = zip.nextEntry ?: break
                val destination = target.resolve(entry.name).normalize()
                require(destination.startsWith(target)) { "技能包中包含非法路径：${entry.name}" }
                if (entry.isDirectory) {
                    Files.createDirectories(destination)
                } else {
                    Files.createDirectories(destination.parent)
                    Files.newOutputStream(destination).use { output -> zip.copyTo(output) }
                    count += 1
                }
                zip.closeEntry()
            }
        }
        return count
    }

    private fun roots(): List<SkillRoot> = buildList {
        projectRoot?.let { root ->
            add(SkillRoot(root.resolve(".opencode/skills"), "project", "opencode"))
            add(SkillRoot(root.resolve(".opencode/skill"), "project", "opencode"))
            add(SkillRoot(root.resolve(".claude/skills"), "project", "claude"))
            add(SkillRoot(root.resolve(".agents/skills"), "project", "agents"))
        }
        add(SkillRoot(home.resolve(".config/opencode/skills"), "global", "opencode"))
        add(SkillRoot(home.resolve(".config/opencode/skill"), "global", "opencode"))
        add(SkillRoot(home.resolve(".claude/skills"), "global", "claude"))
        add(SkillRoot(home.resolve(".agents/skills"), "global", "agents"))
    }.map { it.copy(path = it.path.toAbsolutePath().normalize()) }

    private fun targetRoot(scope: String): Path {
        val target = if (scope == "global") {
            home.resolve(".config/opencode/skills")
        } else {
            (projectRoot ?: error("当前项目没有工作目录")).resolve(".opencode/skills")
        }.toAbsolutePath().normalize()
        Files.createDirectories(target)
        return target
    }

    private fun rootFor(path: Path): SkillRoot = roots().first { path.toAbsolutePath().normalize().startsWith(it.path) }

    private fun parseSkill(path: Path, root: SkillRoot): ManagedSkillInfo {
        val text = runCatching { Files.readString(path) }.getOrDefault("")
        val frontmatter = if (text.startsWith("---")) text.substringAfter("---").substringBefore("---") else ""
        val values = frontmatter.lineSequence().mapNotNull { line ->
            val index = line.indexOf(':')
            if (index <= 0) null else line.take(index).trim() to line.drop(index + 1).trim().trim('"', '\'')
        }.toMap()
        return ManagedSkillInfo(
            name = values["name"]?.ifBlank { null } ?: path.parent.name,
            description = values["description"]?.ifBlank { null },
            location = path.toAbsolutePath().normalize().toString(),
            scope = root.scope,
            source = root.source,
            enabled = path.fileName.toString() == "SKILL.md",
            version = values["version"]?.ifBlank { null },
            // OpenCode keys its live list by directory, which is not always the frontmatter name:
            // `frontend-design-v2-2.0.0/SKILL.md` declares `name: frontend-design`. Matching on one
            // of the two alone leaves the skill looking permanently unloaded.
            directoryName = path.parent.name,
        )
    }

    private fun validatedSkillFile(location: String): Path {
        val path = Path.of(location).toAbsolutePath().normalize()
        require(roots().any { path.startsWith(it.path) }) { "技能不在受支持的目录中" }
        require(Files.isRegularFile(path)) { "技能文件不存在" }
        require(path.fileName.toString() in setOf("SKILL.md", "SKILL.md.disabled")) { "无效的技能文件" }
        return path
    }

    private fun chooseSkill(): Path? {
        var selected: Path? = null
        val choose = Runnable {
            val descriptor = FileChooserDescriptor(true, true, false, false, false, false)
                .withTitle("导入 OpenCode 技能")
                .withDescription("选择包含 SKILL.md 的目录或 SKILL.md 文件")
            selected = FileChooser.chooseFile(descriptor, project, null)?.toNioPath()
        }
        val app = ApplicationManager.getApplication()
        if (app.isDispatchThread) choose.run() else app.invokeAndWait(choose)
        return selected
    }

    private fun copyTree(source: Path, target: Path) {
        Files.walk(source).use { paths ->
            paths.forEach { item ->
                val destination = target.resolve(source.relativize(item)).normalize()
                require(destination.startsWith(target)) { "技能包含无效路径" }
                if (item.isDirectory()) Files.createDirectories(destination)
                else {
                    Files.createDirectories(destination.parent)
                    Files.copy(item, destination, StandardCopyOption.REPLACE_EXISTING)
                }
            }
        }
    }

    private fun deleteTree(target: Path) {
        Files.walk(target).use { paths ->
            paths.sorted(Comparator.reverseOrder()).forEach(Files::deleteIfExists)
        }
    }

    private fun refreshFiles() = VirtualFileManager.getInstance().asyncRefresh(null)

    private fun safeName(value: String): String = value.trim().lowercase()
        .replace(Regex("[^a-z0-9._-]+"), "-")
        .trim('-')
        .ifBlank { "imported-skill" }

    companion object {
        /**
         * The only sorts the listing endpoint accepts. It rejects everything else with
         * `400 参数错误：sortBy 不支持（updated_at/downloads/stars/installs/score）`, so
         * "curated_score" and "rank" are not offered.
         */
        private val CATALOG_SORTS = setOf(
            "score",
            "downloads",
            "stars",
            "installs",
            "updated_at",
        )
        private const val CATALOG_ENDPOINT = "https://api.skillhub.cn/api/skills"
        private const val SEARCH_ENDPOINT = "https://api.skillhub.cn/api/v1/search"
        private const val DOWNLOAD_ENDPOINT = "https://api.skillhub.cn/api/v1/download"
        private const val USER_AGENT = "capybara-idea-plugin"
    }
}
