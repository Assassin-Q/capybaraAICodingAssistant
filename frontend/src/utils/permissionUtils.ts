import type { PermissionRequest, PermissionCategory } from '../types'

/**
 * 通配符匹配函数，支持 * 和 ?
 * * 匹配任意字符序列（包括空序列）
 * ? 匹配任意单个字符
 */
export function wildcardMatch(pattern: string, testString: string): boolean {
  // 将通配符模式转换为正则表达式
  const regexPattern = pattern
    .split('')
    .map(char => {
      if (char === '*') return '.*'
      if (char === '?') return '.'
      // 转义正则特殊字符
      if (/[.+^${}()|[\]\\]/.test(char)) return '\\' + char
      return char
    })
    .join('')
  
  const regex = new RegExp(`^${regexPattern}$`, 'i')
  return regex.test(testString)
}

/**
 * 评估权限请求，根据用户配置的规则返回决策
 * @param request 权限请求
 * @param categories 用户配置的权限规则
 * @returns 'allow' | 'deny' | 'ask' 决策结果
 */
export function evaluatePermission(
  request: PermissionRequest,
  categories: PermissionCategory[]
): 'allow' | 'deny' | 'ask' {
  const category = categories.find(cat => cat.category === request.permission)
  
  // 如果没有配置该类别的规则，默认询问
  if (!category || category.rules.length === 0) {
    return 'ask'
  }
  
  // 按顺序检查规则（第一条匹配的规则生效）
  for (const rule of category.rules) {
    // 检查请求的每个模式是否匹配规则模式
    const hasMatch = request.patterns.some(pattern => 
      wildcardMatch(rule.pattern, pattern)
    )
    
    if (hasMatch) {
      return rule.level
    }
  }
  
  // 没有匹配的规则，默认询问
  return 'ask'
}

/**
 * 将权限决策映射到OpenCode API的回复值
 * @param decision 'allow' | 'deny' | 'ask'
 * @returns 'once' | 'reject' 或 null（表示需要用户交互）
 */
export function mapDecisionToReply(decision: 'allow' | 'deny' | 'ask'): 'once' | 'reject' | null {
  switch (decision) {
    case 'allow':
      return 'once'
    case 'deny':
      return 'reject'
    case 'ask':
    default:
      return null
  }
}