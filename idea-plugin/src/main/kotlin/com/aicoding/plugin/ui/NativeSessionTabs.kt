package com.aicoding.plugin.ui

import com.aicoding.plugin.server.HttpServerManager
import com.aicoding.plugin.server.PanelSessionTab
import com.aicoding.plugin.server.PanelSessionTabsRequest
import com.intellij.icons.AllIcons
import com.intellij.openapi.actionSystem.AnAction
import com.intellij.openapi.actionSystem.ex.DefaultCustomComponentAction
import com.intellij.openapi.project.Project
import com.intellij.openapi.wm.ToolWindow
import com.intellij.ui.InplaceButton
import com.intellij.ui.JBColor
import com.intellij.ui.components.JBLabel
import com.intellij.util.ui.JBUI
import com.intellij.util.ui.UIUtil
import java.awt.BorderLayout
import java.awt.Color
import java.awt.Component
import java.awt.Dimension
import java.awt.FlowLayout
import java.awt.Graphics
import java.awt.Graphics2D
import java.awt.MouseInfo
import java.awt.Point
import java.awt.RenderingHints
import java.awt.event.MouseAdapter
import java.awt.event.MouseEvent
import java.awt.event.ComponentAdapter
import java.awt.event.ComponentEvent
import java.util.Collections
import java.util.IdentityHashMap
import javax.swing.Box
import javax.swing.BoxLayout
import javax.swing.JComponent
import javax.swing.JMenuItem
import javax.swing.JPanel
import javax.swing.JPopupMenu
import javax.swing.Scrollable
import javax.swing.SwingUtilities
import javax.swing.Timer

private const val MIN_TAB_VIEWPORT_WIDTH = 160
private const val HEADER_CHROME_RESERVED_WIDTH = 420
private const val TAB_MAX_CHARS = 18
private const val TAB_HEIGHT = 28
/** Just enough to soften the corners; a full pill read as an oversized bubble. */
private const val TAB_CORNER_ARC = 6
/** One wheel notch moves about one tab. */
private const val WHEEL_SCROLL_STEP = 60
/** How long the scroll hairline lingers after the last movement. */
private const val INDICATOR_LINGER_MS = 900
/** How often a live hover is re-checked against the real pointer. */
private const val HOVER_WATCHDOG_MS = 200
private const val ACTIVE_PROPERTY = "capybara.session-tab.active"
private const val CONTROLS_PROPERTY = "capybara.session-tab.controls"
private const val LABEL_PROPERTY = "capybara.session-tab.label"

/**
 * A tab drawn as a rounded pill rather than an underlined label.
 *
 * Swing has no rounded background, so the fill is painted here and the panel stays non-opaque:
 * letting it paint its own rectangle first would put square corners behind the pill.
 */
private class TabChip : JPanel(BorderLayout()) {
    var selected = false
        set(value) {
            field = value
            repaint()
        }
    var hovered = false
        set(value) {
            field = value
            repaint()
        }

    init {
        isOpaque = false
    }

    override fun paintComponent(graphics: Graphics) {
        /*
         * The selected tab uses the IDE's list-selection pair.
         *
         * `ToolWindow.Button.selectedBackground` is a near-white grey under a light theme, so the
         * label sat on it with no contrast at all. The selection colours are the one pair every
         * theme guarantees is legible together, and the label's foreground is moved with it.
         */
        val fill = when {
            selected -> UIUtil.getListSelectionBackground(true)
            hovered -> JBColor.namedColor("ActionButton.hoverBackground", JBColor(0xEDEDED, 0x404244))
            else -> null
        }
        if (fill != null) {
            val canvas = graphics.create() as Graphics2D
            try {
                canvas.setRenderingHint(RenderingHints.KEY_ANTIALIASING, RenderingHints.VALUE_ANTIALIAS_ON)
                canvas.color = fill
                val arc = JBUI.scale(TAB_CORNER_ARC)
                canvas.fillRoundRect(0, 0, width, height, arc, arc)
            } finally {
                canvas.dispose()
            }
        }
        super.paintComponent(graphics)
    }
}

/**
 * The tab row, scrolled by moving the children rather than by a viewport.
 *
 * A `JScrollPane` was used first and could not be made to work. Measured against the running IDE:
 * the strip was 617px wide with 1087px of tabs, yet `tabsPanel` was itself laid out at 617 — and
 * `ViewportLayout` only ever *grows* a view that is narrower than the viewport, it never expands
 * one to its preferred width. A view exactly as wide as its viewport has a scroll range of zero,
 * so every `setViewPosition` was clamped straight back to 0 on the next validate; the logs showed
 * each click starting from 0 again after the previous one had "succeeded".
 *
 * Laying the children out at `x - offset` removes the viewport, the `Scrollable` contract and the
 * clamping all at once. The panel's own width is the visible width, Swing clips children to it,
 * and the offset is the only piece of state involved.
 */
private class TabStripPanel : JPanel(null) {
    /**
     * The width the title bar actually budgets for this strip. Newer IDEA title bars can leave
     * the component wider than the clipped region, so using only `width` makes the scroll range
     * collapse to zero even though tabs are hidden behind the right-side actions.
     */
    var viewportWidth = 0
        set(value) {
            field = value.coerceAtLeast(0)
            offset = offset
            repaint()
        }

    var offset = 0
        set(value) {
            val clamped = value.coerceIn(0, maxOffset())
            if (field == clamped) return
            field = clamped
            showIndicator()
            revalidate()
            repaint()
        }

    /**
     * A scroll indicator that appears while the row is being used and fades out again.
     *
     * A permanent scrollbar does not fit a 28px header — it would take a third of the row and
     * squash the tabs — so the position is shown as a hairline along the top edge only while the
     * pointer is on the strip or a scroll has just happened.
     */
    private var indicatorShown = false
    private val hideIndicator = Timer(INDICATOR_LINGER_MS) {
        indicatorShown = false
        repaint()
    }.apply { isRepeats = false }

    fun showIndicator() {
        if (maxOffset() <= 0) return
        indicatorShown = true
        hideIndicator.restart()
        repaint()
    }

    override fun paint(graphics: Graphics) {
        super.paint(graphics)
        val span = maxOffset()
        if (!indicatorShown || span <= 0 || width <= 0) return
        val trackWidth = effectiveViewportWidth().coerceAtMost(width)
        if (trackWidth <= 0) return
        val content = contentWidth()
        val thumbWidth = (trackWidth.toLong() * trackWidth / content).toInt().coerceAtLeast(JBUI.scale(20))
        val thumbX = ((trackWidth - thumbWidth).toLong() * offset / span).toInt()
        val canvas = graphics.create() as Graphics2D
        try {
            canvas.setRenderingHint(RenderingHints.KEY_ANTIALIASING, RenderingHints.VALUE_ANTIALIAS_ON)
            val thickness = JBUI.scale(2)
            // Translucent so it reads as an overlay hairline rather than a second border.
            canvas.color = JBColor(Color(0, 0, 0, 42), Color(255, 255, 255, 46))
            canvas.fillRoundRect(thumbX, 0, thumbWidth, thickness, thickness, thickness)
        } finally {
            canvas.dispose()
        }
    }

    /** Total width of the tabs, independent of how much of it is on screen. */
    fun contentWidth(): Int = components.sumOf { it.preferredSize.width }

    fun effectiveViewportWidth(): Int = viewportWidth.takeIf { it > 0 } ?: width

    fun maxOffset(): Int = (contentWidth() - effectiveViewportWidth()).coerceAtLeast(0)

    /** Left edge of a tab within the whole row, ignoring the current offset. */
    fun tabX(component: Component): Int {
        var x = 0
        for (child in components) {
            if (child === component) return x
            x += child.preferredSize.width
        }
        return x
    }

    override fun doLayout() {
        // Centred vertically so the tabs sit on the same line as the arrows and the brand mark,
        // which the header's own toolbar centres within the taller title row.
        val tabHeight = JBUI.scale(TAB_HEIGHT).coerceAtMost(height)
        val y = ((height - tabHeight) / 2).coerceAtLeast(0)
        var x = -offset
        components.forEach { child ->
            val childWidth = child.preferredSize.width
            child.setBounds(x, y, childWidth, tabHeight)
            x += childWidth
        }
    }

    override fun getPreferredSize(): Dimension =
        Dimension(contentWidth(), JBUI.scale(TAB_HEIGHT))
}

/** Native IDEA title-bar tabs. React only owns their state and sends snapshots through the bridge. */
class NativeSessionTabsController(
    private val project: Project,
    private val toolWindow: ToolWindow,
) {
    private val tabsPanel = TabStripPanel().apply { isOpaque = false }
    private val previous = InplaceButton("向左切换会话", AllIcons.Actions.Back) { scroll(-1) }
    private val next = InplaceButton("向右切换会话", AllIcons.Actions.Forward) { scroll(1) }
    private val previousComponent = JPanel(BorderLayout()).apply {
        isOpaque = false
        add(previous, BorderLayout.CENTER)
    }
    private val stripComponent = JPanel(BorderLayout()).apply {
        isOpaque = false
        add(tabsPanel, BorderLayout.CENTER)
    }
    private val nextComponent = JPanel(BorderLayout()).apply {
        isOpaque = false
        add(next, BorderLayout.CENTER)
    }
    private var state = PanelSessionTabsRequest()
    private var contentWidth = 0

    /**
     * Which tab the pointer is on, tracked for the whole strip rather than per tab.
     *
     * Each chip used to hide its own controls on its own mouseExited, and Swing drops that event
     * often enough — moving quickly between adjacent chips, or a repaint under the cursor — that
     * several tabs ended up showing their rename and close buttons at once. Worse, a chip with
     * stuck controls also stayed painted, so it went on looking selected after the selection had
     * moved elsewhere. One owner for the state means entering any tab clears every other.
     */
    private var hoveredTabID: String? = null

    /** All title-bar ancestors can participate in layout changes across IDEA generations. */
    private val observedHeaderComponents = Collections.newSetFromMap(IdentityHashMap<Component, Boolean>())

    init {
        configureNavigationButton(previous, previousComponent)
        configureNavigationButton(next, nextComponent)
        // The strip's own width is what decides whether anything is off screen, so the arrows are
        // re-evaluated whenever the header hands it a new one.
        tabsPanel.addComponentListener(object : ComponentAdapter() {
            override fun componentResized(event: ComponentEvent) {
                tabsPanel.offset = tabsPanel.offset
                updateScrollButtons()
            }
        })
        toolWindow.component.addComponentListener(object : ComponentAdapter() {
            override fun componentResized(event: ComponentEvent) = updateViewportWidth()
        })
        /*
         * The wheel scrolls the strip sideways.
         *
         * A horizontal scrollbar does not fit a 28px header — it would take a third of the row and
         * squash the tabs — so the strip scrolls the way IDEA's own editor tabs do: the wheel moves
         * it, and the arrows are there for anyone who prefers to click.
         *
         * JScrollPane installs its own wheel handler, which with both scrollbars set to NEVER
         * swallows the event without scrolling anything, so it is turned off first. The listener
         * goes on the strip as well as the scroll pane: a wheel event over a tab is delivered to
         * that tab's ancestors, and the tabs panel is the one directly under the pointer.
         */
        tabsPanel.addMouseMotionListener(object : java.awt.event.MouseMotionAdapter() {
            override fun mouseMoved(event: MouseEvent) = tabsPanel.showIndicator()
        })
        tabsPanel.addMouseWheelListener { event ->
            val amount = event.preciseWheelRotation
            if (amount != 0.0 && maxScrollX() > 0) {
                scrollBy((amount * JBUI.scale(WHEEL_SCROLL_STEP)).toInt())
                event.consume()
            }
        }
        // The toolbar is built after this controller, so the first measurements are re-taken over
        // a few passes while the header settles.
        listOf(0, 120, 400, 900, 1800).forEach { delay ->
            javax.swing.Timer(delay) { updateViewportWidth() }.apply { isRepeats = false }.start()
        }
    }

    private fun configureNavigationButton(button: InplaceButton, holder: JPanel) {
        val side = maxOf(button.preferredSize.width, JBUI.scale(TAB_HEIGHT))
        val size = Dimension(side, JBUI.scale(TAB_HEIGHT))
        button.minimumSize = size
        button.preferredSize = size
        button.maximumSize = size
        button.isVisible = true
        button.isEnabled = false
        /*
         * The holder keeps the arrow's width whether or not the arrow is showing.
         *
         * An arrow with nothing to scroll is hidden rather than left greyed out, and BorderLayout
         * drops an invisible child from its preferred size — so the west toolbar shrank, and
         * MigLayout centred what was left, pushing the whole strip away from the left edge. Fixing
         * the holder means showing and hiding the arrow costs no layout at all.
         */
        holder.minimumSize = size
        holder.preferredSize = size
        holder.maximumSize = size
    }

    fun previousAction(): AnAction = DefaultCustomComponentAction { previousComponent }.apply {
        templatePresentation.text = "会话标签"
        templatePresentation.description = "已打开的会话；关闭标签不会删除或停止会话"
    }

    fun stripAction(): AnAction = DefaultCustomComponentAction { stripComponent }.apply {
        templatePresentation.text = "会话标签"
        templatePresentation.description = "已打开的会话；关闭标签不会删除或停止会话"
    }

    fun nextAction(): AnAction = DefaultCustomComponentAction { nextComponent }.apply {
        templatePresentation.text = "向右滚动会话标签"
        templatePresentation.description = "显示后面的会话标签"
    }

    fun update(nextState: PanelSessionTabsRequest) {
        SwingUtilities.invokeLater {
            // Browser snapshots are posted asynchronously. A slower, older request used to arrive
            // after the latest one and restore the previous active tab, which made a single native
            // click appear to do nothing. Revisions make the bridge last-write-wins by browser time.
            if (nextState.revision < state.revision) return@invokeLater
            val sameTabs = state.tabs == nextState.tabs
            val activeChanged = state.activeTabID != nextState.activeTabID
            state = nextState
            if (sameTabs) {
                if (activeChanged) updateActiveTab() else updateScrollButtons()
            } else {
                rebuild()
            }
        }
    }

    /**
     * How much room the header actually has for the strip, measured rather than guessed.
     *
     * `ActionToolbarImpl` under `NOWRAP_LAYOUT_POLICY` lays every child out at its preferred width
     * and lets the row run off the end — it never shrinks anything to fit. So a strip whose
     * preferred width came from "tool window width minus a constant" was clipped by the header
     * whenever that constant under-estimated the buttons on the right, while its scroll pane still
     * believed it was that wide: `maxScrollX` came out zero and the tabs past the edge could not be
     * reached at all, by wheel or by arrow.
     *
     * The west panel's own width is the real budget. Everything the header puts beside the strip —
     * its (now empty) id label, the separator IDEA inserts ahead of tab actions, the brand mark and
     * the two arrows — is subtracted at its own preferred width. The constant survives only as a
     * first-frame fallback, before any of this has been laid out.
     */
    private fun fallbackStripWidth(): Int {
        val minimum = JBUI.scale(MIN_TAB_VIEWPORT_WIDTH)
        val guessed = toolWindow.component.width -
            JBUI.scale(HEADER_CHROME_RESERVED_WIDTH) -
            previous.preferredSize.width -
            next.preferredSize.width
        return guessed.coerceAtLeast(minimum)
    }

    /**
     * Returns the right edge visible through every ancestor clip. This is intentionally separate
     * from the preferred-width calculation: 2026.2 wraps title actions differently, but Swing still
     * clips the same pixels when the toolbar runs past the native header.
     */
    private fun clippedStripWidth(): Int? {
        var ancestor = stripComponent.parent ?: return null
        var available = Int.MAX_VALUE
        while (true) {
            val origin = SwingUtilities.convertPoint(stripComponent, Point(0, 0), ancestor)
            val right = ancestor.width - origin.x
            if (right > 0) available = minOf(available, right)
            if (ancestor === toolWindow.component || ancestor.parent == null) break
            ancestor = ancestor.parent
        }
        return available.takeIf { it != Int.MAX_VALUE && it > 0 }
    }

    private fun availableStripWidth(): Int {
        val minimum = JBUI.scale(MIN_TAB_VIEWPORT_WIDTH)
        val fallback = fallbackStripWidth()
        val toolbar = stripComponent.parent
        val west = toolbar?.parent
        if (toolbar == null || west == null || west.width <= 0) {
            return minOf(fallback, clippedStripWidth() ?: fallback).coerceAtLeast(minimum)
        }
        var used = 0
        west.components.forEach { child ->
            if (child !== toolbar && child.isVisible) used += child.preferredSize.width
        }
        toolbar.components.forEach { child ->
            if (child !== stripComponent) used += child.preferredSize.width
        }
        val measured = (west.width - used).coerceAtLeast(minimum)
        // Keep a conservative cap for title-bar implementations that report the toolbar's full
        // preferred width instead of the pixels left beside IDEA's native actions.
        return minOf(measured, fallback, clippedStripWidth() ?: fallback).coerceAtLeast(minimum)
    }

    /**
     * Follows the header's own width once the toolbar exists.
     *
     * The strip is only attached to it after `setTabActions`, which happens after this controller
     * is constructed, so the listener cannot be installed up front — and without it the measured
     * budget above would only ever be recomputed when the whole tool window changed size.
     */
    private fun observeHeaderWidth() {
        var ancestor = stripComponent.parent ?: return
        while (true) {
            if (observedHeaderComponents.add(ancestor)) {
                ancestor.addComponentListener(object : ComponentAdapter() {
                    override fun componentResized(event: ComponentEvent) = updateViewportWidth()
                })
            }
            if (ancestor === toolWindow.component || ancestor.parent == null) break
            ancestor = ancestor.parent
        }
    }

    private fun updateViewportWidth() {
        if (!SwingUtilities.isEventDispatchThread()) {
            SwingUtilities.invokeLater { updateViewportWidth() }
            return
        }
        observeHeaderWidth()
        val height = JBUI.scale(TAB_HEIGHT)
        val viewportSize = Dimension(availableStripWidth(), height)
        tabsPanel.viewportWidth = viewportSize.width
        stripComponent.minimumSize = Dimension(0, height)
        stripComponent.preferredSize = viewportSize
        stripComponent.maximumSize = viewportSize
        stripComponent.revalidate()
        stripComponent.parent?.revalidate()
        SwingUtilities.invokeLater {
            previousComponent.doLayout()
            stripComponent.doLayout()
            nextComponent.doLayout()
            tabsPanel.doLayout()
            scrollActiveIntoView()
            updateScrollButtons()
        }
    }

    private fun rebuild() {
        tabsPanel.removeAll()
        state.tabs.forEachIndexed { index, tab ->
            if (index > 0) tabsPanel.add(Box.createHorizontalStrut(JBUI.scale(2)))
            tabsPanel.add(createTab(tab, tab.id == state.activeTabID))
        }
        contentWidth = tabsPanel.contentWidth()
        tabsPanel.revalidate()
        tabsPanel.repaint()
        // The viewport is sized from `contentWidth`, which only exists once the tabs above have
        // been measured — so the width is settled here rather than at construction time.
        updateViewportWidth()
    }

    private fun createTab(tab: PanelSessionTab, active: Boolean): JComponent {
        val title = tab.title.ifBlank { "新会话" }
        val label = JBLabel(ellipsize(title)).apply {
            border = JBUI.Borders.empty(0, 7)
            toolTipText = title
        }
        val edit = InplaceButton("重命名 $title", AllIcons.Actions.Edit) {
            send("rename-session-tab:${tab.id}")
        }.apply { isVisible = false }
        val close = InplaceButton("关闭标签 $title（不会删除或停止会话）", AllIcons.Actions.Close) {
            send("close-session-tab:${tab.id}")
        }.apply { isVisible = false }
        // BoxLayout, not FlowLayout: a flow row sits at the top of a container taller than itself,
        // which left these two icons riding above the title. BoxLayout honours each child alignmentY
        // and centres them on the same line as the text.
        val controls = JPanel().apply {
            isOpaque = false
            layout = BoxLayout(this, BoxLayout.X_AXIS)
            add(edit)
            add(close)
        }
        /*
         * The action area is measured but deliberately not pinned.
         *
         * The tab's own width is fixed below and includes room for these buttons, so showing them
         * never pushes the tabs after it. Leaving the holder unpinned means that while they are
         * hidden BorderLayout collapses the east region to nothing and the title takes the whole
         * tab, instead of being squeezed beside a permanently blank strip.
         */
        val controlsSize = Dimension(
            edit.preferredSize.width + close.preferredSize.width,
            maxOf(edit.preferredSize.height, close.preferredSize.height),
        )
        val chip = TabChip().apply {
            name = tab.id
            toolTipText = title
            add(label, BorderLayout.CENTER)
            add(controls, BorderLayout.EAST)
            putClientProperty(CONTROLS_PROPERTY, controls)
            putClientProperty(LABEL_PROPERTY, label)
        }
        // BoxLayout otherwise expands JPanel up to its effectively unlimited maximum width.
        // Pin all three dimensions to the measured title plus the reserved hover controls, making
        // short session names compact while titles over 18 characters remain capped.
        val chipSize = Dimension(
            label.preferredSize.width + controlsSize.width,
            maxOf(JBUI.scale(28), label.preferredSize.height, controlsSize.height),
        )
        chip.minimumSize = chipSize
        chip.preferredSize = chipSize
        chip.maximumSize = chipSize
        applyTabAppearance(chip, active)
        val hover = object : MouseAdapter() {
            override fun mouseEntered(event: MouseEvent) = setHoveredTab(tab.id)

            override fun mouseExited(event: MouseEvent) {
                // Moving from the label to its edit/close children emits mouseExited first. Check
                // the real pointer after Swing has delivered the matching mouseEntered, otherwise
                // the controls briefly disappear and the tab jitters under the cursor.
                SwingUtilities.invokeLater {
                    val point = MouseInfo.getPointerInfo()?.location
                    if (point == null) {
                        if (hoveredTabID == tab.id) setHoveredTab(null)
                        return@invokeLater
                    }
                    SwingUtilities.convertPointFromScreen(point, chip)
                    if (!chip.contains(point) && hoveredTabID == tab.id) setHoveredTab(null)
                }
            }
        }
        /**
         * The usual tab-strip bulk actions, on right-click.
         *
         * Only in multi-tab mode: with a single tab "close the others" and "close to the left" have
         * nothing to act on, and offering them would suggest a strip that is not there. Each entry
         * broadcasts over the same channel as the close button, so the panel stays the one place
         * that decides what closing means.
         */
        val contextMenu = object : MouseAdapter() {
            override fun mousePressed(event: MouseEvent) = maybeShow(event)

            override fun mouseReleased(event: MouseEvent) = maybeShow(event)

            private fun maybeShow(event: MouseEvent) {
                if (!event.isPopupTrigger || !state.multiTab) return
                val index = state.tabs.indexOfFirst { it.id == tab.id }
                val menu = JPopupMenu()
                menu.add(JMenuItem("关闭其它").apply {
                    isEnabled = state.tabs.size > 1
                    addActionListener { send("close-other-session-tabs:${tab.id}") }
                })
                menu.add(JMenuItem("关闭左边").apply {
                    isEnabled = index > 0
                    addActionListener { send("close-left-session-tabs:${tab.id}") }
                })
                menu.add(JMenuItem("关闭右边").apply {
                    isEnabled = index >= 0 && index < state.tabs.size - 1
                    addActionListener { send("close-right-session-tabs:${tab.id}") }
                })
                menu.addSeparator()
                menu.add(JMenuItem("关闭所有").apply {
                    addActionListener { send("close-all-session-tabs") }
                })
                menu.show(event.component, event.x, event.y)
                event.consume()
            }
        }

        val select = object : MouseAdapter() {
            override fun mousePressed(event: MouseEvent) {
                if (!SwingUtilities.isLeftMouseButton(event) || state.activeTabID == tab.id) return
                // IDEA can repaint the native header immediately. Waiting for the JCEF request,
                // React render and bridge response made every tab click feel much slower than it
                // really was, especially with a long conversation mounted in the browser.
                // Invalidates browser snapshots that were already in flight when this native click
                // happened. The matching React update will return an equal or newer revision.
                state = state.copy(activeTabID = tab.id, revision = state.revision + 1)
                updateActiveTab()
                send("select-session-tab:${tab.id}")
                event.consume()
            }
        }

        chip.addMouseListener(hover)
        label.addMouseListener(hover)
        controls.addMouseListener(hover)
        edit.addMouseListener(hover)
        close.addMouseListener(hover)
        // Action buttons receive their own Swing mouse event. They intentionally do not get the
        // selection listener, so closing or renaming cannot race a second select-tab event.
        chip.addMouseListener(select)
        label.addMouseListener(select)
        chip.addMouseListener(contextMenu)
        label.addMouseListener(contextMenu)
        return chip
    }

    private fun updateActiveTab() {
        tabsPanel.components.forEach { component ->
            val chip = component as? JComponent ?: return@forEach
            if (chip.name.isNullOrBlank()) return@forEach
            applyTabAppearance(chip, chip.name == state.activeTabID)
        }
        scrollActiveIntoView()
        updateScrollButtons()
    }

    /**
     * Moves the hover to one tab, which is the same thing as taking it off every other.
     *
     * Doing this per tab left rename and close buttons showing on several at once whenever a
     * mouseExited went missing, and a tab whose controls were stuck also stayed painted — so it
     * read as still selected long after the selection had moved.
     */
    /**
     * Clears a hover that Swing never told us about.
     *
     * `mouseExited` is not reliable at the bottom edge of the header: moving down puts the pointer
     * over the JCEF browser, a heavyweight component, and the exit event for the tab is dropped —
     * so the rename and close buttons stayed on a tab the pointer had long left. While anything is
     * hovered, the real pointer is checked against the strip and the state is dropped when it is
     * no longer inside.
     */
    private val hoverWatchdog = Timer(HOVER_WATCHDOG_MS) {
        val point = MouseInfo.getPointerInfo()?.location
        if (point == null || !tabsPanel.isShowing) {
            setHoveredTab(null)
        } else {
            SwingUtilities.convertPointFromScreen(point, tabsPanel)
            if (!tabsPanel.contains(point)) setHoveredTab(null)
        }
    }

    private fun setHoveredTab(tabID: String?) {
        if (hoveredTabID == tabID) return
        hoveredTabID = tabID
        if (tabID == null) hoverWatchdog.stop() else hoverWatchdog.start()
        tabsPanel.components.forEach { component ->
            val chip = component as? TabChip ?: return@forEach
            val hovered = chip.name == tabID
            chip.hovered = hovered
            val controls = chip.getClientProperty(CONTROLS_PROPERTY) as? JComponent
            controls?.components?.forEach { it.isVisible = hovered }
            controls?.repaint()
        }
    }

    private fun applyTabAppearance(chip: JComponent, active: Boolean) {
        chip.putClientProperty(ACTIVE_PROPERTY, active)
        // A rounded tab rather than an underline: the fill is painted by TabChip, so all this
        // leaves is even padding where the 2px rule used to sit.
        (chip as? TabChip)?.selected = active
        chip.border = JBUI.Borders.empty(1, 0)
        // The label has to follow the fill. Left on the default foreground it was dark text on the
        // dark selection colour under a light theme — the tab was selected and unreadable.
        (chip.getClientProperty(LABEL_PROPERTY) as? JComponent)?.foreground = if (active) {
            UIUtil.getListSelectionForeground(true)
        } else {
            UIUtil.getLabelForeground()
        }
        chip.repaint()
    }

    private fun send(action: String) {
        HttpServerManager.forProject(project)?.broadcastPanelAction(action)
    }

    private fun scroll(direction: Int) {
        val step = (tabsPanel.width * 3 / 4).coerceAtLeast(JBUI.scale(96))
        scrollBy(direction * step)
    }

    private fun scrollBy(delta: Int) {
        tabsPanel.offset += delta
        updateScrollButtons()
    }


    private fun scrollActiveIntoView() {
        val active = tabsPanel.components.firstOrNull { it.name == state.activeTabID } ?: return
        val start = tabsPanel.tabX(active)
        val end = start + active.preferredSize.width
        val visible = tabsPanel.effectiveViewportWidth().takeIf { it > 0 } ?: return
        tabsPanel.offset = when {
            start < tabsPanel.offset -> start
            end > tabsPanel.offset + visible -> end - visible
            else -> tabsPanel.offset
        }
    }

    private fun updateScrollButtons() {
        val maxX = maxScrollX()
        // InplaceButton only forwards a click when it is enabled, and a permanently greyed arrow
        // is indistinguishable from a broken one — so an arrow with nothing to scroll is hidden
        // rather than shown dead. The strip reserves their width either way, so nothing shifts.
        val canScrollBack = maxX > 0 && tabsPanel.offset > 0
        val canScrollForward = maxX > 0 && tabsPanel.offset < maxX
        previous.isEnabled = canScrollBack
        next.isEnabled = canScrollForward
        previous.isVisible = canScrollBack
        next.isVisible = canScrollForward
        previousComponent.repaint()
        nextComponent.repaint()
    }

    /** How far the row can move: everything past its own width, and nothing else. */
    private fun maxScrollX(): Int = tabsPanel.maxOffset()

    private fun ellipsize(value: String): String {
        val count = value.codePointCount(0, value.length)
        if (count <= TAB_MAX_CHARS) return value
        val end = value.offsetByCodePoints(0, TAB_MAX_CHARS - 1)
        return value.substring(0, end) + "…"
    }
}
