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
      library: 'Library',
      libraryHint: 'Download your templates, presets and components of your own, with no project. Every project export carries them too.',
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
      drop: 'Or drop a .spadewick.zip, a zipped project folder, a project.db or a downloaded library here.',
      reading: 'Reading the project…',
      privacy: 'The project is read in this tab and never uploaded.',
      desktopHint: 'A project from the desktop app: close it there first, then choose its folder or a zip of it.'
    },
    // file pickers and drops (WEB-PRD Phase 4)
    pick: {
      title: 'Choose a file',
      folderTitle: 'Choose a folder',
      text: 'Choose the file on your computer.',
      filesText: 'Choose the files on your computer.',
      folderText: 'Choose the folder on your computer.',
      siblings: 'Choose the other pictures of the design with it, if they are in the same folder: they are found too.',
      privacy: 'What you choose is read in this tab and never uploaded.',
      choose: 'Choose…',
      chooseFolder: 'Choose a folder…'
    },
    drop: {
      openFirst: 'Open or create a project first, then drop the pictures on it.',
      added: ({ n }) => `Added ${n} ${n === 1 ? 'picture' : 'pictures'} to the project's assets.`,
      unknown: 'Drop a project (.spadewick.zip, a project folder or project.db) or pictures (PNG, JPEG, WebP, SVG).'
    },
    // the person's library travels with projects (WEB-PRD Phase 8)
    library: {
      merged: 'Your library: {what}.',
      added: ({ n }) => `${n} ${n === 1 ? 'item' : 'items'} added`,
      kept: ({ n }) => `${n} ${n === 1 ? 'item was' : 'items were'} different here and in the file: both versions kept, the older one as a copy`,
      skipped: ({ n }) => `${n} damaged ${n === 1 ? 'item' : 'items'} left out`,
      nothingNew: 'Your library already had everything in this file.',
      empty: 'Your library has no templates, presets or components of your own yet.',
      downloaded: 'Downloaded {file}. Import it in another tab to bring your library there.',
      inExport: ({ n }) => `Your library (${n} ${n === 1 ? 'item' : 'items'}: templates, presets and components of your own) goes with it.`
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
  },
  menu: {
    duplicateProject: 'Export a Copy As…'
  },
  actions: {
    duplicated: 'Downloaded a copy: {path}'
  },
  // exports are downloaded (WEB-PRD Phase 7): no folder is chosen, and the saved object cannot link to files on this computer
  exportDialog: {
    export: 'Export and download',
    exportedToast: ({ n, path }) => `Exported ${n} ${n === 1 ? 'card' : 'cards'}: downloading ${path}`,
    imageLinksNamesHelp: 'The download holds the JSON and the sheet images; the JSON names the images. Tabletop Simulator reads the names as web addresses and reports a "WWW Image Error" until you replace each one with an address. Choose Steam Cloud to have Spadewick write the addresses in.',
    imageLinksCloudHelp: 'The download holds the JSON and the sheet images. To play, upload the sheets to Steam Cloud in Tabletop Simulator, then paste the address of each below: Spadewick writes a second JSON (ending in _cloud), which is downloaded and loads for everyone. Delete the files in Cloud Manager when the playtest is over.',
    cloudSteps: 'Upload the sheets: unzip the download, open Tabletop Simulator, choose Modding, Cloud Manager, Upload, and add the files listed below. Then copy the address Cloud Manager gives each file and paste it next to its name.',
    cloudWritten: ({ n, file }) => `${n} ${n === 1 ? 'link' : 'links'} written to ${file}: downloading it`
  }
}

const isPlain = v => v && typeof v === 'object' && !Array.isArray(v)

/** `base` with `over` laid on top, key by key (neither is changed). */
export function mergeStrings(base, over) {
  const out = { ...base }
  for (const [k, v] of Object.entries(over)) out[k] = isPlain(v) && isPlain(base[k]) ? mergeStrings(base[k], v) : v
  return out
}
