import { m } from 'motion/react'
import type { ReactNode } from 'react'

import { clsxm } from '~/lib/cn'

import { useToolMotion } from '../../motion'

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
  const { item } = useToolMotion()

  return (
    <m.section
      aria-label={title}
      className={clsxm('raw-tool-section', className)}
      variants={item}
    >
      <div className="raw-tool-section-heading">
        <div className="raw-tool-section-heading-text">
          {eyebrow && <p className="raw-tool-eyebrow">{eyebrow}</p>}
          <h2>{title}</h2>
        </div>
      </div>
      {children}
    </m.section>
  )
}
