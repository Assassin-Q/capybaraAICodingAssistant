import { diffLines } from 'diff'

export function buildConflictText(
  oldText: string,
  newText: string,
  options?: {
    conflictPrefix?: string
    conflictSuffix?: string
  }
): string {
  const {
    conflictPrefix = 'Original',
    conflictSuffix = 'Modified',
  } = options || {}
  const changes = diffLines(oldText, newText)
  let result = ''
  let i = 0

  while (i < changes.length) {
    const current = changes[i]
    if (!current.added && !current.removed) {
      result += current.value
      i++
      continue
    }

    let oldChunk = ''
    let newChunk = ''

    while (i < changes.length && (changes[i].added || changes[i].removed)) {
      if (changes[i].added) newChunk += changes[i].value
      if (changes[i].removed) oldChunk += changes[i].value
      i++
    }

    const oldTrimmed = oldChunk.replace(/\n$/, '')
    const newTrimmed = newChunk.replace(/\n$/, '')
    result += `<<<<<<< ${conflictPrefix}\n${oldTrimmed}\n=======\n${newTrimmed}\n>>>>>>> ${conflictSuffix}\n`
  }
  return result
}
