import axios from 'axios'

/**
 * API client for endpoints that must stay reachable before login.
 * - Does not attach Bearer tokens (avoids 401 from gateways on stale JWT while loading the landing page).
 * - Does not redirect to /login on 401 (guests should see the public home + inline error, not the staff login screen).
 */
const publicClient = axios.create({
  baseURL: '/api/v1',
  headers: { 'Content-Type': 'application/json' },
})

export default publicClient
