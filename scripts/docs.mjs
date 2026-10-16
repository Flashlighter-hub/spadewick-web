/**
 * The documentation page made from the program's own text, so it cannot drift from it (PRD §19):
 *   docs/svg-naming-guide.md  from the guide that the SVG import dialog shows
 * (The web version has no command line, so docs/command-line.md is gone: WEB-PRD Phase 0.)
 * `node scripts/docs.mjs` writes them; tests/unit/docs.test.js fails when the files are not what this makes.
 */
import { mkdirSync, writeFileSync } from 'fs'
import { join } from 'path'
import { strings } from '../src/shared/strings.js'

export function buildDocs() {
  const g = strings.svgImport
  const guide = `# ${g.guideTitle}

${g.guideIntro}

- ${g.guideNames}
- ${g.guideBox}
- ${g.guideConditions}
- ${g.guideIcons}
- ${g.guideText}
- ${g.guideImages}

## Tools

- ${g.guideFigma}
- ${g.guideIllustrator}
- ${g.guideInkscape}
- ${g.guideAffinity}
`
  return { 'svg-naming-guide.md': guide }
}

if (process.argv[1] && process.argv[1].endsWith('docs.mjs')) {
  const dir = join(process.cwd(), 'docs')
  mkdirSync(dir, { recursive: true })
  for (const [name, text] of Object.entries(buildDocs())) writeFileSync(join(dir, name), text.replace(/\r?\n/g, '\r\n'))
  console.log('docs written')
}
