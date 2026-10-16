import { execSync } from 'child_process'

// Build the site the tests drive (out-web/), as Cloudflare Pages builds it (WEB-PRD Phase 12).
export default function setup() {
  if (process.env.E2E_SKIP_BUILD) return
  execSync('npm run build', { stdio: 'pipe', env: { ...process.env, FORCE_COLOR: '0' } })
}
