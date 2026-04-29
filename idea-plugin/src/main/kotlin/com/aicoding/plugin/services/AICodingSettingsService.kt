package com.aicoding.plugin.services

import com.intellij.openapi.components.PersistentStateComponent
import com.intellij.openapi.components.Service
import com.intellij.openapi.components.State
import com.intellij.openapi.components.Storage
import com.intellij.util.xmlb.XmlSerializerUtil

@Service(Service.Level.PROJECT)
@State(
    name = "AICodingSettings",
    storages = [Storage("aiCodingSettings.xml")]
)
class AICodingSettingsService : PersistentStateComponent<AICodingSettingsService> {
    var opencodeServiceUrl: String = "http://localhost:3000"
    var theme: String = "dark"
    var model: String = "gpt-4"
    var promptEnhancementEnabled: Boolean = false
    var enhancementLevel: String = "medium"
    var autoContextEnabled: Boolean = true
    
    // 新增：划选悬浮框设置
    var enableSelectionPopup: Boolean = true
    var popupTriggerDelay: Int = 300 // ms
    var selectionPopupShortcut: String = "ctrl shift A"
    
    // 新增：AI代码补全设置
    var enableAICodeCompletion: Boolean = true
    var completionAIWeight: Int = 2  // AI建议排序权重
    var maxCompletionItems: Int = 10
    var completionCacheTTL: Int = 300 // 秒，缓存有效期

    override fun getState(): AICodingSettingsService = this

    override fun loadState(state: AICodingSettingsService) {
        XmlSerializerUtil.copyBean(state, this)
    }
}