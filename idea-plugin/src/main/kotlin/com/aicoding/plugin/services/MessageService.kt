package com.aicoding.plugin.services

import com.intellij.openapi.components.Service
import kotlinx.serialization.Serializable
import java.util.concurrent.CopyOnWriteArrayList
import java.util.concurrent.atomic.AtomicLong

@Serializable
data class LineRange(
    val start: Int,
    val end: Int,
)

@Serializable
data class ChatMessage(
    val id: Long,
    val type: String,
    val content: String,
    val kind: String? = null,
    val fileName: String? = null,
    val displayName: String? = null,
    val lineRange: LineRange? = null,
    val timestamp: Long = System.currentTimeMillis(),
)

@Service(Service.Level.PROJECT)
class MessageService {
    private val idGenerator = AtomicLong(0)
    private val listeners = CopyOnWriteArrayList<(ChatMessage) -> Unit>()
    private val pendingMessages = CopyOnWriteArrayList<ChatMessage>()

    fun addMessage(
        type: String,
        content: String,
        kind: String? = null,
        fileName: String? = null,
        displayName: String? = null,
        lineRange: Pair<Int, Int>? = null,
    ): Long {
        val message = ChatMessage(
            id = idGenerator.incrementAndGet(),
            type = type,
            content = content,
            kind = kind,
            fileName = fileName,
            displayName = displayName,
            lineRange = lineRange?.let { LineRange(it.first, it.second) },
        )
        if (listeners.isEmpty()) {
            pendingMessages.add(message)
            while (pendingMessages.size > 20) {
                pendingMessages.removeAt(0)
            }
        } else {
            listeners.forEach { listener -> runCatching { listener(message) } }
        }
        return message.id
    }

    fun addListener(listener: (ChatMessage) -> Unit) {
        listeners.add(listener)
        pendingMessages.toList().forEach { message ->
            if (pendingMessages.remove(message)) {
                runCatching { listener(message) }
            }
        }
    }

    fun removeListener(listener: (ChatMessage) -> Unit) {
        listeners.remove(listener)
    }
}
