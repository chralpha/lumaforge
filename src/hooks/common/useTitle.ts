import { useEffect, useRef } from 'react'

const titleTemplate = `%s | ${APP_NAME}`
export const useTitle = (title?: Nullable<string>) => {
  const currentTitleRef = useRef(document.title)
  useEffect(() => {
    if (!title) return

    const currentTitle = currentTitleRef.current
    document.title = titleTemplate.replace('%s', title)
    return () => {
      document.title = currentTitle
    }
  }, [title])
}
