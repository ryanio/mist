import React, { Component } from 'react';
import { connect } from 'react-redux';

class TransactionListWidget extends Component {
  constructor(props) {
    super(props);

    this.state = {};
  }

  componentDidMount() {}

  componentDidUpdate(prevProps, prevState) {}

  componentWillUnmount() {}

  renderTransactions() {
    const { transactions, network } = this.props;
    console.log('!!!');
    console.log(transactions);

    const transactionList = [];

    transactions.hashes[network].forEach(hash => {
      const transaction = transactions[hash];
      const transactionStatus = transaction.blockNumber ? 'status status-confirmed' : 'status status-pending';

      transactionList.push(
        <div className="transaction" key={transaction.hash}>
          <div className={transactionStatus}></div>
          <div className="hash">
            {transaction.hash}
          </div>
        </div>
        );
    });

    return transactionList;
  }

  render() {
    const { transactions, network } = this.props;

    if (transactions.hashes[network].length === 0) {
      return null;
    }

    return (
      <div className="transaction-list">
        <div className="title">Txs</div>
        {this.renderTransactions()}
      </div>
    );
  }
}

function mapStateToProps(state) {
  return {
    transactions: state.transactions,
    network: state.nodes.network
  };
}

export default connect(mapStateToProps)(TransactionListWidget);
