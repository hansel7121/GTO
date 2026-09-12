// Build with the GitHub Pages base path and publish dist/ to the gh-pages branch.
import { execSync } from 'node:child_process'
execSync('npm run build', { stdio: 'inherit', env: { ...process.env, BASE_PATH: '/GTO/' } })
execSync('npx gh-pages -d dist --nojekyll -m "Deploy to GitHub Pages"', { stdio: 'inherit' })
