import express, { Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { query } from './db';
import { projectEvent } from './projector'; 

const app = express();
app.use(express.json());

const PORT = process.env.API_PORT || 8080;

app.get('/health', (req: Request, res: Response) => res.status(200).send('OK'));

app.post('/api/accounts', async (req: Request, res: Response) => {
  const { accountId, ownerName, initialBalance, currency } = req.body;
  if (!accountId || !ownerName || initialBalance < 0 || !currency) return res.status(400).json({ message: "Invalid request" });

  try {
    const existing = await query('SELECT 1 FROM events WHERE aggregate_id = $1', [accountId]);
    if (existing.rowCount && existing.rowCount > 0) return res.status(409).json({ message: "Exists" });

    const event = {
      event_id: uuidv4(), 
      aggregate_id: accountId as string, 
      aggregate_type: 'BankAccount',
      event_type: 'AccountCreated', 
      event_data: JSON.stringify({ ownerName, initialBalance, currency }),
      event_number: 1
    };

    await query(`INSERT INTO events (event_id, aggregate_id, aggregate_type, event_type, event_data, event_number) VALUES ($1, $2, $3, $4, $5, $6)`,
      [event.event_id, event.aggregate_id, event.aggregate_type, event.event_type, event.event_data, event.event_number]);

    await projectEvent(event);
    return res.status(202).json({ message: "Command accepted" });
  } catch (error) { return res.status(500).json({ message: "Error" }); }
});

app.get('/api/accounts/:accountId', async (req: Request, res: Response) => {
  const accountId = req.params.accountId as string;
  const result = await query('SELECT * FROM account_summaries WHERE account_id = $1', [accountId]);
  if (result.rowCount === 0) return res.status(404).json({ message: "Not Found" });
  const a = result.rows[0];
  res.status(200).json({ accountId: a.account_id, ownerName: a.owner_name, balance: parseFloat(a.balance), currency: a.currency, status: a.status });
});

const handleTransaction = async (req: Request, res: Response, type: 'MoneyDeposited' | 'MoneyWithdrawn') => {
  const accountId = req.params.accountId as string;
  const { amount, description, transactionId } = req.body;
  if (amount <= 0 || !transactionId) return res.status(400).json({ message: "Invalid data" });

  try {
    const acc = await query('SELECT balance, status, version FROM account_summaries WHERE account_id = $1', [accountId]);
    if (acc.rowCount === 0) return res.status(404).json({ message: "Not Found" });
    const account = acc.rows[0];

    if (account.status === 'CLOSED') return res.status(409).json({ message: "Closed" });
    if (type === 'MoneyWithdrawn' && parseFloat(account.balance) < amount) return res.status(409).json({ message: "Insufficient funds" });

    const event = {
      event_id: uuidv4(), 
      aggregate_id: accountId, 
      aggregate_type: 'BankAccount',
      event_type: type, 
      event_data: JSON.stringify({ amount, description, transactionId }),
      event_number: parseInt(account.version) + 1
    };

    await query(`INSERT INTO events (event_id, aggregate_id, aggregate_type, event_type, event_data, event_number) VALUES ($1, $2, $3, $4, $5, $6)`,
      [event.event_id, event.aggregate_id, event.aggregate_type, event.event_type, event.event_data, event.event_number]);

    await projectEvent(event);
    res.status(202).json({ message: "Accepted" });
  } catch (e) { res.status(500).json({ message: "Error" }); }
};

app.post('/api/accounts/:accountId/deposit', (req, res) => handleTransaction(req, res, 'MoneyDeposited'));
app.post('/api/accounts/:accountId/withdraw', (req, res) => handleTransaction(req, res, 'MoneyWithdrawn'));

app.post('/api/accounts/:accountId/close', async (req: Request, res: Response) => {
  const accountId = req.params.accountId as string;
  const acc = await query('SELECT balance, version FROM account_summaries WHERE account_id = $1', [accountId]);
  if (acc.rowCount === 0) return res.status(404).json({ message: "Not Found" });
  if (parseFloat(acc.rows[0].balance) !== 0) return res.status(409).json({ message: "Balance not zero" });

  const event = {
    event_id: uuidv4(), 
    aggregate_id: accountId, 
    aggregate_type: 'BankAccount',
    event_type: 'AccountClosed', 
    event_data: JSON.stringify({ reason: req.body.reason }),
    event_number: parseInt(acc.rows[0].version) + 1
  };
  await query(`INSERT INTO events (event_id, aggregate_id, aggregate_type, event_type, event_data, event_number) VALUES ($1, $2, $3, $4, $5, $6)`,
    [event.event_id, event.aggregate_id, event.aggregate_type, event.event_type, event.event_data, event.event_number]);
  await projectEvent(event);
  res.status(202).json({ message: "Accepted" });
});

app.get('/api/accounts/:accountId/events', async (req: Request, res: Response) => {
  const accountId = req.params.accountId as string;
  const result = await query('SELECT event_id as "eventId", event_type as "eventType", event_number as "eventNumber", event_data as "data", timestamp FROM events WHERE aggregate_id = $1 ORDER BY event_number ASC', [accountId]);
  res.status(200).json(result.rows);
});

app.get('/api/accounts/:accountId/balance-at/*timestamp', async (req: Request, res: Response) => {
  const accountId = req.params.accountId as string;
  // Express puts the wildcard match in req.params[0] or just req.params.timestamp
  const timestamp = req.params.timestamp || (req.params as any)['0']; 
  const decodedTs = decodeURIComponent(timestamp);
  
  try {
    const events = await query('SELECT event_type, event_data FROM events WHERE aggregate_id = $1 AND timestamp <= $2 ORDER BY event_number ASC', [accountId, decodedTs]);
    
    let balance = 0;
    events.rows.forEach(e => {
      const data = typeof e.event_data === 'string' ? JSON.parse(e.event_data) : e.event_data;
      if (e.event_type === 'AccountCreated') balance = data.initialBalance;
      else if (e.event_type === 'MoneyDeposited') balance += data.amount;
      else if (e.event_type === 'MoneyWithdrawn') balance -= data.amount;
    });
    res.status(200).json({ accountId, balanceAt: balance, timestamp: decodedTs });
  } catch (e) {
    res.status(500).json({ message: "Error calculating balance" });
  }
});

app.get('/api/accounts/:accountId/transactions', async (req: Request, res: Response) => {
  const accountId = req.params.accountId as string;
  const page = parseInt((req.query.page as any) || '1', 10);
  const pageSize = parseInt((req.query.pageSize as any) || '10', 10);
  const offset = (page - 1) * pageSize;

  try {
    const count = await query('SELECT count(*) FROM transaction_history WHERE account_id = $1', [accountId]);
    const items = await query('SELECT * FROM transaction_history WHERE account_id = $1 ORDER BY timestamp DESC LIMIT $2 OFFSET $3', [accountId, pageSize, offset]);
    res.status(200).json({ currentPage: page, pageSize, totalPages: Math.ceil(parseInt(count.rows[0].count) / pageSize), totalCount: parseInt(count.rows[0].count), items: items.rows });
  } catch (e) { res.status(500).json({ message: "Error" }); }
});

app.post('/api/projections/rebuild', async (req: Request, res: Response) => {
  await query('DELETE FROM account_summaries');
  await query('DELETE FROM transaction_history');
  const allEvents = await query('SELECT * FROM events ORDER BY timestamp ASC');
  for (const event of allEvents.rows) { await projectEvent(event); }
  res.status(202).json({ message: "Projection rebuild initiated." });
});

app.get('/api/projections/status', async (req: Request, res: Response) => {
  const total = await query('SELECT COUNT(*) FROM events');
  const count = parseInt(total.rows[0].count);
  res.status(200).json({ 
    totalEventsInStore: count, 
    projections: [
      { name: "AccountSummaries", lastProcessedEventNumberGlobal: count, lag: 0 },
      { name: "TransactionHistory", lastProcessedEventNumberGlobal: count, lag: 0 }
    ]
  });
});

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));