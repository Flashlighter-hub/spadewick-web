/**
 * Text of the web version (WEB-PRD §4 rule 5). Merged over src/shared/strings.js when the page starts, so the shared
 * strings file stays as the desktop version has it: new keys go under `web`, and a desktop key given here replaces
 * the desktop text in the web version only.
 */
export const webStrings = {
  web: {
    notYetOpen: 'Opening files from your computer comes in a later step of the web version.',
    notYetSave: 'Downloading files comes in a later step of the web version.',
    notYet: 'This is not available in the web version yet.',
    fatalTitle: 'Spadewick could not start',
    fatalText: 'The part of Spadewick that runs in the background stopped: {message}',
    fatalReload: 'Reload the page',
    unsupportedTitle: 'This browser cannot run Spadewick',
    unsupportedText: 'Spadewick needs a current Chrome, Edge or Firefox. Missing here: {missing}.',

    // the project's life in a tab (WEB-PRD §5, Phase 3)
    project: {
      tooBig: 'This project is too large to open in the browser (the limit is 2 GB).',
      large: 'This project is {size} MB. A browser tab may run short of memory with a project this large. Open it anyway?',
      exported: 'Exported {file}. Keep this file: it is the only copy of your project once this tab is closed.',
      discard: '“{name}” has changes you have not exported. They will be lost. Continue?'
    },
    bar: {
      label: 'Project',
      new: 'New',
      import: 'Import…',
      importHint: 'Open a project from your computer: a .spadewick.zip, a zipped project folder, a project folder or a project.db (Ctrl+O)',
      export: 'Export',
      exportHint: 'Download the project as a .spadewick.zip (Ctrl+S)',
      close: 'Close',
      noProject: 'No project open. Nothing is stored on this computer or on a server.',
      notExported: 'Not exported yet: this project exists only in this tab',
      changedSince: 'Changes since the export {when}: export to keep them',
      exported: 'Nothing new since the export {when}',
      asImported: 'Nothing new since it was imported',
      changedSinceImport: 'Changes since it was imported: export to keep them',
      justNow: 'just now',
      minutesAgo: '{n} min ago',
      dirtyHint: 'Closing or reloading this tab deletes what has not been exported. Export with Ctrl+S.'
    },
    import: {
      title: 'Import a project',
      intro: 'Choose a project on your computer.',
      chooseFile: 'Choose a file…',
      chooseFolder: 'Choose a project folder…',
      drop: 'Or drop a .spadewick.zip, a zipped project folder or a project.db here.',
      reading: 'Reading the project…',
      privacy: 'The project is read in this tab and never uploaded.',
      desktopHint: 'A project from the desktop app: close it there first, then choose its folder or a zip of it.'
    },
    export: {
      title: 'Export the project',
      intro: 'Download “{name}” as one .spadewick.zip file. Import it here to go on working, or unzip it and open the folder in the desktop app.',
      snapshots: 'Include snapshots',
      size: 'The project is about {mb} MB before compression.',
      shortcut: 'Ctrl+S exports straight away.',
      go: 'Export and download',
      working: 'Exporting…'
    }
  },

  // desktop text that says something else in the web version
  welcome: {
    openProject: 'Import Project…'
  }
}

const isPlain = v => v && typeof v === 'object' && !Array.isArray(v)

/** `base` with `over` laid on top, key by key (neither is changed). */
export function mergeStrings(base, over) {
  const out = { ...base }
  for (const [k, v] of Object.entries(over)) out[k] = isPlain(v) && isPlain(base[k]) ? mergeStrings(base[k], v) : v
  return out
}
