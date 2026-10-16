/**
 * Settings of the web version (WEB-PRD §5.3, Phase 1), shared by the page and the core worker.
 */

/** The desktop app's settings defaults (src/main/index.js in the desktop repository), with web places for its folders. */
export const SETTINGS_DEFAULTS = {
  projects_root: '/projects',
  recent_projects: [],
  library_dir: '/library',
  undo_limit: 1000,
  autosave_interval_seconds: 30,
  preview_size: 'medium',
  theme: 'system',
  default_export_dpi: 300,
  canvas_smart_guides: true,
  tts_image_links: 'names'          // 'local' needs a folder on the disk the browser cannot know (WEB-PRD Phase 7)
}

/**
 * The only settings kept between visits, in the browser's localStorage (WEB-PRD §5.3, decided by the owner).
 * They describe the interface, never a project; anything else stays in memory and is gone with the tab.
 */
export const REMEMBERED_SETTINGS = [
  'theme', 'preview_size', 'ui_layout', 'undo_limit', 'default_export_dpi', 'canvas_smart_guides', 'tts_image_links',
  'image_export_options', 'production_options', 'author_code'
]

/** The localStorage key that holds them. */
export const SETTINGS_STORAGE_KEY = 'spadewick.settings'

/** The folders of the in-memory file system (WEB-PRD §5.1, Phase 4). */
export const FOLDERS = ['/projects', '/tmp', '/imports', '/downloads', '/library', '/resources']

/** Project size limits in bytes (WEB-PRD §5.2). */
export const WARN_PROJECT_BYTES = 500 * 1024 * 1024
export const MAX_PROJECT_BYTES = 2 * 1024 * 1024 * 1024
