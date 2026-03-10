import { query } from './db';
import { v4 as uuidv4 } from 'uuid';

export const projectEvent = async (event: any) => {
  const data = typeof event.event_data === 'string' ? JSON.parse(event.event_data) : event.event_data;

  switch (event.event_type) {
    case 'AccountCreated':
      await query(`INSERT INTO account_summaries (account_id, owner_name, balance, currency, status, version) VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT (account_id) DO NOTHING`,
        [event.aggregate_id, data.ownerName, data.initialBalance, data.currency, 'OPEN', event.event_number]);
      break;
    case 'MoneyDeposited':
      await query(`UPDATE account_summaries SET balance = balance + $1, version = $2 WHERE account_id = $3`, [data.amount, event.event_number, event.aggregate_id]);
      break;
    case 'MoneyWithdrawn':
      await query(`UPDATE account_summaries SET balance = balance - $1, version = $2 WHERE account_id = $3`, [data.amount, event.event_number, event.aggregate_id]);
      break;
    case 'AccountClosed':
      await query(`UPDATE account_summaries SET status = 'CLOSED', version = $1 WHERE account_id = $2`, [event.event_number, event.aggregate_id]);
      break;
  }

  if (['MoneyDeposited', 'MoneyWithdrawn'].includes(event.event_type)) {
    await query(`INSERT INTO transaction_history (transaction_id, account_id, type, amount, description, timestamp) VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT DO NOTHING`,
      [data.transactionId, event.aggregate_id, event.event_type === 'MoneyDeposited' ? 'DEPOSIT' : 'WITHDRAW', data.amount, data.description, new Date()]);
  }

  // Requirement 17: Snapshot trigger after every 50 events (triggered on 51st, 101st etc)
  if (event.event_number > 50 && (event.event_number - 1) % 50 === 0) {
    const state = await query('SELECT * FROM account_summaries WHERE account_id = $1', [event.aggregate_id]);
    await query(`INSERT INTO snapshots (snapshot_id, aggregate_id, snapshot_data, last_event_number) VALUES ($1, $2, $3, $4) ON CONFLICT (aggregate_id) DO UPDATE SET snapshot_data = $3, last_event_number = $4`,
      [uuidv4(), event.aggregate_id, JSON.stringify(state.rows[0]), event.event_number - 1]);
  }
};