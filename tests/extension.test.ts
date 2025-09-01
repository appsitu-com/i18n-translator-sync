import { it, expect } from 'vitest'
import { activate, deactivate } from '../src/extension'
import { commands } from './mocks/vscode'

it('registers commands on activate', async () => {
  const ctx = { subscriptions: [] as any[] } as any
  await activate(ctx)
  // Three commands should be registered
  expect(commands.registerCommand).toHaveBeenCalledTimes(3)
})

it('deactivate should stop without throwing', () => {
  expect(() => deactivate()).not.toThrow()
})
