package com.aicoding.plugin.services

import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.components.Service
import com.intellij.openapi.diagnostic.logger
import com.intellij.util.concurrency.AppExecutorUtil
import kotlinx.coroutines.*
import java.util.concurrent.*
import java.util.concurrent.atomic.AtomicInteger

@Service(Service.Level.APP)
class AIAsyncManager {
    private val log = logger<AIAsyncManager>()
    
    // 不同优先级队列
    private val highPriorityExecutor = AppExecutorUtil.createBoundedApplicationPoolExecutor(
        "AI-High-Priority", 2
    )
    private val normalPriorityExecutor = AppExecutorUtil.createBoundedApplicationPoolExecutor(
        "AI-Normal-Priority", 4
    )
    private val lowPriorityExecutor = AppExecutorUtil.createBoundedApplicationPoolExecutor(
        "AI-Low-Priority", 2
    )
    
    // 任务跟踪
    private val activeTasks = ConcurrentHashMap<String, CompletableFuture<*>>()
    private val taskCounter = AtomicInteger(0)
    
    enum class TaskPriority {
        HIGH,     // 代码补全（要求低延迟）
        NORMAL,   // 悬浮框对话（用户主动触发）
        LOW       // 后台学习、缓存预热
    }
    
    sealed class AIAsyncResult<out T> {
        data class Success<out T>(val value: T) : AIAsyncResult<T>()
        data class Error(val exception: Throwable) : AIAsyncResult<Nothing>()
        object Cancelled : AIAsyncResult<Nothing>()
        object Timeout : AIAsyncResult<Nothing>()
    }
    
    fun <T> submitTask(
        taskId: String? = null,
        priority: TaskPriority = TaskPriority.NORMAL,
        timeoutMs: Long = 30000,
        task: suspend () -> T
    ): CompletableFuture<AIAsyncResult<T>> {
        val executor = when (priority) {
            TaskPriority.HIGH -> highPriorityExecutor
            TaskPriority.NORMAL -> normalPriorityExecutor
            TaskPriority.LOW -> lowPriorityExecutor
        }
        
        val actualTaskId = taskId ?: "task-${taskCounter.incrementAndGet()}"
        val future = CompletableFuture<AIAsyncResult<T>>()
        
        val scope = CoroutineScope(Dispatchers.IO + SupervisorJob())
        val job = scope.launch {
            try {
                withTimeout(timeoutMs) {
                    val result = task()
                    future.complete(AIAsyncResult.Success(result))
                }
            } catch (e: TimeoutCancellationException) {
                log.warn("Task $actualTaskId timed out after ${timeoutMs}ms")
                future.complete(AIAsyncResult.Timeout)
                cancelTask(actualTaskId)
            } catch (e: kotlinx.coroutines.CancellationException) {
                log.info("Task $actualTaskId was cancelled")
                future.complete(AIAsyncResult.Cancelled)
            } catch (e: Exception) {
                log.error("Task $actualTaskId failed", e)
                future.complete(AIAsyncResult.Error(e))
            } finally {
                activeTasks.remove(actualTaskId)
                scope.cancel()
            }
        }
        
        activeTasks[actualTaskId] = future
        
        // 设置取消回调
        future.whenComplete { _, _ ->
            if (!job.isCancelled) {
                job.cancel()
            }
        }
        
        return future
    }
    
    fun submitCompletionTask(
        context: String,
        prefix: String,
        timeoutMs: Long = 2000
    ): CompletableFuture<AIAsyncResult<List<CompletionSuggestion>>> {
        return submitTask(
            taskId = "completion-${System.currentTimeMillis()}",
            priority = TaskPriority.HIGH,
            timeoutMs = timeoutMs
        ) {
            // 这里将调用实际的AI服务
            // 暂时返回模拟数据
            simulateAICompletion(context, prefix)
        }
    }
    
    fun submitPopupTask(
        selectedText: String,
        context: String,
        instruction: String? = null,
        timeoutMs: Long = 10000
    ): CompletableFuture<AIAsyncResult<PopupResponse>> {
        return submitTask(
            taskId = "popup-${System.currentTimeMillis()}",
            priority = TaskPriority.NORMAL,
            timeoutMs = timeoutMs
        ) {
            // 这里将调用实际的AI服务
            // 暂时返回模拟数据
            simulateAIPopupResponse(selectedText, context, instruction)
        }
    }
    
    fun cancelTask(taskId: String): Boolean {
        val future = activeTasks[taskId]
        future?.cancel(true)
        activeTasks.remove(taskId)
        return future != null
    }
    
    fun cancelAll(userInitiated: Boolean = false) {
        log.info("Cancelling all AI tasks (userInitiated: $userInitiated)")
        activeTasks.forEach { (taskId, future) ->
            future.cancel(true)
        }
        activeTasks.clear()
    }
    
    fun getActiveTaskCount(): Int = activeTasks.size
    
    private suspend fun simulateAICompletion(
        context: String,
        prefix: String
    ): List<CompletionSuggestion> {
        delay(500) // 模拟网络延迟
        
        return listOf(
            CompletionSuggestion(
                text = "${prefix}findByUsername(username: String)",
                description = "根据用户名查找用户",
                type = CompletionType.FUNCTION,
                source = CompletionSource.AI,
                confidence = 0.85
            ),
            CompletionSuggestion(
                text = "${prefix}findByEmail(email: String)",
                description = "根据邮箱查找用户",
                type = CompletionType.FUNCTION,
                source = CompletionSource.AI,
                confidence = 0.78
            ),
            CompletionSuggestion(
                text = "${prefix}findAllActive()",
                description = "查找所有活跃用户",
                type = CompletionType.FUNCTION,
                source = CompletionSource.AI,
                confidence = 0.72
            )
        )
    }
    
    private suspend fun simulateAIPopupResponse(
        selectedText: String,
        context: String,
        instruction: String?
    ): PopupResponse {
        delay(1000) // 模拟网络延迟
        
        val actualInstruction = instruction ?: "优化这段代码"
        
        return PopupResponse(
            originalText = selectedText,
            suggestedText = selectedText.replace("for (", "for ("),
            explanation = "将循环变量声明移到循环外部可以提高性能",
            alternatives = listOf(
                "使用forEach方法更符合函数式编程风格",
                "使用Stream API可以更好地利用多核处理器"
            )
        )
    }
}

data class CompletionSuggestion(
    val text: String,
    val description: String,
    val type: CompletionType,
    val source: CompletionSource,
    val confidence: Double
)

enum class CompletionType {
    FUNCTION, METHOD, VARIABLE, CLASS, KEYWORD, UNKNOWN
}

enum class CompletionSource {
    LOCAL, PROJECT, AI, LIBRARY
}

data class PopupResponse(
    val originalText: String,
    val suggestedText: String,
    val explanation: String,
    val alternatives: List<String>
)