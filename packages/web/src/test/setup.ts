import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach, vi } from 'vitest'

// jsdom has neither media queries nor the Web Animations API.
vi.stubGlobal('matchMedia', (query: string) => ({
  matches: false,
  media: query,
  addEventListener: () => {},
  removeEventListener: () => {},
}))
Element.prototype.animate = () => ({ cancel: () => {} }) as unknown as Animation

afterEach(() => cleanup())
