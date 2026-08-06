import { afterEach } from 'vitest'
import { closeAll } from './server.js'

// Every server a test started is shut down when it finishes. Registered here
// rather than in each file so a new test cannot forget to do it.
afterEach(closeAll)
