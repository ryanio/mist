import Settings from '../../settings';
import ethereumNode from '../../ethereumNode';

export function addTransaction(transaction) {
  return (dispatch, getState) => {
    const network = getState().nodes.network;
    
    dispatch({
      type: '[MAIN]:TRANSACTIONS:ADD',
      payload: { transaction, network }
    });

    if (!transaction.blockNumber) {
      dispatch(updateTransaction(transaction.hash));
    }
  };
}

export function removeTransaction(transactionHash) {
  return {
    type: '[MAIN]:TRANSACTIONS:REMOVE',
    payload: { transactionHash }
  };
}

export function checkTransactionsOnNodeConnect() {
  return (dispatch, getState) => {
    const state = getState();
    if (
      state.nodes.remote.blockNumber > 1000 ||
      state.nodes.local.blockNumber > 1000
    ) {
      dispatch(checkTransactions());
    } else {
      // Try again in 2s
      setTimeout(() => {
        dispatch(checkTransactionsOnNodeConnect());
      }, 2000);
    }
  };
}

export function checkTransactions() {
  return (dispatch, getState) => {
    const state = getState();

    if (!state.transactions.hashes[state.nodes.network]) {
      return;
    }

    state.transactions.hashes[state.nodes.network].forEach(hash => {
      const transaction = state.transactions[hash];
      // Update a transaction if missing blockNumber (i.e. in pending state)
      if (transaction && !transaction.blockNumber) {
        dispatch(updateTransaction(hash));
      }
    });
  };
}

export function updateTransaction(transactionHash) {
  return async (dispatch, getState) => {
    let transaction = getState().transactions[transactionHash] || {
      hash: transactionHash
    };

    try {
      const result = await ethereumNode.send('eth_getTransactionByHash', [
        transactionHash
      ]);
    } catch (error) {
      if (String(error).contains('connect')) {
        console.log('Connection error in updateTransaction: ', error);
        // Retry in 2s
        setTimeout(() => {
          dispatch(updateTransaction(transactionHash))
        }, 2000)
      }
    }

    if (result && result.result) {
      transaction = Object.assign({}, transaction, result.result);
    } else {
      transaction.error = 'Transaction not found';
    }

    dispatch({
      type: '[MAIN]:TRANSACTIONS:UPDATE',
      payload: {
        transaction
      }
    });

    if (!transaction.blockNumber) {
      // Transaction is still pending, so let's get another update in 2s
      setTimeout(() => {
        dispatch(updateTransaction(transactionHash));
      }, 2000);
    }
  };
}
