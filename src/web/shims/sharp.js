/** Placeholder for sharp until the browser image operations replace it (WEB-PRD Phase 6). */
import { NotInWebYet } from './notYet.js'

export default function sharp() { throw new NotInWebYet('Image processing', 'Phase 6') }
sharp.cache = () => {}
sharp.concurrency = () => 1
