import { app } from 'electron';
import path from 'path';
import { LocalStorage } from 'node-localstorage';
import { createStore, applyMiddleware } from 'redux';
import { forwardToRenderer, replayActionMain } from 'electron-redux';
import { composeWithDevTools } from 'remote-redux-devtools';
import thunk from 'redux-thunk';
import { persistStore, persistCombineReducers } from 'redux-persist';
import { AsyncNodeStorage } from 'redux-persist-node-storage';
import reducers from './reducers';

export default function configureReduxStore() {
  const localStoragePath = path.join(app.getPath('userData'), 'Local Storage');
  const localStorage = new LocalStorage(localStoragePath);
  const storage = new AsyncNodeStorage(localStoragePath);
  const persistConfig = {
    key: 'root',
    storage,
    whitelist: ['transactions']
  };

  const reducer = persistCombineReducers(persistConfig, reducers);

  const store = createStore(
    reducer,
    composeWithDevTools(applyMiddleware(thunk, forwardToRenderer))
  );

  const persistor = persistStore(store);

  replayActionMain(store);

  return store;
}

