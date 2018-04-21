import { combineReducers } from 'redux';
import nodes from './nodes/reducer';
import settings from './settings/reducer';
import ui from './ui/reducer';
import transactions from './transactions/reducer';

let reducers = {
  nodes,
  settings,
  ui,
  transactions
};

export default reducers;
