import '@testing-library/jest-dom/vitest'
import { afterEach } from 'vitest'
import { cleanup } from '@testing-library/react'

// Testing Library's implicit auto-cleanup relies on detecting a global `afterEach` (as set up by
// Vitest's `globals: true`), which this project doesn't enable -- so it has to be wired up
// explicitly here instead, once, for every component test.
afterEach(() => cleanup())
