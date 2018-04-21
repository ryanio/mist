global._ = require('./modules/utils/underscore');

import { app, dialog, ipcMain, shell, protocol } from 'electron';
import Q from 'bluebird';
import windowStateKeeper from 'electron-window-state';
import timesync from 'os-timesync';

import dbSync from './modules/dbSync';
import i18n from './modules/i18n';
import Sockets from './modules/socketManager';
import Windows from './modules/windows';
import ClientBinaryManager from './modules/clientBinaryManager';
import UpdateChecker from './modules/updateChecker';
import logger from './modules/utils/logger';
import Settings from './modules/settings';

import { quitApp } from './modules/core/ui/actions';
import {
  setLanguageOnMain,
  toggleSwarm
} from './modules/core/settings/actions';
import { syncNodeDefaults, setActiveNode } from './modules/core/nodes/actions';
import { checkTransactionsOnNodeConnect } from './modules/core/transactions/actions';
import { SwarmState } from './modules/core/settings/reducer';

import swarmNode from './modules/swarmNode.js';
import ethereumNodeRemote from './modules/ethereumNodeRemote';

const log = logger.create('main');

Q.config({
  cancellation: true
});

store.subscribe(() => {
  store.dispatch(setActiveNode());
});

const db = (global.db = require('./modules/db'));

require('./modules/ipcCommunicator.js');
const appMenu = require('./modules/menuItems');
const ipcProviderBackend = require('./modules/ipc/ipcProviderBackend.js');
const ethereumNode = require('./modules/ethereumNode.js');

// Define global vars; The preloader makes some globals available to the client.
global.webviews = [];
global.mining = false;
global.mode = store.getState().settings.uiMode;
global.icon = `${__dirname}/icons/${global.mode}/icon.png`;
global.dirname = __dirname;
global.i18n = i18n;

// INTERFACE PATHS
// - WALLET
if (global.mode === 'wallet') {
  log.info('Starting in Wallet mode');

  global.interfaceAppUrl = Settings.inProductionMode
    ? `file://${__dirname}/interface/wallet/index.html`
    : 'http://localhost:3050';
  global.interfacePopupsUrl = Settings.inProductionMode
    ? `file://${__dirname}/interface/index.html`
    : 'http://localhost:3000';

  // - MIST
} else {
  log.info('Starting in Mist mode');

  let url = Settings.inProductionMode
    ? `file://${__dirname}/interface/index.html`
    : 'http://localhost:3000';

  if (Settings.cli.resetTabs) {
    url += '?reset-tabs=true';
  }

  global.interfaceAppUrl = global.interfacePopupsUrl = url;
}

// prevent crashes and close gracefully
process.on('uncaughtException', error => {
  log.error('UNCAUGHT EXCEPTION', error);
  store.dispatch(quitApp());
});

// Quit when all windows are closed.
app.on('window-all-closed', () => store.dispatch(quitApp()));

// Listen to custom protocol incoming messages, needs registering of URL schemes
app.on('open-url', (e, url) => log.info('Open URL', url));

let killedSocketsAndNodes = false;

app.on('before-quit', async event => {
  if (!killedSocketsAndNodes) {
    log.info('Defer quitting until sockets and node are shut down');

    event.preventDefault();

    // sockets manager
    try {
      await Sockets.destroyAll();
      store.dispatch({ type: '[MAIN]:SOCKETS:DESTROY' });
    } catch (e) {
      log.error('Error shutting down sockets');
    }

    // delay quit, so the sockets can close
    setTimeout(async () => {
      await ethereumNode.stop();
      store.dispatch({ type: '[MAIN]:ETH_NODE:STOP' });

      killedSocketsAndNodes = true;
      await db.close();
      store.dispatch({ type: '[MAIN]:DB:CLOSE' });

      store.dispatch(quitApp());
    }, 500);
  } else {
    log.info('About to quit...');
  }
});

let mainWindow;

// This method will be called when Electron has done everything
// initialization and ready for creating browser windows.
app.on('ready', async () => {
  // if using HTTP RPC then inform user
  if (Settings.rpcMode === 'http') {
    dialog.showErrorBox(
      'Insecure RPC connection',
      `
WARNING: You are connecting to an Ethereum node via: ${Settings.rpcHttpPath}

This is less secure than using local IPC - your passwords will be sent over the wire in plaintext.

Only do this if you have secured your HTTP connection or you know what you are doing.
`
    );
  }

  // initialise the db
  try {
    await global.db.init();
    store.dispatch({ type: '[MAIN]:DB:INIT' });
    onReady();
  } catch (e) {
    log.error(e);
    store.dispatch(quitApp());
  }
});

protocol.registerStandardSchemes(['bzz']);
store.dispatch({
  type: '[MAIN]:PROTOCOL:REGISTER',
  payload: { protocol: 'bzz' }
});

function onReady() {
  global.config = db.getCollection('SYS_config');

  dbSync.initializeListeners();

  Windows.init();

  enableSwarmProtocol();

  if (!Settings.inAutoTestMode) {
    UpdateChecker.run();
  }

  ipcProviderBackend.init();

  store.dispatch(syncNodeDefaults());

  ethereumNode.init();

  ethereumNodeRemote.start();

  store.dispatch(checkTransactionsOnNodeConnect());

  // TODO: Settings.language relies on global.config object being set
  store.dispatch(setLanguageOnMain(Settings.language));

  appMenu();

  createCoreWindows();

  checkTimeSync();

  initializeListeners();

  checkForLegacyChain();

  ClientBinaryManager.init();

  if (Settings.enableSwarmOnStart) {
    store.dispatch(toggleSwarm());
  }

  // Update menu (to show node switching possibilities)
  appMenu();

  // await handleOnboarding();

  startMainWindow();
}

function enableSwarmProtocol() {
  protocol.registerHttpProtocol(
    'bzz',
    (request, callback) => {
      if (
        [SwarmState.Disabling, SwarmState.Disabled].includes(
          store.getState().settings.swarmState
        )
      ) {
        const error = global.i18n.t('mist.errors.swarm.notEnabled');
        dialog.showErrorBox('Note', error);
        callback({ error });
        store.dispatch({
          type: '[MAIN]:PROTOCOL:ERROR',
          payload: { protocol: 'bzz', error }
        });
        return;
      }

      const redirectPath = `${Settings.swarmURL}/${request.url.replace(
        'bzz:/',
        'bzz://'
      )}`;

      if (store.getState().settings.swarmState === SwarmState.Enabling) {
        swarmNode.on('started', () => {
          callback({
            method: request.method,
            referrer: request.referrer,
            url: redirectPath
          });
        });
      } else {
        // Swarm enabled
        callback({
          method: request.method,
          referrer: request.referrer,
          url: redirectPath
        });
      }

      store.dispatch({
        type: '[MAIN]:PROTOCOL:REQUEST',
        payload: { protocol: 'bzz' }
      });
    },
    error => {
      if (error) {
        log.error(error);
      }
    }
  );
}

function createCoreWindows() {
  global.defaultWindow = windowStateKeeper({
    defaultWidth: 1024 + 208,
    defaultHeight: 720
  });

  // Create the browser window.
  mainWindow = Windows.create('main');

  // Delegating events to save window bounds on windowStateKeeper
  global.defaultWindow.manage(mainWindow.window);
}

function checkTimeSync() {
  if (!Settings.skiptimesynccheck) {
    timesync.checkEnabled((err, enabled) => {
      if (err) {
        log.error("Couldn't infer if computer automatically syncs time.", err);
        return;
      }

      if (!enabled) {
        dialog.showMessageBox(
          {
            type: 'warning',
            buttons: ['OK'],
            message: global.i18n.t('mist.errors.timeSync.title'),
            detail: `${global.i18n.t(
              'mist.errors.timeSync.description'
            )}\n\n${global.i18n.t(`mist.errors.timeSync.${process.platform}`)}`
          },
          () => {}
        );
      }
    });
  }
}

function checkForLegacyChain() {
  if ((Settings.loadUserData('daoFork') || '').trim() === 'false') {
    dialog.showMessageBox(
      {
        type: 'warning',
        buttons: ['OK'],
        message: global.i18n.t('mist.errors.legacyChain.title'),
        detail: global.i18n.t('mist.errors.legacyChain.description')
      },
      () => {
        shell.openExternal('https://github.com/ethereum/mist/releases');
        store.dispatch(quitApp());
      }
    );

    throw new Error('Cant start client due to legacy non-Fork setting.');
  }
}

function initializeListeners() {
  ClientBinaryManager.on('status', (status, data) => {
    Windows.broadcast('uiAction_clientBinaryStatus', status, data);
  });

  ethereumNode.on('nodeConnectionTimeout', () => {
    Windows.broadcast('uiAction_nodeStatus', 'connectionTimeout');
  });

  ethereumNode.on('nodeLog', data => {
    Windows.broadcast('uiAction_nodeLogText', data.replace(/^.*[0-9]]/, ''));
  });

  ethereumNode.on('state', (state, stateAsText) => {
    Windows.broadcast(
      'uiAction_nodeStatus',
      stateAsText,
      ethereumNode.STATES.ERROR === state ? ethereumNode.lastError : null
    );
  });
}

async function handleOnboarding() {
  // Fetch accounts; if none, show the onboarding process
  const resultData = await ethereumNode.send('eth_accounts', []);

  if (
    ethereumNode.isGeth &&
    (resultData.result === null ||
      (_.isArray(resultData.result) && resultData.result.length === 0))
  ) {
    log.info('No accounts setup yet, lets do onboarding first.');

    await new Q((resolve, reject) => {
      const onboardingWindow = Windows.createPopup('onboardingScreen');

      onboardingWindow.on('closed', () => store.dispatch(quitApp()));

      // Handle changing network types (mainnet, testnet)
      ipcMain.on('onBoarding_changeNet', (e, testnet) => {
        const newType = ethereumNode.type;
        const newNetwork = testnet ? 'rinkeby' : 'main';

        log.debug('Onboarding change network', newType, newNetwork);

        ethereumNode
          .restart(newType, newNetwork)
          .then(function nodeRestarted() {
            appMenu();
          })
          .catch(err => {
            log.error('Error restarting node', err);
            reject(err);
          });
      });

      ipcMain.on('onBoarding_launchApp', () => {
        onboardingWindow.removeAllListeners('closed');
        onboardingWindow.close();

        ipcMain.removeAllListeners('onBoarding_changeNet');
        ipcMain.removeAllListeners('onBoarding_launchApp');

        resolve();
      });
    });
  }
}

function startMainWindow() {
  log.info(`Loading Interface at ${global.interfaceAppUrl}`);
  initializeMainWindowListeners();
  initializeTabs();
}

function initializeMainWindowListeners() {
  mainWindow.on('ready', () => {
    mainWindow.show();
  });

  mainWindow.load(global.interfaceAppUrl);

  mainWindow.on('closed', () => store.dispatch(quitApp()));
}

function initializeTabs() {
  const Tabs = global.db.getCollection('UI_tabs');
  const sortedTabs =
    Tabs.getDynamicView('sorted_tabs') || Tabs.addDynamicView('sorted_tabs');
  sortedTabs.applySimpleSort('position', false);

  const refreshMenu = () => {
    clearTimeout(global._refreshMenuFromTabsTimer);

    global._refreshMenuFromTabsTimer = setTimeout(() => {
      log.debug('Refresh menu with tabs');
      global.webviews = sortedTabs.data();
      appMenu(global.webviews);
      store.dispatch({ type: '[MAIN]:MENU:REFRESH' });
    }, 1000);
  };

  Tabs.on('insert', refreshMenu);
  Tabs.on('update', refreshMenu);
  Tabs.on('delete', refreshMenu);
}
