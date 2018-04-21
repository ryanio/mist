// Create the client-side Redux store.
// This store's only purpose is to sync with the main store.
import { createStore, applyMiddleware, combineReducers } from 'redux';
import {
  forwardToMain,
  getInitialStateRenderer,
  replayActionRenderer
} from 'electron-redux';
import thunk from 'redux-thunk';
import reducers from '../core/reducers';

const initialState = getInitialStateRenderer();
delete initialState['_persist'];

const reducer = combineReducers(reducers);

const store = createStore(
  reducer,
  initialState,
  applyMiddleware(forwardToMain, thunk)
);

replayActionRenderer(store);

module.exports = store;
