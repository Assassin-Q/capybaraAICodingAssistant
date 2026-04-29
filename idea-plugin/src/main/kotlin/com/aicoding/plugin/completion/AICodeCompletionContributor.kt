package com.aicoding.plugin.completion

import com.intellij.codeInsight.completion.CompletionContributor
import com.intellij.codeInsight.completion.CompletionParameters
import com.intellij.codeInsight.completion.CompletionResultSet
import com.intellij.codeInsight.lookup.LookupElement
import com.intellij.codeInsight.lookup.LookupElementBuilder
import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.components.service
import com.intellij.openapi.diagnostic.logger
import com.aicoding.plugin.services.AICodingSettingsService
import com.aicoding.plugin.services.AIContextService
import com.aicoding.plugin.services.AIAsyncManager
import com.aicoding.plugin.services.CompletionSuggestion
import com.aicoding.plugin.services.CompletionSource
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.TimeUnit

class AICodeCompletionContributor : CompletionContributor() {
    private val log = logger<AICodeCompletionContributor>()
    private val cache = CompletionCache()
    
    override fun fillCompletionVariants(
        parameters: CompletionParameters,
        result: CompletionResultSet
    ) {
        val project = parameters.position.project
        val settings = try {
            project.service<AICodingSettingsService>()
        } catch (e: Exception) {
            super.fillCompletionVariants(parameters, result)
            return
        }
        
        if (!settings.enableAICodeCompletion) {
            super.fillCompletionVariants(parameters, result)
            return
        }
        
        val editor = parameters.editor
        val offset = parameters.offset
        val prefix = result.prefixMatcher.prefix
        
        if (prefix.length < 2) {
            super.fillCompletionVariants(parameters, result)
            return
        }
        
        val cacheKey = "${project.name}:${editor.hashCode()}:$prefix"
        
        cache.get(cacheKey)?.let { cachedSuggestions ->
            log.debug("Using cached completions for prefix: $prefix")
            cachedSuggestions.forEach { suggestion ->
                result.addElement(createLookupElement(suggestion, settings))
            }
            super.fillCompletionVariants(parameters, result)
            return
        }
        
        val contextService = project.service<AIContextService>()
        val context = contextService.extractCompletionContext(project, editor, offset)
        
        val asyncManager = ApplicationManager.getApplication().service<AIAsyncManager>()
        val future = asyncManager.submitCompletionTask(context, prefix)
        
        future.thenAccept { aiResult ->
            when (aiResult) {
                is AIAsyncManager.AIAsyncResult.Success -> {
                    val suggestions = aiResult.value
                    cache.put(cacheKey, suggestions, settings.completionCacheTTL)
                    
                    ApplicationManager.getApplication().invokeLater {
                        suggestions.forEach { suggestion ->
                            result.addElement(createLookupElement(suggestion, settings))
                        }
                    }
                }
                else -> {
                    log.debug("AI completion failed or cancelled: $aiResult")
                }
            }
        }
        
        super.fillCompletionVariants(parameters, result)
    }
    
    private fun createLookupElement(
        suggestion: CompletionSuggestion,
        settings: AICodingSettingsService
    ): LookupElement {
        val builder = LookupElementBuilder.create(suggestion.text)
            .withBoldness(suggestion.source == CompletionSource.AI)
            .withTypeText(suggestion.description, true)
            .withPresentableText(getPresentableText(suggestion))
        
        if (suggestion.source == CompletionSource.AI) {
            builder
                .withStrikeoutness(false)
                .withTailText(" [AI]", true)
        }
        
        return builder.withInsertHandler { context, item ->
            if (suggestion.source == CompletionSource.AI) {
                val project = context.project
                val contextService = project.service<AIContextService>()
                contextService.recordPattern(suggestion.text)
            }
            context.commitDocument()
        }
    }
    
    private fun getPresentableText(suggestion: CompletionSuggestion): String {
        return when (suggestion.source) {
            CompletionSource.AI -> "🤖 ${suggestion.text}"
            else -> suggestion.text
        }
    }
    
    private class CompletionCache {
        private data class CacheEntry(
            val suggestions: List<CompletionSuggestion>,
            val timestamp: Long
        )
        
        private val cache = ConcurrentHashMap<String, CacheEntry>()
        
        fun get(key: String): List<CompletionSuggestion>? {
            val entry = cache[key] ?: return null
            val age = System.currentTimeMillis() - entry.timestamp
            if (age > TimeUnit.MINUTES.toMillis(5)) {
                cache.remove(key)
                return null
            }
            return entry.suggestions
        }
        
        fun put(key: String, suggestions: List<CompletionSuggestion>, ttlSeconds: Int) {
            cache[key] = CacheEntry(suggestions, System.currentTimeMillis())
            
            if (cache.size > 1000) {
                cleanup()
            }
        }
        
        private fun cleanup() {
            val now = System.currentTimeMillis()
            val iterator = cache.entries.iterator()
            while (iterator.hasNext()) {
                val entry = iterator.next()
                val age = now - entry.value.timestamp
                if (age > TimeUnit.MINUTES.toMillis(10)) {
                    iterator.remove()
                }
            }
        }
        
        fun clear() {
            cache.clear()
        }
    }
}