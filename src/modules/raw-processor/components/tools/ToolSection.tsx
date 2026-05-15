import type { ReactNode } from 'react'

import { clsxm } from '~/lib/cn'

export function ToolSection({
  title,
  eyebrow,
  children,
  className,
}: {
  title: string
  eyebrow?: string
  children: ReactNode
  className?: string
}) {
  return (
    <section
      aria-label={title}
      className={clsxm('raw-tool-section', className)}
    >
      <div className="raw-tool-section-heading">
        <div className="raw-tool-section-heading-text">
          {eyebrow && <p className="raw-tool-eyebrow">{eyebrow}</p>}
          <h2>{title}</h2>
        </div>
      </div>
      {children}
    </section>
  )
}
