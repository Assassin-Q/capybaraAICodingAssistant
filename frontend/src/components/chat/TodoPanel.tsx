import React from 'react'
import { Collapse, Checkbox, Tag, Space, Typography } from 'antd'
import type { Todo } from '../../types'

const { Text } = Typography

interface TodoPanelProps {
  todos: Todo[]
  todoCollapsed: boolean
  setTodoCollapsed: (collapsed: boolean) => void
}

const TodoPanel: React.FC<TodoPanelProps> = ({
  todos,
  todoCollapsed,
  setTodoCollapsed,
}) => {
  if (todos.length === 0 || !todos.some(todo => todo.status !== 'completed')) {
    return null
  }

  return (
    <Collapse
      size="small"
      activeKey={todoCollapsed ? [] : ['todos']}
      onChange={(keys) => setTodoCollapsed(keys.length === 0)}
      style={{
        marginBottom: 8,
        border: '1px solid var(--border-color)',
        backgroundColor: 'var(--bg-secondary)',
      }}
      items={[{
        key: 'todos',
        label: `待办事项 (${todos.filter(t => t.status === 'completed').length}/${todos.length})`,
        extra: (
          <Space>
            <Tag color={todos.filter(t => t.status === 'pending').length > 0 ? 'warning' : 'success'}>
              {todos.filter(t => t.status === 'pending').length} 待处理
            </Tag>
            <Tag color="processing">
              {todos.filter(t => t.status === 'in_progress').length} 进行中
            </Tag>
          </Space>
        ),
        children: (
        <div style={{ maxHeight: '70vh', overflow: 'auto' }}>
          {todos.map((todo, idx) => (
            <div
              key={todo.id || idx}
              style={{
                padding: '4px 0',
                borderBottom: '1px solid var(--border-light)',
                display: 'flex',
                alignItems: 'center',
              }}
            >
              <Checkbox
                checked={todo.status === 'completed'}
                indeterminate={todo.status === 'in_progress'}
                disabled={true}
                style={{ marginRight: 8 }}
              />
              <div style={{ flex: 1 }}>
                <Text style={{
                  color: 'var(--text-primary)',
                  textDecoration: todo.status === 'completed' ? 'line-through' : 'none',
                  opacity: todo.status === 'completed' ? 0.7 : 1
                }}>
                  {todo.title}
                </Text>
                {todo.description && (
                  <Text style={{
                    color: 'var(--text-secondary)',
                    fontSize: 12,
                    display: 'block',
                    marginTop: 2,
                    textDecoration: todo.status === 'completed' ? 'line-through' : 'none',
                    opacity: todo.status === 'completed' ? 0.7 : 1
                  }}>
                    {todo.description}
                  </Text>
                )}
              </div>
              <Tag
                color={
                  todo.status === 'completed' ? 'success' :
                    todo.status === 'in_progress' ? 'processing' :
                    todo.status === 'cancelled' ? 'error' : 'default'
                  }
                  style={{ fontSize: 12 }}
                >
                  {todo.status === 'completed' ? '已完成' :
                    todo.status === 'in_progress' ? '进行中' :
                    todo.status === 'cancelled' ? '已取消' : '待处理'}
                </Tag>
              </div>
            ))}
        </div>
      )}]} />
  )
}

export default TodoPanel