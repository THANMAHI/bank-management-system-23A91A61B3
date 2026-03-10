// The shape of our Event Store record (Requirement 4)
export interface Event {
  event_id: string;
  aggregate_id: string;
  aggregate_type: 'BankAccount';
  event_type: 'AccountCreated' | 'MoneyDeposited' | 'MoneyWithdrawn' | 'AccountClosed';
  event_data: any;
  event_number: number;
  timestamp: Date;
  version: number;
}

// The shape of our Read Model (Requirement 6)
export interface AccountSummary {
  account_id: string;
  owner_name: string;
  balance: number;
  currency: string;
  status: 'OPEN' | 'CLOSED';
  version: number;
}

// Requirement 3: submission.json structure
export interface Submission {
  testAccountId: string;
  testAccountOwner: string;
}