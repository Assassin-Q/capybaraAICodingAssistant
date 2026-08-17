package com.aicoding.plugin.services

import com.intellij.openapi.components.PersistentStateComponent
import com.intellij.openapi.components.Service
import com.intellij.openapi.components.State
import com.intellij.openapi.components.Storage
import com.intellij.openapi.components.StoragePathMacros
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject

class WorkspacePreferencesState {
    var json: String = ""
}

/**
 * Persists non-secret panel preferences in IDEA's project workspace file.
 *
 * JCEF localStorage is scoped by origin, while the plugin frontend port changes after every IDEA
 * restart. Keeping the canonical copy here makes language, session tabs, personas and model labels
 * survive that port change without putting provider credentials into IDEA configuration.
 */
@State(
    name = "CapybaraWorkspacePreferences",
    storages = [Storage(StoragePathMacros.WORKSPACE_FILE)],
)
@Service(Service.Level.PROJECT)
class WorkspacePreferencesService : PersistentStateComponent<WorkspacePreferencesState> {
    private val parser = Json { ignoreUnknownKeys = true }
    private var value = WorkspacePreferencesState()

    override fun getState(): WorkspacePreferencesState = value

    override fun loadState(state: WorkspacePreferencesState) {
        value = state
    }

    @Synchronized
    fun read(): String = value.json.ifBlank { "null" }

    @Synchronized
    fun save(raw: String): String {
        require(raw.toByteArray(Charsets.UTF_8).size <= MAX_BYTES) { "偏好设置内容过大" }
        val parsed = parser.parseToJsonElement(raw)
        require(parsed is JsonObject) { "偏好设置必须是 JSON 对象" }
        return parsed.toString().also { value.json = it }
    }

    private companion object {
        const val MAX_BYTES = 1024 * 1024
    }
}
