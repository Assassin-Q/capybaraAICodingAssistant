package com.aicoding.plugin.services

import com.intellij.ide.BrowserUtil
import com.intellij.openapi.application.ApplicationInfo
import com.intellij.openapi.application.PathManager
import com.intellij.openapi.project.Project
import kotlinx.serialization.Serializable
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.booleanOrNull
import kotlinx.serialization.json.buildJsonArray
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.intOrNull
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import java.io.File
import java.net.HttpURLConnection
import java.net.URLEncoder
import java.net.URL
import java.security.MessageDigest
import java.util.concurrent.TimeUnit

@Serializable
data class MemoryPluginInfo(
    val id: String,
    val name: String,
    val spec: String,
    val description: String,
    val capabilities: List<String>,
    val fullIntegration: Boolean = false,
)

@Serializable
data class DevelopmentEnvironmentInfo(
    val id: String,
    val name: String,
    val version: String? = null,
    val paths: List<String> = emptyList(),
    val source: String,
    val manual: Boolean = false,
)

@Serializable
data class MemorySystemStatus(
    val enabled: Boolean,
    val autoInstall: Boolean,
    val installing: Boolean,
    val installed: Boolean,
    val pluginReady: Boolean,
    val restartRequired: Boolean,
    val plugins: List<MemoryPluginInfo>,
    val defaultPlugin: String = "opencode-mem",
    val autoCaptureEnabled: Boolean,
    val crossProjectEnabled: Boolean,
    val profileEnabled: Boolean,
    val environmentSyncEnabled: Boolean,
    val memoryProvider: String? = null,
    val memoryModel: String? = null,
    /**
     * Auto-capture sends an extra structured-output request to the model after every idle session.
     * Nothing in the UI used to say so, so the cost was invisible.
     */
    val captureCallsTotal: Long = 0,
    val captureCallsThisMonth: Long = 0,
    val captureCostVisible: Boolean = true,
    val storagePath: String,
    val dashboardUrl: String,
    val lastEnvironmentScan: Long? = null,
    val environments: List<DevelopmentEnvironmentInfo> = emptyList(),
    val stats: JsonElement? = null,
    val error: String? = null,
)

@Serializable
data class MemorySettingsRequest(
    val enabled: Boolean,
    val autoInstall: Boolean = true,
    val autoCaptureEnabled: Boolean = true,
    val crossProjectEnabled: Boolean = true,
    val profileEnabled: Boolean = true,
    val environmentSyncEnabled: Boolean = true,
    val memoryProvider: String? = null,
    val memoryModel: String? = null,
    val storagePath: String? = null,
)

@Serializable
data class DevelopmentEnvironmentsRequest(
    val environments: List<DevelopmentEnvironmentInfo>,
    val sync: Boolean = true,
)

@Serializable
data class MemoryActionResponse(
    val success: Boolean,
    val status: MemorySystemStatus? = null,
    val message: String? = null,
)

@Serializable
private data class MemoryLocalState(
    val enabled: Boolean = true,
    val autoInstall: Boolean = true,
    val environmentSyncEnabled: Boolean = true,
    val restartRequired: Boolean = false,
    val lastEnvironmentScan: Long? = null,
    val environmentFingerprint: String? = null,
)

class MemorySystemService(
    private val project: Project,
    private val openCodeServer: OpenCodeServerManager,
) {
    companion object {
        private const val DEFAULT_PLUGIN = "opencode-mem"
        private const val DEFAULT_MEMORY_PORT = 4747
        private const val ENVIRONMENT_MEMORY_TAG = "capybara-environment"
        private val MEMORY_PACKAGES = linkedMapOf(
            "opencode-mem" to MemoryPluginInfo(
                id = "opencode-mem",
                name = "OpenCode Mem",
                // Pinned to the scope that publishes the Turso/libSQL engine — "opencode-mem" is
                // also taken by an unrelated project on npm.
                spec = "opencode-mem",
                description = "本地 Turso/libSQL 向量库，自动捕获、跨项目用户画像与管理面板。自动捕获会额外调用一次模型。",
                capabilities = listOf("语义检索", "自动捕获（额外计费）", "跨项目检索", "用户画像", "本地存储"),
                fullIntegration = true,
            ),
            "opencode-agent-memory" to MemoryPluginInfo(
                id = "opencode-agent-memory",
                name = "Agent Memory",
                spec = "opencode-agent-memory",
                description = "基于可编辑记忆块和 AGENTS.md 的本地记忆 harness。",
                capabilities = listOf("记忆块", "项目记忆", "AGENTS.md"),
            ),
            "opencode-supermemory" to MemoryPluginInfo(
                id = "opencode-supermemory",
                name = "Supermemory",
                spec = "opencode-supermemory",
                description = "Supermemory 云端记忆，可用 npx supermemory local 自托管。默认数据会离开本机。",
                capabilities = listOf("云端记忆", "跨项目检索", "可自托管"),
            ),
            "opencode-working-memory" to MemoryPluginInfo(
                id = "opencode-working-memory",
                name = "Working Memory",
                spec = "opencode-working-memory",
                description = "把提取折进 OpenCode 自带的 compaction，不产生额外模型调用；没有向量检索。",
                capabilities = listOf("工作记忆", "会话压缩", "零额外调用"),
            ),
            "opencode-hindsight" to MemoryPluginInfo(
                id = "opencode-hindsight",
                name = "Hindsight",
                spec = "opencode-hindsight",
                description = "Vectorize 提供的托管记忆服务。",
                capabilities = listOf("云端记忆", "语义检索"),
            ),
            "nowledge-mem" to MemoryPluginInfo(
                id = "nowledge-mem",
                name = "Nowledge Mem",
                spec = "@nowledge/opencode-mem",
                description = "Nowledge Mem 的 OpenCode 集成。",
                capabilities = listOf("云端记忆", "跨项目检索"),
            ),
        )
    }

    private val json = Json {
        encodeDefaults = true
        ignoreUnknownKeys = true
        prettyPrint = true
    }
    private val configDirectory = File(System.getProperty("user.home"), ".config/opencode")
    private val memoryConfigFile = File(configDirectory, "opencode-mem.jsonc")
    private val memoryTokenFile = File(System.getProperty("user.home"), ".opencode-mem/.auth-token")
    private val stateFile = File(configDirectory, "capybara-memory.json")
    private val environmentFile = File(configDirectory, "capybara-environments.json")
    @Volatile private var installing = false
    @Volatile private var lastError: String? = null

    fun ensureDefaultInstalled(): MemorySystemStatus {
        val state = loadState()
        if (!state.enabled || !state.autoInstall) return status()
        val plugins = configuredMemoryPlugins()
        if (plugins.isEmpty()) {
            installDefault(force = false)
        } else if (plugins.any { it.id == DEFAULT_PLUGIN } && !memoryConfigFile.isFile) {
            configureDefaults()
            updateState(loadState().copy(restartRequired = true))
        }
        if (loadState().environmentSyncEnabled && loadEnvironments().isEmpty()) scanEnvironments(sync = true)
        return status()
    }

    @Synchronized
    fun installDefault(force: Boolean): MemoryActionResponse {
        if (installing) return MemoryActionResponse(false, status(), "记忆插件正在安装")
        installing = true
        lastError = null
        return try {
            val args = buildList {
                add("plugin")
                add(DEFAULT_PLUGIN)
                add("--global")
                if (force) add("--force")
            }
            val result = openCodeServer.runCli(args)
            if (result.timedOut || result.exitCode != 0) {
                val message = result.output.ifBlank { "安装记忆插件失败" }
                lastError = message
                MemoryActionResponse(false, status(), message)
            } else {
                configureDefaults()
                updateState(loadState().copy(restartRequired = true))
                if (loadState().environmentSyncEnabled) scanEnvironments(sync = true)
                MemoryActionResponse(true, status(), "OpenCode Mem 已安装；现有 OpenCode 服务重新载入后生效")
            }
        } catch (error: Exception) {
            lastError = error.message ?: "安装记忆插件失败"
            MemoryActionResponse(false, status(), lastError)
        } finally {
            installing = false
        }
    }

    @Synchronized
    fun updateSettings(request: MemorySettingsRequest): MemoryActionResponse {
        lastError = null
        val storageError = validateStoragePath(request.storagePath)
        if (storageError != null) return MemoryActionResponse(false, status(), storageError)
        val current = loadState()
        updateState(
            current.copy(
                enabled = request.enabled,
                autoInstall = request.autoInstall,
                environmentSyncEnabled = request.environmentSyncEnabled,
                restartRequired = current.restartRequired,
            )
        )
        if (request.enabled && configuredMemoryPlugins().isEmpty()) {
            val installed = installDefault(force = false)
            if (!installed.success) return installed
        }
        val integrated = configuredMemoryPlugins().any { it.id == DEFAULT_PLUGIN }
        if (!integrated) {
            updateState(loadState().copy(restartRequired = false))
            return MemoryActionResponse(
                true,
                status(),
                "已保留现有社区记忆插件；安装 OpenCode Mem 后可在此管理自动捕获、用户画像和跨项目召回。",
            )
        }
        updateMemoryConfig(request)
        updateState(loadState().copy(restartRequired = true))
        if (request.enabled && request.environmentSyncEnabled) scanEnvironments(sync = true)
        return MemoryActionResponse(true, status(), "记忆设置已保存，OpenCode 重新载入后应用新配置")
    }

    fun status(): MemorySystemStatus {
        val state = loadState()
        val config = loadMemoryConfig()
        val plugins = configuredMemoryPlugins()
        val fullPlugin = plugins.any { it.id == DEFAULT_PLUGIN }
        val port = config.int("webServerPort") ?: DEFAULT_MEMORY_PORT
        val dashboardUrl = "http://127.0.0.1:$port"
        val pluginReady = fullPlugin && request(dashboardUrl + "/api/health")?.status in 200..299
        if (pluginReady && state.restartRequired) updateState(state.copy(restartRequired = false))
        val stats = if (pluginReady) memoryApi("/api/stats")?.body?.let(::parseElement) else null
        val memory = config.objectValue("memory")
        val profileInterval = config.int("userProfileAnalysisInterval") ?: 10
        val environments = loadEnvironments()
        return MemorySystemStatus(
            enabled = state.enabled,
            autoInstall = state.autoInstall,
            installing = installing,
            installed = plugins.isNotEmpty(),
            pluginReady = pluginReady,
            restartRequired = !pluginReady && (state.restartRequired || fullPlugin),
            plugins = plugins,
            autoCaptureEnabled = config.boolean("autoCaptureEnabled") ?: true,
            crossProjectEnabled = memory?.string("defaultScope") != "project",
            profileEnabled = (config.boolean("injectProfile") ?: true) && profileInterval > 0,
            environmentSyncEnabled = state.environmentSyncEnabled,
            memoryProvider = config.string("opencodeProvider") ?: config.string("memoryProvider"),
            memoryModel = config.string("opencodeModel") ?: config.string("memoryModel"),
            captureCallsTotal = captureCounts().first,
            captureCallsThisMonth = captureCounts().second,
            storagePath = expandPath(config.string("storagePath") ?: "~/.opencode-mem/data"),
            dashboardUrl = dashboardUrl,
            lastEnvironmentScan = state.lastEnvironmentScan,
            environments = environments,
            stats = stats,
            error = lastError,
        )
    }

    /**
     * How many memories the engine captured in total and this month.
     *
     * Each captured memory corresponds to one extra structured-output request, so the row count is
     * the closest honest proxy for "how many times has this billed me" without the engine exposing
     * a call counter of its own.
     */
    private fun captureCounts(): Pair<Long, Long> = runCatching {
        val items = memoryApi("/api/memories?page=1&pageSize=1000&includePrompts=false")
            ?.takeIf { it.status in 200..299 }
            ?.let { json.parseToJsonElement(it.body) as? JsonObject }
            ?.get("data")?.let { it as? JsonObject }
            ?.get("items") as? JsonArray
            ?: return 0L to 0L
        val monthStart = java.time.YearMonth.now()
            .atDay(1).atStartOfDay(java.time.ZoneId.systemDefault()).toInstant().toEpochMilli()
        val thisMonth = items.count { element ->
            val created = (element as? JsonObject)?.string("createdAt") ?: return@count false
            runCatching { java.time.Instant.parse(created).toEpochMilli() >= monthStart }.getOrDefault(false)
        }
        items.size.toLong() to thisMonth.toLong()
    }.getOrDefault(0L to 0L)

    fun scanEnvironments(sync: Boolean): MemoryActionResponse {
        return try {
            val manualEnvironments = loadEnvironments().filter { it.manual }
            val environments = mergeEnvironmentOverrides(buildEnvironmentIndex(), manualEnvironments)
            environmentFile.parentFile?.mkdirs()
            environmentFile.writeText(json.encodeToString(environments), Charsets.UTF_8)
            val content = environmentMemory(environments)
            val fingerprint = sha256(content)
            val current = loadState()
            updateState(current.copy(lastEnvironmentScan = System.currentTimeMillis(), environmentFingerprint = fingerprint))
            val syncMessage = if (sync && current.enabled && current.environmentSyncEnabled) {
                syncEnvironmentMemory(content, fingerprint, current.environmentFingerprint)
            } else null
            MemoryActionResponse(true, status(), syncMessage ?: "已扫描 ${environments.size} 项开发环境")
        } catch (error: Exception) {
            lastError = error.message ?: "开发环境扫描失败"
            MemoryActionResponse(false, status(), lastError)
        }
    }

    @Synchronized
    fun updateEnvironments(request: DevelopmentEnvironmentsRequest): MemoryActionResponse {
        return try {
            val environments = request.environments.mapIndexed { index, environment ->
                val name = environment.name.trim()
                require(name.isNotEmpty()) { "第 ${index + 1} 项开发环境缺少名称" }
                val paths = environment.paths.map(String::trim).filter(String::isNotEmpty).distinct()
                require(paths.isNotEmpty()) { "${name} 至少需要一个路径" }
                environment.copy(
                    id = environment.id.trim().ifEmpty { "manual-${sha256("$name-${paths.joinToString()}").take(12)}" },
                    name = name,
                    version = environment.version?.trim()?.takeIf(String::isNotEmpty),
                    paths = paths,
                    source = environment.source.trim().ifEmpty { "手动" },
                )
            }.distinctBy { it.id }
            environmentFile.parentFile?.mkdirs()
            environmentFile.writeText(json.encodeToString(environments), Charsets.UTF_8)
            val content = environmentMemory(environments)
            val fingerprint = sha256(content)
            val current = loadState()
            updateState(current.copy(lastEnvironmentScan = System.currentTimeMillis(), environmentFingerprint = fingerprint))
            val syncMessage = if (request.sync && current.enabled && current.environmentSyncEnabled) {
                syncEnvironmentMemory(content, fingerprint, current.environmentFingerprint)
            } else null
            MemoryActionResponse(true, status(), syncMessage ?: "已保存 ${environments.size} 项开发环境")
        } catch (error: Exception) {
            lastError = error.message ?: "保存开发环境失败"
            MemoryActionResponse(false, status(), lastError)
        }
    }

    fun listMemories(query: String?): String = memoryApi(
        "/api/memories?${query?.takeIf { it.isNotBlank() } ?: "page=1&pageSize=30&includePrompts=false"}"
    )?.body ?: unavailableMemoryResponse()

    fun addMemory(body: String): String {
        val root = runCatching { json.parseToJsonElement(body).jsonObject.toMutableMap() }.getOrNull()
            ?: return memoryErrorResponse("记忆内容格式无效")
        val content = root["content"]?.jsonPrimitive?.contentOrNull?.trim()
        if (content.isNullOrEmpty()) return memoryErrorResponse("记忆内容不能为空")

        val identity = userMemoryIdentity()
        root["containerTag"] = JsonPrimitive(identity.tag)
        if (root["displayName"] == null) root["displayName"] = JsonPrimitive("用户全局记忆")
        identity.userName?.let { root["userName"] = JsonPrimitive(it) }
        identity.userEmail?.let { root["userEmail"] = JsonPrimitive(it) }
        val tags = ((root["tags"] as? JsonArray).orEmpty().mapNotNull { it.jsonPrimitive.contentOrNull } +
            listOf("capybara", "user", "global")).distinct()
        root["tags"] = buildJsonArray { tags.forEach { add(JsonPrimitive(it)) } }
        return memoryApi("/api/memories", "POST", JsonObject(root).toString())?.body
            ?: unavailableMemoryResponse()
    }

    fun deleteMemory(id: String): String {
        require(id.matches(Regex("[A-Za-z0-9_-]+"))) { "无效的记忆 ID" }
        return memoryApi("/api/memories/$id?cascade=true", "DELETE")?.body ?: unavailableMemoryResponse()
    }

    fun userProfile(): String = memoryApi("/api/user-profile")?.body ?: unavailableMemoryResponse()

    fun refreshUserProfile(): String = memoryApi("/api/user-profile/refresh", "POST", "{}")?.body
        ?: unavailableMemoryResponse()

    fun openDashboard(): MemoryActionResponse {
        val current = status()
        BrowserUtil.browse(current.dashboardUrl)
        return MemoryActionResponse(true, current, "已打开记忆管理面板")
    }

    private fun configureDefaults() {
        val inferred = inferCurrentModel()
        updateMemoryConfig(
            MemorySettingsRequest(
                enabled = true,
                autoInstall = true,
                autoCaptureEnabled = true,
                crossProjectEnabled = true,
                profileEnabled = true,
                environmentSyncEnabled = true,
                memoryProvider = inferred?.first,
                memoryModel = inferred?.second,
                storagePath = "~/.opencode-mem/data",
            )
        )
    }

    private fun updateMemoryConfig(request: MemorySettingsRequest) {
        val root = loadMemoryConfig().toMutableMap()
        val active = request.enabled
        root["autoCaptureEnabled"] = JsonPrimitive(active && request.autoCaptureEnabled)
        root["injectProfile"] = JsonPrimitive(active && request.profileEnabled)
        root["userProfileAnalysisInterval"] = JsonPrimitive(if (active && request.profileEnabled) 10 else 0)
        root["webServerEnabled"] = JsonPrimitive(true)
        root["webServerHost"] = JsonPrimitive("127.0.0.1")
        root["webServerPort"] = JsonPrimitive(root["webServerPort"]?.jsonPrimitive?.intOrNull ?: DEFAULT_MEMORY_PORT)

        val memory = (root["memory"] as? JsonObject)?.toMutableMap() ?: mutableMapOf()
        memory["defaultScope"] = JsonPrimitive(if (request.crossProjectEnabled) "all-projects" else "project")
        root["memory"] = JsonObject(memory)

        val chat = (root["chatMessage"] as? JsonObject)?.toMutableMap() ?: mutableMapOf()
        chat["enabled"] = JsonPrimitive(active)
        chat["excludeCurrentSession"] = JsonPrimitive(true)
        chat["injectOn"] = JsonPrimitive("first")
        root["chatMessage"] = JsonObject(chat)

        // Zero-cost mode: with auto-capture off, extraction still happens — but only inside
        // OpenCode's own compaction request, so it costs no extra model call. Turning the switch
        // off used to mean "remember nothing", which is a worse trade than most users expect.
        val compaction = (root["compaction"] as? JsonObject)?.toMutableMap() ?: mutableMapOf()
        compaction["enabled"] = JsonPrimitive(active)
        root["compaction"] = JsonObject(compaction)

        request.memoryProvider?.trim()?.let {
            if (it.isEmpty()) root.remove("opencodeProvider") else root["opencodeProvider"] = JsonPrimitive(it)
        }
        request.memoryModel?.trim()?.let {
            if (it.isEmpty()) root.remove("opencodeModel") else root["opencodeModel"] = JsonPrimitive(it)
        }
        request.storagePath?.trim()?.takeIf { it.isNotEmpty() }?.let {
            root["storagePath"] = JsonPrimitive(normalizePath(expandPath(it)))
        }
        writeMemoryConfig(JsonObject(root))
    }

    private fun configuredMemoryPlugins(): List<MemoryPluginInfo> {
        val specs = linkedSetOf<String>()
        openCodeServer.endpoint().baseUrl?.let { baseUrl ->
            val response = request("$baseUrl/global/config")
            if (response?.status in 200..299) specs += pluginSpecs(parseObject(response?.body.orEmpty()))
        }
        listOf("opencode.json", "opencode.jsonc", "config.json").forEach { filename ->
            val file = File(configDirectory, filename)
            if (!file.isFile) return@forEach
            val root = runCatching { parseObject(sanitizeJsonc(file.readText(Charsets.UTF_8))) }.getOrNull()
                ?: return@forEach
            specs += pluginSpecs(root)
        }
        return specs.mapNotNull(::memoryPlugin).distinctBy { it.id }
    }

    private fun pluginSpecs(root: JsonObject): List<String> {
        val plugins = root["plugin"] as? JsonArray ?: return emptyList()
        return plugins.mapNotNull { element ->
            val spec = when (element) {
                is JsonPrimitive -> element.contentOrNull
                is JsonArray -> (element.firstOrNull() as? JsonPrimitive)?.contentOrNull
                else -> null
            }
            spec
        }
    }

    private fun memoryPlugin(spec: String): MemoryPluginInfo? {
        val pkg = packageName(spec)
        val known = MEMORY_PACKAGES[pkg]
        if (known != null) return known.copy(spec = spec)
        if (!pkg.contains("memory", ignoreCase = true)) return null
        return MemoryPluginInfo(
            id = pkg,
            name = pkg,
            spec = spec,
            description = "检测到社区记忆插件，当前以兼容模式显示。",
            capabilities = listOf("社区插件"),
        )
    }

    private fun packageName(spec: String): String {
        if (spec.startsWith("file:", true)) return spec.substringAfterLast('/').substringBeforeLast('.')
        val value = spec.substringBefore('?')
        return if (value.startsWith("@")) {
            val slash = value.indexOf('/')
            val version = value.indexOf('@', slash + 1)
            if (version > slash) value.substring(0, version) else value
        } else value.substringBefore('@')
    }

    private fun inferCurrentModel(): Pair<String, String>? {
        val baseUrl = openCodeServer.endpoint().baseUrl ?: return null
        val directory = project.basePath ?: return null
        val query = URLEncoder.encode(directory, Charsets.UTF_8.name())
        val response = request("$baseUrl/api/session?directory=$query&limit=1") ?: return null
        val root = parseObject(response.body)
        val session = (root["data"] as? JsonArray)?.firstOrNull()?.jsonObject ?: return null
        val model = session["model"]?.jsonObject ?: return null
        val provider = model.string("providerID") ?: return null
        val id = model.string("id") ?: model.string("modelID") ?: return null
        return provider to id
    }

    private fun syncEnvironmentMemory(content: String, fingerprint: String, previousFingerprint: String?): String {
        if (fingerprint == previousFingerprint) return "开发环境未变化，已保留现有全局记忆"
        if (!status().pluginReady) return "开发环境已保存；记忆插件重新载入后会同步为全局记忆"
        val identity = userMemoryIdentity()
        val tag = URLEncoder.encode(identity.tag, Charsets.UTF_8.name())
        val list = memoryApi("/api/memories?tag=$tag&page=1&pageSize=10&includePrompts=false")?.body
        val data = list?.let(::parseObject)?.get("data") as? JsonObject
        val items = data?.get("items") as? JsonArray
        val existing = items
            ?.mapNotNull { it as? JsonObject }
            ?.firstOrNull { item ->
                (item["tags"] as? JsonArray)
                    ?.any { it.jsonPrimitive.contentOrNull == ENVIRONMENT_MEMORY_TAG } == true
            }
            ?.string("id")
        val payload = buildJsonObject {
            put("content", JsonPrimitive(content))
            if (existing == null) {
                put("containerTag", JsonPrimitive(identity.tag))
                put("type", JsonPrimitive("environment"))
                put("tags", buildJsonArray {
                    add(JsonPrimitive("capybara"))
                    add(JsonPrimitive(ENVIRONMENT_MEMORY_TAG))
                    add(JsonPrimitive("global"))
                })
                put("displayName", JsonPrimitive("本机开发环境"))
                identity.userName?.let { put("userName", JsonPrimitive(it)) }
                identity.userEmail?.let { put("userEmail", JsonPrimitive(it)) }
            }
        }.toString()
        val result = if (existing == null) {
            memoryApi("/api/memories", "POST", payload)
        } else {
            memoryApi("/api/memories/$existing", "PUT", payload)
        }
        return if (result?.status in 200..299) "开发环境已同步到跨项目用户记忆" else "开发环境已保存，但同步记忆失败"
    }

    private data class UserMemoryIdentity(
        val tag: String,
        val displayName: String,
        val userName: String?,
        val userEmail: String?,
    )

    private fun userMemoryIdentity(): UserMemoryIdentity {
        val config = loadMemoryConfig()
        val prefix = config.string("containerTagPrefix") ?: "opencode"
        val email = config.string("userEmailOverride") ?: gitConfig("user.email")
        val name = config.string("userNameOverride") ?: gitConfig("user.name")
        val fallback = name ?: System.getenv("USER") ?: System.getenv("USERNAME") ?: "anonymous"
        val identity = email ?: fallback
        return UserMemoryIdentity(
            tag = "${prefix}_user_${sha256(identity).take(16)}",
            displayName = name ?: email ?: fallback,
            userName = name,
            userEmail = email,
        )
    }

    private fun gitConfig(key: String): String? = commandOutput(listOf("git.exe", "config", key))

    private fun buildEnvironmentIndex(): List<DevelopmentEnvironmentInfo> {
        val items = mutableListOf<DevelopmentEnvironmentInfo>()
        val ideaHome = File(PathManager.getHomePath()).absolutePath
        items += DevelopmentEnvironmentInfo(
            id = "idea",
            name = "IntelliJ IDEA",
            version = ApplicationInfo.getInstance().fullVersion,
            paths = listOf(ideaHome),
            source = "IDEA",
        )
        environmentFromHome("jdk", "JDK", "JAVA_HOME", "bin/java.exe", listOf("-version"))?.let(items::add)
        scanCommand("java", "Java", "java.exe", listOf("-version"))?.let { items.merge(it) }
        environmentFromHome("gradle-home", "Gradle", "GRADLE_HOME", "bin/gradle.bat", listOf("--version"))?.let { items.merge(it) }
        environmentFromHome("maven-home", "Maven", "MAVEN_HOME", "bin/mvn.cmd", listOf("--version"))?.let { items.merge(it) }
        environmentFromHome("android-sdk", "Android SDK", "ANDROID_SDK_ROOT", "platform-tools/adb.exe", listOf("version"))?.let(items::add)
        environmentFromHome("android-home", "Android SDK", "ANDROID_HOME", "platform-tools/adb.exe", listOf("version"))?.let { items.merge(it) }
        listOf(
            ToolProbe("node", "Node.js", "node.exe", listOf("--version")),
            ToolProbe("pnpm", "pnpm", "pnpm.cmd", listOf("--version")),
            ToolProbe("npm", "npm", "npm.cmd", listOf("--version")),
            ToolProbe("yarn", "Yarn", "yarn.cmd", listOf("--version")),
            ToolProbe("bun", "Bun", "bun.exe", listOf("--version")),
            ToolProbe("python", "Python", "python.exe", listOf("--version")),
            ToolProbe("uv", "uv", "uv.exe", listOf("--version")),
            ToolProbe("conda", "Conda", "conda.exe", listOf("--version")),
            ToolProbe("git", "Git", "git.exe", listOf("--version")),
            ToolProbe("gradle", "Gradle", "gradle.bat", listOf("--version")),
            ToolProbe("maven", "Maven", "mvn.cmd", listOf("--version")),
            ToolProbe("cmake", "CMake", "cmake.exe", listOf("--version")),
            ToolProbe("ninja", "Ninja", "ninja.exe", listOf("--version")),
            ToolProbe("go", "Go", "go.exe", listOf("version")),
            ToolProbe("rust", "Rust", "rustc.exe", listOf("--version")),
            ToolProbe("cargo", "Cargo", "cargo.exe", listOf("--version")),
            ToolProbe("ruby", "Ruby", "ruby.exe", listOf("--version")),
            ToolProbe("php", "PHP", "php.exe", listOf("--version")),
            ToolProbe("composer", "Composer", "composer.bat", listOf("--version")),
            ToolProbe("dotnet", ".NET SDK", "dotnet.exe", listOf("--version")),
            ToolProbe("flutter", "Flutter", "flutter.bat", listOf("--version")),
            ToolProbe("dart", "Dart", "dart.exe", listOf("--version")),
            ToolProbe("docker", "Docker", "docker.exe", listOf("--version")),
            ToolProbe("kubectl", "kubectl", "kubectl.exe", listOf("version", "--client")),
            ToolProbe("terraform", "Terraform", "terraform.exe", listOf("version")),
            ToolProbe("aws", "AWS CLI", "aws.exe", listOf("--version")),
            ToolProbe("azure", "Azure CLI", "az.cmd", listOf("version")),
            ToolProbe("gcloud", "Google Cloud CLI", "gcloud.cmd", listOf("version")),
            ToolProbe("wsl", "Windows Subsystem for Linux", "wsl.exe", listOf("--version")),
            ToolProbe("adb", "Android Debug Bridge", "adb.exe", listOf("version")),
            ToolProbe("vscode", "Visual Studio Code", "code.cmd", listOf("--version")),
            ToolProbe("opencode", "OpenCode", "opencode.cmd", listOf("--version")),
        ).forEach { probe -> scanCommand(probe.id, probe.name, probe.command, probe.versionArgs)?.let { items.merge(it) } }
        return items
            .map { it.copy(paths = it.paths.map(::normalizePath).distinct()) }
            .sortedBy { it.name.lowercase() }
    }

    private data class ToolProbe(val id: String, val name: String, val command: String, val versionArgs: List<String>)

    private fun environmentFromHome(
        id: String,
        name: String,
        variable: String,
        executable: String,
        versionArgs: List<String>,
    ): DevelopmentEnvironmentInfo? {
        val home = System.getenv(variable)?.trim()?.takeIf { it.isNotEmpty() } ?: return null
        val binary = File(home, executable)
        val version = if (binary.isFile) commandOutput(listOf(binary.absolutePath) + versionArgs) else null
        return DevelopmentEnvironmentInfo(id, name, version, listOf(home), variable)
    }

    private fun scanCommand(
        id: String,
        name: String,
        command: String,
        versionArgs: List<String>,
    ): DevelopmentEnvironmentInfo? {
        val paths = where(command)
        if (paths.isEmpty()) return null
        val version = commandOutput(listOf(paths.first()) + versionArgs)
        return DevelopmentEnvironmentInfo(id, name, version, paths, "PATH")
    }

    private fun MutableList<DevelopmentEnvironmentInfo>.merge(item: DevelopmentEnvironmentInfo) {
        val index = indexOfFirst { it.name.equals(item.name, ignoreCase = true) }
        if (index < 0) {
            add(item)
            return
        }
        val current = this[index]
        this[index] = current.copy(
            version = current.version ?: item.version,
            paths = (current.paths + item.paths).distinct(),
            source = listOf(current.source, item.source).distinct().joinToString(" + "),
        )
    }

    private fun mergeEnvironmentOverrides(
        detected: List<DevelopmentEnvironmentInfo>,
        manual: List<DevelopmentEnvironmentInfo>,
    ): List<DevelopmentEnvironmentInfo> {
        val merged = detected.associateByTo(linkedMapOf()) { it.id }
        manual.forEach { merged[it.id] = it.copy(manual = true) }
        return merged.values.sortedBy { it.name.lowercase() }
    }

    private fun where(command: String): List<String> = runCatching {
        val child = ProcessBuilder("where.exe", command).redirectErrorStream(true).start()
        child.inputStream.bufferedReader(Charsets.UTF_8).readLines()
            .also { child.waitFor(3, TimeUnit.SECONDS) }
            .map(String::trim)
            .filter { it.isNotEmpty() && File(it).exists() }
    }.getOrDefault(emptyList())

    private fun commandOutput(command: List<String>): String? = runCatching {
        val child = ProcessBuilder(windowsCommand(command)).redirectErrorStream(true).start()
        val output = child.inputStream.readBytes()
        if (!child.waitFor(5, TimeUnit.SECONDS)) child.destroyForcibly()
        decodeCommandOutput(output).lineSequence().firstOrNull { it.isNotBlank() }?.trim()?.take(160)
    }.getOrNull()

    private fun decodeCommandOutput(output: ByteArray): String {
        if (output.isEmpty()) return ""
        val sampleSize = minOf(output.size, 64)
        val oddNulls = (1 until sampleSize step 2).count { output[it] == 0.toByte() }
        if (sampleSize >= 4 && oddNulls >= sampleSize / 4) return output.toString(Charsets.UTF_16LE)

        val utf8 = output.toString(Charsets.UTF_8)
        if (!utf8.contains('\uFFFD')) return utf8
        return runCatching { output.toString(charset("GB18030")) }.getOrDefault(utf8)
    }

    private fun windowsCommand(command: List<String>): List<String> {
        val executable = command.firstOrNull().orEmpty()
        if (!executable.endsWith(".cmd", true) && !executable.endsWith(".bat", true)) return command
        val line = command.joinToString(" ") { "\"${it.replace("\"", "\"\"")}\"" }
        return listOf("cmd.exe", "/d", "/s", "/c", "\"$line\"")
    }

    private fun environmentMemory(environments: List<DevelopmentEnvironmentInfo>): String = buildString {
        appendLine("# 用户全局开发环境")
        appendLine()
        appendLine("以下环境由水豚 AI 的 IDEA 插件在本机检测，可在不同项目中复用。路径仅用于本地任务规划，不应对外泄露。")
        appendLine()
        environments.forEach { environment ->
            append("- **").append(environment.name).append("**")
            environment.version?.let { append(": ").append(it) }
            if (environment.paths.isNotEmpty()) append(" — ").append(environment.paths.joinToString("; "))
            appendLine()
        }
    }.trim()

    private fun memoryApi(path: String, method: String = "GET", body: String? = null): HttpResult? {
        val config = loadMemoryConfig()
        val port = config.int("webServerPort") ?: DEFAULT_MEMORY_PORT
        val baseUrl = "http://127.0.0.1:$port"
        val token = memoryApiToken(baseUrl) ?: return null
        return request(baseUrl + path, method, body, mapOf("x-opencode-mem-token" to token))
    }

    private fun memoryApiToken(baseUrl: String): String? {
        val stored = runCatching { memoryTokenFile.readText(Charsets.UTF_8).trim() }
            .getOrNull()
            ?.takeIf { it.isNotEmpty() }
        if (stored != null) return stored
        val html = request(baseUrl)?.body ?: return null
        val encoded = Regex("window\\.__OPENCODE_MEM_TOKEN__=([^;]+);").find(html)?.groupValues?.getOrNull(1)
            ?: return null
        return runCatching { json.parseToJsonElement(encoded).jsonPrimitive.content }.getOrNull()
    }

    private data class HttpResult(val status: Int, val body: String)

    private fun request(
        target: String,
        method: String = "GET",
        body: String? = null,
        headers: Map<String, String> = emptyMap(),
    ): HttpResult? = runCatching {
        val connection = URL(target).openConnection() as HttpURLConnection
        connection.connectTimeout = 2_500
        connection.readTimeout = 30_000
        connection.requestMethod = method
        connection.setRequestProperty("Accept", "application/json")
        headers.forEach(connection::setRequestProperty)
        if (body != null) {
            connection.doOutput = true
            connection.setRequestProperty("Content-Type", "application/json; charset=utf-8")
            connection.outputStream.use { it.write(body.toByteArray(Charsets.UTF_8)) }
        }
        val status = connection.responseCode
        val stream = if (status in 200..399) connection.inputStream else connection.errorStream
        val responseBody = stream?.bufferedReader(Charsets.UTF_8)?.use { it.readText() }.orEmpty()
        connection.disconnect()
        HttpResult(status, responseBody)
    }.getOrNull()

    private fun loadMemoryConfig(): JsonObject {
        if (!memoryConfigFile.isFile) return JsonObject(emptyMap())
        return runCatching { parseObject(sanitizeJsonc(memoryConfigFile.readText(Charsets.UTF_8))) }
            .getOrDefault(JsonObject(emptyMap()))
    }

    private fun writeMemoryConfig(value: JsonObject) {
        configDirectory.mkdirs()
        if (memoryConfigFile.isFile) {
            val backup = File(configDirectory, "opencode-mem.jsonc.capybara.bak")
            if (!backup.exists()) memoryConfigFile.copyTo(backup)
        }
        memoryConfigFile.writeText(json.encodeToString(JsonObject.serializer(), value), Charsets.UTF_8)
    }

    private fun loadState(): MemoryLocalState = runCatching {
        json.decodeFromString<MemoryLocalState>(stateFile.readText(Charsets.UTF_8))
    }.getOrDefault(MemoryLocalState())

    private fun updateState(state: MemoryLocalState) {
        configDirectory.mkdirs()
        stateFile.writeText(json.encodeToString(state), Charsets.UTF_8)
    }

    private fun loadEnvironments(): List<DevelopmentEnvironmentInfo> = runCatching {
        json.decodeFromString<List<DevelopmentEnvironmentInfo>>(environmentFile.readText(Charsets.UTF_8))
    }.getOrDefault(emptyList())

    private fun sanitizeJsonc(source: String): String = MemoryConfigFile.sanitizeJsonc(source)

    private fun parseObject(value: String): JsonObject = runCatching {
        json.parseToJsonElement(value).jsonObject
    }.getOrDefault(JsonObject(emptyMap()))

    private fun parseElement(value: String): JsonElement = runCatching {
        json.parseToJsonElement(value)
    }.getOrDefault(JsonNull)

    private fun unavailableMemoryResponse(): String = buildJsonObject {
        put("success", JsonPrimitive(false))
        put("error", JsonPrimitive("记忆服务尚未就绪，请重新载入 OpenCode 后重试"))
    }.toString()

    private fun memoryErrorResponse(message: String): String = buildJsonObject {
        put("success", JsonPrimitive(false))
        put("error", JsonPrimitive(message))
    }.toString()

    private fun expandPath(path: String): String = MemoryConfigFile.expandPath(path)

    private fun validateStoragePath(path: String?): String? {
        val value = path?.trim() ?: return null
        if (value.isEmpty()) return "记忆存储位置不能为空"
        val directory = File(expandPath(value))
        if (!directory.isAbsolute) return "记忆存储位置需要使用绝对路径或 ~/ 开头的路径"
        if (directory.exists() && !directory.isDirectory) return "记忆存储位置指向了文件，请选择目录"
        return runCatching {
            if (!directory.exists()) require(directory.mkdirs()) { "无法创建记忆存储目录" }
            null
        }.getOrElse { it.message ?: "无法使用该记忆存储目录" }
    }

    private fun normalizePath(path: String): String = runCatching { File(path).canonicalPath }.getOrDefault(path)

    private fun sha256(value: String): String = MessageDigest.getInstance("SHA-256")
        .digest(value.toByteArray(Charsets.UTF_8))
        .joinToString("") { "%02x".format(it) }

    private fun JsonObject.string(key: String): String? = this[key]?.jsonPrimitive?.contentOrNull
    private fun JsonObject.boolean(key: String): Boolean? = this[key]?.jsonPrimitive?.booleanOrNull
    private fun JsonObject.int(key: String): Int? = this[key]?.jsonPrimitive?.intOrNull
    private fun JsonObject.objectValue(key: String): JsonObject? = this[key] as? JsonObject
}
