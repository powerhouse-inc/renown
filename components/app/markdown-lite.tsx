import { Fragment, type ReactNode } from 'react'
import { parseMarkdownLite, type Block, type Inline } from '../../utils/markdown-lite'

function inline(nodes: Inline[]): ReactNode[] {
  return nodes.map((node, i) => {
    switch (node.type) {
      case 'text':
        return <Fragment key={i}>{node.text}</Fragment>
      case 'break':
        return <br key={i} />
      case 'code':
        return (
          <code key={i} className="bg-foreground/10 rounded px-1 py-0.5 font-mono text-[0.9em]">
            {node.text}
          </code>
        )
      case 'strong':
        return (
          <strong key={i} className="font-semibold">
            {inline(node.children)}
          </strong>
        )
      case 'em':
        return <em key={i}>{inline(node.children)}</em>
      case 'link':
        return (
          <a
            key={i}
            href={node.href}
            target="_blank"
            rel="noopener noreferrer nofollow ugc"
            className="text-primary! underline underline-offset-2 hover:opacity-80"
          >
            {inline(node.children)}
          </a>
        )
    }
  })
}

function block(node: Block, i: number, headingBase: 2 | 3): ReactNode {
  switch (node.type) {
    case 'heading': {
      const Tag = (['h2', 'h3', 'h4', 'h5'] as const)[headingBase - 2 + node.level - 1]
      const size = node.level === 1 ? 'text-xl' : node.level === 2 ? 'text-lg' : 'text-base'
      return (
        <Tag key={i} className={`text-foreground font-semibold ${size}`}>
          {inline(node.children)}
        </Tag>
      )
    }
    case 'paragraph':
      return <p key={i}>{inline(node.children)}</p>
    case 'list': {
      const List = node.ordered ? 'ol' : 'ul'
      return (
        <List key={i} className={`space-y-1 pl-5 ${node.ordered ? 'list-decimal' : 'list-disc'}`}>
          {node.items.map((item, j) => (
            <li key={j}>{inline(item)}</li>
          ))}
        </List>
      )
    }
    case 'quote':
      return (
        <blockquote key={i} className="border-primary/40 text-muted-foreground border-l-4 pl-4 italic">
          {inline(node.children)}
        </blockquote>
      )
  }
}

/**
 * A description in the markdown subset, as React elements only (no HTML is ever
 * injected). `headingBase`: the element of a level-1 heading (2 = h2), so the
 * text's headings sit below the section heading that contains it.
 */
export function MarkdownLite({ text, className = '', headingBase = 2 }: { text: string; className?: string; headingBase?: 2 | 3 }) {
  return <div className={`text-foreground/90 space-y-3 break-words ${className}`}>{parseMarkdownLite(text).map((node, i) => block(node, i, headingBase))}</div>
}
