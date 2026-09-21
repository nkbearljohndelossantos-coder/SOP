# NKB Manufacturing Corp. — SOP Management & Approval System

A production-ready enterprise web application for authoring, reviewing, discussing, approving, revising, and archiving controlled Standard Operating Procedures (SOPs), fully compliant with **ISO 9001:2015 Clause 7.5 (Documented Information)** quality management principles.

---

## 1. System Architecture

```
                       ┌────────────────────────────────────────┐
                       │     React 18 + TypeScript + Vite       │
                       │     Tailwind CSS + Lucide Icons        │
                       │  (Corporate Navy / Slate / Amber Theme)│
                       └───────────────────┬────────────────────┘
                                           │  REST / HTTP + JSON
                                           ▼
                       ┌────────────────────────────────────────┐
                       │     Node.js + Express + TypeScript     │
                       │     JWT Authentication + RBAC          │
                       │     Zod Validation + Multer Storage    │
                       └───────────────────┬────────────────────┘
                                           │  Prisma ORM
                                           ▼
                       ┌────────────────────────────────────────┐
                       │     SQLite (sop_dev.db / sop_prod.db)  │
                       │   (Easily swapped with PostgreSQL)     │
                       └────────────────────────────────────────┘
```

### Core Technology Stack
- **Frontend**: React 18, TypeScript, Tailwind CSS, Vite, React Router DOM, Axios, date-fns.
- **Backend**: Node.js, Express, TypeScript, Prisma ORM, Zod, JWT (`jsonwebtoken`), bcryptjs, Multer, Morgan, Helmet.
- **Database**: SQLite (via Prisma, fully compatible with PostgreSQL in production).
- **Quality & Testing**: Vitest test suite covering 20 core workflows, security, and isolation assertions.

---

## 2. Source of Truth: Organizational Structure

The application is grounded in NKB Manufacturing Corp.'s organizational chart, featuring **22 official departments**:

| Code | Department Name | Key Operational Function |
| :--- | :--- | :--- |
| **ACC** | Accounting | Financial records, payables, receivables, budgeting |
| **AUD** | Internal Audit | Compliance auditing, internal control verification |
| **BOM** | Bill of Materials | Item specifications, manufacturing bill of materials |
| **COR** | Corporate Affairs | Public affairs, regulatory correspondence |
| **CSD** | Customer Service Department | Customer inquiries, support, order coordination |
| **ENG** | Engineering & Facilities | Plant infrastructure, mechanical and electrical engineering |
| **EXC** | Executive Office | C-suite governance, company-wide policy |
| **FIN** | Finance | Treasury, capital expenditure, banking |
| **HRD** | Human Resources Department | Personnel, training records, compensation |
| **ITD** | Information Technology Department | Infrastructure, portal administration, data security |
| **LEG** | Legal & Compliance | Statutory compliance, legal contract review |
| **LOG** | Logistics & Dispatch | Transport, freight coordination, shipping |
| **MNT** | Maintenance | Equipment upkeep, calibration, preventive maintenance |
| **MKT** | Marketing | Brand management, market communications |
| **PRD** | Production / Manufacturing | Plant production, assembly lines, shift operations |
| **PRC** | Procurement | Strategic supplier relations, vendor contracting |
| **PUR** | Purchasing | Purchase orders, direct material procurement |
| **QAC** | Quality Assurance (QA) | ISO compliance, document control, audit management |
| **QCL** | Quality Control (QC) | Incoming, in-process, and finished goods testing |
| **RND** | Research & Development | Formulation, prototype design, testing |
| **SAF** | Safety & Environmental (EHS) | Occupational safety, hazard containment, OSHA/DENR |
| **WHS** | Warehouse & Inventory | Material receipt, quarantine, finished goods storage |

---

## 3. ISO 9001:2015 Procedure Lifecycle & Workflow Rules

Every SOP moves through a strict state machine enforced by the backend workflow engine (`workflowEngine.ts`):

```
[ DRAFT / REVISION_DRAFT ]
          │
          │ Submit for Review
          ▼
   [ UNDER_REVIEW ]
          │
          │ Advance to Discussion
          ▼
[ DEPARTMENT_DISCUSSION ] ──── Record Meetings & Remarks
          │
          │ Confirm Agreement (All participating depts)
          ▼
[ REMARKS_CONSOLIDATION ]
          │
          │ Open Formal Approvals
          ▼
[ PENDING_DEPARTMENT_APPROVAL ] ──◄── Formal Sign-Off (Dept Heads only)
          │                                  │
          │ (If Changes Requested)           │ (Digital SHA-256 Signature)
          ▼                                  ▼
[ CHANGES_REQUESTED ]           [ PENDING_FINAL_REVIEW ]
          │                                  │
          │ (Author updates/revises)         │ Finalize Procedure
          ▼                                  ▼
   [ New Revision ]                     [ FINALIZED ] (Locked & Frozen)
```

### Strict Business Logic & Non-Negotiable Rules

1. **Departments are NOT automatically required to approve every SOP**:
   - Each SOP version specifies its own participant matrix with 4 distinct roles:
     - `REQUIRED_APPROVER`: Must formally grant digital sign-off before finalization.
     - `REQUIRED_REVIEWER`: Must participate in review and complete review confirmation.
     - `CONSULTED`: Can provide advisory remarks and recommendations, but can **never** block finalization.
     - `NOT_INVOLVED`: Displayed as **`N/A`** and cannot block the workflow.
2. **Agreement Before Formal Approval**:
   - A Department Head cannot grant formal approval until department agreement is confirmed. Formal approval is blocked until the agreement milestone is met.
3. **Department Head Authority**:
   - A Department Head can **only** approve for their own authorized department. Cross-department approvals without authorization are rejected with HTTP 403.
4. **Mandatory Reason on Rejection / Changes Requested**:
   - Requesting changes or rejecting an SOP strictly requires a non-empty reason that is captured in the audit trail and displayed to the creator.
5. **Version-Specific Participants & Freezing**:
   - When a new revision (e.g. `1.1` from `1.0`) is created, the old version (`1.0`) remains completely frozen and immutable.
   - Pending approvals on old versions cannot approve the new version.
6. **Optimistic Locking**:
   - Every version has a `lockVersion` counter. Concurrent saves detect version mismatches and return HTTP 409 Conflict.
7. **Production Isolation**:
   - When `APP_ENV=production` or `ENABLE_DEMO_ACCOUNTS=false`, demo seeding, demo switchers, demo routes, and fake users are **strictly disabled**.
   - Initial administrator setup is securely performed via `/setup` (`POST /api/auth/setup-admin`), which self-locks once an admin exists.

---

## 4. Quick Start & Development

### Prerequisites
- Node.js (v18+ or v20+)
- npm (v9+)

### Installation
From the project root:
```bash
# Install all dependencies (root, server, and client)
npm run install:all
```

### Database Initialization
```bash
# Push Prisma schema to SQLite
cd server
npx prisma db push

# (Option A) Seed Development Demo Data (with realistic personas & SOPs)
npm run seed:demo

# (Option B) Seed Production Base (22 official company departments ONLY)
npm run seed:prod
```

### Running the Application

```bash
# Terminal 1: Run Backend Server (Port 5000)
npm run dev:server

# Terminal 2: Run Frontend Client (Port 3000)
npm run dev:client
```
Open your browser at: `http://localhost:3000`

---

## 5. Automated Vitest Test Suite

The system includes an extensive automated test suite verifying all 20 non-negotiable workflow rules and isolation guards:

```bash
npm test
```

### Verified Test Cases:
- **TEST 1**: Unassigned department cannot approve SOP.
- **TEST 2**: Normal employee / non-head cannot approve SOP.
- **TEST 3**: Department Head can approve ONLY for their authorized department.
- **TEST 4**: Approving an old SOP version does not approve a new version.
- **TEST 5**: SOP cannot be finalized when a required approval is pending.
- **TEST 6**: `CONSULTED` departments cannot block finalization.
- **TEST 7**: `NOT_INVOLVED` departments (`N/A`) cannot block finalization.
- **TEST 8**: `CHANGES_REQUESTED` SOP cannot be finalized.
- **TEST 9**: Finalized SOP cannot be directly edited (frozen lock).
- **TEST 10**: New revision preserves previous finalized version as frozen historical record.
- **TEST 11**: Demo seed throws fatal error when `APP_ENV=production` or `ENABLE_DEMO_ACCOUNTS=false`.
- **TEST 12**: Production seed initializes ONLY official company departments with ZERO demo accounts.
- **TEST 13**: Formal approval cannot be granted before agreement confirmation.
- **TEST 14**: Department Head can approve only within authorized department.
- **TEST 15**: Requesting changes / rejection requires a mandatory reason.
- **TEST 16**: Concurrency conflict detected and blocked with 409 Conflict.
- **TEST 17**: Version increment follows 1.0 -> 1.1 progression.
- **TEST 18**: Security rejects malicious/unauthorized file upload extensions (`.exe`, `.sh`).
- **TEST 19**: Notification created when SOP requires approval.
- **TEST 20**: Audit logs recorded for critical actions without edit/delete endpoints.
- **TEST 22**: First admin setup disabled once Super Admin exists.

---

## 6. Production Build & Deployment

### Building for Production
```bash
# Compiles backend TypeScript to /server/dist and Vite frontend to /client/dist
npm run build
```

### Running in Production
```bash
# Set production environment variables
export APP_ENV=production
export NODE_ENV=production
export ENABLE_DEMO_ACCOUNTS=false
export JWT_SECRET="your-strong-production-jwt-secret-min-32-chars"
export PORT=5000

# Start production server (serves API and compiled client SPA together)
npm start
```
When running in production, Express automatically serves the compiled Single Page Application from `client/dist` and mounts uploaded assets from `/uploads`.

### Initial Administrator Setup
1. Navigate to `http://localhost:5000/setup`.
2. Enter the first Super Administrator's details and master password.
3. Once created, the setup endpoint automatically locks itself permanently.

---

## 7. Database Backup & Restore

### SQLite Backup (Default)
To create an atomic, non-blocking online backup of the SQLite database:
```bash
# Windows PowerShell
sqlite3 server/sop_prod.db ".backup 'server/backups/sop_backup_$(Get-Date -Format yyyyMMdd_HHmmss).db'"

# Linux / macOS
sqlite3 server/sop_prod.db ".backup 'server/backups/sop_backup_$(date +%Y%m%d_%H%M%S).db'"
```

### SQLite Restore
```bash
# Stop the server service, then restore:
cp server/backups/sop_backup_YYYYMMDD_HHMMSS.db server/sop_prod.db
```

### PostgreSQL Migration (Optional Enterprise Target)
To migrate from SQLite to PostgreSQL in an enterprise datacenter:
1. Update `server/prisma/schema.prisma`:
   ```prisma
   datasource db {
     provider = "postgresql"
     url      = env("DATABASE_URL")
   }
   ```
2. Set `DATABASE_URL="postgresql://user:password@pg-host:5432/sop_db?schema=public"` in `.env`.
3. Run `npx prisma migrate deploy` and `npm run seed:prod`.

---

## 8. License & Confidentiality
Confidential & Proprietary. Copyright © 2026 NKB Manufacturing Corp. All rights reserved.
ISO 9001:2015 Document Control System.
