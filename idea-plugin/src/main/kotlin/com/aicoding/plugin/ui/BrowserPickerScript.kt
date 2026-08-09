package com.aicoding.plugin.ui

/** JavaScript installed into every JCEF frame to support visual element picking and comments. */
internal object BrowserPickerScript {
    fun install(callback: String, enabled: Boolean, picksJson: String, pageUrlJson: String): String = """
        (function () {
          var mainPageUrl = $pageUrlJson;
          var sendToIdea = function (message) {
            try {
              var __capybaraPickerMessage = message;
              $callback
            } catch (error) {
              console.debug('Capybara picker bridge unavailable', error);
            }
          };

          if (window.__capybaraPicker && typeof window.__capybaraPicker.destroy === 'function') {
            window.__capybaraPicker.destroy();
          }

          var state = {
            enabled: false,
            frozen: false,
            overlay: null,
            editor: null,
            activeElement: null,
            badges: [],
            picks: [],
            framePending: false
          };

          function markUi(element) {
            element.setAttribute('data-capybara-picker-ui', 'true');
            return element;
          }

          function isPickerUi(target) {
            return !!(target && target.closest && target.closest('[data-capybara-picker-ui="true"]'));
          }

          function cssEscape(value) {
            if (window.CSS && typeof window.CSS.escape === 'function') return window.CSS.escape(value);
            return String(value).replace(/[^a-zA-Z0-9_-]/g, function (char) {
              return '\\' + char.codePointAt(0).toString(16) + ' ';
            });
          }

          function quoteAttribute(value) {
            return '"' + String(value).replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"';
          }

          function isUnique(selector) {
            try { return document.querySelectorAll(selector).length === 1; } catch (error) { return false; }
          }

          function stableSelector(element) {
            if (!(element instanceof Element)) return '';
            if (element.id) {
              var idSelector = '#' + cssEscape(element.id);
              if (isUnique(idSelector)) return idSelector;
            }

            var preferred = ['data-testid', 'data-test', 'data-cy', 'data-qa'];
            for (var index = 0; index < preferred.length; index += 1) {
              var name = preferred[index];
              var value = element.getAttribute(name);
              if (!value) continue;
              var preferredSelector = '[' + name + '=' + quoteAttribute(value) + ']';
              if (isUnique(preferredSelector)) return preferredSelector;
            }

            var dataAttributes = Array.prototype.slice.call(element.attributes || []).filter(function (attribute) {
              return attribute.name.indexOf('data-') === 0 && attribute.value && attribute.value.length <= 120;
            });
            for (var dataIndex = 0; dataIndex < dataAttributes.length; dataIndex += 1) {
              var attribute = dataAttributes[dataIndex];
              var dataSelector = '[' + attribute.name + '=' + quoteAttribute(attribute.value) + ']';
              if (isUnique(dataSelector)) return dataSelector;
            }

            var parts = [];
            var current = element;
            while (current && current.nodeType === Node.ELEMENT_NODE && current !== document.documentElement) {
              var tag = current.tagName.toLowerCase();
              var parent = current.parentElement;
              if (parent) {
                var siblings = Array.prototype.filter.call(parent.children, function (child) {
                  return child.tagName === current.tagName;
                });
                if (siblings.length > 1) tag += ':nth-of-type(' + (siblings.indexOf(current) + 1) + ')';
              }
              parts.unshift(tag);
              var candidate = parts.join(' > ');
              if (isUnique(candidate)) return candidate;
              current = parent;
            }
            return parts.join(' > ');
          }

          function pageUrl() {
            return mainPageUrl || window.location.href;
          }

          function elementRect(element) {
            var rect = element.getBoundingClientRect();
            return {
              left: rect.left,
              top: rect.top,
              right: rect.right,
              bottom: rect.bottom,
              width: rect.width,
              height: rect.height
            };
          }

          function trimText(value, limit) {
            var text = String(value || '').replace(/\s+/g, ' ').trim();
            return text.length > limit ? text.slice(0, limit) + '…' : text;
          }

          function matchingPick(selector) {
            var frameUrl = window.location.href;
            return state.picks.find(function (pick) {
              return pick.selector === selector && (!pick.frameUrl || pick.frameUrl === frameUrl);
            });
          }

          function buildPick(element) {
            var selector = stableSelector(element);
            var existing = matchingPick(selector);
            return {
              id: existing && existing.id
                ? existing.id
                : 'pick_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 9),
              selector: selector,
              tagName: element.tagName.toLowerCase(),
              text: trimText(element.innerText || element.textContent || '', 2000),
              outerHtml: trimText(element.outerHTML || '', 8000),
              rect: elementRect(element),
              url: pageUrl(),
              frameUrl: window.location.href,
              comment: existing ? existing.comment : null,
              createdAt: existing && existing.createdAt ? existing.createdAt : Date.now()
            };
          }

          function removeElement(element) {
            if (element && element.parentNode) element.parentNode.removeChild(element);
          }

          function ensureOverlay() {
            if (state.overlay && state.overlay.isConnected) return state.overlay;
            var overlay = markUi(document.createElement('div'));
            Object.assign(overlay.style, {
              position: 'fixed',
              display: 'none',
              pointerEvents: 'none',
              boxSizing: 'border-box',
              border: '2px solid #ff8a00',
              background: 'rgba(255, 138, 0, 0.10)',
              borderRadius: '3px',
              zIndex: '2147483646',
              transition: 'left 45ms linear, top 45ms linear, width 45ms linear, height 45ms linear'
            });
            document.documentElement.appendChild(overlay);
            state.overlay = overlay;
            return overlay;
          }

          function positionOverlay(element) {
            if ((!state.enabled && !state.frozen) || !element || !element.isConnected) return;
            var overlay = ensureOverlay();
            var rect = element.getBoundingClientRect();
            Object.assign(overlay.style, {
              display: rect.width > 0 && rect.height > 0 ? 'block' : 'none',
              left: Math.max(0, rect.left) + 'px',
              top: Math.max(0, rect.top) + 'px',
              width: Math.max(0, rect.width) + 'px',
              height: Math.max(0, rect.height) + 'px'
            });
          }

          function closeEditor(keepPicking) {
            removeElement(state.editor);
            state.editor = null;
            if (state.frozen) {
              state.frozen = false;
              // Editing an existing annotation turns the highlight on without the picker; hide it
              // again on close so a stale box is not left over the page.
              if (!state.enabled && state.overlay) state.overlay.style.display = 'none';
              // One click = one annotation. Press the toolbar button again for the next one,
              // so the highlight never starts chasing the cursor unannounced.
              if (!keepPicking) disable(true);
            }
          }

          function button(label, primary) {
            var control = markUi(document.createElement('button'));
            control.type = 'button';
            control.textContent = label;
            Object.assign(control.style, {
              border: primary ? '1px solid #d66f00' : '1px solid rgba(127, 127, 127, 0.45)',
              background: primary ? '#ff8a00' : 'transparent',
              color: primary ? '#171717' : 'inherit',
              borderRadius: '4px',
              padding: '4px 9px',
              cursor: 'pointer',
              font: '12px system-ui, sans-serif'
            });
            return control;
          }

          function showCommentEditor(element, pick) {
            // keepPicking: this is replacing one editor with another, not ending the round.
            closeEditor(true);
            var rect = element.getBoundingClientRect();
            var editor = markUi(document.createElement('div'));
            Object.assign(editor.style, {
              position: 'fixed',
              left: Math.max(8, Math.min(window.innerWidth - 292, rect.left)) + 'px',
              top: Math.max(8, Math.min(window.innerHeight - 150, rect.bottom + 8)) + 'px',
              width: '280px',
              boxSizing: 'border-box',
              padding: '10px',
              border: '1px solid rgba(127, 127, 127, 0.45)',
              borderRadius: '6px',
              background: '#202124',
              color: '#f5f5f5',
              boxShadow: '0 8px 24px rgba(0, 0, 0, 0.30)',
              zIndex: '2147483647',
              font: '12px system-ui, sans-serif'
            });

            var title = markUi(document.createElement('div'));
            title.textContent = pick.tagName + ' · ' + pick.selector;
            Object.assign(title.style, {
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              marginBottom: '7px',
              color: '#d7d7d7'
            });

            var input = markUi(document.createElement('textarea'));
            input.value = pick.comment || '';
            input.placeholder = '告诉 AI 这里需要怎样调整';
            input.rows = 3;
            Object.assign(input.style, {
              display: 'block',
              width: '100%',
              resize: 'vertical',
              boxSizing: 'border-box',
              border: '1px solid rgba(255, 255, 255, 0.24)',
              borderRadius: '4px',
              padding: '7px 8px',
              outline: 'none',
              background: '#2b2d30',
              color: '#ffffff',
              font: '12px system-ui, sans-serif'
            });

            var actions = markUi(document.createElement('div'));
            Object.assign(actions.style, {
              display: 'flex',
              justifyContent: 'flex-end',
              gap: '6px',
              marginTop: '8px'
            });
            var cancel = button('取消', false);
            var save = button('保存评论', true);
            var remove = pick.comment ? button('删除标注', false) : null;
            if (remove) {
              remove.style.borderColor = 'rgba(220, 80, 80, 0.55)';
              remove.style.color = '#e06060';
              remove.addEventListener('click', function (event) {
                event.preventDefault();
                event.stopPropagation();
                state.picks = state.picks.filter(function (item) { return item.id !== pick.id; });
                sendToIdea({ type: 'removePick', pickId: pick.id });
                closeEditor();
                renderBadges();
              }, true);
            }
            cancel.addEventListener('click', function (event) {
              event.preventDefault();
              event.stopPropagation();
              closeEditor();
            }, true);
            save.addEventListener('click', function (event) {
              event.preventDefault();
              event.stopPropagation();
              var comment = input.value.trim();
              if (!comment) {
                input.focus();
                return;
              }
              pick.comment = comment;
              var previous = state.picks.findIndex(function (item) { return item.id === pick.id; });
              if (previous >= 0) state.picks[previous] = pick;
              else state.picks.push(pick);
              sendToIdea({
                type: 'comment',
                pickId: pick.id,
                selector: pick.selector,
                comment: comment
              });
              closeEditor();
              renderBadges();
            }, true);
            input.addEventListener('keydown', function (event) {
              event.stopPropagation();
              if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') save.click();
              if (event.key === 'Escape') closeEditor();
            }, true);

            if (remove) actions.appendChild(remove);
            actions.appendChild(cancel);
            actions.appendChild(save);
            editor.appendChild(title);
            editor.appendChild(input);
            editor.appendChild(actions);
            document.documentElement.appendChild(editor);
            state.editor = editor;
            window.setTimeout(function () { input.focus(); input.select(); }, 0);
          }

          function clearBadges() {
            state.badges.forEach(removeElement);
            state.badges = [];
          }

          function renderBadges() {
            clearBadges();
            var frameUrl = window.location.href;
            state.picks.filter(function (pick) {
              return pick.comment && (!pick.frameUrl || pick.frameUrl === frameUrl);
            }).forEach(function (pick, index) {
              var element;
              try { element = document.querySelector(pick.selector); } catch (error) { element = null; }
              if (!element) return;
              var rect = element.getBoundingClientRect();
              if (rect.width <= 0 || rect.height <= 0) return;
              var badge = markUi(document.createElement('button'));
              badge.type = 'button';
              badge.textContent = String(index + 1);
              badge.title = pick.comment;
              Object.assign(badge.style, {
                position: 'fixed',
                left: Math.max(2, rect.right - 10) + 'px',
                top: Math.max(2, rect.top - 10) + 'px',
                width: '20px',
                height: '20px',
                padding: '0',
                border: '1px solid #d66f00',
                borderRadius: '50%',
                background: '#ff8a00',
                color: '#171717',
                cursor: 'pointer',
                font: 'bold 11px system-ui, sans-serif',
                lineHeight: '18px',
                textAlign: 'center',
                zIndex: '2147483645'
              });
              badge.addEventListener('click', function (event) {
                event.preventDefault();
                event.stopPropagation();
                event.stopImmediatePropagation();
                state.frozen = true;
                state.activeElement = element;
                ensureOverlay();
                if (state.overlay) state.overlay.style.display = 'block';
                positionOverlay(element);
                showCommentEditor(element, pick);
              }, true);
              document.documentElement.appendChild(badge);
              state.badges.push(badge);
            });
          }

          function scheduleFrameUpdate() {
            if (state.framePending) return;
            state.framePending = true;
            window.requestAnimationFrame(function () {
              state.framePending = false;
              if (state.activeElement) positionOverlay(state.activeElement);
              renderBadges();
            });
          }

          function onPointerMove(event) {
            // Frozen means an element is already picked and its editor is open: the box stays put
            // instead of following the cursor, which used to make the whole page look "selected".
            if (!state.enabled || state.frozen || isPickerUi(event.target)) return;
            state.activeElement = event.target instanceof Element ? event.target : null;
            positionOverlay(state.activeElement);
          }

          function onClick(event) {
            if (!state.enabled || state.frozen || isPickerUi(event.target)) return;
            var element = event.target instanceof Element ? event.target : null;
            if (!element) return;
            event.preventDefault();
            event.stopPropagation();
            event.stopImmediatePropagation();
            var pick = buildPick(element);
            var previous = state.picks.findIndex(function (item) { return item.id === pick.id; });
            if (previous >= 0) state.picks[previous] = pick;
            else state.picks.push(pick);
            sendToIdea(Object.assign({ type: 'pick' }, pick));
            state.frozen = true;
            state.activeElement = element;
            positionOverlay(element);
            showCommentEditor(element, pick);
          }

          function disable(notifyIdea) {
            if (state.enabled) {
              document.removeEventListener('pointermove', onPointerMove, true);
              document.removeEventListener('click', onClick, true);
              document.removeEventListener('keydown', onKeyDown, true);
            }
            state.enabled = false;
            state.activeElement = null;
            state.frozen = false;
            if (state.overlay) state.overlay.style.display = 'none';
            closeEditor(true);
            if (notifyIdea) sendToIdea({ type: 'pickerStopped' });
          }

          function onKeyDown(event) {
            if (event.key !== 'Escape') return;
            event.preventDefault();
            event.stopPropagation();
            disable(true);
          }

          function enable() {
            if (state.enabled) return;
            state.enabled = true;
            ensureOverlay();
            document.addEventListener('pointermove', onPointerMove, true);
            document.addEventListener('click', onClick, true);
            document.addEventListener('keydown', onKeyDown, true);
          }

          state.setEnabled = function (enabled) {
            if (enabled) enable();
            else disable(false);
          };
          state.syncPicks = function (picks, pageUrl) {
            if (pageUrl) mainPageUrl = pageUrl;
            state.picks = Array.isArray(picks) ? picks.slice() : [];
            renderBadges();
          };
          state.destroy = function () {
            disable(false);
            window.removeEventListener('scroll', scheduleFrameUpdate, true);
            window.removeEventListener('resize', scheduleFrameUpdate, true);
            clearBadges();
            removeElement(state.overlay);
            state.overlay = null;
            if (window.__capybaraPicker === state) delete window.__capybaraPicker;
          };

          window.addEventListener('scroll', scheduleFrameUpdate, true);
          window.addEventListener('resize', scheduleFrameUpdate, true);
          window.__capybaraPicker = state;
          state.syncPicks($picksJson, mainPageUrl);
          state.setEnabled($enabled);
        })();
    """.trimIndent()

    fun setEnabled(enabled: Boolean): String = """
        (function () {
          if (window.__capybaraPicker && typeof window.__capybaraPicker.setEnabled === 'function') {
            window.__capybaraPicker.setEnabled($enabled);
          }
        })();
    """.trimIndent()

    fun syncPicks(picksJson: String, pageUrlJson: String): String = """
        (function () {
          if (window.__capybaraPicker && typeof window.__capybaraPicker.syncPicks === 'function') {
            window.__capybaraPicker.syncPicks($picksJson, $pageUrlJson);
          }
        })();
    """.trimIndent()

    fun destroy(): String = """
        (function () {
          if (window.__capybaraPicker && typeof window.__capybaraPicker.destroy === 'function') {
            window.__capybaraPicker.destroy();
          }
        })();
    """.trimIndent()
}
