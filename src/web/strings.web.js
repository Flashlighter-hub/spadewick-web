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
      export: 'Export',
      exportHint: 'Download the project as a .spadewick.zip (Ctrl+S)',
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
    // the menu bar and the parts of the desktop interface the web version replaces (Phase 9)
    menu: {
      label: 'Application menu',
      exportProject: 'Export Project…',
      downloadLibrary: 'Download Library',
      copyErrorReport: 'Copy Error Report'
    },
    // when something goes wrong (Phase 10)
    errors: {
      copied: 'The error report is on the clipboard. Look it over before you send it: it can name your cards and files.',
      downloaded: 'The browser would not use the clipboard, so the error report was downloaded as a text file. Look it over before you send it.'
    },
    crash: {
      title: 'Spadewick stopped working in this tab',
      text: 'The part of Spadewick that runs in the background stopped ({message}). What was in this tab is gone.',
      fromExport: 'Spadewick can start again from your last export of “{name}” at {when}. Changes made after that are lost.',
      fromImport: 'Spadewick can start again from “{name}” as you imported it at {when}. Changes made after that are lost.',
      nothingKept: 'This project was never exported, so there is nothing to start again from. Reload the page to start afresh.',
      restart: 'Start again from that file',
      restarting: 'Starting again…',
      download: 'Download that file',
      reload: 'Reload the page',
      report: 'Copy error report'
    },
    memory: {
      large: 'This project now takes {mb} MB of the tab\'s memory. Export it often: a browser tab may run short of memory with a project this large.'
    },
    welcome: {
      drop: 'Or drop a .spadewick.zip, a project folder or a project.db anywhere on this page.',
      privacyTitle: 'Where your work is kept',
      privacy: 'Only in this browser tab. Nothing is uploaded, and nothing is written to your computer except the files you download. Export your project (Ctrl+S) before closing the tab, and import the file next time.'
    },
    about: {
      version: 'Version {version}, running entirely in your browser.',
      licences: 'Licences of the fonts and software it is made with'
    },
    status: {
      notExported: 'Changes not exported yet',
      exported: 'No unexported changes',
      size: 'The project takes {mb} MB of this tab\'s memory.'
    },
    preferences: {
      remembered: 'These preferences are remembered in this browser only, and hold nothing from your projects.',
      forget: 'Forget my preferences',
      forgotten: 'Forgotten. This tab keeps using them until it is closed; the next visit starts with the defaults.'
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
    openProject: 'Import Project…',
    localFirstCardGameDesign: 'Card game design in your browser'
  },
  menu: {
    openProject: 'Import Project…',
    duplicateProject: 'Export a Copy As…'
  },
  actions: {
    duplicated: 'Downloaded a copy: {path}'
  },
  aboutDialog: {
    localFirstGameAgnosticCard: '— game-agnostic card design.',
    offlineAndPortableAllProjects: 'Private: your project stays in this browser tab and is never uploaded.'
  },
  preferencesDialog: {
    appliesAfterRestart: 'applies when the page is next opened'
  },
  assetBrowser: {
    exportedToast: 'Downloaded {path}'
  },
  // sharing a table (WEB-PRD Phase 11): the helper is the one server outside this site the app may reach, and only when it is on
  tableShare: {
    helperNote: 'The helper only tells each player the address they have on the internet while connecting; it never sees the game. It is the only server outside this site that Spadewick ever contacts, and only while a player connects with it switched on.'
  },
  compare: {
    exported: 'Downloaded {path}'
  },
  templateLibrary: {
    exported: 'Downloaded {path}'
  },
  rulesView: {
    exported: 'Downloaded {path}'
  },
  presets: {
    problems: '{n} preset file(s) in your library could not be read and are not listed.'
  },
  fontsDialog: {
    includedHint: 'These come with Spadewick and are free to use in a game you print or sell: each family is under the SIL Open Font License or the Apache License (Help → About → Licences). Use the name in a template\'s font-family or in the text properties.'
  },
  // the guide (Help tab): what is about folders, the desktop's files or its command line, told for a browser tab
  help: {
    items: {
      quickstart: {
        project: { title: '1. Make a project', code: '', text: 'On the welcome screen choose New Project (or File → New Project…, Alt+N) and give it a name. The project lives in this browser tab: export it (Ctrl+S) to keep it as a .spadewick.zip file, and import that file (File → Import Project…, Ctrl+O) to go on working another time.' },
        export: { title: '8. Export', code: '', text: 'File → Export: Tabletop Simulator… for a deck to play online, Print-and-Play PDF… to print at home, PNG Sheet… for images. What an export makes is downloaded. Nothing is uploaded.' }
      },
      workspace: {
        saving: { title: 'Saving', code: 'Ctrl+S', text: 'Every change to the cards, fields and sets is kept in the project at once, but the project lives only in this browser tab. Export it (Ctrl+S, or Export in the bar on top) to keep it on your computer: the bar says when there are changes not exported yet, and the browser asks before a tab with such changes is closed. The Template Editor is the one place that asks you to save: it shows "Unsaved changes" until you press Save.' },
        menus: { title: 'The menus', code: '', text: 'File: new, import, export the project, export a copy, close, Export (Tabletop Simulator, PDF, PNG), download your library, Preferences. Edit: Undo, Redo, Find and Replace, Select All Cards. View: sidebar, card preview size, rulers, grid, snap, guides and zoom for the canvas. Project: Manage Fields, Card IDs, Manage Fonts, Icons, Text Styles & Keywords, Check Text, Check Print Readiness, Snapshots and What Changed Since. Help: this guide, About and a database check.' },
        shortcuts: { title: 'Keyboard shortcuts', code: 'Alt+N  Ctrl+O  Ctrl+S  Ctrl+Z  Ctrl+Shift+Z  Ctrl+H  Ctrl+A  Ctrl+B  Ctrl+,', text: 'New project, import a project, export it, undo, redo, find and replace, select all cards, show or hide the sidebar, preferences. Browsers keep Ctrl+N for a new window, so New Project is Alt+N. While you type in a field, the field keeps Ctrl+Z, Ctrl+A and Ctrl+B for itself. The canvas and the table have keys of their own: see The canvas editor and The table\'s keys.' },
        preferences: { title: 'Preferences', code: 'Ctrl+,', text: 'Theme (light, dark or follow the system), the size of the card preview, the default export DPI, the undo limit, Reset for the panel layout, and Forget my preferences. They are remembered in this browser only and hold nothing from your projects.' },
        portable: { title: 'Your work in a browser tab', code: '', text: 'Spadewick runs entirely in this tab: nothing is uploaded, and nothing is written to your computer except the files you download. A project is gone when its tab is closed or reloaded, so export it (Ctrl+S) as a .spadewick.zip and import it next time. Your own templates, presets and components travel inside every exported project and are added to the library of the tab that imports it; File → Download Library saves them alone. A project from the desktop app can be imported (close it there first), and an exported file, unzipped, opens in the desktop app.' }
      },
      projects: {
        intro: 'A project holds sets, a set holds cards. Everything about a game travels in one .spadewick.zip file that you export, import, copy and snapshot.',
        project: { title: 'A project', code: '', text: 'Inside its file: a database (project.db) and folders for templates, assets, fonts and snapshots. File → Export Project… downloads it, File → Export a Copy As… downloads a copy under another name, and File → Import Project… brings one in: a .spadewick.zip, a project folder of the desktop app or a zip of one, or a project.db alone.' },
        backup: { title: 'Backing up', code: '', text: 'Export the project (Ctrl+S) and keep the file, or export a snapshot zip. Keep a few exported files of a project you work on for long: each is a complete copy.' }
      },
      exporting: {
        dialog: { title: 'The export dialog', code: '', text: 'Choose the set or sets, the cards (all, only those selected in the table, or those that match a filter), the card back and a file name pattern. What the export makes is downloaded: one file as it is, several as one zip named after the project. Each card is exported as many times as its Quantity.' },
        ttsLinks: { title: 'Image links in the JSON', code: '', text: 'File names only is for when you will host the images yourself and then replace each name with its web address; until then the game reports a WWW Image Error. Steam Cloud is for playing the deck: export with it, unzip the download, upload the sheets in Tabletop Simulator (Modding, Cloud Manager), paste the address of each into the export window and Spadewick writes a second JSON, ending in _cloud, which is downloaded and loads for everyone. Delete the files in Cloud Manager after the playtest. (Links to files on this computer are for the desktop app only.)' }
      },
      print: {
        profiles: { title: 'Saved export profiles', code: '', text: 'Save the settings of an export under a name, and reuse them.' }
      },
      commandLine: {
        intro: 'The command line comes with the desktop app; the web version has none. These entries describe the desktop app\'s, for a project you also open there.'
      },
      troubleshooting: {
        intro: 'Common problems and what to do. If something here does not help, write down the steps that led to the problem; the browser\'s console (F12) shows what went wrong.',
        damaged: { title: 'A project will not open', code: '', text: 'Try Help → Check Database Integrity. Spadewick offers to restore a damaged project from a snapshot. An earlier exported file of the project is the safest way back.' },
        synced: { title: 'A project will not import', code: '', text: 'A project folder copied while the desktop app had it open cannot be imported: its newest changes are in a side file (project.db-wal). Close the project in the desktop app, then copy or zip its folder again. Exported files import as they are.' },
        report: { title: 'Reporting a problem', code: '', text: 'Help → About shows the version. Send it with the steps that led to the problem and, if you can, an exported project that shows it.' }
      },
      glossary: {
        project: { title: 'Project', code: '', text: 'Everything for one game: kept in the browser tab, exported as one file.' }
      }
    }
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
