import { test, expect } from './fixtures'

test('launches the app and opens a window with a non-empty title', async ({ app }) => {
  const { page } = app
  const title = await page.title()
  console.log('[e2e] actual window title:', title)
  expect(title).toBeTruthy()
})
