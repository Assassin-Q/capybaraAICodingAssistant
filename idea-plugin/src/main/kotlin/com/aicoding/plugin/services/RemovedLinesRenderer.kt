package com.aicoding.plugin.services

import com.intellij.openapi.editor.Editor
import com.intellij.openapi.editor.EditorCustomElementRenderer
import com.intellij.openapi.editor.Inlay
import com.intellij.openapi.editor.colors.EditorFontType
import com.intellij.openapi.editor.markup.TextAttributes
import com.intellij.ui.JBColor
import java.awt.Color
import java.awt.Graphics
import java.awt.Rectangle

internal class RemovedLinesRenderer(
    private val lines: List<String>,
    private val editor: Editor,
) : EditorCustomElementRenderer {
    override fun calcWidthInPixels(inlay: Inlay<*>): Int = editor.contentComponent.width

    override fun calcHeightInPixels(inlay: Inlay<*>): Int = editor.lineHeight * lines.size

    override fun paint(
        inlay: Inlay<*>,
        graphics: Graphics,
        targetRegion: Rectangle,
        textAttributes: TextAttributes,
    ) {
        val lineHeight = editor.lineHeight
        val font = editor.colorsScheme.getFont(EditorFontType.PLAIN)
        val ascent = graphics.getFontMetrics(font).ascent
        val background = JBColor(Color(0xFCE8E8), Color(0x442326))
        val border = JBColor(Color(0xD45757), Color(0xF07178))
        val foreground = JBColor(Color(0x8B1E1E), Color(0xFFB3B8))

        lines.forEachIndexed { index, line ->
            val y = targetRegion.y + index * lineHeight
            graphics.color = background
            graphics.fillRect(targetRegion.x, y, targetRegion.width, lineHeight)
            graphics.color = border
            graphics.fillRect(targetRegion.x, y, 3, lineHeight)
            graphics.font = font
            graphics.color = foreground
            graphics.drawString(line, targetRegion.x + 9, y + ascent)
        }
    }
}
