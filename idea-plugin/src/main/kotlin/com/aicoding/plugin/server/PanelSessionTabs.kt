package com.aicoding.plugin.server

import kotlinx.serialization.Serializable

@Serializable
data class PanelSessionTab(
    val id: String,
    val sessionID: String? = null,
    val title: String,
)

@Serializable
data class PanelSessionTabsRequest(
    val activeTabID: String = "",
    /** False in single-tab mode, where closing groups of tabs has nothing to act on. */
    val multiTab: Boolean = false,
    /** Monotonic browser snapshot revision; older in-flight HTTP requests must not overwrite it. */
    val revision: Long = 0,
    val tabs: List<PanelSessionTab> = emptyList(),
)

@Serializable
internal data class PanelActionEvent(val action: String)
