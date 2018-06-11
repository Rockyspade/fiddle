import { observable, action, autorun } from 'mobx';
import * as tmp from 'tmp';

import { BinaryManager } from './binary';
import { ElectronVersion, StringMap, OutputEntry } from '../interfaces';
import { arrayToStringMap } from '../utils/array-to-stringmap';
import { getKnownVersions } from './versions';
import { normalizeVersion } from '../utils/normalize-version';
import { updateEditorTypeDefinitions } from './fetch-types';

const knownVersions = getKnownVersions();
const defaultVersion = normalizeVersion(knownVersions[0].tag_name);

/**
 * Editors exist outside of React's world. To make things *a lot*
 * easier, we keep them around in a global object. Don't judge us,
 * we're really only doing that for the editors.
 */
window.ElectronFiddle = {
  editors: {
    main: null,
    renderer: null,
    html: null
  },
  app: null
};

/**
 * The application's state. Exported as a singleton below.
 *
 * @export
 * @class AppState
 */
export class AppState {
  @observable public gistId: string = '';
  @observable public version: string = defaultVersion;
  @observable public tmpDir: tmp.SynchrounousResult = tmp.dirSync();
  @observable public avatarUrl: string | null = null;
  @observable public githubToken: string | null = null;
  @observable public binaryManager: BinaryManager = new BinaryManager(defaultVersion);
  @observable public versions: StringMap<ElectronVersion> = arrayToStringMap(knownVersions);
  @observable public output: Array<OutputEntry> = [];
  @observable public isConsoleShowing: boolean = false;
  @observable public isTokenDialogShowing: boolean = false;
  @observable public isUnsaved: boolean = true;
  @observable public isMyGist: boolean = false;

  constructor() {
    // Bind all actions
    this.toggleConsole = this.toggleConsole.bind(this);
    this.toggleAuthDialog = this.toggleAuthDialog.bind(this);
    this.setVersion = this.setVersion.bind(this);
  }

  @action public toggleConsole() {
    this.isConsoleShowing = !this.isConsoleShowing;
  }

  @action public toggleAuthDialog() {
    this.isTokenDialogShowing = !this.isTokenDialogShowing;
  }

  @action public async setVersion(input: string) {
    const version = normalizeVersion(input);
    console.log(`State: Switching to ${version}`);

    this.version = version;

    // Update TypeScript definitions
    updateEditorTypeDefinitions(version);

    // Fetch new binaries, maybe?
    if ((this.versions[version] || { state: '' }).state !== 'ready') {
      console.log(`State: Instructing BinaryManager to fetch v${version}`);
      const updatedVersions = { ...this.versions };
      updatedVersions[normalizeVersion(version)].state = 'downloading';
      this.versions = updatedVersions;

      await this.binaryManager.setup(version);
      this.updateDownloadedVersionState();
    }

    autorun(() => localStorage.setItem('githubToken', this.githubToken || ''));
    autorun(() => localStorage.setItem('avatarUrl', this.avatarUrl || ''));
  }

 /*
  * Go and check which versions have already been downloaded.
  *
  * @returns {Promise<void>}
  */
  @action public async updateDownloadedVersionState(): Promise<void> {
    const downloadedVersions = await this.binaryManager.getDownloadedVersions();
    const updatedVersions = { ...this.versions };

    console.log(`State: Updating version state`);
    downloadedVersions.forEach((version) => {
      if (updatedVersions[version]) {
        updatedVersions[version].state = 'ready';
      }
    });

    this.versions = updatedVersions;
  }
}

export const appState = new AppState();
appState.githubToken = localStorage.getItem('githubToken');
appState.setVersion(appState.version);

tmp.setGracefulCleanup();
