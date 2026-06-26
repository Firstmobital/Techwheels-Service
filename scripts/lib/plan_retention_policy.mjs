import fs from 'fs/promises'
import path from 'path'

export function sanitizeCell(value) {
  return String(value ?? '-')
    .replace(/\|/g, '/')
    .replace(/\s+/g, ' ')
    .trim()
}

export function sectionRange(text, startHeader, endHeader) {
  const start = text.indexOf(startHeader)
  if (start === -1) return null
  const end = endHeader ? text.indexOf(endHeader, start + startHeader.length) : -1
  return {
    start,
    end: end === -1 ? text.length : end,
  }
}

export function appendTableRowInSection(markdown, sectionHeader, nextSectionHeader, rowText) {
  const range = sectionRange(markdown, sectionHeader, nextSectionHeader)
  if (!range) return markdown

  const before = markdown.slice(0, range.start)
  const section = markdown.slice(range.start, range.end)
  const after = markdown.slice(range.end)

  const lines = section.split('\n')
  let insertionIndex = -1
  for (let i = lines.length - 1; i >= 0; i -= 1) {
    if (lines[i].startsWith('|')) {
      insertionIndex = i
      break
    }
  }

  if (insertionIndex === -1) return markdown
  lines.splice(insertionIndex + 1, 0, rowText)

  return `${before}${lines.join('\n')}${after}`
}

export function pruneTableRowsInSection(markdown, sectionHeader, nextSectionHeader, rowPredicate, keepLast = 2) {
  const range = sectionRange(markdown, sectionHeader, nextSectionHeader)
  if (!range) return markdown

  const before = markdown.slice(0, range.start)
  const section = markdown.slice(range.start, range.end)
  const after = markdown.slice(range.end)

  const lines = section.split('\n')
  const matchingIndexes = []
  lines.forEach((line, idx) => {
    if (line.startsWith('|') && rowPredicate(line)) {
      matchingIndexes.push(idx)
    }
  })

  if (matchingIndexes.length <= keepLast) return markdown

  const toDelete = matchingIndexes.slice(0, matchingIndexes.length - keepLast)
  for (let i = toDelete.length - 1; i >= 0; i -= 1) {
    lines.splice(toDelete[i], 1)
  }

  return `${before}${lines.join('\n')}${after}`
}

export function pruneSnapshotBlocks(markdown, headingRegex, keepLast = 2) {
  const matches = [...markdown.matchAll(headingRegex)]
  if (matches.length <= keepLast) return markdown

  const blocks = matches.map((match, index) => {
    const start = match.index
    const end = index + 1 < matches.length ? matches[index + 1].index : markdown.length
    return { start, end }
  })

  const blocksToRemove = blocks
    .slice(0, blocks.length - keepLast)
    .sort((a, b) => b.start - a.start)

  let next = markdown
  for (const block of blocksToRemove) {
    const before = next.slice(0, block.start).replace(/[ \t]*\n*$/, '\n\n')
    const after = next.slice(block.end).replace(/^\n+/, '')
    next = `${before}${after}`
  }

  return next
}

export function getMaxNumberedSnapshot(markdown, numberedHeadingRegex) {
  const matches = [...markdown.matchAll(numberedHeadingRegex)]
  if (matches.length === 0) return 0
  return matches.reduce((max, match) => {
    const value = Number(match[1] || 0)
    return Number.isFinite(value) ? Math.max(max, value) : max
  }, 0)
}

export async function applyRetentionMutations(planPath, mutation) {
  const raw = await fs.readFile(planPath, 'utf8')
  let markdown = raw

  if (Array.isArray(mutation.tableUpdates)) {
    for (const update of mutation.tableUpdates) {
      if (update.rowText) {
        markdown = appendTableRowInSection(
          markdown,
          update.sectionHeader,
          update.nextSectionHeader,
          update.rowText,
        )
      }

      if (typeof update.rowMatcher === 'function') {
        markdown = pruneTableRowsInSection(
          markdown,
          update.sectionHeader,
          update.nextSectionHeader,
          update.rowMatcher,
          Number(update.keepLast || 2),
        )
      }
    }
  }

  if (mutation.snapshotAppendBlock) {
    markdown = `${markdown.trimEnd()}\n\n${mutation.snapshotAppendBlock}`
  }

  if (mutation.snapshotHeadingRegex) {
    markdown = pruneSnapshotBlocks(
      markdown,
      mutation.snapshotHeadingRegex,
      Number(mutation.snapshotKeepLast || 2),
    )
  }

  if (markdown !== raw) {
    await fs.writeFile(planPath, markdown, 'utf8')
  }

  return {
    changed: markdown !== raw,
    planPath,
  }
}

export function resolvePlanPath(repoRoot, planRelativePath) {
  return path.resolve(repoRoot, planRelativePath)
}
