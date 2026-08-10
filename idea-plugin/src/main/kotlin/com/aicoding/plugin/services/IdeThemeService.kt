package com.aicoding.plugin.services

import com.intellij.ide.actions.QuickChangeLookAndFeel
import com.intellij.ide.projectView.ProjectView
import com.intellij.ide.ui.LafManager
import com.intellij.ide.util.PropertiesComponent
import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.diagnostic.Logger
import com.intellij.openapi.project.ProjectManager
import com.intellij.openapi.util.IconLoader
import kotlinx.serialization.Serializable
import javax.swing.UIManager

@Serializable
data class IdeThemeRequest(val theme: String)

@Serializable
data class IdeThemeMappingRequest(
    val lightThemeId: String,
    val darkThemeId: String,
    val syncWithOs: Boolean? = null,
)

@Serializable
data class IdeThemeOption(
    val id: String,
    val name: String,
    val dark: Boolean,
    val current: Boolean,
)

@Serializable
data class IdeThemeResponse(
    val success: Boolean,
    val theme: String,
    val currentThemeId: String? = null,
    val currentThemeName: String? = null,
    val lightThemeId: String? = null,
    val darkThemeId: String? = null,
    val syncWithOs: Boolean = false,
    val syncWithOsSupported: Boolean = false,
    val themes: List<IdeThemeOption> = emptyList(),
    val message: String? = null,
)

/** Maps the assistant's light/dark switch to exact IDEA look-and-feel entries. */
object IdeThemeService {
    private val logger = Logger.getInstance(IdeThemeService::class.java)

    fun currentTheme(): String {
        val manager = runCatching { LafManager.getInstance() }.getOrNull()
        return if (manager?.currentLookAndFeel?.let(::isDark) == true) "dark" else "light"
    }

    fun settings(): IdeThemeResponse {
        val manager = runCatching { LafManager.getInstance() }.getOrNull()
            ?: return IdeThemeResponse(false, currentTheme(), message = "无法访问 IDEA 主题管理器")
        return snapshot(manager, success = true)
    }

    fun apply(request: IdeThemeRequest): IdeThemeResponse {
        val requestedMode = request.theme.trim().lowercase()
        if (requestedMode != "dark" && requestedMode != "light") {
            return settings().copy(success = false, message = "主题模式只能是 light 或 dark")
        }

        val manager = runCatching { LafManager.getInstance() }.getOrNull()
            ?: return IdeThemeResponse(false, currentTheme(), message = "无法访问 IDEA 主题管理器")
        val wantDark = requestedMode == "dark"
        val targetId = mappedThemeId(manager, wantDark)
        val target = manager.installedLookAndFeels.firstOrNull { themeId(it) == targetId }
            ?: return snapshot(manager, false, "映射的 IDEA 主题已经不可用，请重新选择")

        return runCatching {
            runOnUiThread {
                if (themeId(manager.currentLookAndFeel) != themeId(target)) {
                    switchTheme(manager, target)
                }
            }
            snapshot(manager, true, "已切换 IDEA 主题：${target.name}")
        }.getOrElse { error ->
            logger.info("Unable to switch the IDEA theme: ${error.message}")
            snapshot(manager, false, error.message ?: "切换 IDEA 主题失败")
        }
    }

    fun updateMapping(request: IdeThemeMappingRequest): IdeThemeResponse {
        val manager = runCatching { LafManager.getInstance() }.getOrNull()
            ?: return IdeThemeResponse(false, currentTheme(), message = "无法访问 IDEA 主题管理器")
        val installed = manager.installedLookAndFeels.toList()
        val light = installed.firstOrNull { themeId(it) == request.lightThemeId }
            ?: return snapshot(manager, false, "选择的明亮主题已经不可用")
        val dark = installed.firstOrNull { themeId(it) == request.darkThemeId }
            ?: return snapshot(manager, false, "选择的暗色主题已经不可用")
        if (isDark(light)) return snapshot(manager, false, "明亮模式不能映射到暗色主题：${light.name}")
        if (!isDark(dark)) return snapshot(manager, false, "暗色模式不能映射到明亮主题：${dark.name}")

        return runCatching {
            val properties = PropertiesComponent.getInstance()
            properties.setValue(LIGHT_THEME_KEY, themeId(light))
            properties.setValue(DARK_THEME_KEY, themeId(dark))
            runOnUiThread {
                // Best-effort: the mapping is also persisted to our own properties above, which is
                // what mappedThemeId actually reads, so losing the platform setters costs nothing.
                setPreferredLaf(manager, dark = false, target = light)
                setPreferredLaf(manager, dark = true, target = dark)
                if (request.syncWithOs != null && manager.autodetectSupported) {
                    manager.autodetect = request.syncWithOs
                }
                val target = if (isDark(manager.currentLookAndFeel)) dark else light
                if (themeId(manager.currentLookAndFeel) != themeId(target)) {
                    switchTheme(manager, target)
                }
            }
            snapshot(manager, true, "主题映射已保存并应用")
        }.getOrElse { error ->
            logger.info("Unable to save the IDEA theme mapping: ${error.message}")
            snapshot(manager, false, error.message ?: "保存主题映射失败")
        }
    }

    private fun snapshot(
        manager: LafManager,
        success: Boolean,
        message: String? = null,
    ): IdeThemeResponse {
        val currentId = themeId(manager.currentLookAndFeel)
        val options = manager.installedLookAndFeels.map { info ->
            IdeThemeOption(
                id = themeId(info),
                name = info.name,
                dark = isDark(info),
                current = themeId(info) == currentId,
            )
        }
        return IdeThemeResponse(
            success = success,
            theme = if (isDark(manager.currentLookAndFeel)) "dark" else "light",
            currentThemeId = currentId,
            currentThemeName = manager.currentLookAndFeel?.name,
            lightThemeId = mappedThemeId(manager, false),
            darkThemeId = mappedThemeId(manager, true),
            syncWithOs = manager.autodetectSupported && manager.autodetect,
            syncWithOsSupported = manager.autodetectSupported,
            themes = options,
            message = message,
        )
    }

    private fun mappedThemeId(manager: LafManager, dark: Boolean): String {
        val propertyKey = if (dark) DARK_THEME_KEY else LIGHT_THEME_KEY
        val stored = PropertiesComponent.getInstance().getValue(propertyKey)
        if (stored != null && manager.installedLookAndFeels.any { themeId(it) == stored && isDark(it) == dark }) {
            return stored
        }
        val default = defaultLaf(manager, dark)
        return default?.takeIf { isDark(it) == dark }?.let(::themeId)
            ?: manager.installedLookAndFeels.firstOrNull { isDark(it) == dark }?.let(::themeId)
            .orEmpty()
    }

    /**
     * The theme APIs are reached reflectively because their shapes moved between the build we
     * compile against and the ones we run on.
     *
     * 2023.2 exposes `UIThemeBasedLookAndFeelInfo` with a nested `theme`; by 2025.3 that class is
     * gone and the info object carries `id`/`isDark` itself, and `setPreferredDarkLaf` takes the
     * new type. Binding to either at compile time turns the other into a NoSuchMethodError or
     * NoSuchClassError at runtime — confirmed by the Plugin Verifier against IU-253 and IU-262.
     * Every lookup degrades to the name-based heuristic rather than throwing.
     */
    private fun callNoArg(target: Any?, vararg names: String): Any? {
        if (target == null) return null
        for (name in names) {
            val method = runCatching { target.javaClass.getMethod(name) }.getOrNull() ?: continue
            runCatching { method.invoke(target) }.getOrNull()?.let { return it }
        }
        return null
    }

    private fun themeId(info: UIManager.LookAndFeelInfo?): String {
        if (info == null) return ""
        val theme = callNoArg(info, "getTheme")
        (callNoArg(theme, "getId") ?: callNoArg(info, "getId"))?.let { return it.toString() }
        return "${info.className}::${info.name}"
    }

    private fun isDark(info: UIManager.LookAndFeelInfo?): Boolean {
        if (info == null) return false
        val theme = callNoArg(info, "getTheme")
        (callNoArg(theme, "isDark") ?: callNoArg(info, "isDark"))?.let { return it == true }
        val marker = "${info.name} ${info.className}".lowercase()
        return DARK_NAME_MARKERS.any(marker::contains)
    }

    /** `defaultDarkLaf` / `defaultLightLaf` are absent on 2025.3+; callers fall back to the list. */
    private fun defaultLaf(manager: LafManager, dark: Boolean): UIManager.LookAndFeelInfo? {
        val name = if (dark) "getDefaultDarkLaf" else "getDefaultLightLaf"
        return callNoArg(manager, name) as? UIManager.LookAndFeelInfo
    }

    /** @return false when this IDE has no matching setter, so the caller can skip it quietly. */
    private fun setPreferredLaf(manager: LafManager, dark: Boolean, target: UIManager.LookAndFeelInfo): Boolean {
        val name = if (dark) "setPreferredDarkLaf" else "setPreferredLightLaf"
        val method = manager.javaClass.methods.firstOrNull {
            it.name == name && it.parameterCount == 1 && it.parameterTypes[0].isInstance(target)
        } ?: return false
        return runCatching { method.invoke(manager, target) }.isSuccess
    }

    /**
     * Switches the look and feel the same way the IDE's own theme action does.
     *
     * `setCurrentLookAndFeel` + `updateUI()` alone recolours components but leaves the icon layer
     * on the previous palette: IDEA rasterises SVG icons per theme and caches them behind a
     * dark/light flag, so folder and file icons kept their old colours while everything else
     * turned light. [QuickChangeLookAndFeel] is the platform's own entry point and handles that;
     * the icon cache is cleared explicitly as a belt-and-braces measure, and the project views
     * are refreshed because their node presentations cache icons too.
     */
    private fun switchTheme(manager: LafManager, target: UIManager.LookAndFeelInfo) {
        QuickChangeLookAndFeel.switchLafAndUpdateUI(manager, target, false)
        IconLoader.setUseDarkIcons(isDark(target))
        IconLoader.clearCache()
        manager.repaintUI()
        ProjectManager.getInstance().openProjects.forEach { project ->
            if (!project.isDisposed) runCatching { ProjectView.getInstance(project).refresh() }
        }
    }

    private fun runOnUiThread(action: () -> Unit) {
        val application = ApplicationManager.getApplication()
        if (application.isDispatchThread) action() else application.invokeAndWait(action)
    }

    private const val LIGHT_THEME_KEY = "capybara.theme.mapping.light"
    private const val DARK_THEME_KEY = "capybara.theme.mapping.dark"
    private val DARK_NAME_MARKERS = listOf("dark", "darcula", "high contrast")
}
