import BaseProcessor from './base';
import Windows from '../../windows';
import Q from 'bluebird';
import { ipcMain as ipc } from 'electron';
import BlurOverlay from '../../blurOverlay';
import { addTransaction } from '../../core/transactions/actions';

/**
 * Process method: eth_sendTransaction
 */
module.exports = class extends BaseProcessor {
  /**
   * @override
   */
  sanitizeRequestPayload(conn, payload, isPartOfABatch) {
    if (isPartOfABatch) {
      throw this.ERRORS.BATCH_TX_DENIED;
    }

    return super.sanitizeRequestPayload(conn, payload, isPartOfABatch);
  }

  /**
   * @override
   */
  exec(conn, payload) {
    return new Q((resolve, reject) => {
      this._log.info('Ask user for password');

      this._log.info(payload.params[0]);

      // validate data
      try {
        _.each(payload.params[0], (val, key) => {
          // if doesn't have hex then leave
          if (!_.isString(val)) {
            throw this.ERRORS.INVALID_PAYLOAD;
          } else {
            // make sure all data is lowercase and has 0x
            if (val) val = `0x${val.toLowerCase().replace(/^0x/, '')}`;

            if (val.substr(2).match(/[^0-9a-f]/gim)) {
              throw this.ERRORS.INVALID_PAYLOAD;
            }
          }

          payload.params[0][key] = val;
        });
      } catch (err) {
        return reject(err);
      }

      const modalWindow = Windows.createPopup('sendTransactionConfirmation', {
        sendData: { uiAction_sendData: payload.params[0] }
      });

      BlurOverlay.enable();

      modalWindow.on('hidden', () => {
        BlurOverlay.disable();

        // user cancelled?
        if (!modalWindow.processed) {
          reject(this.ERRORS.TX_DENIED);
        }
      });

      ipc.once(
        'backendAction_unlockedAccountAndSentTransaction',
        (ev, err, result) => {
          if (
            Windows.getById(ev.sender.id) === modalWindow &&
            !modalWindow.isClosed
          ) {
            if (err || !result) {
              this._log.debug('Confirmation error', err);
              reject(err || this.ERRORS.TX_DENIED);
            } else {
              this._log.info('Transaction sent', result);
              store.dispatch(addTransaction({hash: result}));
              resolve(result);
            }

            modalWindow.processed = true;
            modalWindow.close();
          }
        }
      );
    }).then(result => {
      return _.extend({}, payload, {
        result
      });
    });
  }
};
