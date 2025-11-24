Here's the properly formatted README.md file with correct markdown syntax:
# Smart Collections API

A high-performance microservice for content curation platform built with Bun, Hono, and PostgreSQL.

## Tech Stack

- **Runtime**: Bun
- **Framework**: Hono
- **Database**: PostgreSQL
- **ORM**: Drizzle ORM
- **Validation**: Zod
- **Language**: TypeScript

## Prerequisites

- [Bun](https://bun.sh/) (v1.0.0 or higher)
- [PostgreSQL](https://www.postgresql.org/) (v12 or higher)

## Quick Start

### 1. Install Dependencies
bun install

### 2. Database Setup
#### Option A: Local PostgreSQL
# Create database
createdb postgres

# Or via psql
psql -U postgres -c "CREATE DATABASE \"postgres\";"


### 3. Environment Configuration

Create a `.env` file:
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/postgres"

### 4. Database Schema Setup
# Push schema to database
bun run db:push

# Generate Drizzle schema (if needed)
bun run db:generate

### 5. Run the Application
# Development mode (with hot reload)
bun run dev

# Production mode
bun run start

The API will be available at `http://localhost:3000`

## Testing
### Run All Tests
bun test

### Test Database Connection
bun run test:connection

### Run Specific Test Files
bun test tests/collections.test.ts

## API Endpoints
### Collections
- `POST /collections` - Create a new collection
- `GET /collections` - List all collections with relevance scores
- `GET /collections/:id` - Get specific collection with items
- `DELETE /collections/:id` - Delete a collection

### Collection Items
- `POST /collections/:id/items` - Add item to collection
- `PUT /collections/move-item` - Move item between collections
- `DELETE /collections/:collectionId/items/:itemId` - Remove item from collection

## Authentication
All endpoints require the `X-User-ID` header for user identification.
Example:
curl -H "X-User-ID: user-123" http://localhost:3000/collections

## Business Rules
- Each collection is limited to **5 items maximum** (enforced at database level)
- Collection names are automatically made unique by appending counters
- Items with meaningful notes are worth 2 points, others 1 point for relevance scoring
- Move operations are atomic and safe (rollback if target is full)

## Development
### Database Studio
bun run db:studio

### Project Structure
src/
├── db/
│   ├── index.ts          # Database connection & constraints
│   └── schema.ts         # Database schema
├── routes/
│   └── collections.ts    # Collection endpoints
├── middleware/
│   └── auth.ts          # Authentication middleware
├── models/
│   └── types.ts         # Zod validation schemas
└── utils/
    └── helpers.ts       # Utility functions

## Production Deployment
### Environment Variables
- `DATABASE_URL` - PostgreSQL connection string
- `PORT` - Server port (default: 3000)

### Build & Run
bun install --production
bun run start

## API Response Formats
### Success
{
  "id": 1,
  "name": "My Collection",
  "description": "Collection description",
  "userId": "user-123",
  "createdAt": "2024-01-01T00:00:00.000Z",
  "updatedAt": "2024-01-01T00:00:00.000Z"
}

### Error
{
  "error": "Error message description"
}

## Troubleshooting
### Database Connection Issues
1. Ensure PostgreSQL is running: `pg_isready`
2. Test connection: `bun run test:connection`
3. Check database exists: `psql -l`

### Port Already in Use
# Find and kill process using port 3000
lsof -ti:3000 | xargs kill -9

### Schema Issues
# Reset database schema
bun run db:push --force

## API Examples
### Create Collection
curl -X POST http://localhost:3000/collections \
  -H "X-User-ID: user-123" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "My Favorites",
    "description": "My favorite items"
  }'

### Add Item to Collection
curl -X POST http://localhost:3000/collections/1/items \
  -H "X-User-ID: user-123" \
  -H "Content-Type: application/json" \
  -d '{
    "itemId": "item-001",
    "note": "This is an important item"
  }'

### Move Item Between Collections
curl -X PUT http://localhost:3000/collections/move-item \
  -H "X-User-ID: user-123" \
  -H "Content-Type: application/json" \
  -d '{
    "itemId": "item-001",
    "sourceCollectionId": 1,
    "targetCollectionId": 2
  }'

### List Collections
curl -H "X-User-ID: user-123" http://localhost:3000/collections

## Contributing
1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Run tests: `bun test`
5. Submit a pull request

## License
This project is licensed under the MIT License.