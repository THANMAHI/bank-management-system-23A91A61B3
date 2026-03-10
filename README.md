# Bank Account Management System (CQRS & Event Sourcing)

A production-grade financial microservice built with **Node.js**, **TypeScript**, and **PostgreSQL**. This system utilizes **Event Sourcing** and **CQRS** (Command Query Responsibility Segregation) to provide a fully auditable and high-performance banking experience.

## 🏗️ Architectural Overview

This project implements the "Hard" difficulty requirements, focusing on data integrity and historical auditability:

- **Event Sourcing**: The "Source of Truth" is the `events` table. All state changes are immutable events.
- **CQRS**: The system separates write operations (Commands) from read operations (Queries). Projections translate events into optimized read-only tables (`account_summaries`, `transaction_history`).
- **Snapshots**: To optimize state reconstruction, a snapshot is automatically generated every 50 events.
- **Rebuild Capability**: Read models can be completely wiped and re-synchronized from the event store at any time.

## 🚀 Getting Started

### Prerequisites
- Docker and Docker Compose installed.
- Postman or cURL for API testing.

### Installation
1. **Prepare Environment**:
   
```bash
   cp .env.example .env
```

2. **Launch System**:

```
  docker-compose up --build
```

The application will be available at http://localhost:8080

## API Endpoints

### Commands (Writes)

- **POST /api/accounts**: Create a new bank account.

- **POST /api/accounts/{id}/deposit**: Deposit funds.

- **POST /api/accounts/{id}/withdraw**: Withdraw funds (validates sufficient balance).

- **POST /api/accounts/{id}/close**: Close account (only if balance is 0.00).

### Queries (Reads)

- **GET /api/accounts/{id}:** Get current balance and status.

- **GET /api/accounts/{id}/events**: Get the full audit trail.

- **GET /api/accounts/{id}/transactions**: Paginated transaction history.

- **GET /api/accounts/{id}/balance-at/{timestamp}**: Time-travel query to see balance at any historical point.

### Administrative
- **POST /api/projections/rebuild**: Re-sync read models from the Event Store.

- **GET /api/projections/status**: Check projection lag and event counts.

## Implementation Details
- **Timestamp Handling:** Historical queries use URL-encoded ISO 8601 timestamps. The system is configured to handle special characters (colons and dots) in path parameters.

- **Concurrency**: Version-based optimistic concurrency is implemented in the account_summaries table.

- **Data Integrity**: DECIMAL(19, 4) is used for all financial calculations to prevent floating-point errors.

## Project Structure
- **/src**: TypeScript source code.
- **/seeds**: SQL initialization scripts for Docker.
- **submission.json**: Evaluation metadata.
- **docker-compose.yml**: Multi-container orchestration.