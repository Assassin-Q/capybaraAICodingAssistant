package com.aicoding.plugin.services

import kotlinx.serialization.Serializable

@Serializable
data class OpenCodeInstallResponse(
    val success: Boolean,
    val message: String,
    val output: String = "",
    val requirement: OpenCodeRequirement? = null,
    val runtime: OpenCodeEndpoint? = null,
)

/** Coordinates executable maintenance with the local service process lifecycle. */
class OpenCodeLifecycleService(
    private val manager: OpenCodeServerManager,
    private val requirementService: OpenCodeRequirementService,
    private val projectPath: String?,
) {
    fun restart(frontendPort: Int, force: Boolean, theme: String): OpenCodeEndpoint = runCatching {
        manager.restart(frontendPort, force)
    }.getOrElse { error ->
        OpenCodeEndpoint(projectPath = projectPath, error = error.message ?: "无法重启 OpenCode 服务。")
    }.copy(frontendPort = frontendPort, ideaTheme = theme)

    fun install(frontendPort: Int, request: OpenCodeInstallRequest, theme: String): OpenCodeInstallResponse {
        val current = manager.endpoint()
        val externalServiceRunning = request.update && current.connected && !current.managed
        // Never terminate a service started from the user's terminal as an implicit side effect of
        // an in-app update. The replacement is installed and verified first as well, so a failed
        // download cannot take a working plugin-managed service offline.
        val result = requirementService.installOrUpdate(request.update)
        if (result.success && request.update && !externalServiceRunning) manager.stopForUpdate()
        val runtime = if (result.success) {
            runCatching { manager.start(frontendPort) }.getOrElse { error ->
                OpenCodeEndpoint(projectPath = projectPath, error = error.message ?: "无法启动 OpenCode 服务。")
            }
        } else {
            manager.endpoint()
        }.copy(frontendPort = frontendPort, ideaTheme = theme)
        val message = if (result.success && externalServiceRunning && runtime.connected) {
            "${result.message}，当前服务由终端启动，请手动重启 OpenCode 后生效。"
        } else if (result.success && !runtime.connected) {
            "${result.message}，但服务启动失败：${runtime.error.orEmpty()}"
        } else {
            result.message
        }
        return OpenCodeInstallResponse(
            success = result.success,
            message = message,
            output = result.output,
            requirement = result.requirement,
            runtime = runtime,
        )
    }
}
