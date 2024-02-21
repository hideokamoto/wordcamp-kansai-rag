import { Hono } from 'hono'
import { jsxRenderer, useRequestContext } from 'hono/jsx-renderer'

export const pageApp = new Hono()

pageApp.get('/', (c) => {
  return c.text('Hello Hono!')
})

pageApp.get(
  '/page/*',
  jsxRenderer(({ children }) => {
    return (
      <html>
        <body>
          <header>Menu</header>
          <div>{children}</div>
        </body>
      </html>
    )
  })
)

pageApp.get('/page/about', (c) => {
  return c.render(<h1>About me!</h1>)
})
