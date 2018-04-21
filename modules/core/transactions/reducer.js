export const initialState = {
  hashes: {}
};

const transactions = (state = initialState, action) => {
  switch (action.type) {
    case '[MAIN]:TRANSACTIONS:ADD': {
      const { transaction, network } = action.payload;

      return Object.assign({}, state, {
        [transaction.hash]: transaction,
        hashes: Object.assign({}, state.hashes, {
          [network]: state.hashes[network] ? [...state.hashes[network], transaction.hash] : [transaction.hash]
        })
      });
    }
    case '[MAIN]:TRANSACTIONS:UPDATE': {
      const { transaction } = action.payload;
      return Object.assign({}, state, {
        [transaction.hash]: Object.assign(
          {},
          state[transaction.hash],
          transaction
        )
      });
    }
    case '[MAIN]:TRANSACTIONS:REMOVE': {
      const { transactionHash } = action.payload;
      return Object.keys(state).reduce((result, key) => {
        if (key === 'hashes') {
          result[key] = Object.keys(state.hashes).reduce((result2, key2) => {
            result2[key2] = Object.keys(state.hashes[key2]).reduce(
              (result3, key3) => {
                if (result3[key3] !== transactionHash) {
                  result3[key3] = result3[key3];
                }
              }
            );
          });
        } else if (transactionHash !== key) {
          result[key] = state[key];
        }
        return result;
      }, {});
    }
    default:
      return state;
  }
};

export default transactions;
