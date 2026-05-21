import type { JSX, ReactNode } from 'react'
import { cloneElement } from 'react'

export const ProviderComposer: Component<{
  contexts: JSX.Element[]
}> = ({ contexts, children }) =>
  contexts.reduceRight<ReactNode>(
    (kids, parent) => cloneElement(parent, { children: kids }),
    children,
  )
