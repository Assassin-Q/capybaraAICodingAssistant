package com.aicoding.plugin.services

import com.intellij.openapi.components.Service
import kotlinx.serialization.Serializable
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.CopyOnWriteArrayList
import java.util.concurrent.atomic.AtomicLong

@Serializable
data class LineRange(
    val start: Int,
    val end: Int
)

@Serializable
data class ChatMessage(
    val id: Long,
    val type: String, // "add_to_chat", "explain_code", "optimize_code", "generate_test"
    val content: String,
    val fileName: String? = null,
    val lineRange: LineRange? = null,
    val timestamp: Long = System.currentTimeMillis(),
    val status: String = "pending" // pending, processing, completed, error
)

@Serializable
data class OpenCodeRequest(
    val type: String,
    val content: String,
    val fileName: String? = null,
    val lineRange: LineRange? = null,
    val sessionId: String? = null
)

@Service(Service.Level.PROJECT)
class MessageService {
    private val messageIdGenerator = AtomicLong(0)
    private val pendingMessages = ConcurrentHashMap<Long, ChatMessage>()
    private val messageListeners = CopyOnWriteArrayList<(ChatMessage) -> Unit>()
    private val json = Json { ignoreUnknownKeys = true }
    
    fun addMessage(type: String, content: String, fileName: String? = null, lineRange: Pair<Int, Int>? = null): Long {
        val id = messageIdGenerator.incrementAndGet()
        val lineRangeObj = lineRange?.let { LineRange(it.first, it.second) }
        val message = ChatMessage(id, type, content, fileName, lineRangeObj)
        pendingMessages[id] = message
        println("[MessageService] Added message: id=$id, type=$type, fileName=$fileName, lineRange=$lineRange, content=${content.take(50)}...")
        notifyListeners(message)
        return id
    }
    
    fun getPendingMessages(): List<ChatMessage> {
        return pendingMessages.values.toList()
    }
    
    fun getMessage(id: Long): ChatMessage? {
        return pendingMessages[id]
    }
    
    fun removeMessage(id: Long) {
        pendingMessages.remove(id)
    }
    
    fun updateMessageStatus(id: Long, status: String) {
        pendingMessages.computeIfPresent(id) { _, msg ->
            msg.copy(status = status)
        }
    }
    
    fun addListener(listener: (ChatMessage) -> Unit) {
        messageListeners.add(listener)
    }
    
    fun removeListener(listener: (ChatMessage) -> Unit) {
        messageListeners.remove(listener)
    }
    
    private fun notifyListeners(message: ChatMessage) {
        messageListeners.forEach { listener ->
            try {
                listener(message)
            } catch (e: Exception) {
                e.printStackTrace()
            }
        }
    }
    
    fun toJson(message: ChatMessage): String {
        return json.encodeToString(message)
    }
    
    fun fromJson(jsonString: String): ChatMessage {
        return json.decodeFromString(jsonString)
    }
    
    fun createOpenCodeRequest(message: ChatMessage): OpenCodeRequest {
        return OpenCodeRequest(
            type = message.type,
            content = message.content,
            fileName = message.fileName,
            lineRange = message.lineRange,
            sessionId = "default" // TODO: Get current session ID
        )
    }
}